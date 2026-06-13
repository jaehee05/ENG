import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'

export const config = {
  maxDuration: 60,
}

const SYSTEM_PROMPT = `당신은 한국 수능/모의고사 영어 문제 원문 텍스트 또는 시험지 캡쳐 이미지를 파싱하는 분석가입니다.
입력에는 본문(지문) + 발문 + 5지선다(①~⑤) + 가끔 정답·해설이 포함되어 있습니다.

**중요한 동작 규칙 (우선순위 최상위)**
- 입력에서 문항 1개라도 식별되면 **반드시 submit_reading 도구를 호출**하세요. 설명만 텍스트로 출력하지 마세요.
- 정답 표시가 입력에 없으면 **answer=0으로 그냥 제출**하세요. 정답이 없다는 이유로 호출을 거르지 마세요. 사용자가 나중에 직접 정답을 고칠 겁니다.
- 발문이 잘려 있거나 누락된 경우 합리적으로 추정하세요(예: 본문에 빈칸이 있으면 "다음 빈칸에 들어갈 말로 가장 적절한 것은?"). 추정한 발문이라도 그대로 q에 넣고 도구를 호출하세요.
- 선지가 5개 미만이면 빈 문자열로 채워서 5개를 맞춰 제출하세요.

submit_reading을 호출하지 않고 텍스트만 출력해도 되는 경우는 입력에 영어 문제 구조(발문·선지·지문 중 어느 것도)가 전혀 보이지 않을 때뿐입니다.

원문에는 다음 노이즈가 섞여 있을 수 있습니다. 모두 제거하세요.
- 문항 번호 (예: "31.", "[31~32]")
- 배점 표기 (예: "[3점]", "(3점)")
- 별표 단어 풀이 (예: "* paradigm: 패러다임")
- 해설/번역 문단
- 페이지 번호, 시험명 헤더/푸터

규칙:
- title: 출처 정보가 명확하면 그대로(예: "2024학년도 6월 모평 31번"). 모르면 빈 문자열.
- passage: 공용 지문이 따로 있을 때만 채움. 단일 문항이면 비우고 questions[].body에 본문을 넣음.
- type 분류:
  - cloze: 본문에 빈칸이 있는 빈칸 추론
  - order: 주어진 글 + (A)(B)(C) 순서
  - insert: 주어진 문장 + 본문 안 ①~⑤ 위치
  - summary: 지문 + 요약문 박스에 (A)(B) 빈칸
  - irrelevant: 본문에 ①~⑤ 표시된 문장 중 흐름과 무관
  - underline-grammar: 본문 ①~⑤ 밑줄 중 어법상 틀린 것
  - underline-vocab: 본문 ①~⑤ 밑줄 중 문맥상 부적절한 낱말
  - standard: 그 외 (제목/주제/주장/요지/심정/일치/도표 등)
- q: 발문 (예: "다음 빈칸에 들어갈 말로 가장 적절한 것은?"). 발문 끝의 [3점]/[2점] 같은 배점 표기는 빼고 깨끗한 발문만.
- points: 발문 끝에 [3점]이 있었으면 3, 그 외엔 2.
- body:
  - 빈칸은 8개 이상 밑줄(________)로
  - insert, irrelevant, underline-* 유형은 본문에 ①~⑤ 마커 유지
  - underline-grammar / underline-vocab 유형은 밑줄 범위를 \`①{...}\` 형식으로 감쌀 것. 예: "He ①{liked} to ②{walking} home." 마커와 중괄호 사이 공백 X.
  - 그 외에 본문에 단순히 밑줄 친 부분이 있고 발문이 그걸 가리키는 경우(예: "밑줄 친 ~가 의미하는 바로 가장 적절한 것은?"), 그 부분을 \`{{...}}\`로 감쌀 것. 예: "He {{kicked the bucket}} last night."
- intro: order/insert에서 박스로 주어진 글/문장
- summaryBox: summary에서 박스 안 요약문, (A)/(B) 빈칸 그대로
- choices: 정확히 5개. ①~⑤ 마커는 빼고 텍스트만.
  - summary 유형: "(A) ...... (B) ......" 형태로 한 항목에 함께
  - order 유형: "(A) - (C) - (B)" 같은 순서 표기 그대로
- answer: 원문에 정답 표시("정답: ③", "Answer: 3" 등)가 있으면 그 인덱스(0~4). 없으면 0.`

const ALLOWED_TYPES = [
  'standard',
  'cloze',
  'order',
  'insert',
  'summary',
  'irrelevant',
  'underline-grammar',
  'underline-vocab',
] as const

const ALLOWED_SET = new Set<string>(ALLOWED_TYPES)

interface ParsedQuestion {
  type: string
  q: string
  body: string
  intro: string
  summaryBox: string
  choices: string[]
  answer: number
  points?: number
}

interface ParseResult {
  title: string
  passage: string
  questions: ParsedQuestion[]
}

function normalizeQuestion(raw: unknown): ParsedQuestion | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const type =
    typeof r.type === 'string' && ALLOWED_SET.has(r.type) ? r.type : 'standard'
  const q = typeof r.q === 'string' ? r.q.trim() : ''
  if (!q) return null
  const choicesRaw = Array.isArray(r.choices) ? r.choices : []
  const choices = choicesRaw.map((c) => (typeof c === 'string' ? c.trim() : ''))
  while (choices.length < 5) choices.push('')
  const answer =
    typeof r.answer === 'number' && r.answer >= 0 && r.answer <= 4 ? Math.trunc(r.answer) : 0
  const pointsRaw = typeof r.points === 'number' ? Math.trunc(r.points) : 0
  const points = pointsRaw >= 1 && pointsRaw <= 5 ? pointsRaw : undefined
  return {
    type,
    q,
    body: typeof r.body === 'string' ? r.body.trim() : '',
    intro: typeof r.intro === 'string' ? r.intro.trim() : '',
    summaryBox: typeof r.summaryBox === 'string' ? r.summaryBox.trim() : '',
    choices: choices.slice(0, 5),
    answer,
    points,
  }
}

function normalizeResult(obj: unknown): ParseResult {
  const r = (obj ?? {}) as Record<string, unknown>
  const title = typeof r.title === 'string' ? r.title.trim() : ''
  const passage = typeof r.passage === 'string' ? r.passage.trim() : ''
  const arr = Array.isArray(r.questions) ? r.questions : []
  const questions: ParsedQuestion[] = []
  for (const item of arr) {
    const norm = normalizeQuestion(item)
    if (norm) questions.push(norm)
  }
  return { title, passage, questions }
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

  const { text, images } = (req.body ?? {}) as { text?: string; images?: string[] }
  const hasText = typeof text === 'string' && text.trim().length > 0
  const imageList = Array.isArray(images) ? images.filter((s) => typeof s === 'string' && s) : []
  if (!hasText && imageList.length === 0) {
    res.status(400).json({ error: 'text 또는 images가 필요합니다.' })
    return
  }
  if (hasText && (text as string).length > 40000) {
    res.status(400).json({ error: '텍스트가 너무 깁니다. (40000자 이내)' })
    return
  }
  if (imageList.length > 8) {
    res.status(400).json({ error: '이미지는 한 번에 8장까지 첨부할 수 있습니다.' })
    return
  }

  const userContent: Anthropic.Messages.ContentBlockParam[] = []
  for (const raw of imageList) {
    let data = raw
    let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/png'
    const m = raw.match(/^data:([^;]+);base64,(.+)$/)
    if (m) {
      const mt = m[1]
      data = m[2]
      if (mt === 'image/jpeg' || mt === 'image/jpg') mediaType = 'image/jpeg'
      else if (mt === 'image/gif') mediaType = 'image/gif'
      else if (mt === 'image/webp') mediaType = 'image/webp'
      else mediaType = 'image/png'
    }
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data },
    })
  }
  if (hasText) {
    userContent.push({ type: 'text', text: `[원문]\n${(text as string).trim()}` })
  } else {
    userContent.push({
      type: 'text',
      text: '첨부된 이미지(시험지/캡쳐)에서 문항을 추출해주세요.',
    })
  }

  const client = new Anthropic({ apiKey })

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [
        {
          name: 'submit_reading',
          description: '추출한 지문과 문항을 제출합니다.',
          input_schema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              passage: { type: 'string' },
              questions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: [...ALLOWED_TYPES] },
                    q: { type: 'string' },
                    body: { type: 'string' },
                    intro: { type: 'string' },
                    summaryBox: { type: 'string' },
                    choices: {
                      type: 'array',
                      items: { type: 'string' },
                      minItems: 5,
                      maxItems: 5,
                    },
                    answer: { type: 'integer', minimum: 0, maximum: 4 },
                    points: { type: 'integer', minimum: 1, maximum: 5 },
                  },
                  required: ['type', 'q', 'choices', 'answer'],
                },
              },
            },
            required: ['questions'],
          },
        },
      ],
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: userContent }],
    })

    const toolUse = msg.content.find((b) => b.type === 'tool_use')
    const textBlock = msg.content.find((b) => b.type === 'text')
    const hint =
      textBlock && textBlock.type === 'text' && textBlock.text.trim()
        ? textBlock.text.trim().slice(0, 400)
        : ''
    if (!toolUse || toolUse.type !== 'tool_use') {
      console.error('parse-reading: no tool_use', {
        stop_reason: msg.stop_reason,
        hint,
      })
      res.status(502).json({
        error:
          'Claude 응답에 결과가 없습니다.' +
          (hint ? ` (모델 메시지: ${hint})` : ` (stop: ${msg.stop_reason ?? 'unknown'})`),
      })
      return
    }
    const rawInput = toolUse.input as { questions?: unknown }
    const rawCount = Array.isArray(rawInput?.questions) ? rawInput.questions.length : 0
    const parsed = normalizeResult(toolUse.input)
    if (parsed.questions.length === 0) {
      console.error('parse-reading: empty questions', {
        rawCount,
        hint,
        sample: JSON.stringify(rawInput).slice(0, 500),
      })
      const reason =
        rawCount > 0
          ? `모델이 ${rawCount}개 추출했지만 발문/선지가 비어 있어 모두 제외됨`
          : '모델이 문항을 추출하지 못함'
      res.status(422).json({
        error: `문항을 찾지 못했습니다. (${reason})${hint ? ' - ' + hint : ''}`,
      })
      return
    }
    res.status(200).json(parsed)
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    res.status(500).json({ error: message })
  }
}
