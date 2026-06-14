import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `당신은 영어가 약한 한국 학생을 위한 영어 모의고사 교재의 어휘 분석가입니다.
주어진 영어 지문과 5지선다 보기를 읽고, **영어를 잘 못하는 학생** 기준으로 모를 가능성이 있는 단어·숙어·구문을 폭넓게 추출하여 한국어 뜻을 답니다. 의심되면 포함하는 쪽으로.

추출 기준:
- 명사·동사·형용사·부사·전치사구·접속사 — 학생이 모를 만한 건 **초급 어휘까지 모두**
- 숙어·관용표현 포함 (예: around the clock, be tied to, keep ~ humming)
- 복합어·하이픈 표현 포함 (예: clock-oriented, machine-human relationship)
- 의미 있는 구·연어(collocation) 포함 (예: take place, set up, give up)
- 정말 누구나 아는 극히 기초 단어만 제외: 관사(a, the), be동사(is/are/was 등), 인칭대명사(I/you/he/she 등), 가장 흔한 조동사(do/does/did), 숫자, 요일, "and/or/but" 같은 기본 접속사
- 그 외 일반 명사·동사·형용사는 **쉬워 보여도 포함** (예: people, place, time, big, small, run, walk, look, see, want, give, take 등 학생이 한국어 뜻을 정확히 모를 수 있음)
- 지문 내 등장 순서대로 나열
- 보기에 등장하는 표현은 choicesGlossary에 별도로 (지문과 중복되더라도 OK)

**선지가 모두 한국어로만 작성되어 있다면 choicesGlossary는 비워서 제출하세요** (한국어 선지는 단어 풀이 불필요).

한국어 뜻 작성 규칙:
- 문맥에 맞는 뜻 1~3개를 쉼표로 구분 (예: "도래, 등장")
- 짧고 명확하게
- 동사는 기본형으로 (예: "이끌다, 좌우하다")
- 숙어는 '~' 자리표시자 사용 가능 (예: "~에 묶이다, ~와 연동되다")

submit_glossary 도구를 호출해 결과를 제출하세요.`

interface Entry {
  en: string
  ko: string
}

interface ExtractResult {
  glossary: Entry[]
  choicesGlossary: Entry[]
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

function normalize(obj: unknown): ExtractResult {
  const r = (obj ?? {}) as { glossary?: unknown; choicesGlossary?: unknown }
  const glossary: Entry[] = Array.isArray(r.glossary)
    ? r.glossary.filter((e) => isEntry(e))
    : []
  const choicesGlossary: Entry[] = Array.isArray(r.choicesGlossary)
    ? r.choicesGlossary.filter((e) => isEntry(e))
    : []
  return { glossary, choicesGlossary }
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
      tools: [
        {
          name: 'submit_glossary',
          description: '추출한 단어 풀이를 제출합니다.',
          input_schema: {
            type: 'object',
            properties: {
              glossary: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    en: { type: 'string' },
                    ko: { type: 'string' },
                  },
                  required: ['en', 'ko'],
                },
              },
              choicesGlossary: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    en: { type: 'string' },
                    ko: { type: 'string' },
                  },
                  required: ['en', 'ko'],
                },
              },
            },
            required: ['glossary', 'choicesGlossary'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_glossary' },
      messages: [{ role: 'user', content: userMessage }],
    })

    const toolUse = msg.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      res.status(502).json({ error: 'Claude 응답에 결과가 없습니다.' })
      return
    }
    res.status(200).json(normalize(toolUse.input))
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    res.status(500).json({ error: message })
  }
}
