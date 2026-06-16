import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'

export const config = {
  maxDuration: 300,
}

const SYSTEM_PROMPT = `당신은 한국 수능 영어 모의고사 문제지 분석가입니다.
첨부된 PDF에서 지정된 문항 번호의 영어 문제를 정확하게 추출하여 JSON으로 반환합니다.

각 문항을 다음 구조로 추출하세요.

- number (정수): 문항 번호
- type (다음 중 하나):
  - "cloze": 빈칸 추론
  - "order": 글의 순서 (주어진 글 + (A)(B)(C))
  - "insert": 문장 위치 (주어진 문장 + 본문 내 ①~⑤ 위치 마커)
  - "summary": 요약문 (지문 + 요약 박스 + (A)/(B) 빈칸)
  - "irrelevant": 흐름과 관계 없는 문장 (본문에 ①~⑤로 표시된 문장)
  - "underline-grammar": 어법상 틀린 것 (지문 안에 ①~⑤ 밑줄)
  - "underline-vocab": 문맥상 낱말 쓰임 (지문 안에 ①~⑤ 밑줄)
  - "standard": 그 외 일반(제목·주제·주장·요지·심정·일치·도표 등)
- q (문자열): 발문 (예: "다음 빈칸에 들어갈 말로 가장 적절한 것은?")
- body (문자열): 지문/본문 텍스트.
  - 빈칸 마커는 8개 이상의 밑줄(________)로 표기
  - 본문에 ①~⑤ 마커가 포함된 유형(insert, irrelevant, underline-*)은 ①~⑤를 그대로 포함
  - underline-grammar / underline-vocab 유형은 밑줄 친 단어/구문을 \`①{...}\` 형식으로 감쌀 것. 예: "He ①{liked} to ②{walking} home." 마커와 중괄호 사이 공백은 넣지 말 것.
- intro (문자열, 선택): order/insert 유형에서 박스 안에 별도로 주어진 글/문장
- summaryBox (문자열, 선택): summary 유형에서 박스 안 요약문. (A), (B) 빈칸을 그대로 포함
- choices (5개 문자열 배열): 5개 선지. 각 선지는 ①~⑤ 마커 없이 텍스트만.
  - summary 유형은 "(A) ...... (B) ......" 형태로 (A)와 (B) 단어를 한 항목에 함께
  - order 유형의 선지는 "(A) - (C) - (B)" 같은 순서 표기 그대로
- answer (정수 0~4): 정답 인덱스. 정답표가 주어지면 해석하여 채우고, 없으면 0으로

본문 안의 [3점]·[2점] 같은 배점 표기, 본문 끝 단어 풀이(*표시) 등 부가 정보는 제외하고 본문/선지에 영향 없게 깔끔히 정리하세요.

출력은 아래 JSON 형식만 출력하고, 다른 설명·코드펜스를 붙이지 마세요.

{
  "readings": [
    {
      "number": 31,
      "type": "cloze",
      "q": "다음 빈칸에 들어갈 말로 가장 적절한 것은?",
      "body": "...",
      "choices": ["...", "...", "...", "...", "..."],
      "answer": 0
    }
  ]
}`

interface ImportedReading {
  number: number
  type: string
  q: string
  body?: string
  intro?: string
  summaryBox?: string
  choices: string[]
  answer: number
}

interface ImportResult {
  readings: ImportedReading[]
}

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

function normalizeReading(raw: unknown): ImportedReading | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const number = typeof r.number === 'number' ? Math.trunc(r.number) : Number.parseInt(String(r.number ?? ''), 10)
  if (!Number.isFinite(number)) return null
  const type = typeof r.type === 'string' && ALLOWED_TYPES.has(r.type) ? r.type : 'standard'
  const q = typeof r.q === 'string' ? r.q.trim() : ''
  if (!q) return null
  const choicesRaw = Array.isArray(r.choices) ? r.choices : []
  const choices = choicesRaw.map((c) => (typeof c === 'string' ? c.trim() : '')).filter(Boolean)
  if (choices.length === 0) return null
  while (choices.length < 5) choices.push('')
  const answer = typeof r.answer === 'number' && r.answer >= 0 && r.answer <= 4 ? Math.trunc(r.answer) : 0
  return {
    number,
    type,
    q,
    body: typeof r.body === 'string' ? r.body.trim() : '',
    intro: typeof r.intro === 'string' ? r.intro.trim() : '',
    summaryBox: typeof r.summaryBox === 'string' ? r.summaryBox.trim() : '',
    choices: choices.slice(0, 5),
    answer,
  }
}

function parseJsonLoose(text: string): ImportResult {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : trimmed
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error('JSON 응답을 찾을 수 없습니다.')
  const slice = body.slice(start, end + 1)
  const obj = JSON.parse(slice)
  const arr = Array.isArray(obj.readings) ? obj.readings : []
  const readings: ImportedReading[] = []
  for (const item of arr) {
    const norm = normalizeReading(item)
    if (norm) readings.push(norm)
  }
  return { readings }
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

  const { pdfBase64, range, answerKey } = (req.body ?? {}) as {
    pdfBase64?: string
    range?: string
    answerKey?: string
  }
  if (typeof pdfBase64 !== 'string' || !pdfBase64) {
    res.status(400).json({ error: 'pdfBase64가 필요합니다.' })
    return
  }
  if (typeof range !== 'string' || !range.trim()) {
    res.status(400).json({ error: '문항 범위(range)가 필요합니다.' })
    return
  }

  const userText = [
    `다음 문항을 PDF에서 추출해주세요: ${range.trim()}`,
    answerKey?.trim() ? `\n[정답표]\n${answerKey.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const client = new Anthropic({ apiKey })

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64,
              },
            },
            { type: 'text', text: userText },
          ],
        },
      ],
    })

    const textBlock = msg.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      res.status(502).json({ error: 'Claude 응답에 text가 없습니다.' })
      return
    }
    const parsed = parseJsonLoose(textBlock.text)
    res.status(200).json(parsed)
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    res.status(500).json({ error: message })
  }
}
