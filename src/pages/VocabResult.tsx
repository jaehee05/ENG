import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { getAttempt, updateVocabResults } from '../lib/firestore'
import type { Attempt, VocabResult as VocabResultRow } from '../lib/types'

export function VocabResult() {
  const { attemptId } = useParams<{ id: string; attemptId: string }>()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [results, setResults] = useState<VocabResultRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingIdx, setSavingIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!attemptId) return
    getAttempt(attemptId)
      .then((a) => {
        if (!a) setError('결과를 찾을 수 없습니다.')
        else {
          setAttempt(a)
          setResults(a.vocabResults ?? [])
        }
      })
      .catch((e) => setError(e.message ?? '불러오기 실패'))
      .finally(() => setLoading(false))
  }, [attemptId])

  const correctCount = useMemo(
    () => results.filter((r) => r.correct).length,
    [results],
  )
  const total = results.length
  const ratio = total > 0 ? Math.round((correctCount / total) * 100) : 0

  async function toggleCorrect(i: number) {
    if (!attempt) return
    const next = results.map((r, idx) =>
      idx === i ? { ...r, correct: !r.correct } : r,
    )
    setResults(next)
    setSavingIdx(i)
    try {
      await updateVocabResults(attempt.id, next)
    } catch (err) {
      // Revert on failure
      setResults(results)
      window.alert(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSavingIdx(null)
    }
  }

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!attempt) return null

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          결과
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">{attempt.refTitle}</h1>
        <p className="text-xs text-slate-500 mt-1">{attempt.studentName}</p>
      </header>

      <div className="rounded-lg border border-slate-200 bg-white p-5 flex items-baseline gap-3">
        <span className="text-4xl font-bold text-slate-900">
          {correctCount}
          <span className="text-2xl text-slate-400"> / {total}</span>
        </span>
        <span className="text-sm text-slate-500">정답률 {ratio}%</span>
      </div>

      {isAdmin && (
        <p className="text-xs text-slate-500">
          각 행의 상태 배지를 눌러 정답/오답을 바꿀 수 있습니다. 누르면 즉시 저장돼요.
        </p>
      )}

      <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-50 border-b border-slate-200">
          <div className="col-span-1">#</div>
          <div className="col-span-3">영단어</div>
          <div className="col-span-4">내 답</div>
          <div className="col-span-3">정답</div>
          <div className="col-span-1 text-center">결과</div>
        </div>
        {results.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-slate-500">
            {attempt?.manual
              ? '관리자가 점수만 입력한 기록이라 문항별 내역이 없습니다.'
              : '문항별 내역이 없습니다.'}
          </p>
        )}
        {results.map((r, i) => (
          <div key={i} className={r.correct ? '' : 'bg-red-50/40'}>
          <div
            className="grid grid-cols-12 px-4 py-2 items-center text-sm border-b border-slate-100 last:border-b-0"
          >
            <div className="col-span-1 text-slate-500">{i + 1}</div>
            <div className="col-span-3 font-medium text-slate-900">{r.en}</div>
            <div className={`col-span-4 ${r.userAnswer ? 'text-slate-700' : 'text-slate-400 italic'}`}>
              {r.userAnswer || '(미입력)'}
            </div>
            <div className="col-span-3 text-slate-600">{r.ko}</div>
            <div className="col-span-1 text-center">
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => toggleCorrect(i)}
                  disabled={savingIdx === i}
                  className={`inline-block rounded text-xs px-2 py-0.5 transition disabled:opacity-50 ${
                    r.correct
                      ? 'bg-brand-100 text-brand-700 hover:bg-brand-200'
                      : 'bg-red-100 text-red-800 hover:bg-red-200'
                  }`}
                  title="클릭해서 정답/오답 전환"
                >
                  {savingIdx === i ? '...' : r.correct ? '정답' : '오답'}
                </button>
              ) : r.correct ? (
                <span className="inline-block rounded bg-brand-100 text-brand-700 text-xs px-2 py-0.5">
                  정답
                </span>
              ) : (
                <span className="inline-block rounded bg-red-100 text-red-800 text-xs px-2 py-0.5">
                  오답
                </span>
              )}
            </div>
          </div>
          {/* 5지선다 오답: 어떤 선지들 중에 틀렸는지 보여준다 */}
          {!r.correct && r.choices && r.choices.length > 0 && (
            <ul className="px-4 pb-2.5 pl-12 space-y-1 text-[13px] border-b border-slate-100 last:border-b-0">
              {r.choices.map((c, ci) => {
                const isAnswer = ci === r.answerIndex
                const isPicked = ci === r.userIndex
                return (
                  <li
                    key={ci}
                    className={
                      isAnswer
                        ? 'text-brand-700 font-medium'
                        : isPicked
                          ? 'text-red-700'
                          : 'text-slate-500'
                    }
                  >
                    {ci + 1}. {c}
                    {isAnswer && ' ← 정답'}
                    {isPicked && !isAnswer && ' ← 내가 고른 답'}
                  </li>
                )
              })}
            </ul>
          )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Link
          to="/vocab"
          className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-100"
        >
          목록으로
        </Link>
      </div>
    </div>
  )
}
