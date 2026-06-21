import { isAssignmentDone } from './firestore'
import { isReadingAttemptComplete } from './types'
import type { Assignment, Attempt } from './types'

/** 단어 시험 통과 기준 (회당 맞춘 단어 수). 사용자 템플릿 예시: 30개 중 25개. */
export const VOCAB_PASS_THRESHOLD = 25

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export interface WeeklyReportVars {
  /** var1: 과제 성취도 */
  var1: string
  /** var2: 단어 시험 Report */
  var2: string
  /** var3: 문제 풀이 Report */
  var3: string
}

function tsToMillis(ts: { toMillis?: () => number; toDate?: () => Date } | null | undefined): number | null {
  if (!ts) return null
  if (typeof ts.toMillis === 'function') return ts.toMillis()
  if (typeof ts.toDate === 'function') return ts.toDate().getTime()
  return null
}

/**
 * 주간 리포트 알림톡 변수 생성.
 * 서버 `buildWeeklyReportVarsSrv`와 동일한 7일 롤링 윈도우 + 빈 상태 문구.
 *
 * - 과제는 dueAt(없으면 createdAt)이 [windowStart, now] 안에 들어오는 것만 집계
 * - attempts는 createdAt이 윈도우 안인 것만 집계
 */
export function buildWeeklyReportVars(
  assignments: Assignment[],
  attempts: Attempt[],
  now: Date = new Date(),
): WeeklyReportVars {
  const start = now.getTime() - WEEK_MS
  const inWindow = (ts: { toMillis?: () => number; toDate?: () => Date } | null | undefined): boolean => {
    const ms = tsToMillis(ts)
    return ms != null && ms >= start
  }

  const recentAsn = assignments.filter((a) => inWindow(a.dueAt || a.createdAt))
  const recentAttempts = attempts.filter((a) => inWindow(a.createdAt))

  const vocabAsn = recentAsn.filter((a) => a.type === 'vocab')
  const readingAsn = recentAsn.filter((a) => a.type === 'reading')
  const vocabDone = vocabAsn.filter((a) => isAssignmentDone(a, attempts)).length
  const readingDone = readingAsn.filter((a) =>
    isAssignmentDone(a, attempts),
  ).length
  const vocabPct =
    vocabAsn.length > 0 ? Math.round((vocabDone / vocabAsn.length) * 100) : null
  const readingPct =
    readingAsn.length > 0
      ? Math.round((readingDone / readingAsn.length) * 100)
      : null

  const vocabAttempts = recentAttempts.filter(
    (a) => a.type === 'vocab' && !a.practice,
  )
  const totalWords = vocabAttempts.reduce((s, a) => s + (a.total || 0), 0)
  const totalCorrectV = vocabAttempts.reduce((s, a) => s + (a.correct || 0), 0)
  const passCount = vocabAttempts.filter(
    (a) => (a.correct || 0) >= VOCAB_PASS_THRESHOLD,
  ).length
  const sessionCount = vocabAttempts.length

  // 지문 통계는 '완료된' attempt(만점이거나 오답 검토 완료)만 집계.
  const completedReadingAttempts = recentAttempts.filter(
    (a) => a.type === 'reading' && !a.practice && isReadingAttemptComplete(a),
  )
  const uniqueDoneReadingIds = new Set(
    completedReadingAttempts.map((a) => a.refId),
  )
  const doneReadingCount = uniqueDoneReadingIds.size
  const totalR = completedReadingAttempts.reduce(
    (s, a) => s + (a.total || 0),
    0,
  )
  const totalCorrectR = completedReadingAttempts.reduce(
    (s, a) => s + (a.correct || 0),
    0,
  )
  const ratio = totalR > 0 ? Math.round((totalCorrectR / totalR) * 100) : null

  const vocabPctLine =
    vocabPct == null
      ? '▫️ 단어 암기: 지난주 과제 없음'
      : `▫️ 단어 암기: ${vocabPct}% 완료`
  const readingPctLine =
    readingPct == null
      ? '▫️ 문제 풀이: 지난주 과제 없음'
      : `▫️ 문제 풀이: ${readingPct}% 완료`
  const vocabBody =
    sessionCount === 0
      ? '▫️ 지난주 응시 기록 없음'
      : `▫️ 학습 ${vocabAsn.length}회분 · 단어 ${totalWords}개\n▫️ 통과 ${passCount}/${sessionCount}회 (암기 ${totalCorrectV}개)`
  const readingBody =
    completedReadingAttempts.length === 0
      ? '▫️ 지난주 완료한 지문 없음'
      : `▫️ 지문 ${doneReadingCount}개 완료\n▫️ 📈 정답률 ${ratio}% (${totalCorrectR}/${totalR}문항)`

  return {
    var1: ['📊 지난주 과제 성취도', vocabPctLine, readingPctLine].join('\n'),
    var2: ['🔤 단어 시험', vocabBody].join('\n'),
    var3: ['📝 문제 풀이', readingBody].join('\n'),
  }
}
