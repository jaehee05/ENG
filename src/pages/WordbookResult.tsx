import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAttempt } from '../lib/firestore'
import type { Attempt } from '../lib/types'

export function WordbookResult() {
  const { attemptId } = useParams<{ attemptId: string }>()
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
  if (!attempt || !attempt.vocabResults) return null

  const ratio = attempt.total > 0 ? Math.round((attempt.correct / attempt.total) * 100) : 0

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">내 단어장 시험 결과</h1>
        <p className="text-sm text-slate-500 mt-1">{attempt.studentName}</p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 flex items-baseline gap-3">
        <span className="text-4xl font-bold text-slate-900">
          {attempt.correct}
          <span className="text-2xl text-slate-400"> / {attempt.total}</span>
        </span>
        <span className="text-sm text-slate-500">정답률 {ratio}%</span>
      </div>

      <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-50 border-b border-slate-200">
          <div className="col-span-1">#</div>
          <div className="col-span-3">영단어</div>
          <div className="col-span-4">내 답</div>
          <div className="col-span-3">정답</div>
          <div className="col-span-1 text-center">결과</div>
        </div>
        {attempt.vocabResults.map((r, i) => (
          <div
            key={i}
            className={`grid grid-cols-12 px-4 py-2 items-center text-sm border-b border-slate-100 last:border-b-0 ${
              r.correct ? '' : 'bg-red-50/40'
            }`}
          >
            <div className="col-span-1 text-slate-500">{i + 1}</div>
            <div className="col-span-3 font-medium text-slate-900">{r.en}</div>
            <div className={`col-span-4 ${r.userAnswer ? 'text-slate-700' : 'text-slate-400 italic'}`}>
              {r.userAnswer || '(미입력)'}
            </div>
            <div className="col-span-3 text-slate-600">{r.ko}</div>
            <div className="col-span-1 text-center">
              {r.correct ? (
                <span className="inline-block rounded bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5">
                  정답
                </span>
              ) : (
                <span className="inline-block rounded bg-red-100 text-red-800 text-xs px-2 py-0.5">
                  오답
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Link
          to="/wordbook"
          className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-100"
        >
          단어장으로
        </Link>
      </div>
    </div>
  )
}
