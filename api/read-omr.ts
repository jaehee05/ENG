import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'

export const config = {
  maxDuration: 60,
}

/**
 * 학생이 찍은 종이 OMR 카드 사진에서 마킹을 읽어 온다.
 *
 * 판독 결과는 화면의 답안 칸을 채우는 데만 쓴다 — 학생이 확인·수정한 뒤
 * 평소처럼 제출한다. 사진만으로 채점하지 않는 이유는 판독이 틀릴 수 있고,
 * 틀린 답이 그대로 채점되면 학생 기록이 오염되기 때문이다. 그래서 여기서는
 * 맞히는 것만큼 "모르겠으면 low 로 표시하는 것"이 중요하다.
 *
 * 사진은 어디에도 저장하지 않는다. 요청을 받아 판독하고 버린다.
 */

type Subject = 'korean' | 'english'

const COMMON_RULES = `당신은 한국 수능·모의고사 OMR 답안지 판독기입니다.
사진 한 장에 찍힌 종이 OMR 카드에서 학생이 마킹한 답을 읽어 submit_omr 도구로 제출하세요.

사진 상태:
- 휴대폰으로 찍은 사진이라 기울어 있거나, 원근 때문에 사다리꼴로 찌그러져 있거나, 그림자·빛 반사가 있을 수 있습니다.
- 90°나 180° 돌아간 채로 찍혔을 수 있습니다. 먼저 카드의 방향을 바로잡은 뒤 읽으세요.

무엇이 마킹인가:
- 인쇄된 답 칸은 빨강·분홍 테두리 안에 숫자(1~5)만 들어 있는 빈 타원입니다.
- 학생 마킹은 컴퓨터용 사인펜으로 칸을 검게 채운 것입니다. 칸 안이 검게 메워져 있어야 마킹입니다.
- 인쇄된 테두리, 인쇄된 숫자, 표의 선, 배경색은 마킹이 아닙니다.

판독 규칙:
- 한 문항에 마킹이 정확히 하나면 그 번호(1~5)를 choice 로, 확실하면 confidence 'high'.
- 아무 칸도 칠하지 않았으면 choice 0.
- 두 칸 이상 칠했거나, 지우다 만 흔적이 있거나, 칠한 정도가 애매해 어느 칸인지 단정할 수 없으면 choice 0, confidence 'low', note 에 상황을 짧게 적으세요(예: "2·4 두 칸 마킹", "3번 지운 흔적").
- 조금이라도 확신이 없으면 반드시 confidence 'low' 로 표시하세요. 틀린 답을 'high' 로 내는 것이 가장 나쁜 실수입니다. 학생이 low 문항을 직접 다시 확인합니다.
- 그림자나 반사 때문에 해당 행이 잘 보이지 않으면 추측하지 말고 choice 0, 'low'.

개인정보:
- 수험번호·성명·학교 칸은 읽지 마세요. 사진에 이름이나 번호가 보이더라도 응답 어디에도(note 포함) 담지 마세요.

제출 형식:
- 사용자가 주는 numbers 목록의 번호만, 하나도 빠짐없이, 그 순서대로 answers 에 담으세요. 목록에 없는 번호는 카드에 칠해져 있어도 제출하지 마세요.

칸 위치(grid) — answers 와 별개로 꼭 채우세요:
- 좌표는 받은 사진 그대로의 픽셀 좌표입니다. 왼쪽 위가 (0, 0), x 는 오른쪽, y 는 아래로 커집니다. 사진이 돌아가 있어도 돌리기 전 원래 사진의 좌표로 적으세요.
- 답란 열마다 하나씩 columns 에 담습니다. first 는 그 열 맨 위 줄의 인쇄된 문번, last 는 맨 아래 줄의 문번입니다.
- topLeft 는 맨 위 줄 ① 칸의 가운데, topRight 는 맨 위 줄 ⑤ 칸의 가운데, bottomLeft 는 맨 아래 줄 ① 칸의 가운데, bottomRight 는 맨 아래 줄 ⑤ 칸의 가운데입니다. 칠해졌는지와 상관없이 인쇄된 칸의 가운데를 가리키세요.
- 네 점은 앱이 그 사이의 칸 위치를 계산하는 데 씁니다. 몇 픽셀 차이가 판독을 가르므로 칸의 한가운데를 정확히 짚으세요.
- 선택 과목 상자가 있으면 elective.one 은 ① 칸 가운데, elective.two 는 ② 칸 가운데입니다.`

/**
 * 양식별 배치 설명. 양식이 과목마다 달라서 나눠 둔다.
 * 영어 양식 사진이 생기면 english 에 국어처럼 실제 배치를 적으면 된다.
 */
const LAYOUT_BY_SUBJECT: Record<Subject, string> = {
  korean: `국어 OMR 양식(김승리 수능 국어 모의평가 답안지):
- 가로로 긴 A4 한 장입니다. 맨 위 가장자리에 검은 타이밍 마크(짧은 막대)가 한 줄로 늘어서 있습니다 — 이것이 카드의 위쪽이며, 기울기·방향을 잡는 기준으로 쓰세요.
- 표의 테두리와 머리글은 초록색이고, 답 칸(타원)만 빨강·분홍입니다.
- 카드 오른쪽 절반에 답란이 3열로 있습니다(왼쪽에서 오른쪽 순서):
  1열 "공통 과목" 1~20번
  2열 "공통 과목" 21~34번 (34번 아래는 빈 초록 바탕)
  3열 "선택 과목" 35~45번 (분홍 바탕, 45번 아래는 빈 분홍 바탕)
- 각 행은 왼쪽에 문번, 그 오른쪽에 ①②③④⑤ 다섯 칸이 가로로 놓입니다. 5의 배수 번호(5, 10, 15, 20, 25, 30, 35, 40, 45)는 문번이 굵게 인쇄되어 있어 행 위치를 세는 기준으로 쓸 수 있습니다.
- 2열·3열 아래의 빈 바탕 영역에는 답 칸이 없습니다. 거기 있는 얼룩이나 그림자를 마킹으로 읽지 마세요.
- 카드 왼쪽 가운데에 "선택 과목" 상자가 있습니다: "화법과 작문" 옆 ① 칸, "언어와 매체" 옆 ② 칸. 둘 중 하나가 칠해져 있으면 electiveMark 에 1(화법과 작문) 또는 2(언어와 매체)를 넣으세요. 둘 다 비었거나 둘 다 칠했거나 애매하면 electiveMark 를 생략하세요.
- 카드 왼쪽의 수험번호 칸(숫자 0~9 타원)과 가운데의 성명 칸(한글 자모 타원)은 답란이 아닙니다. 읽지 마세요.
- numbers 에 35~45가 하나도 없으면 3열 "선택 과목"은 무시하세요.`,
  english: `영어 OMR 양식:
- 이 양식의 정확한 배치는 아직 알려져 있지 않습니다. 일반 규칙으로 읽으세요.
- 답란은 "문번 + ①②③④⑤ 다섯 칸"인 행들이 세로로 이어진 열 몇 개로 되어 있습니다. 1~45번이 한 과목입니다.
- 시험지가 18번부터 시작하는 등 numbers 가 1번부터가 아닐 수 있습니다. 인쇄된 문번을 보고 해당 행을 찾으세요.
- 수험번호·성명 칸(숫자·한글 타원)은 답란이 아닙니다. 읽지 마세요.`,
}

interface Pt {
  x: number
  y: number
}

interface OmrColumnGrid {
  first: number
  last: number
  topLeft: Pt
  topRight: Pt
  bottomLeft: Pt
  bottomRight: Pt
}

interface OmrAnswer {
  number: number
  choice: number
  confidence: 'high' | 'low'
  note?: string
}

/** 이미지 본문 상한. Vercel 요청 본문이 4.5MB 라 그 안쪽에서 끊는다. */
const MAX_IMAGE_BASE64 = 4_200_000

const MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** 도구 스키마의 좌표 한 점. */
const PT_SCHEMA = {
  type: 'object' as const,
  properties: { x: { type: 'number' as const }, y: { type: 'number' as const } },
  required: ['x', 'y'],
}

function toPt(v: unknown): Pt | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  const x = Number(r.x)
  const y = Number(r.y)
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 ? { x, y } : null
}

/** 모델이 짚은 칸 위치. 모양이 맞지 않는 열은 버린다 — 판독은 클라이언트가 픽셀로 한다. */
function normalizeGrid(input: unknown): { columns: OmrColumnGrid[]; elective?: { one: Pt; two: Pt } } | undefined {
  const g = (input ?? {}) as { columns?: unknown; elective?: unknown }
  const columns: OmrColumnGrid[] = []
  for (const c of Array.isArray(g.columns) ? g.columns : []) {
    if (!c || typeof c !== 'object') continue
    const r = c as Record<string, unknown>
    const first = Number(r.first)
    const last = Number(r.last)
    const pts = [toPt(r.topLeft), toPt(r.topRight), toPt(r.bottomLeft), toPt(r.bottomRight)]
    if (!Number.isInteger(first) || !Number.isInteger(last) || last <= first || pts.some((p) => !p)) continue
    const [topLeft, topRight, bottomLeft, bottomRight] = pts as Pt[]
    columns.push({ first, last, topLeft, topRight, bottomLeft, bottomRight })
  }
  const e = (g.elective ?? null) as { one?: unknown; two?: unknown } | null
  const one = e ? toPt(e.one) : null
  const two = e ? toPt(e.two) : null
  if (columns.length === 0) return undefined
  return one && two ? { columns, elective: { one, two } } : { columns }
}

function normalize(input: unknown, numbers: number[]): {
  answers: OmrAnswer[]
  electiveMark?: 1 | 2
  grid?: ReturnType<typeof normalizeGrid>
} {
  const obj = (input ?? {}) as { answers?: unknown; electiveMark?: unknown }
  const arr = Array.isArray(obj.answers) ? obj.answers : []
  const wanted = new Set(numbers)
  const byNumber = new Map<number, OmrAnswer>()
  for (const r of arr) {
    if (!r || typeof r !== 'object') continue
    const rec = r as Record<string, unknown>
    const number = Number(rec.number)
    // 요청하지 않은 번호는 버린다. 같은 번호가 두 번 오면 처음 것을 쓴다.
    if (!wanted.has(number) || byNumber.has(number)) continue
    const c = Number(rec.choice)
    const choice = Number.isInteger(c) && c >= 0 && c <= 5 ? c : 0
    // 범위 밖 choice 를 0 으로 고쳤다면 모델이 뭔가 잘못 읽은 것이니 low 로 낮춘다.
    const confidence: 'high' | 'low' =
      rec.confidence === 'high' && choice === c ? 'high' : 'low'
    const note = typeof rec.note === 'string' && rec.note.trim() ? rec.note.trim().slice(0, 80) : undefined
    byNumber.set(number, note ? { number, choice, confidence, note } : { number, choice, confidence })
  }
  // 빠진 번호는 미마킹·low 로 채워, 학생이 그 문항을 꼭 다시 보게 한다.
  const answers = numbers.map((n) => byNumber.get(n) ?? { number: n, choice: 0, confidence: 'low' as const })
  const em = Number(obj.electiveMark)
  const grid = normalizeGrid((input as { grid?: unknown } | null)?.grid)
  return {
    answers,
    ...(em === 1 || em === 2 ? { electiveMark: em as 1 | 2 } : {}),
    ...(grid ? { grid } : {}),
  }
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

  const { image, mediaType, numbers, subject } = (req.body ?? {}) as {
    image?: unknown
    mediaType?: unknown
    numbers?: unknown
    subject?: unknown
  }
  if (typeof image !== 'string' || image.length === 0) {
    res.status(400).json({ error: '사진이 필요합니다.' })
    return
  }
  if (image.length > MAX_IMAGE_BASE64) {
    res.status(413).json({ error: '사진 용량이 너무 큽니다.' })
    return
  }
  if (typeof mediaType !== 'string' || !MEDIA_TYPES.has(mediaType)) {
    res.status(400).json({ error: '지원하지 않는 사진 형식입니다.' })
    return
  }
  const nums = Array.isArray(numbers)
    ? numbers.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 45)
    : []
  const uniqueNums = [...new Set(nums)]
  if (uniqueNums.length === 0) {
    res.status(400).json({ error: 'numbers 배열이 필요합니다.' })
    return
  }
  const subj: Subject = subject === 'english' ? 'english' : 'korean'

  const client = new Anthropic({ apiKey })

  try {
    const msg = await client.messages.create({
      model: 'claude-opus-5',
      // thinking 은 기본값(적응형)으로 둔다. Opus 5 에서 thinking 을 끈 채
      // tool_choice 를 강제하면 도구 호출이 평문으로 새어나와 조용히 실패할 수 있다.
      // effort 도 낮추지 않는다 — 칸 하나 잘못 읽으면 그대로 오답이 되는 일이다.
      max_tokens: 16000,
      system: `${COMMON_RULES}\n\n${LAYOUT_BY_SUBJECT[subj]}`,
      tools: [
        {
          name: 'submit_omr',
          description: 'OMR 카드에서 읽은 문항별 마킹을 제출합니다.',
          input_schema: {
            type: 'object',
            properties: {
              answers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    number: { type: 'integer', description: '문항 번호' },
                    choice: {
                      type: 'integer',
                      minimum: 0,
                      maximum: 5,
                      description: '칠한 칸 번호 1~5. 미마킹·중복·판단 불가는 0.',
                    },
                    confidence: { type: 'string', enum: ['high', 'low'] },
                    note: { type: 'string', description: 'low 일 때 이유(짧게). 개인정보 금지.' },
                  },
                  required: ['number', 'choice', 'confidence'],
                },
              },
              electiveMark: {
                type: 'integer',
                enum: [1, 2],
                description: '선택 과목 상자에 칠한 칸. 1=화법과 작문, 2=언어와 매체. 없거나 애매하면 생략.',
              },
              grid: {
                type: 'object',
                description: '답란 열마다 네 모서리 칸의 가운데 픽셀 좌표(받은 사진 그대로).',
                properties: {
                  columns: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        first: { type: 'integer' },
                        last: { type: 'integer' },
                        topLeft: PT_SCHEMA,
                        topRight: PT_SCHEMA,
                        bottomLeft: PT_SCHEMA,
                        bottomRight: PT_SCHEMA,
                      },
                      required: ['first', 'last', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight'],
                    },
                  },
                  elective: {
                    type: 'object',
                    properties: { one: PT_SCHEMA, two: PT_SCHEMA },
                  },
                },
                required: ['columns'],
              },
            },
            required: ['answers', 'grid'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_omr' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp',
                data: image,
              },
            },
            {
              type: 'text',
              text: `이 OMR 카드에서 다음 번호의 마킹을 읽어 submit_omr 도구로 제출하세요.\n${JSON.stringify({ numbers: uniqueNums })}`,
            },
          ],
        },
      ],
    })

    const toolUse = msg.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      res.status(502).json({ error: '판독 결과를 받지 못했습니다. 다시 시도해 주세요.' })
      return
    }
    res.status(200).json(normalize(toolUse.input, uniqueNums))
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    res.status(500).json({ error: message })
  }
}
