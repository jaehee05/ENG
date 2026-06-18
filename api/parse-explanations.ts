import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'

export const config = {
  maxDuration: 60,
}

const SYSTEM_PROMPT = `당신은 한국 수능/모의고사 영어 해설을 reading의 각 문항에 분배하는 도구입니다.

입력:
1) reading 안 문항 목록 — index(0부터)와 number(원본 시험 번호, 없으면 0)와 q(발문)
2) 한국어 해설 텍스트 — "41. 정답 ① 해설 ..." 같이 문항별로 정리되어 있거나 줄글로 섞여 있음

작업:
- 각 문항(index)에 대응하는 한국어 해설 본문을 추출해 explanations 배열에 담으세요.
- **index는 입력에 제시된 값 그대로 사용** (재인덱싱하지 마세요).
- 매핑 우선순위:
  (a) 해설 텍스트에 "41.", "[41]", "41번", "41번 문항", "문항 41", "Q41", "## 41" 같은 다양한 문항 번호 표지를 인식해서 reading 문항의 number와 일치하는 항목에 매핑
  (b) 번호가 없으면 발문/주제/유형 키워드로 추정
- 해설 본문에서 단순 표지("정답: ③", "Answer: ③", "* 정답: ④" 등)는 제거하고 풀이 줄글(정답 근거, 오답 분석, 추론 단서 등)만 담습니다.
- **해설 텍스트의 정답 번호가 reading에 저장된 정답과 다르더라도 explanation에는 풀이 줄글만 담으세요.** 정답 번호 자체는 reading.answer를 기준으로 하므로, 해설의 정답 표지를 그대로 옮기지 마세요.
- 입력 해설에 "* 어휘:" 같은 어휘 정리 섹션이 들어 있으면 그건 해설에 포함하지 마세요 (단어 풀이는 별도 단계에서 처리).
- 해설이 없는 문항은 explanation을 빈 문자열로 두세요.
- 반드시 입력에 제시된 모든 문항 index에 대해 explanations 배열 항목을 채우세요 (해설이 없어도 빈 문자열로).

submit_explanations 도구를 호출해 결과를 제출하세요.`

interface QuestionRef {
  index: number
  number: number
  q: string
}

interface ExplanationItem {
  index: number
  explanation: string
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

  const { questions, text } = (req.body ?? {}) as {
    questions?: QuestionRef[]
    text?: string
  }
  if (!Array.isArray(questions) || questions.length === 0) {
    res.status(400).json({ error: 'questions 배열이 필요합니다.' })
    return
  }
  if (typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'text가 필요합니다.' })
    return
  }
  if (text.length > 40000) {
    res.status(400).json({ error: '텍스트가 너무 깁니다. (40000자 이내)' })
    return
  }

  const qListText = questions
    .map(
      (q) =>
        `[index=${q.index}, number=${q.number || '없음'}] ${q.q.slice(0, 120)}`,
    )
    .join('\n')

  const userMessage = `[reading 문항 목록]\n${qListText}\n\n[해설 텍스트]\n${text.trim()}`

  const client = new Anthropic({ apiKey })

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      tools: [
        {
          name: 'submit_explanations',
          description: '문항별 한국어 해설을 제출합니다.',
          input_schema: {
            type: 'object',
            properties: {
              explanations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    index: { type: 'integer', minimum: 0 },
                    explanation: { type: 'string' },
                  },
                  required: ['index', 'explanation'],
                },
              },
            },
            required: ['explanations'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_explanations' },
      messages: [{ role: 'user', content: userMessage }],
    })

    const toolUse = msg.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      res.status(502).json({ error: 'Claude 응답에 결과가 없습니다.' })
      return
    }
    const input = toolUse.input as { explanations?: unknown }
    const raw = Array.isArray(input.explanations) ? input.explanations : []
    const explanations: ExplanationItem[] = []
    for (const item of raw) {
      if (typeof item !== 'object' || item === null) continue
      const r = item as Record<string, unknown>
      const idx = typeof r.index === 'number' ? Math.trunc(r.index) : -1
      const exp = typeof r.explanation === 'string' ? r.explanation.trim() : ''
      if (idx < 0 || idx >= questions.length) continue
      explanations.push({ index: idx, explanation: exp })
    }
    res.status(200).json({ explanations })
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    res.status(500).json({ error: message })
  }
}
