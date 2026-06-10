import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAttempt } from '../lib/firestore'
import type { Attempt } from '../lib/types'

export function ReadingResult() {
  const { attemptId } = useParams<{ id: string; attemptId: string }>()
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!attemptId) return
    getAttempt(attemptId)
      .then((a) => {
        if (!a) setError('결과를 찾을 수 없습니다.')
        else setAttempt(a)
      })
      .catch((e) => setError(e.message ?? '불러오기 실패'))
      .finally(() => setLoading(false))
  }, [attemptId])

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!attempt || !attempt.readingResults) return null

  const ratio = attempt.total > 0 ? Math.round((attempt.correct / attempt.total) * 100) : 0

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

      <div className="space-y-3">
        {attempt.readingResults.map((r, i) => (
          <div
            key={i}
            className={`rounded-md border p-4 ${
              r.correct ? 'border-emerald-200 bg-emerald-50/40' : 'border-red-200 bg-red-50/40'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900 whitespace-pre-wrap">
                {i + 1}. {r.q}
              </p>
              {r.correct ? (
                <span className="inline-block rounded bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 whitespace-nowrap">
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
                return (
                  <div
                    key={ci}
                    className={`flex items-start gap-2 rounded px-2 py-1 ${
                      isAnswer
                        ? 'bg-emerald-100/70'
                        : isUser
                          ? 'bg-red-100/70'
                          : ''
                    }`}
                  >
                    <span className="text-slate-500 w-5">{['①', '②', '③', '④', '⑤'][ci]}</span>
                    <span className="flex-1 text-slate-700">{c}</span>
                    {isAnswer && <span className="text-xs text-emerald-800 font-medium">정답</span>}
                    {isUser && !isAnswer && (
                      <span className="text-xs text-red-800 font-medium">선택</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
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
