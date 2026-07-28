import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'

export const config = {
  maxDuration: 60,
}

const SYSTEM_PROMPT = `당신은 한국 고등학생용 영어 단어 5지선다 시험지를 만드는 출제자입니다.
주어진 단어 각각에 대해 "매력적인 오답 뜻" 4개를 만들어 submit_distractors 도구를 호출하세요.

오답은 다음 두 종류를 섞어서 만듭니다.

1) 반대 뜻 — 그 단어의 반의어에 해당하는 한국어 뜻.
   예: increase(증가하다) → "감소하다", abundant(풍부한) → "부족한"

2) 스펠링이 비슷한 다른 단어의 뜻 — 철자가 헷갈리기 쉬운 실제 영어 단어를 떠올리고,
   그 단어의 뜻을 적습니다. 그 단어 자체는 적지 않고 "뜻"만 적습니다.
   예: adapt(적응하다) → "입양하다"(adopt), "채택하다"(adept 아님 주의)
       desert(사막) → "디저트, 후식"(dessert)
       principal(교장) → "원칙"(principle)

규칙:
- 각 단어마다 정확히 4개. 2)번 유형을 최소 1개는 포함하세요.
- 4개 모두 서로 다르고, 정답 뜻(ko)과 의미가 겹치지 않아야 합니다.
  정답과 같은 뜻이거나 동의어인 오답은 절대 만들지 마세요.
- 정답 뜻과 형식·길이를 비슷하게 맞추세요. 정답만 유독 길거나 짧으면 답이 보입니다.
  정답이 "증가하다"면 오답도 "감소하다"처럼 동사로, 정답이 "풍부한"이면 오답도 형용사로.
- 품사를 정답과 맞추세요.
- 한국어 뜻만 적습니다. 영어 단어나 괄호 설명을 넣지 마세요.
- 확실한 오답을 못 만들겠으면 그 단어는 distractors를 빈 배열로 두세요.
  억지로 만들지 마세요 — 빈 자리는 다른 단어의 뜻으로 채웁니다.`

interface InputWord {
  en: string
  ko: string
}

interface WordDistractors {
  en: string
  distractors: string[]
}

function isStr(x: unknown): x is string {
  return typeof x === 'string'
}

function normalize(input: unknown): WordDistractors[] {
  const obj = (input ?? {}) as { words?: unknown }
  const arr = Array.isArray(obj.words) ? obj.words : []
  const out: WordDistractors[] = []
  for (const w of arr) {
    if (!w || typeof w !== 'object') continue
    const r = w as Record<string, unknown>
    const en = isStr(r.en) ? r.en.trim() : ''
    if (!en) continue
    const raw = Array.isArray(r.distractors) ? r.distractors : []
    const seen = new Set<string>()
    const distractors: string[] = []
    for (const d of raw) {
      const s = isStr(d) ? d.trim() : ''
      if (!s || seen.has(s)) continue
      seen.add(s)
      distractors.push(s)
    }
    out.push({ en, distractors: distractors.slice(0, 4) })
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
    '다음 단어들의 오답 선지를 만들어 submit_distractors 도구를 호출하세요.',
    JSON.stringify({ words: compact }),
  ].join('\n')

  const client = new Anthropic({ apiKey })

  try {
    const msg = await client.messages.create({
      model: 'claude-opus-5',
      // thinking 은 기본값(적응형)으로 둔다. Opus 5 에서 thinking 을 끈 채
      // tool_choice 를 강제하면 도구 호출이 평문으로 새어나와 조용히 실패할 수 있다.
      max_tokens: 16000,
      // 기계적인 작업이라 낮은 effort 로 충분하다.
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: 'submit_distractors',
          description: '단어별 오답 선지 4개를 제출합니다.',
          input_schema: {
            type: 'object',
            properties: {
              words: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    en: { type: 'string' },
                    distractors: {
                      type: 'array',
                      items: { type: 'string' },
                      description: '오답 뜻 4개. 못 만들면 빈 배열.',
                    },
                  },
                  required: ['en', 'distractors'],
                },
              },
            },
            required: ['words'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_distractors' },
      messages: [{ role: 'user', content: userText }],
    })

    const toolUse = msg.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      res.status(502).json({ error: 'Claude 응답에 결과가 없습니다.' })
      return
    }
    res.status(200).json({ words: normalize(toolUse.input) })
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    res.status(500).json({ error: message })
  }
}
