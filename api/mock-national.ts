import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'

export const config = {
  maxDuration: 60,
}

/**
 * 전국단위 통계 AI 추정. 사설 모의고사는 공개 통계가 없고 우리 학생 표본은 너무 작아서,
 * 문제지·정답·해설을 보고 전국 수험생 모집단이었다면 나왔을 수치를 어림한다.
 * 한 번에 다 시키면 60초를 넘기므로 클라이언트가 나눠 부른다:
 *  - part 'cutoffs': 과목별 원점수 등급컷 1~8 + 등급별 표준점수
 *  - part 'rates'  : 한 묶음(공통 또는 선택과목 하나) 문항의 선지별 선택률
 */

const COMMON_RULES = `당신은 수능 국어 출제·채점 통계 전문가입니다. 사설 실전 모의고사를 전국 수능 응시생 모집단(약 45만 명, 재수생 포함)이 본다고 가정하고, 그때 나왔을 통계를 추정합니다.
시험지 본문이 있으면 지문 길이·난도, 선지의 매력도를 실제로 판단하세요. 본문이 없으면 문항 해설과 배점, 문항 위치(독서 후반 장문 세트·문학 복합 세트는 대체로 어렵다)를 근거로 판단하세요.
숫자는 그럴듯하게 들쭉날쭉해야 합니다 — 모든 문항을 비슷한 값으로 채우지 마세요.`

const CUTOFF_RULES = `${COMMON_RULES}

원점수 등급컷:
- 등급 1~8 각각 "이 원점수 이상이면 해당 등급"인 정수. 상대평가 누적 비율 4/11/23/40/60/77/89/96%.
- 선택과목마다 따로 낸다(공통 + 그 선택과목 총점 기준). 선택과목이 어려우면 그 과목 컷이 조금 낮다.
- 최근 수능 국어 1등급컷은 대체로 80~92점. 실전 사설은 평가원보다 조금 어렵게 나오는 편.

등급별 표준점수:
- 등급 1~8 각 등급컷에 해당하는 표준점수(평균 100, 표준편차 20 체계, 정수). 선택과목과 상관없이 하나.
- 어려운 시험일수록 1등급 표준점수가 높다(최근 수능 1등급 표준점수 약 126~133).`

const RATES_RULES = `${COMMON_RULES}

선지별 선택률:
- 받은 문항마다 ①~⑤ 선택률(%)을 소수 첫째 자리까지. 다섯 개 합은 100.
- 정답 선택률 = 정답률. 쉬운 문항 85~97, 보통 60~80, 어려운 문항 25~50, 킬러는 15~30.
- 오답 선지는 매력도대로 나눈다. 해설에서 '많이 고른', '헷갈리는' 선지로 짚힌 것은 높게, 명백히 틀린 선지는 1~3%.`

interface Cut {
  grade: number
  minScore: number
}

interface QuestionInput {
  number: number
  answer: number
  points: number
  hint?: string
}

const CUTS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: { grade: { type: 'integer' }, minScore: { type: 'integer' } },
    required: ['grade', 'minScore'],
    additionalProperties: false,
  },
}

/** 등급 1~8, 등급이 내려갈수록 값이 줄게 바로잡는다. */
function normalizeCuts(input: unknown, max: number): Cut[] {
  const arr = Array.isArray(input) ? input : []
  const byGrade = new Map<number, number>()
  for (const r of arr) {
    const g = Math.round(Number((r as Cut)?.grade))
    const s = Math.round(Number((r as Cut)?.minScore))
    if (!Number.isFinite(g) || !Number.isFinite(s) || g < 1 || g > 8) continue
    byGrade.set(g, Math.max(0, Math.min(max, s)))
  }
  const out = [...byGrade.entries()].map(([grade, minScore]) => ({ grade, minScore })).sort((a, b) => a.grade - b.grade)
  for (let i = 1; i < out.length; i++) {
    if (out[i].minScore >= out[i - 1].minScore) out[i].minScore = Math.max(0, out[i - 1].minScore - 1)
  }
  return out
}

/** 다섯 개, 음수 없이, 합 100 으로 맞추고 소수 첫째 자리. */
function normalizeRates(input: unknown): number[] | null {
  if (!Array.isArray(input) || input.length !== 5) return null
  const r = input.map((x) => Math.max(0, Number(x) || 0))
  const sum = r.reduce((s, x) => s + x, 0)
  if (sum <= 0) return null
  const scaled = r.map((x) => Math.round((x / sum) * 1000) / 10)
  // 반올림으로 생긴 0.1 차이는 가장 큰 값에 몰아준다.
  const diff = Math.round((100 - scaled.reduce((s, x) => s + x, 0)) * 10) / 10
  const top = scaled.indexOf(Math.max(...scaled))
  scaled[top] = Math.round((scaled[top] + diff) * 10) / 10
  return scaled
}

function questionLines(qs: QuestionInput[]): string {
  return qs
    .map((q) => {
      const hint = q.hint ? ` | 해설: ${q.hint.slice(0, 700)}` : ''
      return `${q.number}번 정답 ${q.answer} 배점 ${q.points}${hint}`
    })
    .join('\n')
}

async function ask(client: Anthropic, system: string, user: string, schema: Record<string, unknown>) {
  const msg = await client.messages
    .stream({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      // 문항 수십 개를 60초 안에 끝내야 한다. 어림잡는 일이라 깊이 생각할 필요는 없다.
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
    })
    .finalMessage()
  if (msg.stop_reason === 'refusal') throw new Error('AI가 요청을 거절했습니다.')
  if (msg.stop_reason === 'max_tokens') throw new Error('AI 응답이 길이 제한에 걸렸습니다.')
  const text = msg.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error('AI 응답에 결과가 없습니다.')
  return JSON.parse(text.text) as Record<string, unknown>
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.' })
    return
  }

  const body = (req.body ?? {}) as {
    part?: 'cutoffs' | 'rates'
    title?: string
    examText?: string
    /** part 'cutoffs': 과목 키 → 그 과목 총점(공통 포함). */
    totals?: Record<string, number>
    /** 묶음 이름(공통과목·화법과 작문 …)과 문항. part 'cutoffs' 는 전 문항, 'rates' 는 그 묶음만. */
    groups?: { label: string; questions: QuestionInput[] }[]
  }
  const groups = Array.isArray(body.groups) ? body.groups : []
  if (groups.every((g) => !g.questions?.length)) {
    res.status(400).json({ error: '문항이 필요합니다.' })
    return
  }
  const paper =
    typeof body.examText === 'string' && body.examText.trim()
      ? `\n\n[시험지 본문]\n${body.examText.slice(0, 60000)}`
      : ''
  const questions = groups.map((g) => `[${g.label}]\n${questionLines(g.questions)}`).join('\n\n')
  const client = new Anthropic({ apiKey })

  try {
    if (body.part === 'cutoffs') {
      const totals = Object.entries(body.totals ?? {}).filter(([, t]) => Number(t) > 0)
      if (totals.length === 0) {
        res.status(400).json({ error: 'totals 가 필요합니다.' })
        return
      }
      const user =
        `[시험] ${String(body.title ?? '')}\n` +
        `[과목별 총점] ${totals.map(([k, t]) => `${k}: ${t}점`).join(', ')}\n\n` +
        `[문항]\n${questions}${paper}`
      const out = await ask(client, CUTOFF_RULES, user, {
        type: 'object',
        properties: {
          cutoffs: {
            type: 'array',
            items: {
              type: 'object',
              properties: { key: { type: 'string' }, cuts: CUTS_SCHEMA },
              required: ['key', 'cuts'],
              additionalProperties: false,
            },
          },
          stdCutoffs: CUTS_SCHEMA,
        },
        required: ['cutoffs', 'stdCutoffs'],
        additionalProperties: false,
      })
      const cutoffs: Record<string, Cut[]> = {}
      const raw = Array.isArray(out.cutoffs) ? (out.cutoffs as { key?: unknown; cuts?: unknown }[]) : []
      for (const [key, total] of totals) {
        const hit = raw.find((c) => String(c.key) === key) ?? (totals.length === 1 ? raw[0] : undefined)
        const cuts = normalizeCuts(hit?.cuts, Number(total))
        if (cuts.length) cutoffs[key] = cuts
      }
      res.status(200).json({ cutoffs, stdCutoffs: normalizeCuts(out.stdCutoffs, 200) })
      return
    }

    const user = `[시험] ${String(body.title ?? '')}\n\n[선택률을 낼 문항]\n${questions}${paper}`
    const out = await ask(client, RATES_RULES, user, {
      type: 'object',
      properties: {
        rates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              number: { type: 'integer' },
              rates: { type: 'array', items: { type: 'number' } },
            },
            required: ['number', 'rates'],
            additionalProperties: false,
          },
        },
      },
      required: ['rates'],
      additionalProperties: false,
    })
    const wanted = new Set(groups.flatMap((g) => g.questions.map((q) => q.number)))
    const rates: Record<string, number[]> = {}
    for (const r of Array.isArray(out.rates) ? (out.rates as { number?: unknown; rates?: unknown }[]) : []) {
      const num = Number(r.number)
      const norm = normalizeRates(r.rates)
      if (wanted.has(num) && norm) rates[String(num)] = norm
    }
    res.status(200).json({ rates })
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    res.status(500).json({ error: message })
  }
}
