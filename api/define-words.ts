import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `당신은 한국 고등학생용 영어 모의고사 교재를 만드는 어휘 분석가입니다.
주어진 영어 지문(맥락)과 그 안에서 선택된 여러 단어·숙어·구문 목록을 보고, 각 표현마다 해당 맥락에 가장 알맞은 한국어 뜻을 답니다.

한국어 뜻 작성 규칙:
- 반드시 지문의 문맥에 맞는 뜻으로 (사전적 1번 뜻이 아니라 이 지문에서 쓰인 의미)
- 문맥에 맞는 뜻 1~3개를 쉼표로 구분 (예: "도래, 등장")
- 짧고 명확하게
- 동사는 기본형으로 (예: "이끌다, 좌우하다")
- 숙어는 '~' 자리표시자 사용 가능 (예: "~에 묶이다, ~와 연동되다")
- 여러 단어로 된 표현은 그 구/숙어 전체의 뜻을 답니다

규칙:
- 입력으로 받은 표현(en)은 글자 그대로 그대로 돌려주세요 (대소문자·철자 변경 금지)
- 입력 목록의 모든 표현을 빠짐없이 같은 순서로 포함

출력은 반드시 아래 JSON 형식만 출력하고, 다른 어떤 설명·코드펜스도 붙이지 마세요.

{ "entries": [ { "en": "string", "ko": "string" } ] }`

interface Entry {
  en: string
  ko: string
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

function parseEntries(text: string): Entry[] {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : trimmed
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error('JSON 응답을 찾을 수 없습니다.')
  const obj = JSON.parse(body.slice(start, end + 1))
  return Array.isArray(obj.entries) ? obj.entries.filter(isEntry) : []
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

  const { words, passage } = (req.body ?? {}) as {
    words?: string[]
    passage?: string
  }
  const cleanWords = Array.isArray(words)
    ? [...new Set(words.map((w) => (typeof w === 'string' ? w.trim() : '')).filter(Boolean))]
    : []
  if (cleanWords.length === 0) {
    res.status(400).json({ error: 'words가 필요합니다.' })
    return
  }

  const userMessage = [
    '[지문 맥락]',
    typeof passage === 'string' && passage.trim() ? passage.trim() : '(맥락 없음)',
    '',
    '[뜻을 찾을 표현 목록]',
    cleanWords.map((w, i) => `${i + 1}. ${w}`).join('\n'),
  ].join('\n')

  const client = new Anthropic({ apiKey })

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const textBlock = msg.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      res.status(502).json({ error: 'Claude 응답에 text가 없습니다.' })
      return
    }
    res.status(200).json({ entries: parseEntries(textBlock.text) })
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    res.status(500).json({ error: message })
  }
}
