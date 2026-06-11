import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'

export const config = {
  maxDuration: 30,
}

const SYSTEM_PROMPT = `당신은 한국 고등학생을 위한 영어 어휘 학습 자료 작성자입니다.
주어진 영어 단어 목록 각각에 다음 두 가지를 추가해 JSON으로 반환합니다.

1. example: 그 단어가 자연스럽게 쓰인 한 문장의 영어 예문.
   - 단어를 그대로 또는 자연스러운 활용형으로 포함
   - 수능 지문 톤(중급, 한 문장 12~22 단어)
2. definitionEn: 단어의 영영 정의(영어로 설명).
   - 학습자가 이해할 수 있는 쉬운 영어로
   - 한국어 뜻과 같은 문맥의 뜻을 정의
   - 콜린스/롱맨 학습자 사전 스타일 (한 줄, 한 문장)

원본 en/ko는 그대로 두고 example과 definitionEn만 추가합니다.

출력은 아래 JSON 형식만, 다른 설명·코드펜스를 붙이지 마세요.

{
  "words": [
    {
      "en": "abandon",
      "ko": "버리다, 포기하다",
      "example": "She had to abandon her plan to study abroad due to family issues.",
      "definitionEn": "to leave a person, thing, or place permanently, especially when you should stay and look after them"
    }
  ]
}`

interface InputWord {
  en: string
  ko: string
}

interface EnrichedWord {
  en: string
  ko: string
  example: string
  definitionEn: string
}

function isStr(x: unknown): x is string {
  return typeof x === 'string'
}

function parseJsonLoose(text: string): EnrichedWord[] {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : trimmed
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error('JSON 응답을 찾을 수 없습니다.')
  const slice = body.slice(start, end + 1)
  const obj = JSON.parse(slice)
  const arr = Array.isArray(obj.words) ? obj.words : []
  const out: EnrichedWord[] = []
  for (const w of arr) {
    if (!w || typeof w !== 'object') continue
    const en = isStr((w as Record<string, unknown>).en) ? ((w as Record<string, unknown>).en as string).trim() : ''
    const ko = isStr((w as Record<string, unknown>).ko) ? ((w as Record<string, unknown>).ko as string).trim() : ''
    const example = isStr((w as Record<string, unknown>).example) ? ((w as Record<string, unknown>).example as string).trim() : ''
    const definitionEn = isStr((w as Record<string, unknown>).definitionEn)
      ? ((w as Record<string, unknown>).definitionEn as string).trim()
      : ''
    if (!en) continue
    out.push({ en, ko, example, definitionEn })
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

  const { words } = (req.body ?? {}) as { words?: InputWord[] }
  if (!Array.isArray(words) || words.length === 0) {
    res.status(400).json({ error: 'words 배열이 필요합니다.' })
    return
  }

  const compact = words
    .filter((w) => w && typeof w.en === 'string' && w.en.trim())
    .map((w) => ({ en: w.en.trim(), ko: typeof w.ko === 'string' ? w.ko.trim() : '' }))

  const userText = [
    '다음 단어 목록에 자연스러운 예문과 영영 정의를 추가해주세요.',
    JSON.stringify({ words: compact }, null, 2),
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
      messages: [{ role: 'user', content: userText }],
    })

    const textBlock = msg.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      res.status(502).json({ error: 'Claude 응답에 text가 없습니다.' })
      return
    }
    const enriched = parseJsonLoose(textBlock.text)
    res.status(200).json({ words: enriched })
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    res.status(500).json({ error: message })
  }
}
