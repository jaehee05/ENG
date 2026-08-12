import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { deleteAttempt, listAttemptsForUser } from '../lib/firestore'
import { WORDBOOK_ENABLED } from '../lib/features'
import { MOCK_SUBJECT_LABEL, type Attempt, type MockSubject } from '../lib/types'

const TYPE_LABEL: Record<Attempt['type'], string> = {
  vocab: '단어 시험지',
  reading: '지문 문제풀이',
  wordbook: '내 단어장 시험',
  korean_mock: '모의고사',
}

const SUBJECT_BADGE_CLASS: Record<MockSubject, string> = {
  korean: 'bg-rose-50 text-rose-700 border-rose-200',
  english: 'bg-sky-50 text-sky-700 border-sky-200',
}

type Filter = 'all' | Attempt['type']

/**
 * 필터 칩. 내 단어장과 지문 문제풀이는 내린 기능이라 뺀다 — 지난 응시
 * 기록은 '전체' 에 남는다.
 */
const HISTORY_FILTERS: readonly Filter[] = [
  'all',
  'vocab',
  ...(WORDBOOK_ENABLED ? (['wordbook'] as const) : []),
  'korean_mock',
]

function fmtDate(ts: Attempt['createdAt']): string {
  if (!ts) return ''
  const d = ts.toDate()
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function resultPath(a: Attempt): string {
  if (a.type === 'vocab') return `/vocab/${a.refId}/result/${a.id}`
  if (a.type === 'reading') return `/reading/${a.refId}/result/${a.id}`
  if (a.type === 'korean_mock') return `/korean-mocks/${a.refId}/result/${a.id}`
  return `/wordbook/result/${a.id}`
}

function bucketLabel(b: Bucket): string {
  if (b.type === 'korean_mock') {
    const subj = b.mockSubject ?? 'korean'
    return `${MOCK_SUBJECT_LABEL[subj]} 모의고사`
  }
  return TYPE_LABEL[b.type]
}

interface Bucket {
  key: string
  type: Attempt['type']
  refId: string
  refTitle: string
  mockSubject?: MockSubject
  attempts: Attempt[]
}

export function MyHistory() {
  const { profile } = useAuth()
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // 시험지를 확인하려고 관리자가 직접 풀어 본 기록이 쌓인다. 여기서 지운다.
  const isAdmin = profile?.role === 'admin'
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleDelete(a: Attempt) {
    if (
      !window.confirm(
        `${a.refTitle}\n${fmtDate(a.createdAt) || '날짜 없음'} · ${a.correct}/${a.total} 기록을 삭제하시겠습니까?` +
          (a.practice
            ? '\n연습 기록이라 응시 횟수에는 영향이 없습니다.'
            : '\n응시 횟수 제한이 있으면 한 번 더 풀 수 있게 됩니다.'),
      )
    )
      return
    setDeletingId(a.id)
    setDeleteError(null)
    try {
      await deleteAttempt(a.id)
      setAttempts((prev) => prev.filter((x) => x.id !== a.id))
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : '기록 삭제 실패')
    } finally {
      setDeletingId(null)
    }
  }

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
      if (existing) {
        existing.attempts.push(a)
        if (!existing.mockSubject && a.mockSubject) existing.mockSubject = a.mockSubject
      } else
        map.set(key, {
          key,
          type: a.type,
          refId: a.refId,
          refTitle: a.refTitle,
          mockSubject: a.mockSubject,
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
    <div className="space-y-5 max-w-4xl mx-auto">
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
      {deleteError && <p className="text-red-600 text-sm">{deleteError}</p>}

      {!loading && (
        <>
          <div className="flex items-center gap-1 text-xs flex-wrap">
            {HISTORY_FILTERS.map((k) => (
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
                          <span
                            className={`inline-block rounded text-xs font-medium px-2 py-0.5 ${
                              b.type === 'korean_mock'
                                ? `border ${SUBJECT_BADGE_CLASS[b.mockSubject ?? 'korean']}`
                                : 'bg-brand-50 text-brand-700'
                            }`}
                          >
                            {bucketLabel(b)}
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
                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(a)}
                                    disabled={deletingId === a.id}
                                    className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50"
                                  >
                                    {deletingId === a.id ? '삭제 중…' : '삭제'}
                                  </button>
                                )}
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
