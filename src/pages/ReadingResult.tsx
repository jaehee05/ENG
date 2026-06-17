import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAttempt, getReading } from '../lib/firestore'
import { renderUnderlines } from '../lib/renderUnderlines'
import type { Attempt, Reading } from '../lib/types'

const CHOICE_MARKS = ['①', '②', '③', '④', '⑤']

export function ReadingResult() {
  const { attemptId } = useParams<{ id: string; attemptId: string }>()
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [reading, setReading] = useState<Reading | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 재도전: 문항별로 선택된 인덱스 보관 (기록 X)
  const [retry, setRetry] = useState<Record<number, number>>({})

  useEffect(() => {
    if (!attemptId) return
    let cancelled = false
    getAttempt(attemptId)
      .then(async (a) => {
        if (cancelled) return
        if (!a) {
          setError('결과를 찾을 수 없습니다.')
          return
        }
        setAttempt(a)
        if (a.refId) {
          try {
            const r = await getReading(a.refId)
            if (!cancelled) setReading(r)
          } catch {
            // 지문 조회 실패는 결과 표시에 치명적이지 않음
          }
        }
      })
      .catch((e) => setError(e.message ?? '불러오기 실패'))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [attemptId])

  const wrongIndices = useMemo(() => {
    if (!attempt?.readingResults) return [] as number[]
    return attempt.readingResults
      .map((r, i) => (r.correct ? -1 : i))
      .filter((i) => i >= 0)
  }, [attempt])

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!attempt || !attempt.readingResults) return null

  const ratio = attempt.total > 0 ? Math.round((attempt.correct / attempt.total) * 100) : 0
  const hasWrong = wrongIndices.length > 0
  const passageKo = reading?.passageKo?.trim() ?? ''

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{attempt.refTitle}</h1>
        <p className="text-sm text-slate-500 mt-1">{attempt.studentName} 님의 결과</p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 flex items-baseline gap-3">
        <span className="text-4xl font-bold text-slate-900">
          {attempt.correct}
          <span className="text-2xl text-slate-400"> / {attempt.total}</span>
        </span>
        <span className="text-sm text-slate-500">정답률 {ratio}%</span>
      </div>

      {hasWrong && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-900">
            틀린 문제가 {wrongIndices.length}개 있어요. 한글 해석을 참고해서 다시 풀어보세요.
          </p>
          {passageKo ? (
            <details className="rounded-md border border-amber-200 bg-white">
              <summary className="cursor-pointer text-sm font-medium text-slate-800 px-4 py-2 hover:bg-amber-50">
                지문 한글 해석 보기
              </summary>
              <div className="px-4 py-3 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed border-t border-amber-100 font-myeongjo">
                {passageKo}
              </div>
            </details>
          ) : (
            <p className="text-xs text-slate-500">
              아직 이 지문의 한글 해석이 등록되어 있지 않습니다. 관리자에게 요청해 주세요.
            </p>
          )}
        </div>
      )}

      <div className="space-y-3">
        {attempt.readingResults.map((r, i) => {
          const label = r.number ?? i + 1
          const retryAns = retry[i] ?? -1
          const retried = retryAns >= 0
          const retryCorrect = retried && retryAns === r.correctAnswer
          return (
            <div
              key={i}
              className={`rounded-md border p-4 ${
                r.correct ? 'border-brand-200 bg-brand-50/40' : 'border-red-200 bg-red-50/40'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900 whitespace-pre-wrap">
                  {label}. {renderUnderlines(r.q)}
                </p>
                {r.correct ? (
                  <span className="inline-block rounded bg-brand-100 text-brand-700 text-xs px-2 py-0.5 whitespace-nowrap">
                    정답
                  </span>
                ) : (
                  <span className="inline-block rounded bg-red-100 text-red-800 text-xs px-2 py-0.5 whitespace-nowrap">
                    오답
                  </span>
                )}
              </div>
              <div className="mt-3 space-y-1 text-sm">
                {r.choices.map((c, ci) => {
                  const isUser = ci === r.userAnswer
                  const isAnswer = ci === r.correctAnswer
                  // 정답은 (a) 처음부터 맞혔거나 (b) 재도전에서 맞힌 경우에만 공개
                  const revealAnswer = r.correct || retryCorrect
                  const showAsAnswer = isAnswer && revealAnswer
                  return (
                    <div
                      key={ci}
                      className={`flex items-start gap-2 rounded px-2 py-1 ${
                        showAsAnswer
                          ? 'bg-brand-100/70'
                          : isUser && !showAsAnswer
                            ? 'bg-red-100/70'
                            : ''
                      }`}
                    >
                      <span className="text-slate-500 w-5">{CHOICE_MARKS[ci]}</span>
                      <span className="flex-1 text-slate-700">{renderUnderlines(c)}</span>
                      {showAsAnswer && <span className="text-xs text-brand-700 font-medium">정답</span>}
                      {isUser && !showAsAnswer && (
                        <span className="text-xs text-red-800 font-medium">선택</span>
                      )}
                    </div>
                  )
                })}
              </div>

              {!r.correct && (
                <div className="mt-3 pt-3 border-t border-red-200/70 space-y-2">
                  <p className="text-xs font-medium text-slate-700">다시 풀어보기</p>
                  <div className="flex flex-wrap gap-2">
                    {r.choices.map((_, ci) => {
                      const isSel = ci === retryAns
                      const isCorrectChoice = ci === r.correctAnswer
                      const color = isSel
                        ? isCorrectChoice
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-red-600 text-white border-red-600'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      return (
                        <button
                          key={ci}
                          type="button"
                          onClick={() =>
                            setRetry((prev) => ({ ...prev, [i]: ci }))
                          }
                          className={`rounded-full w-9 h-9 inline-flex items-center justify-center border text-sm font-medium transition ${color}`}
                        >
                          {CHOICE_MARKS[ci]}
                        </button>
                      )
                    })}
                  </div>
                  {retried && (
                    <p
                      className={`text-xs font-medium ${
                        retryCorrect ? 'text-brand-700' : 'text-red-700'
                      }`}
                    >
                      {retryCorrect
                        ? '잘 풀었어요! 다음에는 한 번에 맞혀 봐요.'
                        : '아직 정답이 아니에요. 한글 해석을 더 살펴보세요.'}
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex gap-2">
        <Link
          to="/reading"
          className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-100"
        >
          목록으로
        </Link>
      </div>
    </div>
  )
}
