import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `당신은 한국 고등학생을 위한 영어 지문 어휘 풀이 도구입니다.
주어진 영어 지문과 5지선다 보기에 등장하는 **거의 모든 어휘**를 한국어 뜻과 함께 추출합니다.
"학생이 알 만한가?"를 따지지 말고, 의미가 있는 단어·구는 전부 포함하세요.

포함 대상:
- 모든 명사·동사·형용사·부사·전치사·접속사 (쉽다고 느껴도 포함)
- 숙어·관용표현 (around the clock, be tied to, keep ~ humming 등)
- 복합어·하이픈 표현 (clock-oriented, machine-human relationship 등)
- 구동사·연어 (take place, set up, give up 등)
- 본문 등장 순서대로 나열
- 같은 단어는 한 번만 (중복 제외)

제외 대상 (극히 기초 기능어만):
- 관사: a, an, the
- be동사 전체: is, are, was, were, be, been, being, am
- 일반 조동사: do, does, did, will, would, can, could, may, might, should, must, shall, ought
- 인칭대명사 및 소유격: I, me, my, mine, you, your, yours, he, him, his, she, her, hers, it, its, we, us, our, ours, they, them, their, theirs
- 지시대명사: this, that, these, those
- 단순 접속사: and, or, but, so, if, when, while, because (단, although/whereas 등은 포함)
- 단순 전치사 중 of/to/in/on/at/by/for/with (단, into/onto/within/without/throughout 등은 포함)
- 숫자, 요일, 월 이름
- 사람·지명 고유명사

(헷갈리면 포함하는 쪽으로.)

선지(choices)에서도 동일 기준으로 choicesGlossary 추출.
**선지가 모두 한국어로만 작성되어 있다면 choicesGlossary는 비워서 제출하세요.**

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
      max_tokens: 8192,
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
