import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'

export const config = {
  maxDuration: 60,
}

const SYSTEM_PROMPT = `당신은 한국 수능/모의고사 영어 문제 원문 텍스트 또는 시험지 캡쳐 이미지를 파싱하는 분석가입니다.
입력에는 본문(지문) + 발문 + 5지선다(①~⑤) + 가끔 정답·해설이 포함되어 있습니다.

**중요한 동작 규칙 (우선순위 최상위)**
- 입력에서 문항 1개라도 식별되면 **반드시 submit_reading 도구를 호출**하세요. 설명만 텍스트로 출력하지 마세요.
- 정답 표시가 입력에 없으면 **answer=0으로 그냥 제출**하세요. 정답이 없다는 이유로 호출을 거르지 마세요. 사용자가 나중에 직접 정답을 고칠 겁니다.
- 발문이 잘려 있거나 누락된 경우 합리적으로 추정하세요(예: 본문에 빈칸이 있으면 "다음 빈칸에 들어갈 말로 가장 적절한 것은?"). 추정한 발문이라도 그대로 q에 넣고 도구를 호출하세요.
- 선지가 5개 미만이면 빈 문자열로 채워서 5개를 맞춰 제출하세요.

submit_reading을 호출하지 않고 텍스트만 출력해도 되는 경우는 입력에 영어 문제 구조(발문·선지·지문 중 어느 것도)가 전혀 보이지 않을 때뿐입니다.

원문에는 다음 노이즈가 섞여 있을 수 있습니다. 모두 제거하세요.
- 문항 번호 (예: "31.", "[31~32]")
- 배점 표기 (예: "[3점]", "(3점)")
- 별표 단어 풀이 (예: "* paradigm: 패러다임")
- 해설/번역 문단
- 페이지 번호, 시험명 헤더/푸터

규칙:
- title: 출처 정보가 명확하면 그대로(예: "2024학년도 6월 모평 31번"). 모르면 빈 문자열.
- passageKo: 입력에 한국어로 작성된 **지문 해석/번역 문단**이 영어 본문과 같이 들어 있으면, 그 한국어 줄글을 모아 여기에 담으세요. 영어 문장 사이사이에 한국어 해석이 줄별로 끼어 있으면 한국어 부분만 모아서 자연스러운 문단으로 정리해 담으세요. 해석/번역이 없으면 빈 문자열.
- explanation (문항별): 입력에 각 문항의 **해설/풀이**(정답 근거, 오답 분석, 추론 단서 등)가 한국어로 들어 있으면, 그 문항의 explanation 필드에 담으세요. "해설", "풀이", "정답: ③", "왜냐하면..." 같은 표지로 시작하는 줄글이 포함됩니다. 단순 한 줄 정답 표시("정답: ③")만 있으면 explanation은 빈 문자열로 두고 answer만 채우세요. 해설 본문이 있으면 정답 표시는 빼고 풀이 줄글만 정리해서 담으세요.
- passage: 본문 영어 텍스트는 **항상 여기에 넣으세요**. 단일 문항이라도 본문은 passage에. 절대 questions[].body에 본문 텍스트를 넣지 마세요. passage에는 한국어 해석을 섞지 말 것 (영어만).
  - **세트(43~45) 처리**: 본문이 (A)(B)(C)(D) 단락으로 명시적으로 분리된 장문 독해(보통 43~45번)는 passage를 비우고, **첫 문항(보통 43번 글 순서 배열)을 type='order'로 분류 + partA/partB/partC/partD에 단락 텍스트를 그대로 넣으세요**. 셔플된 원본 순서 유지(글 흐름대로 재정렬 X). 두 번째·세 번째 문항(44번 지칭 추론, 45번 일치/불일치 등)은 body도 비우고 passage도 비웁니다 — 학생 화면에서 첫 문항의 (A)(B)(C)(D) 박스가 공용 지문 역할을 합니다.
  - **세트(41~42)** 같은 2문항 평지문은 기존대로 passage에 한 덩어리.
- type 분류:
  - cloze: 본문에 빈칸이 있는 빈칸 추론
  - order: 주어진 글 + (A)(B)(C) 순서
  - insert: 주어진 문장 + 본문 안 ①~⑤ 위치
  - summary: 지문 + 요약문 박스에 (A)(B) 빈칸
  - irrelevant: 본문에 ①~⑤ 표시된 문장 중 흐름과 무관
  - underline-grammar: 본문 ①~⑤ 밑줄 중 어법상 틀린 것
  - underline-vocab: 본문 ①~⑤ 밑줄 중 문맥상 부적절한 낱말
  - standard: 그 외 (제목/주제/주장/요지/심정/일치/도표 등)
- q: 발문 (예: "다음 빈칸에 들어갈 말로 가장 적절한 것은?"). 발문 끝의 [3점]/[2점] 같은 배점 표기는 빼고 깨끗한 발문만. 문항 번호("41.", "[43~45]" 등)도 빼고 발문만.
- number: 원문에 표시된 문항 번호 (예: 41, 42, 43). 발견 못하면 0. 세트(41~42)면 각 문항이 41, 42를 따로 가짐.
- points: 발문 끝에 [3점]이 있었으면 3, 그 외엔 2.
- body: **기본적으로 비우세요(빈 문자열)**. passage를 사용합니다. 이 필드는 해당 문항만 다른 본문이 필요한 특수 케이스에만 채웁니다.
  - 빈칸은 8개 이상 밑줄(________)로
  - insert, irrelevant, underline-* 유형은 본문에 원본 마커 유지 (①②③④⑤ 또는 ⓐⓑⓒⓓⓔ)
  - underline-grammar / underline-vocab 유형은 밑줄 범위를 \`마커{...}\` 형식으로 감쌀 것. **원본의 마커 종류 그대로 유지** — 원본이 ①②③④⑤이면 그대로, (a)(b)(c)(d)(e) 또는 ⓐⓑⓒⓓⓔ이면 ⓐⓑⓒⓓⓔ로 변환해 사용. 절대 ⓐⓑⓒ를 ①②③으로 임의로 바꾸지 말 것. 예: "He ①{liked} ②{walking}" 또는 "He ⓐ{liked} ⓑ{walking}". 마커와 중괄호 사이 공백 X.
  - 그 외에 본문에 단순히 밑줄 친 부분이 있고 발문이 그걸 가리키는 경우(예: "밑줄 친 ~가 의미하는 바로 가장 적절한 것은?"), 그 부분을 \`{{...}}\`로 감쌀 것. 예: "He {{kicked the bucket}} last night."
- intro: order/insert에서 박스로 주어진 글/문장
- partA, partB, partC, partD: **order 유형 전용**. 본문 순서를 묻는 (A), (B), (C), (D) 단락을 각각 분리해서 채웁니다. body는 사용하지 말 것. (D)가 없으면 partD는 빈 문자열.
- partAKo, partBKo, partCKo, partDKo: order 유형의 (A)(B)(C)(D) 각 단락에 대한 **한국어 해석**. 입력에 단락별 해석이 있으면 각각 분배. 부분 해석만 있으면 가능한 부분만 채우고 없는 건 빈 문자열. 단락별 해석 없이 통합 한글 해석만 있으면 partAKo~partDKo는 모두 빈 문자열로 두고 passageKo에 통합 한글 해석을 담으세요.
- summaryBox: summary에서 박스 안 요약문, (A)/(B) 빈칸 그대로
- choices: 정확히 5개. ①~⑤ 마커는 빼고 텍스트만.
  - summary 유형: "(A) ...... (B) ......" 형태로 한 항목에 함께
  - order 유형: "(A) - (C) - (B)" 같은 순서 표기 그대로
- answer: 원문에 정답 표시("정답: ③", "Answer: 3" 등)가 있으면 그 인덱스(0~4). 없으면 0.
- hasChart: 해당 문항에 **표·그래프·다이어그램·도표·그림**(텍스트로 옮기기 어려운 시각 자료)이 포함돼 있으면 true, 아니면 false. 단순 텍스트 박스나 ①~⑤ 마커는 도표가 아님.`

const ALLOWED_TYPES = [
  'standard',
  'cloze',
  'order',
  'insert',
  'summary',
  'irrelevant',
  'underline-grammar',
  'underline-vocab',
] as const

const ALLOWED_SET = new Set<string>(ALLOWED_TYPES)

interface ParsedQuestion {
  type: string
  q: string
  body: string
  intro: string
  summaryBox: string
  choices: string[]
  answer: number
  points?: number
  number?: number
  hasChart?: boolean
  partA?: string
  partB?: string
  partC?: string
  partD?: string
  partAKo?: string
  partBKo?: string
  partCKo?: string
  partDKo?: string
  explanation?: string
}

interface ParseResult {
  title: string
  passage: string
  passageKo: string
  questions: ParsedQuestion[]
}

function normalizeQuestion(raw: unknown): ParsedQuestion | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const type =
    typeof r.type === 'string' && ALLOWED_SET.has(r.type) ? r.type : 'standard'
  const q = typeof r.q === 'string' ? r.q.trim() : ''
  const body = typeof r.body === 'string' ? r.body.trim() : ''
  const choicesRaw = Array.isArray(r.choices) ? r.choices : []
  const choices = choicesRaw.map((c) => (typeof c === 'string' ? c.trim() : ''))
  if (!q && !body && choices.every((c) => !c)) return null
  while (choices.length < 5) choices.push('')
  const answer =
    typeof r.answer === 'number' && r.answer >= 0 && r.answer <= 4 ? Math.trunc(r.answer) : 0
  const pointsRaw = typeof r.points === 'number' ? Math.trunc(r.points) : 0
  const points = pointsRaw >= 1 && pointsRaw <= 5 ? pointsRaw : undefined
  const numberRaw = typeof r.number === 'number' ? Math.trunc(r.number) : 0
  const number = numberRaw > 0 && numberRaw < 100 ? numberRaw : undefined
  return {
    type,
    q,
    body,
    intro: typeof r.intro === 'string' ? r.intro.trim() : '',
    summaryBox: typeof r.summaryBox === 'string' ? r.summaryBox.trim() : '',
    choices: choices.slice(0, 5),
    answer,
    points,
    number,
    hasChart: r.hasChart === true,
    partA: typeof r.partA === 'string' ? r.partA.trim() : '',
    partB: typeof r.partB === 'string' ? r.partB.trim() : '',
    partC: typeof r.partC === 'string' ? r.partC.trim() : '',
    partD: typeof r.partD === 'string' ? r.partD.trim() : '',
    partAKo: typeof r.partAKo === 'string' ? r.partAKo.trim() : '',
    partBKo: typeof r.partBKo === 'string' ? r.partBKo.trim() : '',
    partCKo: typeof r.partCKo === 'string' ? r.partCKo.trim() : '',
    partDKo: typeof r.partDKo === 'string' ? r.partDKo.trim() : '',
    explanation: typeof r.explanation === 'string' ? r.explanation.trim() : '',
  }
}

function normalizeResult(obj: unknown): ParseResult {
  const r = (obj ?? {}) as Record<string, unknown>
  const title = typeof r.title === 'string' ? r.title.trim() : ''
  const passage = typeof r.passage === 'string' ? r.passage.trim() : ''
  const passageKo = typeof r.passageKo === 'string' ? r.passageKo.trim() : ''
  const arr = Array.isArray(r.questions) ? r.questions : []
  const questions: ParsedQuestion[] = []
  for (const item of arr) {
    const norm = normalizeQuestion(item)
    if (norm) questions.push(norm)
  }
  return { title, passage, passageKo, questions }
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

  const { text, images } = (req.body ?? {}) as { text?: string; images?: string[] }
  const hasText = typeof text === 'string' && text.trim().length > 0
  const imageList = Array.isArray(images) ? images.filter((s) => typeof s === 'string' && s) : []
  if (!hasText && imageList.length === 0) {
    res.status(400).json({ error: 'text 또는 images가 필요합니다.' })
    return
  }
  if (hasText && (text as string).length > 40000) {
    res.status(400).json({ error: '텍스트가 너무 깁니다. (40000자 이내)' })
    return
  }
  if (imageList.length > 8) {
    res.status(400).json({ error: '이미지는 한 번에 8장까지 첨부할 수 있습니다.' })
    return
  }

  const userContent: Anthropic.Messages.ContentBlockParam[] = []
  for (const raw of imageList) {
    let data = raw
    let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/png'
    const m = raw.match(/^data:([^;]+);base64,(.+)$/)
    if (m) {
      const mt = m[1]
      data = m[2]
      if (mt === 'image/jpeg' || mt === 'image/jpg') mediaType = 'image/jpeg'
      else if (mt === 'image/gif') mediaType = 'image/gif'
      else if (mt === 'image/webp') mediaType = 'image/webp'
      else mediaType = 'image/png'
    }
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data },
    })
  }
  if (hasText) {
    userContent.push({ type: 'text', text: `[원문]\n${(text as string).trim()}` })
  } else {
    userContent.push({
      type: 'text',
      text: '첨부된 이미지(시험지/캡쳐)에서 문항을 추출해주세요.',
    })
  }

  const client = new Anthropic({ apiKey })

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: 'submit_reading',
          description: '추출한 지문과 문항을 제출합니다.',
          input_schema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              passage: { type: 'string' },
              passageKo: { type: 'string' },
              questions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: [...ALLOWED_TYPES] },
                    q: { type: 'string' },
                    body: { type: 'string' },
                    intro: { type: 'string' },
                    summaryBox: { type: 'string' },
                    choices: {
                      type: 'array',
                      items: { type: 'string' },
                      minItems: 5,
                      maxItems: 5,
                    },
                    answer: { type: 'integer', minimum: 0, maximum: 4 },
                    points: { type: 'integer', minimum: 1, maximum: 5 },
                    number: { type: 'integer', minimum: 0, maximum: 99 },
                    hasChart: { type: 'boolean' },
                    partA: { type: 'string' },
                    partB: { type: 'string' },
                    partC: { type: 'string' },
                    partD: { type: 'string' },
                    partAKo: { type: 'string' },
                    partBKo: { type: 'string' },
                    partCKo: { type: 'string' },
                    partDKo: { type: 'string' },
                    explanation: { type: 'string' },
                  },
                },
              },
            },
            required: ['questions'],
          },
        },
      ],
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: userContent }],
    })

    const toolUse = msg.content.find((b) => b.type === 'tool_use')
    const textBlock = msg.content.find((b) => b.type === 'text')
    const hint =
      textBlock && textBlock.type === 'text' && textBlock.text.trim()
        ? textBlock.text.trim().slice(0, 400)
        : ''
    if (!toolUse || toolUse.type !== 'tool_use') {
      console.error('parse-reading: no tool_use', {
        stop_reason: msg.stop_reason,
        hint,
      })
      res.status(502).json({
        error:
          'Claude 응답에 결과가 없습니다.' +
          (hint ? ` (모델 메시지: ${hint})` : ` (stop: ${msg.stop_reason ?? 'unknown'})`),
      })
      return
    }
    const rawInput = toolUse.input as { questions?: unknown }
    const rawCount = Array.isArray(rawInput?.questions) ? rawInput.questions.length : 0
    const parsed = normalizeResult(toolUse.input)
    if (parsed.questions.length === 0) {
      const sample = JSON.stringify(rawInput).slice(0, 600)
      console.error('parse-reading: empty questions', {
        rawCount,
        hint,
        sample,
        stop_reason: msg.stop_reason,
      })
      const reason =
        rawCount > 0
          ? `모델이 ${rawCount}개 추출했지만 모두 빈 항목`
          : '모델이 문항을 추출하지 못함'
      res.status(422).json({
        error: `문항을 찾지 못했습니다. (${reason})${hint ? ' - 모델 메시지: ' + hint : ''} | 모델 입력: ${sample}`,
      })
      return
    }
    res.status(200).json(parsed)
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    res.status(500).json({ error: message })
  }
}
