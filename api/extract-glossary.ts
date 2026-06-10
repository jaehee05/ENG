import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `당신은 한국 고등학생용 영어 모의고사 교재를 만드는 어휘 분석가입니다.
주어진 영어 지문과 5지선다 보기를 읽고, 학생(고1~고3 수능 수준)이 모를 가능성이 있는 단어·숙어·구문을 모두 추출하여 한국어 뜻을 답니다.

추출 기준:
- 명사·동사·형용사·부사 중 중급~고급 어휘를 빠짐없이
- 숙어·관용표현 포함 (예: around the clock, be tied to, keep ~ humming)
- 복합어·하이픈 표현 포함 (예: clock-oriented, machine-human relationship)
- 매우 기초적인 단어(a, the, is, have, go 등)는 제외
- 지문 내 등장 순서대로 나열
- 보기에 등장하는 표현은 choicesGlossary에 별도로 (지문과 중복되더라도 OK)

한국어 뜻 작성 규칙:
- 문맥에 맞는 뜻 1~3개를 쉼표로 구분 (예: "도래, 등장")
- 짧고 명확하게
- 동사는 기본형으로 (예: "이끌다, 좌우하다")
- 숙어는 '~' 자리표시자 사용 가능 (예: "~에 묶이다, ~와 연동되다")

출력은 반드시 아래 JSON 형식만 출력하고, 다른 어떤 설명·코드펜스도 붙이지 마세요.

{
  "glossary": [
    { "en": "string", "ko": "string" }
  ],
  "choicesGlossary": [
    { "en": "string", "ko": "string" }
  ]
}`

interface Entry {
  en: string
  ko: string
}

interface ExtractResult {
  glossary: Entry[]
  choicesGlossary: Entry[]
}

function parseJsonLoose(text: string): ExtractResult {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : trimmed
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error('JSON 응답을 찾을 수 없습니다.')
  const slice = body.slice(start, end + 1)
  const obj = JSON.parse(slice)
  const glossary: Entry[] = Array.isArray(obj.glossary)
    ? obj.glossary.filter((e: unknown) => isEntry(e))
    : []
  const choicesGlossary: Entry[] = Array.isArray(obj.choicesGlossary)
    ? obj.choicesGlossary.filter((e: unknown) => isEntry(e))
    : []
  return { glossary, choicesGlossary }
}

function isEntry(e: unknown): e is Entry {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as Entry).en === 'string' &&
    typeof (e as Entry).ko === 'string' &&
    (e as Entry).en.trim().length > 0 &&
    (e as Entry).ko.trim().length > 0
  )
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

  const { passage, choices } = (req.body ?? {}) as {
    passage?: string
    choices?: string[]
  }
  if (typeof passage !== 'string' || !passage.trim()) {
    res.status(400).json({ error: 'passage가 필요합니다.' })
    return
  }

  const userMessage = [
    '[지문]',
    passage.trim(),
    '',
    '[보기]',
    Array.isArray(choices) && choices.length > 0
      ? choices.map((c, i) => `${i + 1}. ${c}`).join('\n')
      : '(보기 없음)',
  ].join('\n')

  const client = new Anthropic({ apiKey })

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userMessage }],
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
