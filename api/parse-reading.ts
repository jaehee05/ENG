import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'

export const config = {
  maxDuration: 60,
}

const SYSTEM_PROMPT = `당신은 한국 수능/모의고사 영어 문제 원문 텍스트를 파싱하는 분석가입니다.
사용자가 책·시험지·인터넷에서 복사해 붙여 넣은 원문(지문 + 발문 + 선지 + 가끔 정답·해설)을 보고 깔끔하게 구조화된 JSON으로 반환합니다.

원문에는 다음 노이즈가 섞여 있을 수 있습니다. 모두 제거하세요.
- 문항 번호 (예: "31.", "[31~32]")
- 배점 표기 (예: "[3점]", "(3점)")
- 별표 단어 풀이 (예: "* paradigm: 패러다임")
- 해설/번역 문단
- 페이지 번호, 시험명 헤더/푸터

다음 항목을 추출하세요.

- title (문자열, 선택): 출처 정보가 명확하면 (예: "2024학년도 6월 모평 31번"). 추정 어려우면 빈 문자열
- passage (문자열): 공용 지문이 따로 존재할 때만 채움. 단일 문항이고 본문이 곧 지문이면 비우고 questions[].body에만 넣기
- questions: 1개 이상. 각 항목:
  - type: "standard" | "cloze" | "order" | "insert" | "summary" | "irrelevant" | "underline-grammar" | "underline-vocab"
    - cloze: 본문에 빈칸이 있는 빈칸 추론
    - order: 주어진 글 + (A)(B)(C) 순서
    - insert: 주어진 문장 + 본문 안 ①~⑤ 위치
    - summary: 지문 + 요약문 박스에 (A)(B) 빈칸
    - irrelevant: 본문에 ①~⑤ 표시된 문장 중 흐름과 무관
    - underline-grammar: 본문 ①~⑤ 밑줄 중 어법상 틀린 것
    - underline-vocab: 본문 ①~⑤ 밑줄 중 문맥상 부적절한 낱말
    - standard: 그 외 (제목/주제/주장/요지/심정/일치/도표 등)
  - q (문자열): 발문 (예: "다음 빈칸에 들어갈 말로 가장 적절한 것은?")
  - body (문자열): 문제별 본문. passage를 따로 채웠다면 비워도 됨.
    - 빈칸은 8개 이상 밑줄(________)로 표기
    - 본문 안에 ①~⑤ 마커가 있는 유형(insert, irrelevant, underline-*)은 마커 유지
  - intro (문자열, 선택): order/insert에서 박스로 주어진 글/문장
  - summaryBox (문자열, 선택): summary에서 박스 안 요약문, (A)·(B) 빈칸 그대로
  - choices (정확히 5개 문자열): ①~⑤ 선지. 마커는 빼고 텍스트만.
    - summary 유형은 "(A) ...... (B) ......" 형태로 한 항목에 함께
    - order 유형은 "(A) - (C) - (B)" 같은 순서 표기 그대로
  - answer (정수 0~4): 원문 어딘가에 정답 표시("정답: ③", "Answer: 3" 등)가 있으면 그 인덱스. 없으면 0.

출력은 아래 JSON 형식만 출력하고, 다른 설명·코드펜스·접두어를 붙이지 마세요.

{
  "title": "string",
  "passage": "string",
  "questions": [
    {
      "type": "standard",
      "q": "string",
      "body": "string",
      "intro": "string",
      "summaryBox": "string",
      "choices": ["", "", "", "", ""],
      "answer": 0
    }
  ]
}`

const ALLOWED_TYPES = new Set([
  'standard',
  'cloze',
  'order',
  'insert',
  'summary',
  'irrelevant',
  'underline-grammar',
  'underline-vocab',
])

interface ParsedQuestion {
  type: string
  q: string
  body: string
  intro: string
  summaryBox: string
  choices: string[]
  answer: number
}

interface ParseResult {
  title: string
  passage: string
  questions: ParsedQuestion[]
}

function normalizeQuestion(raw: unknown): ParsedQuestion | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const type = typeof r.type === 'string' && ALLOWED_TYPES.has(r.type) ? r.type : 'standard'
  const q = typeof r.q === 'string' ? r.q.trim() : ''
  if (!q) return null
  const choicesRaw = Array.isArray(r.choices) ? r.choices : []
  const choices = choicesRaw.map((c) => (typeof c === 'string' ? c.trim() : ''))
  while (choices.length < 5) choices.push('')
  const answer =
    typeof r.answer === 'number' && r.answer >= 0 && r.answer <= 4 ? Math.trunc(r.answer) : 0
  return {
    type,
    q,
    body: typeof r.body === 'string' ? r.body.trim() : '',
    intro: typeof r.intro === 'string' ? r.intro.trim() : '',
    summaryBox: typeof r.summaryBox === 'string' ? r.summaryBox.trim() : '',
    choices: choices.slice(0, 5),
    answer,
  }
}

function parseJsonLoose(text: string): ParseResult {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : trimmed
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error('JSON 응답을 찾을 수 없습니다.')
  const slice = body.slice(start, end + 1)
  const obj = JSON.parse(slice)
  const title = typeof obj.title === 'string' ? obj.title.trim() : ''
  const passage = typeof obj.passage === 'string' ? obj.passage.trim() : ''
  const arr = Array.isArray(obj.questions) ? obj.questions : []
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

  const { text } = (req.body ?? {}) as { text?: string }
  if (typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'text가 필요합니다.' })
    return
  }
  if (text.length > 40000) {
    res.status(400).json({ error: '텍스트가 너무 깁니다. (40000자 이내)' })
    return
  }

  const client = new Anthropic({ apiKey })

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: `[원문]\n${text.trim()}` }],
    })

    const textBlock = msg.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      res.status(502).json({ error: 'Claude 응답에 text가 없습니다.' })
      return
    }
    const parsed = parseJsonLoose(textBlock.text)
    if (parsed.questions.length === 0) {
      res.status(422).json({ error: '문항을 찾지 못했습니다. 원문을 다시 확인하세요.' })
      return
    }
    res.status(200).json(parsed)
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    res.status(500).json({ error: message })
  }
}
