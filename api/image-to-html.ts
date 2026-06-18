import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `당신은 한국 수능/모의고사 영어 도표·안내문 이미지를 시험지 형식 HTML로 재현하는 도구입니다.
이미지 안의 모든 텍스트와 표·목록·레이아웃을 그대로 HTML로 옮기세요. 번역하거나 의역하지 마세요.

스타일 규칙 (수능 시험지 형식 — 흰 바탕, 군더더기 없는 검정 글자/테두리):
- 완전한 HTML 문서 (<!DOCTYPE html> 포함, head에 인라인 CSS)
- 글꼴: "Times New Roman", Georgia, serif
- body: 배경 #fff (흰색), color #000, margin 0, padding 0
- 본문 컨테이너 .passage:
  · width 100%, max-width 600px
  · 흰 배경 #fff, 1.2px solid #000 가는 검정 테두리
  · padding 24px 28px
  · font-size 15.5px, line-height 1.55
  · margin 0 auto (중앙 정렬)
- 제목 h1: text-align center, 18px bold, margin-bottom 14px
- 안내 단락 .intro: text-align center, margin 0 auto 16px, line-height 1.55
- 항목 줄 .row: margin-bottom 9px. .label에 font-weight 700
- 목록 ul/li: 글머리는 en-dash(–) — li::before content "\\2013", 들여쓰기 padding-left 14px, margin-bottom 1px
- 표 table:
  · width 100%, border-collapse collapse
  · 셀 1px solid #000, padding 5px 7px
  · text-align center, font-size 14.5px
  · th는 bold
- 이미지 속 ★/▲/■/♥ 같은 도형은 그대로 텍스트로 옮기기 (필요하면 유니코드)
- 흐릿한 글자가 ★*#△ 같은 censoring 표기면 그대로
- 줄바꿈/문단 구조 원본 유지
- 시각 강조(굵게/이탤릭)는 <strong>/<em>
- 외부 폰트/스크립트/이미지 절대 사용 금지 (인라인만)

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
