import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `당신은 한국 고등학생을 위한 영어 지문 번역가입니다.
주어진 영어 지문을 자연스러운 한국어 해석으로 변환하세요.

규칙:
- 문장 단위로 번역하되, 영어 구조를 그대로 따라가는 직역은 피하고 자연스러운 한국어로
- 의역이지만 의미는 정확히
- 문단 구분(빈 줄)은 그대로 유지
- 원문에 등장하는 인명·지명은 음차(또는 통상 표기) 사용
- 원문에 등장하는 학술 용어는 (영어) 병기 가능 (예: "면역 체계(immune system)")
- 어색한 영어식 표현 ("~을 가지다", "~을 만들다") 지양

**밑줄/마커 보존 (매우 중요)**
원문에 다음 마커 형식이 있으면 한국어 번역에서도 **같은 형식**으로 살리세요.
- \`ⓐ{...}\`, \`ⓑ{...}\`, \`ⓒ{...}\`, \`ⓓ{...}\`, \`ⓔ{...}\` (어휘/지칭 밑줄)
- \`①{...}\`, \`②{...}\`, \`③{...}\`, \`④{...}\`, \`⑤{...}\` (어법/어휘 밑줄)
- \`{{...}}\` (단순 밑줄)

마커 안의 영어 단어/구가 한국어로 옮겨질 때, 그 영역에 해당하는 한국어 단어/구를 같은 마커로 감싸세요.
예시:
- 입력: "He ⓐ{liked} walking in the park."
- 출력: "그는 공원에서 산책하는 것을 ⓐ{좋아했다}."

- 입력: "The man ①{remembers} the day vividly. ②{Despite} the cold..."
- 출력: "그 남자는 그날을 생생히 ①{기억한다}. 추위에도 ②{불구하고}..."

- 입력: "He {{kicked the bucket}} last night."
- 출력: "그는 어젯밤 {{세상을 떠났다}}."

마커는 자리만 유지하지 말고 한국어 의미 영역에 정확히 감싸세요. 마커 종류·번호도 그대로 (ⓐ→ⓐ, ①→①). \`---\` 같은 구분선은 그대로 유지.

submit_translation 도구를 호출해 결과를 제출하세요.`

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

  const { passage } = (req.body ?? {}) as { passage?: string }
  if (typeof passage !== 'string' || !passage.trim()) {
    res.status(400).json({ error: 'passage가 필요합니다.' })
    return
  }

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
          name: 'submit_translation',
          description: '한국어 해석을 제출합니다.',
          input_schema: {
            type: 'object',
            properties: {
              passageKo: {
                type: 'string',
                description: '한국어 해석 전문',
              },
            },
            required: ['passageKo'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_translation' },
      messages: [{ role: 'user', content: passage.trim() }],
    })

    const toolUse = msg.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      res.status(502).json({ error: 'Claude 응답에 결과가 없습니다.' })
      return
    }
    const input = toolUse.input as { passageKo?: unknown }
    const passageKo = typeof input.passageKo === 'string' ? input.passageKo.trim() : ''
    if (!passageKo) {
      res.status(502).json({ error: '번역 결과가 비어 있습니다.' })
      return
    }
    res.status(200).json({ passageKo })
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    res.status(500).json({ error: message })
  }
}
