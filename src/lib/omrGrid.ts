/**
 * OMR 사진에서 칸이 칠해졌는지를 픽셀로 잰다.
 *
 * 모델에게 사진 한 장을 통째로 읽히면 45줄 × 5칸을 한 번에 세다가 줄·칸이
 * 하나씩 밀린 채로 자신 있게 틀린다(⑤ 를 ④ 로, 빈 줄을 옆 줄 답으로). 그래서
 * 모델에게는 "열마다 네 모서리 칸이 어디 있는지"만 묻고, 칸 위치는 그 네 점을
 * 이어 계산하며, 칠했는지는 그 자리의 어둡기로 정한다. 사진이 기울거나 원근이
 * 있어도 네 점을 잇는 것으로 대부분 따라간다.
 *
 * 브라우저(캔버스 픽셀)와 점검 스크립트(scripts/checkOmr.mjs)가 같이 쓰도록
 * 다른 모듈을 가져오지 않는다.
 */

export interface Pt {
  x: number
  y: number
}

/** 답란 한 열. 모서리 네 점은 각각 그 칸의 가운데. */
export interface OmrColumnGrid {
  /** 이 열의 첫 문항 번호(맨 위 줄). */
  first: number
  /** 이 열의 마지막 문항 번호(맨 아래 줄). */
  last: number
  /** 첫 줄 ① */
  topLeft: Pt
  /** 첫 줄 ⑤ */
  topRight: Pt
  /** 마지막 줄 ① */
  bottomLeft: Pt
  /** 마지막 줄 ⑤ */
  bottomRight: Pt
}

export interface OmrGrid {
  columns: OmrColumnGrid[]
  /** 선택 과목 상자의 ① ② 칸 가운데. */
  elective?: { one: Pt; two: Pt }
}

/** RGBA 픽셀(캔버스 ImageData 와 같은 모양). */
export interface RgbaImage {
  width: number
  height: number
  data: Uint8ClampedArray | Uint8Array
}

export interface GridRead {
  number: number
  /** 1~5, 0 = 미마킹·판단 불가. */
  choice: number
  confidence: 'high' | 'low'
  /** 칸별 칠한 비율 0~1 (①~⑤). */
  fills: number[]
  note?: string
}

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/** 열 안의 한 문항 줄에서 ①~⑤ 칸 가운데. */
export function rowCenters(col: OmrColumnGrid, number: number): Pt[] {
  const rows = col.last - col.first
  const t = rows > 0 ? (number - col.first) / rows : 0
  const left = lerp(col.topLeft, col.bottomLeft, t)
  const right = lerp(col.topRight, col.bottomRight, t)
  return [0, 1, 2, 3, 4].map((k) => lerp(left, right, k / 4))
}

/** 픽셀이 "검게 칠한 것"인지. 빨간 인쇄 칸·숫자는 R 이 높아 걸리지 않게 가장 밝은 채널로 본다. */
function brightness(img: RgbaImage, x: number, y: number): number {
  const xi = Math.round(x)
  const yi = Math.round(y)
  if (xi < 0 || yi < 0 || xi >= img.width || yi >= img.height) return 255
  const i = (yi * img.width + xi) * 4
  return Math.max(img.data[i], img.data[i + 1], img.data[i + 2])
}

/** 타원 안에서 바탕보다 확연히 어두운 픽셀의 비율. */
function fillRatio(img: RgbaImage, c: Pt, rx: number, ry: number, bg: number): number {
  const dark = bg * 0.55
  const step = Math.max(1, Math.min(rx, ry) / 6)
  let n = 0
  let hit = 0
  for (let dy = -ry; dy <= ry; dy += step) {
    for (let dx = -rx; dx <= rx; dx += step) {
      if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) > 1) continue
      n++
      if (brightness(img, c.x + dx, c.y + dy) < dark) hit++
    }
  }
  return n ? hit / n : 0
}

/** 줄 둘레의 바탕 밝기(중앙값) — 그림자 진 쪽은 기준도 같이 어두워진다. */
function background(img: RgbaImage, centers: Pt[], ry: number): number {
  const vals: number[] = []
  const a = centers[0]
  const b = centers[4]
  for (let i = 0; i <= 24; i++) {
    const p = lerp(a, b, i / 24)
    vals.push(brightness(img, p.x, p.y - ry * 1.2), brightness(img, p.x, p.y + ry * 1.2))
  }
  vals.sort((x, y) => x - y)
  return Math.max(60, vals[Math.floor(vals.length / 2)])
}

/**
 * 칸 하나의 칠한 비율. 모서리 위치가 조금 어긋나도 따라가도록 둘레를 살짝
 * 훑어 가장 진한 자리를 쓴다 — 칸 간격의 1/4 을 넘지 않아 옆 칸을 넘보지 않는다.
 */
function bubbleFill(img: RgbaImage, c: Pt, dx: number, dy: number, bg: number): number {
  const rx = dx * 0.24
  const ry = dy * 0.22
  let best = 0
  for (const ox of [-0.22, -0.11, 0, 0.11, 0.22]) {
    for (const oy of [-0.18, 0, 0.18]) {
      best = Math.max(best, fillRatio(img, { x: c.x + ox * dx, y: c.y + oy * dy }, rx, ry, bg))
    }
  }
  return best
}

/** 다섯 칸의 칠한 비율로 답을 정한다. 애매하면 low — 학생이 다시 본다. */
export function decide(fills: number[]): Pick<GridRead, 'choice' | 'confidence' | 'note'> {
  const order = fills.map((f, i) => ({ f, i })).sort((a, b) => b.f - a.f)
  const [first, second] = order
  if (first.f < 0.12) return { choice: 0, confidence: first.f < 0.06 ? 'high' : 'low' }
  if (second.f >= 0.3) return { choice: 0, confidence: 'low', note: '두 칸 이상 칠함' }
  if (first.f >= 0.35 && second.f < first.f * 0.4) return { choice: first.i + 1, confidence: 'high' }
  return { choice: first.i + 1, confidence: 'low', note: '칠한 정도가 애매함' }
}

/** 격자로 numbers 의 문항을 읽는다. 격자에 없는 번호는 결과에 넣지 않는다. */
export function readByGrid(img: RgbaImage, grid: OmrGrid, numbers: number[]): Map<number, GridRead> {
  const out = new Map<number, GridRead>()
  for (const col of grid.columns) {
    const rows = col.last - col.first
    if (rows <= 0) continue
    const dx = (dist(col.topLeft, col.topRight) + dist(col.bottomLeft, col.bottomRight)) / 8
    const dy = (dist(col.topLeft, col.bottomLeft) + dist(col.topRight, col.bottomRight)) / 2 / rows
    // 모서리가 말이 안 되면(칸 간격이 너무 작거나 줄 간격이 칸 간격보다 터무니없이 작으면) 버린다.
    if (dx < 6 || dy < 6) continue
    for (const n of numbers) {
      if (n < col.first || n > col.last) continue
      const centers = rowCenters(col, n)
      const bg = background(img, centers, dy * 0.22)
      const fills = centers.map((c) => bubbleFill(img, c, dx, dy, bg))
      out.set(n, { number: n, fills, ...decide(fills) })
    }
  }
  return out
}

/** 선택 과목 상자. 1·2 중 확실히 하나만 칠했을 때만 돌려준다. */
export function readElective(img: RgbaImage, grid: OmrGrid): 1 | 2 | undefined {
  const e = grid.elective
  if (!e) return undefined
  const d = dist(e.one, e.two)
  if (d < 6) return undefined
  const centers = [e.one, e.two]
  const vals: number[] = []
  for (const c of centers) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      vals.push(brightness(img, c.x + Math.cos(a) * d * 0.5, c.y + Math.sin(a) * d * 0.5))
    }
  }
  vals.sort((x, y) => x - y)
  const bg = Math.max(60, vals[Math.floor(vals.length / 2)])
  const f = centers.map((c) => bubbleFill(img, c, d * 1.1, d, bg))
  if (f[0] >= 0.35 && f[1] < f[0] * 0.4) return 1
  if (f[1] >= 0.35 && f[0] < f[1] * 0.4) return 2
  return undefined
}
