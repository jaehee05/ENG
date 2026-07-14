import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'

export const config = {
  maxDuration: 60,
}

const SYSTEM_PROMPT = `당신은 한국 수능/평가원 모의고사 등급컷 추정 전문가입니다.
주어진 모의고사 정보(과목, 총 문항 수, 총점, 실전 모의고사 여부)를 바탕으로,
여태까지의 평가원 모의고사·수능의 난이도와 등급컷 경향을 고려해 1~8등급의 원점수 등급컷을 대략 추정하세요.

원칙:
- minScore는 "이 원점수 이상이면 해당 등급"인 원점수(정수). 총점을 넘지 않게.
- 1등급이 가장 높고 8등급이 가장 낮으며, 등급이 오를수록 minScore가 커집니다(단조 감소: 1등급 minScore > 2등급 > ...).
- 국어/수학(상대평가): 대략 1등급 상위4%, 2등급 11%, 3등급 23%, 4등급 40%, 5등급 60%, 6등급 77%, 7등급 89%, 8등급 96% 누적 비율에 해당하는 일반적 평가원 등급컷 경향을 총점에 맞춰 환산.
- 영어(절대평가): 1등급 90%, 2등급 80%, 3등급 70%, 4등급 60%, 5등급 50%, 6등급 40%, 7등급 30%, 8등급 20% (총점 기준 환산).
- 실전(사설) 모의고사는 평가원보다 다소 어려운 경향이 있어 국어/수학 등급컷을 소폭 낮게 잡아도 됩니다.
- 9등급은 8등급 미만이므로 컷을 출력하지 않습니다.

submit_cutoffs 도구로 grade(1~8)와 minScore(정수) 배열을 제출하세요.`

interface Cut {
  grade: number
  minScore: number
}

function normalize(input: unknown, total: number): Cut[] {
  const obj = (input ?? {}) as { cutoffs?: unknown }
  const arr = Array.isArray(obj.cutoffs) ? obj.cutoffs : []
  const out: Cut[] = []
  for (const r of arr) {
    if (typeof r !== 'object' || r === null) continue
    const g = Number((r as { grade?: unknown }).grade)
    const s = Number((r as { minScore?: unknown }).minScore)
    if (!Number.isFinite(g) || !Number.isFinite(s)) continue
    if (g < 1 || g > 8) continue
    out.push({ grade: Math.round(g), minScore: Math.max(0, Math.min(total, Math.round(s))) })
  }
  // 등급 오름차순 + minScore 단조 감소 보정
  out.sort((a, b) => a.grade - b.grade)
  for (let i = 1; i < out.length; i++) {
    if (out[i].minScore >= out[i - 1].minScore) {
      out[i].minScore = Math.max(0, out[i - 1].minScore - 1)
    }
  }
  return out
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

  const { subject, title, totalQuestions, totalPoints, practice } = (req.body ??
    {}) as {
    subject?: string
    title?: string
    totalQuestions?: number
    totalPoints?: number
    practice?: boolean
  }
  const total = Number(totalPoints)
  if (!Number.isFinite(total) || total <= 0) {
    res.status(400).json({ error: 'totalPoints가 필요합니다.' })
    return
  }

  const userText = JSON.stringify({
    과목: subject === 'english' ? '영어(절대평가)' : '국어(상대평가)',
    제목: String(title ?? ''),
    총문항수: Number(totalQuestions) || undefined,
    총점: total,
    실전모의고사: practice !== false,
  })

  const client = new Anthropic({ apiKey })

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      tools: [
        {
          name: 'submit_cutoffs',
          description: '1~8등급 원점수 등급컷을 제출합니다.',
          input_schema: {
            type: 'object',
            properties: {
              cutoffs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    grade: { type: 'integer' },
                    minScore: { type: 'integer' },
                  },
                  required: ['grade', 'minScore'],
                },
              },
            },
            required: ['cutoffs'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_cutoffs' },
      messages: [{ role: 'user', content: `[모의고사 정보]\n${userText}` }],
    })

    const toolUse = msg.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      res.status(502).json({ error: 'Claude 응답에 결과가 없습니다.' })
      return
    }
    const cutoffs = normalize(toolUse.input, total)
    if (cutoffs.length === 0) {
      res.status(502).json({ error: '등급컷 결과가 비어 있습니다.' })
      return
    }
    res.status(200).json({ cutoffs })
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    res.status(500).json({ error: message })
  }
}
