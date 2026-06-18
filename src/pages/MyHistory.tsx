import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { listAttemptsForUser } from '../lib/firestore'
import type { Attempt } from '../lib/types'

const TYPE_LABEL: Record<Attempt['type'], string> = {
  vocab: '단어 시험지',
  reading: '지문 문제풀이',
  wordbook: '내 단어장 시험',
}

type Filter = 'all' | Attempt['type']

function fmtDate(ts: Attempt['createdAt']): string {
  if (!ts) return ''
  const d = ts.toDate()
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function resultPath(a: Attempt): string {
  if (a.type === 'vocab') return `/vocab/${a.refId}/result/${a.id}`
  if (a.type === 'reading') return `/reading/${a.refId}/result/${a.id}`
  return `/wordbook/result/${a.id}`
}

interface Bucket {
  key: string
  type: Attempt['type']
  refId: string
  refTitle: string
  attempts: Attempt[]
}

export function MyHistory() {
  const { profile } = useAuth()
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!profile) return
    listAttemptsForUser(profile.id)
      .then(setAttempts)
      .catch((e) => setError(e instanceof Error ? e.message : '기록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [profile])

  const filtered = useMemo(
    () => (filter === 'all' ? attempts : attempts.filter((a) => a.type === filter)),
    [attempts, filter],
  )

  const buckets = useMemo<Bucket[]>(() => {
    const map = new Map<string, Bucket>()
    for (const a of filtered) {
      const key = `${a.type}:${a.refId || a.refTitle}`
      const existing = map.get(key)
      if (existing) existing.attempts.push(a)
      else
        map.set(key, {
          key,
          type: a.type,
          refId: a.refId,
          refTitle: a.refTitle,
          attempts: [a],
        })
    }
    return Array.from(map.values()).sort((a, b) => {
      const at = a.attempts[0]?.createdAt?.toMillis() ?? 0
      const bt = b.attempts[0]?.createdAt?.toMillis() ?? 0
      return bt - at
    })
  }, [filtered])

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          나의 학습
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
          내 기록
        </h1>
      </header>

      {loading && <p className="text-slate-500 text-sm">불러오는 중...</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {!loading && (
        <>
          <div className="flex items-center gap-1 text-xs">
            {(['all', 'vocab', 'reading', 'wordbook'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`px-3 py-1.5 rounded-full transition ${
                  filter === k
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {k === 'all' ? '전체' : TYPE_LABEL[k]}
              </button>
            ))}
          </div>

          {buckets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              아직 기록이 없습니다.
            </div>
          ) : (
            <div className="space-y-3">
              {buckets.map((b) => {
                const best = b.attempts.reduce(
                  (acc, a) =>
                    a.total > 0 && a.correct / a.total > acc.ratio
                      ? { ratio: a.correct / a.total, correct: a.correct, total: a.total }
                      : acc,
                  { ratio: 0, correct: 0, total: 0 },
                )
                const isOpen = expanded.has(b.key)
                return (
                  <div
                    key={b.key}
                    className="rounded-lg border border-slate-200 bg-white overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggle(b.key)}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-block rounded bg-brand-50 text-brand-700 text-xs font-medium px-2 py-0.5">
                            {TYPE_LABEL[b.type]}
                          </span>
                          <span className="text-base font-semibold text-slate-900 truncate">
                            {b.refTitle}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {b.attempts.length}회 응시
                          {best.total > 0 && (
                            <> · 최고 {best.correct}/{best.total} ({Math.round(best.ratio * 100)}%)</>
                          )}
                        </p>
                      </div>
                      <span className="text-slate-400 text-sm shrink-0 mt-1">
                        {isOpen ? '−' : '+'}
                      </span>
                    </button>
                    {isOpen && (
                      <ul className="divide-y divide-slate-100 border-t border-slate-100">
                        {b.attempts.map((a, i) => {
                          const ratio = a.total > 0 ? Math.round((a.correct / a.total) * 100) : 0
                          return (
                            <li key={a.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-xs text-slate-400 w-8">
                                  {b.attempts.length - i}회차
                                </span>
                                <span className="text-slate-500 text-xs">
                                  {fmtDate(a.createdAt)}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className="text-slate-700">
                                  {a.correct}/{a.total}
                                </span>
                                <span
                                  className={`text-sm font-medium ${ratio >= 80 ? 'text-brand-700' : ratio >= 50 ? 'text-slate-700' : 'text-red-600'}`}
                                >
                                  {ratio}%
                                </span>
                                <Link
                                  to={resultPath(a)}
                                  className="text-xs text-brand-700 hover:underline"
                                >
                                  다시 보기
                                </Link>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
