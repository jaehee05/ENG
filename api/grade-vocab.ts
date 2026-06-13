import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'

export const config = {
  maxDuration: 60,
}

const SYSTEM_PROMPT = `당신은 한국 고등학생 영어 단어 시험 채점관입니다.
각 항목은 영단어(en), 기대 한국어 뜻(expected), 학생이 쓴 답(userAnswer)입니다.

채점 원칙:
- 의미가 통하면 정답. 표기 차이·어순·어미 변화·동의어·근접 의미 모두 허용.
- 예: expected="포기하다, 버리다", userAnswer="그만두다" → 정답
- 예: expected="중요한", userAnswer="필수적인" → 정답 (문맥상 같은 의미면 OK)
- 예: expected="달리다", userAnswer="걷다" → 오답 (다른 동작)
- 동음이의 영단어인데 학생이 다른 의미를 쓴 경우: 그 영단어의 일반적인 의미 중 하나면 정답.
- userAnswer가 빈 문자열/공백뿐이면 무조건 오답.
- 한국어가 아닌 답(영어 등)이라도 의미가 맞으면 정답.

submit_results 도구를 호출해 items 배열과 같은 순서, 같은 길이의 results 배열을 전달하세요.`

interface GradeItem {
  en: string
  expected: string
  userAnswer: string
}

interface GradeResult {
  correct: boolean
}

function normalize(input: unknown): GradeResult[] {
  const obj = (input ?? {}) as { results?: unknown }
  const arr = Array.isArray(obj.results) ? obj.results : []
  return arr.map((r) => ({
    correct:
      typeof r === 'object' && r !== null && (r as { correct?: unknown }).correct === true,
  }))
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

  const { items } = (req.body ?? {}) as { items?: GradeItem[] }
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'items가 필요합니다.' })
    return
  }
  if (items.length > 200) {
    res.status(400).json({ error: '한 번에 200개까지 채점할 수 있습니다.' })
    return
  }

  const userText = [
    '[채점할 항목]',
    JSON.stringify(
      items.map((it, i) => ({
        i,
        en: String(it.en ?? ''),
        expected: String(it.expected ?? ''),
        userAnswer: String(it.userAnswer ?? ''),
      })),
    ),
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
          name: 'submit_results',
          description: '각 항목의 채점 결과를 제출합니다.',
          input_schema: {
            type: 'object',
            properties: {
              results: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    correct: { type: 'boolean' },
                  },
                  required: ['correct'],
                },
              },
            },
            required: ['results'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_results' },
      messages: [{ role: 'user', content: userText }],
    })

    const toolUse = msg.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      res.status(502).json({ error: 'Claude 응답에 결과가 없습니다.' })
      return
    }
    const results = normalize(toolUse.input)
    if (results.length !== items.length) {
      res.status(502).json({
        error: `결과 개수가 맞지 않습니다. (요청 ${items.length}, 응답 ${results.length})`,
      })
      return
    }
    res.status(200).json({ results })
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    res.status(500).json({ error: message })
  }
}
