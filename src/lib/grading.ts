import { gradeVocabAI } from './api'
import { isCorrectKo, type VocabResult } from './types'

interface GradeInput {
  en: string
  ko: string
  userAnswer: string
}

export async function gradeVocabAnswers(items: GradeInput[]): Promise<VocabResult[]> {
  const results: VocabResult[] = items.map((it) => ({
    en: it.en,
    ko: it.ko,
    userAnswer: it.userAnswer,
    correct: isCorrectKo(it.userAnswer, it.ko),
  }))

  const aiCandidates: { resultIdx: number; en: string; expected: string; userAnswer: string }[] = []
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (!r.correct && r.userAnswer.trim().length > 0) {
      aiCandidates.push({
        resultIdx: i,
        en: r.en,
        expected: r.ko,
        userAnswer: r.userAnswer,
      })
    }
  }

  if (aiCandidates.length === 0) return results

  try {
    const verdicts = await gradeVocabAI(
      aiCandidates.map(({ en, expected, userAnswer }) => ({ en, expected, userAnswer })),
    )
    aiCandidates.forEach((c, i) => {
      if (verdicts[i]) results[c.resultIdx].correct = true
    })
  } catch {
    // AI 채점 실패 시 로컬 채점 결과를 그대로 사용
  }

  return results
}
