import {
  gradeFromScore,
  questionPoints,
  type Attempt,
  type KoreanMock,
  type MockGradeCut,
  type MockNationalStats,
} from './types'

/**
 * 모의고사 결과 화면의 통계 — OUR-TEAM 과 전국단위 두 가지를 같은 모양으로 만든다.
 * 둘 다 보통은 관리자가 저장해 둔 AI 추정치(mock.team / mock.national)다. OUR-TEAM 추정치가
 * 없는 시험만 우리 학생 응시 기록에서 직접 낸다. 화면은 어느 쪽인지 모르고 그린다.
 */
export interface MockStatsView {
  /** 내 등급 (등급컷이 없으면 null). */
  grade: number | null
  /** 등급컷이 5등급까지만 있어 그 아래를 가를 수 없을 때 — 'N등급 이하'로 보인다. */
  gradeOpenEnded: boolean
  /** 내 표준점수 (계산할 자료가 없으면 null). */
  std: number | null
  /** 내 백분위 (계산할 자료가 없으면 null). */
  pct: number | null
  /** 등급컷 표 — 과목 키(COMMON_KEY 또는 선택과목 이름) → 원점수 컷. */
  cutoffs: Record<string, MockGradeCut[]>
  /** 등급별 표준점수 (없으면 빈 배열). */
  stdCutoffs: MockGradeCut[]
  /** 문항 번호 → 선지 1~5 선택률(%). 내 선택과목 문항 기준. */
  rates: Map<number, number[]>
  /** OUR-TEAM 표본 수(추정치는 저장된 값). 전국단위는 null. */
  sampleSize: number | null
}

/**
 * 과목 키 — 선택과목 이름, 선택과목 없는 시험·공통 문항은 COMMON_KEY.
 * Firestore 는 빈 문자열 필드 이름을 받지 않아 ''를 쓰지 않는다.
 */
export const COMMON_KEY = '_common'
export function electiveKey(name: string | undefined): string {
  return name || COMMON_KEY
}

export function pointsMap(mock: KoreanMock | null | undefined): Map<number, number> {
  const map = new Map<number, number>()
  if (mock) {
    for (const q of mock.questions) map.set(q.number, questionPoints(q))
    for (const el of mock.electives ?? [])
      for (const q of el.questions) map.set(q.number, questionPoints(q))
  }
  return map
}

export function rawScore(attempt: Attempt, points: Map<number, number>): number {
  return (attempt.koreanMockResults ?? []).reduce(
    (s, r) => s + (r.correct ? (points.get(r.number) ?? 2) : 0),
    0,
  )
}

/** 표준정규분포 누적확률 (Abramowitz–Stegun 7.1.26, 오차 1e-7 수준). */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2))
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2)
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2
}

/** 표준점수(평균 100, 표준편차 20) → 백분위 추정. */
function pctFromStd(std: number): number {
  return Math.max(0, Math.min(100, Math.round(normalCdf((std - 100) / 20) * 100)))
}

/**
 * 학생 한 명당 한 번만 센다 — 같은 시험을 여러 번 본 학생은 첫 응시만.
 * 다시 본 점수는 답을 알고 본 것이라 분포를 끌어올린다.
 */
export function firstAttemptPerStudent(attempts: Attempt[]): Attempt[] {
  const byStudent = new Map<string, Attempt>()
  for (const a of attempts) {
    if (a.type !== 'korean_mock' || !a.koreanMockResults?.length) continue
    const prev = byStudent.get(a.studentUid)
    const t = a.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER
    const pt = prev?.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER
    if (!prev || t < pt) byStudent.set(a.studentUid, a)
  }
  return [...byStudent.values()]
}

/** 선지 선택 수 → 선택률(%). 소수 첫째 자리. */
function toRates(counts: number[], n: number): number[] {
  return counts.map((c) => (n > 0 ? Math.round((c / n) * 1000) / 10 : 0))
}

/**
 * OUR-TEAM 통계. 등급은 시험지에 넣어 둔 등급컷(AI 추정 포함)을 그대로 쓰고,
 * 표준점수·백분위·선택률은 우리 학생 응시 기록에서 낸다.
 * - 표준점수 = 100 + 20 × (원점수 − 평균) / 표준편차 (전원 점수로)
 * - 백분위 = 나와 같거나 낮은 점수 비율
 */
export function teamStats(
  mock: KoreanMock,
  me: Attempt,
  teamAttempts: Attempt[],
): MockStatsView {
  const points = pointsMap(mock)
  const myRaw = rawScore(me, points)
  // 내 응시가 목록에 없거나(방금 제출해 아직 안 읽혔거나) 재응시면 내 것으로 바꿔 넣는다.
  const pool = firstAttemptPerStudent(teamAttempts).filter((a) => a.studentUid !== me.studentUid)
  pool.push(me)

  const raws = pool.map((a) => rawScore(a, points))
  const n = raws.length
  const mean = raws.reduce((s, x) => s + x, 0) / n
  const sd = Math.sqrt(raws.reduce((s, x) => s + (x - mean) ** 2, 0) / n)
  const stdOf = (raw: number) => (sd > 0 ? Math.round(100 + (20 * (raw - mean)) / sd) : null)

  const myKey = electiveKey(me.mockElectiveName)
  const commonNumbers = new Set(mock.questions.map((q) => q.number))
  const counts = new Map<number, number[]>()
  const totals = new Map<number, number>()
  for (const a of pool) {
    const sameElective = electiveKey(a.mockElectiveName) === myKey
    for (const r of a.koreanMockResults ?? []) {
      // 선택과목 문항은 번호가 같아도 과목이 다르면 다른 문제다.
      if (!commonNumbers.has(r.number) && !sameElective) continue
      const c = counts.get(r.number) ?? [0, 0, 0, 0, 0]
      if (r.userAnswer >= 1 && r.userAnswer <= 5) c[r.userAnswer - 1]++
      counts.set(r.number, c)
      totals.set(r.number, (totals.get(r.number) ?? 0) + 1)
    }
  }
  const rates = new Map<number, number[]>()
  for (const [num, c] of counts) rates.set(num, toRates(c, totals.get(num) ?? 0))

  const cutoffs: Record<string, MockGradeCut[]> = {}
  if (mock.electives?.length) {
    for (const el of mock.electives) cutoffs[el.name] = el.gradeCutoffs?.length ? el.gradeCutoffs : mock.gradeCutoffs ?? []
  } else {
    cutoffs[COMMON_KEY] = mock.gradeCutoffs ?? []
  }
  const myCuts = cutoffs[myKey] ?? []
  const stdCutoffs = myCuts
    .map((c) => ({ grade: c.grade, minScore: stdOf(c.minScore) }))
    .filter((c): c is MockGradeCut => c.minScore != null)

  const grade = gradeFromScore(myRaw, myCuts)
  return {
    grade,
    gradeOpenEnded: isOpenEnded(grade, myCuts),
    std: n >= 2 ? stdOf(myRaw) : null,
    pct: n >= 2 ? Math.round((raws.filter((x) => x <= myRaw).length / n) * 100) : null,
    cutoffs,
    stdCutoffs: n >= 2 ? stdCutoffs : [],
    rates,
    sampleSize: n,
  }
}

/**
 * 원점수 → 표준점수. 내 과목의 (원점수 컷, 표준점수 컷) 점들을 잇는 꺾은선으로
 * 읽는다. 맨 위·맨 아래 바깥은 가장 가까운 구간의 기울기를 그대로 늘린다.
 */
function interpolateStd(raw: number, rawCuts: MockGradeCut[], stdCuts: MockGradeCut[]): number | null {
  const stdByGrade = new Map(stdCuts.map((c) => [c.grade, c.minScore]))
  const pts = rawCuts
    .filter((c) => stdByGrade.has(c.grade))
    .map((c) => [c.minScore, stdByGrade.get(c.grade)!] as const)
    .sort((a, b) => a[0] - b[0])
  // 같은 원점수에 두 점이 있으면 기울기가 무한대가 된다.
  const uniq = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0])
  if (uniq.length === 0) return null
  if (uniq.length === 1) return Math.round(uniq[0][1] + (raw - uniq[0][0]))
  let i = uniq.findIndex((p) => raw < p[0])
  if (i === -1) i = uniq.length - 1
  else if (i === 0) i = 1
  const [x0, y0] = uniq[i - 1]
  const [x1, y1] = uniq[i]
  return Math.round(y0 + ((raw - x0) * (y1 - y0)) / (x1 - x0))
}

/** 맨 아래 등급컷보다 못하면 그 다음 등급이 나오는데, 컷이 8등급까지 없으면 그 아래도 섞여 있다. */
function isOpenEnded(grade: number | null, cuts: MockGradeCut[]): boolean {
  const last = Math.max(0, ...cuts.map((c) => c.grade))
  return grade != null && last < 8 && grade > last
}

/** 저장된 통계(전국단위·OUR-TEAM 추정치)가 하나라도 들어 있는지. */
export function hasStats(n: MockNationalStats | null | undefined): boolean {
  if (!n) return false
  return (
    Object.values(n.cutoffs ?? {}).some((c) => c.length > 0) ||
    (n.stdCutoffs?.length ?? 0) > 0 ||
    Object.values(n.rates ?? {}).some((r) => Object.keys(r).length > 0)
  )
}

/**
 * 저장된 통계(전국단위 또는 OUR-TEAM 추정치)로 내 등급·표준점수·백분위를 읽는다.
 * 비어 있는 칸은 비운 채로 둔다.
 */
export function savedStats(
  mock: KoreanMock,
  me: Attempt,
  n: MockNationalStats,
  sampleSize: number | null,
): MockStatsView {
  const myKey = electiveKey(me.mockElectiveName)
  const myRaw = rawScore(me, pointsMap(mock))
  const cutoffs = n.cutoffs ?? {}
  const myCuts = cutoffs[myKey] ?? []
  const stdCutoffs = n.stdCutoffs ?? []
  const std = interpolateStd(myRaw, myCuts, stdCutoffs)

  const rates = new Map<number, number[]>()
  for (const key of new Set([COMMON_KEY, myKey])) {
    for (const [num, r] of Object.entries(n.rates?.[key] ?? {})) rates.set(Number(num), r)
  }
  const grade = gradeFromScore(myRaw, myCuts)
  return {
    grade,
    gradeOpenEnded: isOpenEnded(grade, myCuts),
    std,
    pct: std != null ? pctFromStd(std) : null,
    cutoffs,
    stdCutoffs,
    rates,
    sampleSize,
  }
}

/** 오답률 Top N — 공통 문항만. 오답률 = 100 − 정답 선택률. */
export function topWrongRates(
  rates: Map<number, number[]>,
  correctByNumber: Map<number, number>,
  commonNumbers: number[],
  limit = 8,
): { number: number; wrongRate: number }[] {
  return commonNumbers
    .flatMap((num) => {
      const r = rates.get(num)
      const ans = correctByNumber.get(num)
      if (!r || !ans || r.every((x) => x === 0)) return []
      return [{ number: num, wrongRate: Math.round((100 - r[ans - 1]) * 10) / 10 }]
    })
    .sort((a, b) => b.wrongRate - a.wrongRate)
    .slice(0, limit)
}

/**
 * 붙여넣은 선택률 표 읽기. 한 줄에 '문번 ①률 ②률 ③률 ④률 ⑤률'.
 * 표에서 그대로 긁어 온 탭·쉼표·%·'번'은 무시한다. 숫자가 6개가 아닌 줄은 버린다.
 */
export function parseRatesText(text: string): Record<string, number[]> {
  const out: Record<string, number[]> = {}
  for (const line of text.split('\n')) {
    const nums = (line.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
    if (nums.length !== 6) continue
    const [num, ...r] = nums
    if (!Number.isInteger(num) || num <= 0) continue
    out[String(num)] = r
  }
  return out
}

export function ratesToText(rates: Record<string, number[]> | undefined): string {
  return Object.entries(rates ?? {})
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([num, r]) => [num, ...r].join(' '))
    .join('\n')
}
