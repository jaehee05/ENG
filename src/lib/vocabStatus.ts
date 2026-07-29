import type { Timestamp } from 'firebase/firestore'
import type { Attempt, VocabSet } from './types'

/** 시험지 하나에 대한 한 학생의 응시 현황. */
export interface SheetStatus {
  set: VocabSet
  /** 정식 응시(연습 제외). 최신순. */
  tries: Attempt[]
  /** 연습 응시 횟수. 통계에는 넣지 않고 화면에만 따로 보여준다. */
  practiceCount: number
  /** 최고 정답 수 / 그때의 문항 수. 정식 응시가 없으면 null. */
  best: Attempt | null
  /** 최고 정답률(%). 정식 응시가 없거나 문항이 0이면 null. */
  bestRate: number | null
  /** 가장 최근 정식 응시. */
  last: Attempt | null
}

function millis(a: Attempt): number {
  return a.createdAt?.toMillis?.() ?? 0
}

function rate(a: Attempt): number | null {
  if (!a.total || a.total <= 0) return null
  return Math.round((a.correct / a.total) * 100)
}

/**
 * 시험지 목록과 그 학생의 응시 기록을 맞춰 현황을 만든다.
 *
 * 연습 응시는 정식 기록과 섞지 않는다 — 다른 화면들도 `!practice` 로
 * 통계를 내므로 여기만 다르면 같은 학생 숫자가 화면마다 어긋난다.
 */
export function sheetStatuses(sets: VocabSet[], attempts: Attempt[]): SheetStatus[] {
  const byRef = new Map<string, Attempt[]>()
  for (const a of attempts) {
    if (a.type !== 'vocab' || !a.refId) continue
    const cur = byRef.get(a.refId)
    if (cur) cur.push(a)
    else byRef.set(a.refId, [a])
  }

  return sets.map((set) => {
    const all = byRef.get(set.id) ?? []
    const tries = all.filter((a) => !a.practice).sort((x, y) => millis(y) - millis(x))
    let best: Attempt | null = null
    for (const a of tries) {
      if (!best || a.correct > best.correct) best = a
    }
    return {
      set,
      tries,
      practiceCount: all.length - tries.length,
      best,
      bestRate: best ? rate(best) : null,
      last: tries[0] ?? null,
    }
  })
}

/** 학생 한 명의 단어 시험 요약. */
export interface VocabSummary {
  /** 배정된 시험지 수. */
  total: number
  /** 한 번이라도 정식 응시한 시험지 수. */
  taken: number
  untaken: number
  /** 응시한 시험지들의 최고 정답률 평균. 응시가 없으면 null. */
  avgRate: number | null
  /** 기준 정답 수를 넘긴 시험지 수. */
  passed: number
  /** 가장 최근 응시 시각. */
  lastAt: Timestamp | null
}

export function summarizeVocab(
  list: SheetStatus[],
  passThreshold: number,
): VocabSummary {
  const taken = list.filter((s) => s.best !== null)
  const rates = taken.map((s) => s.bestRate).filter((r): r is number => r !== null)
  let lastAt: Timestamp | null = null
  for (const s of list) {
    const t = s.last?.createdAt
    if (t && (!lastAt || t.toMillis() > lastAt.toMillis())) lastAt = t
  }
  return {
    total: list.length,
    taken: taken.length,
    untaken: list.length - taken.length,
    avgRate:
      rates.length > 0
        ? Math.round(rates.reduce((n, r) => n + r, 0) / rates.length)
        : null,
    // 기준보다 문항이 적은 시험지는 만점을 통과로 본다 — 10단어짜리 마지막
    // DAY 를 25 기준으로 재면 영영 미달로 남는다.
    passed: taken.filter(
      (s) => s.best !== null && s.best.correct >= Math.min(passThreshold, s.best.total),
    ).length,
    lastAt,
  }
}
