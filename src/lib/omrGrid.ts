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

/**
 * 줄 둘레의 바탕 밝기(중앙값) — 그림자 진 쪽은 기준도 같이 어두워진다.
 * 줄과 수직 방향으로 줄 간격의 반쯤 떨어진 곳(줄과 줄 사이 빈자리)을 잰다.
 */
function background(img: RgbaImage, centers: Pt[], half: number): number {
  const vals: number[] = []
  const a = centers[0]
  const b = centers[4]
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const nx = -(b.y - a.y) / len
  const ny = (b.x - a.x) / len
  for (let i = 0; i <= 24; i++) {
    const p = lerp(a, b, i / 24)
    vals.push(brightness(img, p.x + nx * half, p.y + ny * half), brightness(img, p.x - nx * half, p.y - ny * half))
  }
  vals.sort((x, y) => x - y)
  return Math.max(60, vals[Math.floor(vals.length / 2)])
}

/**
 * 칸 하나의 칠한 비율. 모서리 위치가 조금 어긋나도 따라가도록 둘레를 살짝
 * 훑어 가장 진한 자리를 쓴다 — 칸 간격의 1/4 을 넘지 않아 옆 칸을 넘보지 않는다.
 * dx·dy 는 사진 가로·세로 방향의 칸 간격.
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
    // 칸 크기를 사진 가로·세로 기준으로 — 90° 돌아간 사진에서는 칸이 옆으로 눕는다.
    const upright = Math.abs(col.topRight.x - col.topLeft.x) >= Math.abs(col.topRight.y - col.topLeft.y)
    const sx = upright ? dx : dy
    const sy = upright ? dy : dx
    for (const n of numbers) {
      if (n < col.first || n > col.last) continue
      const centers = rowCenters(col, n)
      const bg = background(img, centers, dy * 0.5)
      const fills = centers.map((c) => bubbleFill(img, c, sx, sy, bg))
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

// ───────────────────────── 격자 보정 ─────────────────────────
//
// 모델이 짚는 모서리는 기울어진 사진에서 반 칸~한 칸씩 어긋난다. 그대로 쓰면
// 옆 칸을 재게 되므로, 사진에서 실제 칸(빨간 테두리 타원·검게 칠한 타원)을
// 찾아 격자를 거기에 맞춘다. 모델의 네 점은 출발점으로만 쓴다.

/** 칸 하나로 보이는 덩어리의 가운데. */
function detectBubbles(img: RgbaImage, box: { x0: number; y0: number; x1: number; y1: number }, dx: number, dy: number): Pt[] {
  const x0 = Math.max(0, Math.floor(box.x0))
  const y0 = Math.max(0, Math.floor(box.y0))
  const x1 = Math.min(img.width - 1, Math.ceil(box.x1))
  const y1 = Math.min(img.height - 1, Math.ceil(box.y1))
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  if (w < 4 || h < 4) return []
  // 바탕 밝기 — 상자 안 가장 밝은 채널의 중앙값.
  // 바탕 붉은기도 — 선택 과목 열은 분홍 바탕이라, 흰 바탕 기준으로 재면 바탕까지 전부
  // ‘빨간 인쇄’로 잡혀 칸 안 숫자가 묻힌다.
  const sample: number[] = []
  const reds: number[] = []
  for (let y = y0; y <= y1; y += 4) {
    for (let x = x0; x <= x1; x += 4) {
      sample.push(brightness(img, x, y))
      const i = (y * img.width + x) * 4
      reds.push(img.data[i] - Math.max(img.data[i + 1], img.data[i + 2]))
    }
  }
  sample.sort((a, b) => a - b)
  reds.sort((a, b) => a - b)
  const bg = Math.max(60, sample[Math.floor(sample.length * 0.6)])
  const redCut = Math.max(0, reds[Math.floor(reds.length * 0.6)]) + 16
  // 잉크: 검게 칠한 곳(dark) 또는 빨간 인쇄. 사진을 줄이면 얇은 빨간 테두리는 바탕에
  // 녹아 거의 안 잡히고 칸 안의 숫자만 남는다 — 그 숫자가 곧 빈 칸의 가운데다.
  const dark = new Uint8Array(w * h)
  const ink = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y + y0) * img.width + (x + x0)) * 4
      const r = img.data[i]
      const g = img.data[i + 1]
      const b = img.data[i + 2]
      const mx = Math.max(r, g, b)
      const isDark = mx < bg * 0.45
      const isRed = r > 90 && r - Math.max(g, b) > redCut
      dark[y * w + x] = isDark ? 1 : 0
      ink[y * w + x] = isDark || isRed ? 1 : 0
    }
  }
  // 획이 끊긴 숫자(4, 5 등)가 한 덩어리가 되도록 부풀린다.
  const fat = new Uint8Array(w * h)
  const R = 2
  for (let y = R; y < h - R; y++) {
    for (let x = R; x < w - R; x++) {
      let on = 0
      for (let oy = -R; oy <= R && !on; oy++) for (let ox = -R; ox <= R && !on; ox++) on = ink[(y + oy) * w + x + ox]
      fat[y * w + x] = on
    }
  }
  // 연결 성분 — 칠한 타원(검정)과 칸 안 숫자(빨강) 크기쯤 되는 것만.
  const seen = new Uint8Array(w * h)
  const stack: number[] = []
  const out: Pt[] = []
  for (let start = 0; start < w * h; start++) {
    if (!fat[start] || seen[start]) continue
    let bx0 = w
    let by0 = h
    let bx1 = -1
    let by1 = -1
    let n = 0
    let nd = 0
    seen[start] = 1
    stack.push(start)
    while (stack.length) {
      const i = stack.pop()!
      const x = i % w
      const y = (i - x) / w
      n++
      if (dark[i]) nd++
      if (x < bx0) bx0 = x
      if (x > bx1) bx1 = x
      if (y < by0) by0 = y
      if (y > by1) by1 = y
      const next = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]
      for (const j of next) {
        if (j < 0 || seen[j] || !fat[j]) continue
        seen[j] = 1
        stack.push(j)
      }
    }
    const bw = bx1 - bx0 + 1
    const bh = by1 - by0 + 1
    const isFill = nd > n * 0.4
    const ok = isFill
      ? bw >= dx * 0.3 && bw <= dx * 0.95 && bh >= dy * 0.25 && bh <= dy * 0.85
      : bw >= dx * 0.08 && bw <= dx * 0.6 && bh >= dy * 0.1 && bh <= dy * 0.55
    if (ok) out.push({ x: x0 + (bx0 + bx1) / 2, y: y0 + (by0 + by1) / 2 })
  }
  return out
}

/** 격자 좌표(u=칸 0~4, v=줄 0~rows) → 사진 좌표. 쌍선형 — 원근을 대충 따라간다. */
interface Bilinear {
  x: [number, number, number, number]
  y: [number, number, number, number]
}
const applyBl = (m: Bilinear, u: number, v: number): Pt => ({
  x: m.x[0] + m.x[1] * u + m.x[2] * v + m.x[3] * u * v,
  y: m.y[0] + m.y[1] * u + m.y[2] * v + m.y[3] * u * v,
})

function blFromCorners(col: OmrColumnGrid): Bilinear {
  const rows = col.last - col.first
  const { topLeft: a, topRight: b, bottomLeft: c, bottomRight: d } = col
  // P(u,v) = a + (b-a)u/4 + (c-a)v/R + (a-b-c+d)uv/(4R)
  const f = (k: 'x' | 'y'): [number, number, number, number] => [
    a[k],
    (b[k] - a[k]) / 4,
    (c[k] - a[k]) / rows,
    (a[k] - b[k] - c[k] + d[k]) / (4 * rows),
  ]
  return { x: f('x'), y: f('y') }
}

/** 4×4 연립방정식(가우스 소거). */
function solve4(A: number[][], b: number[]): number[] | null {
  const n = 4
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    if (Math.abs(M[p][c]) < 1e-9) return null
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  return M.map((row, i) => row[n] / M[i][i])
}

function fitBl(pairs: { u: number; v: number; p: Pt }[]): Bilinear | null {
  const A = [0, 1, 2, 3].map(() => [0, 0, 0, 0])
  const bx = [0, 0, 0, 0]
  const by = [0, 0, 0, 0]
  for (const { u, v, p } of pairs) {
    const f = [1, u, v, u * v]
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) A[i][j] += f[i] * f[j]
      bx[i] += f[i] * p.x
      by[i] += f[i] * p.y
    }
  }
  const x = solve4(A, bx)
  const y = solve4(A, by)
  if (!x || !y) return null
  return { x: x as Bilinear['x'], y: y as Bilinear['y'] }
}

/** 칸들 사이 간격에서 격자 한 방향의 실제 칸 간격을 구한다(모델이 준 방향 근처만). */
function latticeVector(found: Pt[], hint: Pt, other: Pt): Pt | null {
  const hl = Math.hypot(hint.x, hint.y)
  const ol = Math.hypot(other.x, other.y)
  const maxLen = Math.max(hl, ol) * 1.8
  const picks: Pt[] = []
  for (const p of found) {
    let best: Pt | null = null
    let bl = Infinity
    for (const q of found) {
      if (q === p) continue
      let d = { x: q.x - p.x, y: q.y - p.y }
      const len = Math.hypot(d.x, d.y)
      if (len < hl * 0.4 || len > maxLen) continue
      const cos = (d.x * hint.x + d.y * hint.y) / (len * hl)
      if (Math.abs(cos) < 0.9) continue
      if (cos < 0) d = { x: -d.x, y: -d.y }
      if (len < bl) {
        bl = len
        best = d
      }
    }
    if (best) picks.push(best)
  }
  if (picks.length < 4) return null
  const mid = Math.floor(picks.length / 2)
  return {
    x: picks.map((v) => v.x).sort((a, b) => a - b)[mid],
    y: picks.map((v) => v.y).sort((a, b) => a - b)[mid],
  }
}

/**
 * 찾은 칸마다 격자 번호(a=칸, b=줄)를 붙인다. 출발 칸에서 이웃을 따라가며 번호를
 * 넘기므로, 원근 때문에 간격이 조금씩 변해도 따라간다.
 */
function assignLattice(found: Pt[], start: number, du: Pt, dv: Pt): Map<number, { a: number; b: number }> {
  const coords = new Map<number, { a: number; b: number }>()
  coords.set(start, { a: 0, b: 0 })
  const queue = [start]
  const dul = Math.hypot(du.x, du.y)
  const dvl = Math.hypot(dv.x, dv.y)
  const steps = [
    { v: du, da: 1, db: 0, tol: dul * 0.3 },
    { v: { x: -du.x, y: -du.y }, da: -1, db: 0, tol: dul * 0.3 },
    { v: dv, da: 0, db: 1, tol: dvl * 0.3 },
    { v: { x: -dv.x, y: -dv.y }, da: 0, db: -1, tol: dvl * 0.3 },
  ]
  while (queue.length) {
    const i = queue.shift()!
    const c = coords.get(i)!
    const p = found[i]
    for (const st of steps) {
      const want = { x: p.x + st.v.x, y: p.y + st.v.y }
      let bj = -1
      let bd = st.tol
      for (let j = 0; j < found.length; j++) {
        if (coords.has(j)) continue
        const d = Math.hypot(found[j].x - want.x, found[j].y - want.y)
        if (d < bd) {
          bd = d
          bj = j
        }
      }
      if (bj >= 0) {
        coords.set(bj, { a: c.a + st.da, b: c.b + st.db })
        queue.push(bj)
      }
    }
  }
  return coords
}

/**
 * 열 하나의 격자를 실제 칸에 맞춘다.
 *
 * 모델의 네 점에서는 방향과 대략의 크기만 가져오고, 실제 간격은 찾은 칸들끼리의
 * 거리로 다시 잰다. 모델이 짚은 첫 줄 ① 근처 칸에서 출발해 이웃을 따라 번호를 붙인
 * 뒤, 5칸 × (줄 수) 창이 가장 많은 칸을 덮는 자리를 고른다 — 모델이 한 줄·한 칸
 * 통째로 잘못 짚었거나 줄 간격을 틀렸어도 여기서 바로잡힌다. 덮는 칸이 너무 적으면
 * null(이 열은 믿지 않는다).
 */
function refineColumn(
  img: RgbaImage,
  col: OmrColumnGrid,
  model?: Map<number, number>,
): { col: OmrColumnGrid; matched: number } | null {
  const rows = col.last - col.first
  if (rows <= 0) return null
  const base = blFromCorners(col)
  const du0 = { x: base.x[1], y: base.y[1] }
  const dv0 = { x: base.x[2], y: base.y[2] }
  const dul0 = Math.hypot(du0.x, du0.y)
  const dvl0 = Math.hypot(dv0.x, dv0.y)
  if (dul0 < 4 || dvl0 < 4) return null
  const corners = [col.topLeft, col.topRight, col.bottomLeft, col.bottomRight]
  const pad = Math.max(dul0, dvl0) * 1.6
  const box = {
    x0: Math.min(...corners.map((p) => p.x)) - pad,
    y0: Math.min(...corners.map((p) => p.y)) - pad,
    x1: Math.max(...corners.map((p) => p.x)) + pad,
    y1: Math.max(...corners.map((p) => p.y)) + pad,
  }
  // 사진이 90° 돌아가 있으면 칸이 옆으로 눕는다 — 사진 가로·세로 기준의 칸 크기로 바꿔 넘긴다.
  const upright = Math.abs(du0.x) >= Math.abs(du0.y)
  let found = detectBubbles(img, box, upright ? dul0 : dvl0, upright ? dvl0 : dul0)
  if (found.length < (rows + 1) * 2) return null
  const du = latticeVector(found, du0, dv0) ?? du0
  const dv = latticeVector(found, dv0, du0) ?? dv0
  const nearestTo = (pts: Pt[], q: Pt) => {
    let bi = 0
    let bd = Infinity
    for (let i = 0; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - q.x, pts[i].y - q.y)
      if (d < bd) {
        bd = d
        bi = i
      }
    }
    return bi
  }

  // 모델이 열 길이를 짧게(또는 길게) 짚으면 첫 범위가 끝 줄까지 닿지 않는다. 실제로 잰
  // 간격으로 열 전체가 들어갈 범위를 다시 잡아 한 번 더 찾는다.
  const s0 = found[nearestTo(found, col.topLeft)]
  const ends = [s0, { x: s0.x + du.x * 4, y: s0.y + du.y * 4 }, { x: s0.x + dv.x * rows, y: s0.y + dv.y * rows }]
  ends.push({ x: ends[1].x + dv.x * rows, y: ends[1].y + dv.y * rows })
  const pad2 = Math.max(Math.hypot(du.x, du.y), Math.hypot(dv.x, dv.y)) * 2.2
  const box2 = {
    x0: Math.min(box.x0, ...ends.map((p) => p.x - pad2)),
    y0: Math.min(box.y0, ...ends.map((p) => p.y - pad2)),
    x1: Math.max(box.x1, ...ends.map((p) => p.x + pad2)),
    y1: Math.max(box.y1, ...ends.map((p) => p.y + pad2)),
  }
  const dul = Math.hypot(du.x, du.y)
  const dvl = Math.hypot(dv.x, dv.y)
  found = detectBubbles(img, box2, upright ? dul : dvl, upright ? dvl : dul)
  if (found.length < (rows + 1) * 2) return null
  // 출발 칸이 칸이 아닌 얼룩(굵은 문번·머리글 글자)이면 이웃이 없어 번호가 퍼지지 않는다.
  // 모델 첫 줄 ① 근처 몇 개에서 각각 출발해 보고 가장 넓게 퍼진 것을 쓴다.
  const candidates = found
    .map((p, i) => ({ i, d: Math.hypot(p.x - s0.x, p.y - s0.y) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 8)
  let coords = new Map<number, { a: number; b: number }>()
  for (const c of candidates) {
    const got = assignLattice(found, c.i, du, dv)
    if (got.size > coords.size) coords = got
    if (coords.size >= (rows + 1) * 5) break
  }
  if (coords.size < (rows + 1) * 2) return null

  const as = [...coords.values()].map((c) => c.a)
  const bs = [...coords.values()].map((c) => c.b)
  // 창의 첫 줄 ① 자리(사진 좌표). 번호가 붙은 칸들로 쌍선형을 한 번 맞춰 잰다.
  const all: { u: number; v: number; p: Pt }[] = []
  for (const [i, c] of coords) all.push({ u: c.a, v: c.b, p: found[i] })
  const roughFit = fitBl(all)
  const cornerAt = (sa: number, sb: number): Pt =>
    roughFit ? applyBl(roughFit, sa, sb) : { x: s0.x + du.x * sa + dv.x * sb, y: s0.y + du.y * sa + dv.y * sb }
  const spacing = Math.min(Math.hypot(du.x, du.y), Math.hypot(dv.x, dv.y))
  const windows: { sa: number; sb: number; n: number; score: number }[] = []
  for (let sa = Math.min(...as); sa <= Math.max(...as) - 4; sa++) {
    for (let sb = Math.min(...bs); sb <= Math.max(...bs) - rows; sb++) {
      let n = 0
      for (const c of coords.values()) if (c.a >= sa && c.a <= sa + 4 && c.b >= sb && c.b <= sb + rows) n++
      // 덮는 칸 수만으로 고르면, 가장자리 줄의 칸 하나를 못 찾고 카드 테두리 얼룩이 줄처럼
      // 늘어선 사진에서 한 줄 밀린 창이 이긴다. 모델이 짚은 첫 줄 ① 에서 칸 하나만큼 멀어질
      // 때마다 3칸어치 깎는다. 출발 칸이 꼭 첫 줄은 아니라 번호가 아니라 사진 위 거리로 잰다.
      const corner = cornerAt(sa, sb)
      const d = Math.hypot(corner.x - col.topLeft.x, corner.y - col.topLeft.y) / spacing
      windows.push({ sa, sb, n, score: n - 3 * d })
    }
  }
  windows.sort((a, b) => b.score - a.score)
  const total = (rows + 1) * 5
  const fitWindow = (w: { sa: number; sb: number }): OmrColumnGrid | null => {
    const pairs: { u: number; v: number; p: Pt }[] = []
    for (const [i, c] of coords) {
      const u = c.a - w.sa
      const v = c.b - w.sb
      if (u >= 0 && u <= 4 && v >= 0 && v <= rows) pairs.push({ u, v, p: found[i] })
    }
    const m = fitBl(pairs)
    if (!m) return null
    return {
      first: col.first,
      last: col.last,
      topLeft: applyBl(m, 0, 0),
      topRight: applyBl(m, 4, 0),
      bottomLeft: applyBl(m, 0, rows),
      bottomRight: applyBl(m, 4, rows),
    }
  }
  // 칸 수·거리로 엇비슷한 후보가 여럿이면(머리글 글자가 한 줄처럼 늘어선 열 등) 실제로
  // 읽어 보고 모델이 읽은 답과 가장 많이 맞는 쪽을 고른다. 모델은 줄을 하나씩 밀려 읽는
  // 일은 있어도 대부분의 줄은 맞히므로, 제자리에 놓인 격자가 크게 앞선다.
  const top = windows.filter((w) => w.n >= total * 0.6 && w.score >= windows[0].score - total * 0.25).slice(0, 5)
  if (top.length === 0) return null
  let chosen = top[0]
  let chosenCol = fitWindow(chosen)
  if (model && model.size > 0 && top.length > 1) {
    let bestAgree = -1
    for (const w of top) {
      const c = fitWindow(w)
      if (!c) continue
      const reads = readByGrid(img, { columns: [c] }, numbersOf(c))
      let agree = 0
      for (const r of reads.values()) if (model.get(r.number) === r.choice) agree++
      if (agree > bestAgree) {
        bestAgree = agree
        chosen = w
        chosenCol = c
      }
    }
  }
  if (!chosenCol) return null
  return { col: chosenCol, matched: chosen.n / total }
}

const numbersOf = (c: OmrColumnGrid) => Array.from({ length: c.last - c.first + 1 }, (_, i) => c.first + i)

/**
 * 모델 격자를 사진 속 실제 칸에 맞춘다. 맞추지 못한 열은 빼고 돌려준다 —
 * 그 열의 문항은 readByGrid 결과에 없게 되어, 부르는 쪽이 모델 답으로 두고
 * ‘확인 필요’로 표시한다.
 */
export function refineGrid(
  img: RgbaImage,
  grid: OmrGrid,
  /** 모델이 읽은 답 — 엇비슷한 격자 후보를 가르는 데 쓴다. */
  modelAnswers?: { number: number; choice: number }[],
): { grid: OmrGrid; quality: number[] } {
  const model = modelAnswers ? new Map(modelAnswers.map((a) => [a.number, a.choice])) : undefined
  const columns: OmrColumnGrid[] = []
  const quality: number[] = []
  for (const col of grid.columns) {
    const r = refineColumn(img, col, model)
    if (r) {
      columns.push(r.col)
      quality.push(r.matched)
    }
  }
  return { grid: { columns, elective: grid.elective }, quality }
}

export interface ModelAnswer {
  number: number
  choice: number
  confidence: 'high' | 'low'
  note?: string
}

/**
 * 모델이 읽은 답과 픽셀로 잰 답을 합친다.
 *
 * 둘이 같고 둘 다 자신 있을 때만 high. 다르면 픽셀 쪽 답을 두되 low — 학생이
 * 다시 본다(합성 카드로 재 보니 모델 혼자서는 45문항 중 7개를 자신 있게 틀렸다).
 * 격자로 못 읽은 문항(열을 맞추지 못함)은 모델 답에 low.
 * grid 가 아예 없으면(옛 서버·개발용 가짜 응답) 모델 답을 그대로 쓴다.
 */
export function mergeReads(
  numbers: number[],
  model: ModelAnswer[],
  byGrid: Map<number, GridRead> | null,
): ModelAnswer[] {
  const m = new Map(model.map((a) => [a.number, a]))
  return numbers.map((n) => {
    const a = m.get(n) ?? { number: n, choice: 0, confidence: 'low' as const }
    if (!byGrid) return a
    const g = byGrid.get(n)
    if (!g) return { ...a, confidence: 'low' as const, note: a.note ?? '칸 위치를 맞추지 못함' }
    if (g.choice === a.choice) {
      const high = g.confidence === 'high' && a.confidence === 'high'
      return { number: n, choice: g.choice, confidence: high ? ('high' as const) : ('low' as const), note: g.note ?? a.note }
    }
    return { number: n, choice: g.choice, confidence: 'low' as const, note: g.note ?? '판독이 엇갈림' }
  })
}
