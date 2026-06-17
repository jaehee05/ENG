import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `당신은 영어 모의고사 도표/안내문 이미지를 HTML로 재현하는 도구입니다.
이미지 안의 모든 텍스트와 표·목록·레이아웃을 그대로 HTML로 옮기세요. 번역하거나 의역하지 마세요.

스타일 규칙 (CSAT 지문 박스 형식):
- 완전한 HTML 문서 (<!DOCTYPE html> 포함, head에 인라인 CSS)
- 글꼴: "Times New Roman", Georgia, serif (메인 영어 자료)
- 본문 컨테이너 .passage: max-width 600px, 흰 배경 #fff, 1.5px solid #000 테두리, padding 34px 40px 38px, font-size 16px, line-height 1.6
- body: 회색 배경 #d9d9d9, padding 48px 16px
- 제목 h1: text-align center, 23px bold
- intro 단락: text-align center, margin-bottom 22px
- 항목 한 줄(.row): margin-bottom 11px, .label에 font-weight 700
- 목록 ul/li: 글머리는 en-dash(–) — li::before content "\\2013"로 표현, 들여쓰기 padding-left 16px
- 표 table: width 100%, border-collapse collapse, 1px solid #000 셀, text-align center, th는 bold
- 이미지에 등장하는 ★/▲/■/♥ 같은 도형은 그대로 텍스트로 (필요하면 유니코드 entity)
- 흐릿한 글자 일부가 ★*#△ 같은 censoring 표기로 보이면 그대로 옮기기
- 줄바꿈/문단 구조도 원본대로 유지
- 이미지의 시각적 강조(굵게/이탤릭)는 <strong>/<em>으로
- 외부 폰트/스크립트/이미지 절대 사용 금지

submit_html 도구를 호출해 html 한 덩어리로 제출하세요.`

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

  const { image } = (req.body ?? {}) as { image?: string }
  if (typeof image !== 'string' || !image.startsWith('data:image/')) {
    res.status(400).json({ error: 'image (data URL)가 필요합니다.' })
    return
  }
  const m = image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/)
  if (!m) {
    res.status(400).json({ error: 'image data URL 파싱 실패' })
    return
  }
  const mediaType = m[1]
  const data = m[2]

  const client = new Anthropic({ apiKey })
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      tools: [
        {
          name: 'submit_html',
          description: '이미지를 재현한 완전한 HTML 문서를 제출합니다.',
          input_schema: {
            type: 'object',
            properties: {
              html: {
                type: 'string',
                description: '<!DOCTYPE html>부터 시작하는 완전한 HTML 문서',
              },
            },
            required: ['html'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_html' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
                data,
              },
            },
            { type: 'text', text: '이 이미지의 텍스트/표/레이아웃을 HTML로 재현해 주세요.' },
          ],
        },
      ],
    })

    const toolUse = msg.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      res.status(502).json({ error: 'Claude 응답에 결과가 없습니다.' })
      return
    }
    const input = toolUse.input as { html?: unknown }
    const html = typeof input.html === 'string' ? input.html.trim() : ''
    if (!html) {
      res.status(502).json({ error: 'HTML 결과가 비어 있습니다.' })
      return
    }
    res.status(200).json({ html })
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    res.status(500).json({ error: message })
  }
}
