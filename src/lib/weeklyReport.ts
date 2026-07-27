import { isAssignmentDone } from './firestore'
import type { Assignment, Attempt } from './types'

/**
 * 한 지문 응시에서 '실제로 푼 문항'만 집계.
 * userAnswer가 채워진(>= 0) 문항만 분모에 넣어, 안 푼 문항을 틀린 것으로 치지 않는다.
 * readingResults가 없으면 total/correct로 폴백.
 */
function answeredStats(a: Attempt): { answered: number; correct: number } {
  const rr = a.readingResults
  if (Array.isArray(rr) && rr.length > 0) {
    let answered = 0
    let correct = 0
    for (const r of rr) {
      if ((r.userAnswer ?? -1) >= 0) {
        answered++
        if (r.correct) correct++
      }
    }
    return { answered, correct }
  }
  return { answered: a.total || 0, correct: a.correct || 0 }
}

/** 단어 시험 통과 기준 (회당 맞춘 단어 수). 사용자 템플릿 예시: 30개 중 25개. */
export const VOCAB_PASS_THRESHOLD = 25

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * 지문 문제풀이를 학생에게서 내렸으므로, 학생이 열 수도 풀 수도 없는 지문 과제를
 * 완료율 분모에서 뺀다. 실제 발송은 functions/index.js 의
 * READING_ASSIGNMENTS_VISIBLE 이 결정하므로 두 값을 항상 같이 바꿀 것.
 * (이 파일은 관리자 미리보기 전용이라, 어긋나면 미리보기와 실제 발송이 달라진다)
 */
const READING_ASSIGNMENTS_VISIBLE = false

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
  const readingAsn = READING_ASSIGNMENTS_VISIBLE
    ? recentAsn.filter((a) => a.type === 'reading')
    : []
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
  const totalCorrectV = vocabAttempts.reduce((s, a) => s + (a.correct || 0), 0)

  // 문제풀이 정답률: 지난주 '푼' 지문 문항만 집계 (안 푼 문항은 분모에서 제외).
  // 지문별로 가장 최근 응시 1개만 사용해 재시도가 중복 집계되지 않게 한다.
  const readingByLatest = new Map<string, Attempt>()
  for (const a of recentAttempts) {
    if (a.type !== 'reading' || a.practice) continue
    const cur = tsToMillis(a.createdAt) ?? 0
    const prev = readingByLatest.get(a.refId)
    if (!prev || cur >= (tsToMillis(prev.createdAt) ?? 0)) {
      readingByLatest.set(a.refId, a)
    }
  }
  const solvedReadingAttempts = [...readingByLatest.values()]
  const doneReadingCount = solvedReadingAttempts.length
  let totalR = 0
  let totalCorrectR = 0
  for (const a of solvedReadingAttempts) {
    const { answered, correct } = answeredStats(a)
    totalR += answered
    totalCorrectR += correct
  }
  const ratio = totalR > 0 ? Math.round((totalCorrectR / totalR) * 100) : null

  const vocabPctLine =
    vocabPct == null
      ? '▫️ 단어 암기: 지난주 과제 없음'
      : `▫️ 단어 암기: ${vocabPct}% 완료`
  const readingPctLine =
    readingPct == null
      ? '▫️ 문제 풀이: 지난주 과제 없음'
      : `▫️ 문제 풀이: ${readingPct}% 완료`
  // 통과는 '시험 개수' 기준: 부여된 단어 시험 중 통과(완료)한 시험 수.
  const vocabBody =
    vocabAsn.length === 0
      ? '▫️ 지난주 단어 시험 과제 없음'
      : `▫️ 통과 ${vocabDone}/${vocabAsn.length}개 시험\n▫️ 누적 암기 ${totalCorrectV}개`
  const readingBody =
    solvedReadingAttempts.length === 0
      ? '▫️ 지난주 푼 지문 없음'
      : `▫️ 지문 ${doneReadingCount}개 풀이\n▫️ 📈 정답률 ${ratio}% (${totalCorrectR}/${totalR}문항)`

  return {
    var1: ['📊 지난주 과제 성취도', vocabPctLine, readingPctLine].join('\n'),
    var2: ['🔤 단어 시험', vocabBody].join('\n'),
    var3: ['📝 문제 풀이', readingBody].join('\n'),
  }
}
