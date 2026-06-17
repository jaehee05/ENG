import { isAssignmentDone } from './firestore'
import type { Assignment, Attempt } from './types'

/** 단어 시험 통과 기준 (회당 맞춘 단어 수). 사용자 템플릿 예시: 30개 중 25개. */
export const VOCAB_PASS_THRESHOLD = 25

export interface WeeklyReportVars {
  /** var1: 과제 성취도 */
  var1: string
  /** var2: 단어 시험 Report */
  var2: string
  /** var3: 문제 풀이 Report */
  var3: string
}

/**
 * 주간 리포트 알림톡 변수 생성.
 * 현재는 학생의 전체 과제/응시 기준 — 추후 기간 필터 가능.
 */
export function buildWeeklyReportVars(
  assignments: Assignment[],
  attempts: Attempt[],
): WeeklyReportVars {
  const vocabAsn = assignments.filter((a) => a.type === 'vocab')
  const readingAsn = assignments.filter((a) => a.type === 'reading')
  const vocabDone = vocabAsn.filter((a) => isAssignmentDone(a, attempts)).length
  const readingDone = readingAsn.filter((a) =>
    isAssignmentDone(a, attempts),
  ).length
  const vocabPct =
    vocabAsn.length > 0 ? Math.round((vocabDone / vocabAsn.length) * 100) : 0
  const readingPct =
    readingAsn.length > 0
      ? Math.round((readingDone / readingAsn.length) * 100)
      : 0

  const vocabAttempts = attempts.filter(
    (a) => a.type === 'vocab' && !a.practice,
  )
  const totalWords = vocabAttempts.reduce((s, a) => s + (a.total || 0), 0)
  const totalCorrectV = vocabAttempts.reduce((s, a) => s + (a.correct || 0), 0)
  const passCount = vocabAttempts.filter(
    (a) => (a.correct || 0) >= VOCAB_PASS_THRESHOLD,
  ).length
  const sessionCount = vocabAttempts.length

  const readingAttempts = attempts.filter(
    (a) => a.type === 'reading' && !a.practice,
  )
  const totalR = readingAttempts.reduce((s, a) => s + (a.total || 0), 0)
  const totalCorrectR = readingAttempts.reduce(
    (s, a) => s + (a.correct || 0),
    0,
  )
  const ratio = totalR > 0 ? Math.round((totalCorrectR / totalR) * 100) : 0

  const var1 = [
    '📊 지난주 과제 성취도',
    `▫️ 단어 암기: [ ${vocabPct}% 완료 ]`,
    `▫️ 문제 풀이: [ ${readingPct}% 완료 ]`,
  ].join('\n')

  const var2 = [
    '🔤 단어 시험 Report',
    `▫️ 학습 범위: 총 ${vocabAsn.length}회분 (단어 ${totalWords}개)`,
    `▫️ 암기 현황: 총 ${totalCorrectV}개 완료`,
    `▫️ 최종 결과: 🎯 총 ${sessionCount}회 중 [ ${passCount}회 ] 통과 (기준: 회당 30개 중 ${VOCAB_PASS_THRESHOLD}개 이상)`,
  ].join('\n')

  const var3 = [
    '📝 문제 풀이 Report',
    `▫️ 독해 지문: 총 ${readingDone}개 완수`,
    `▫️ 학습 결과: 📈 정답률 ${ratio}% (${totalCorrectR}/${totalR}문항)`,
  ].join('\n')

  return { var1, var2, var3 }
}
