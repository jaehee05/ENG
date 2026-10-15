import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { deleteAttempt, listAttemptsForUser } from '../lib/firestore'
import { WORDBOOK_ENABLED } from '../lib/features'
import { MOCK_SUBJECT_LABEL, type Attempt, type MockSubject } from '../lib/types'
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  ScoreValue,
  SkeletonList,
  confirm,
  cx,
  type BadgeTone,
} from '../components/ui'

const TYPE_LABEL: Record<Attempt['type'], string> = {
  vocab: '단어 시험지',
  reading: '지문 문제풀이',
  wordbook: '내 단어장 시험',
  korean_mock: '모의고사',
}

const SUBJECT_TONE: Record<MockSubject, BadgeTone> = {
  korean: 'rose',
  english: 'blue',
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
      !(await confirm(
        `${a.refTitle}\n${fmtDate(a.createdAt) || '날짜 없음'} · ${a.correct}/${a.total} 기록을 삭제할까요?` +
          (a.practice
            ? '\n연습 기록이라 응시 횟수에는 영향이 없어요.'
            : '\n응시 횟수 제한이 있으면 한 번 더 풀 수 있게 돼요.'),
        { danger: true, confirmText: '삭제' },
      ))
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
    <div className="space-y-6 max-w-2xl mx-auto">
      <PageHeader title="내 기록" />

      {error && <p className="text-[15px] text-red-500 px-1">{error}</p>}
      {deleteError && <p className="text-[15px] text-red-500 px-1">{deleteError}</p>}

      {loading ? (
        <SkeletonList rows={4} />
      ) : (
        <>
          <div className="flex items-center gap-1.5 flex-wrap" role="tablist">
            {HISTORY_FILTERS.map((k) => {
              const on = filter === k
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setFilter(k)}
                  className={cx(
                    'pressable h-9 px-4 rounded-full text-[14px] font-semibold',
                    on ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 hover:bg-slate-50 active:bg-slate-100',
                  )}
                >
                  {k === 'all' ? '전체' : TYPE_LABEL[k]}
                </button>
              )
            })}
          </div>

          {buckets.length === 0 ? (
            <Card padded={false}>
              <EmptyState title="아직 기록이 없어요" description="시험을 보면 여기에 쌓여요." />
            </Card>
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
                  <Card key={b.key} padded={false}>
                    <button
                      type="button"
                      onClick={() => toggle(b.key)}
                      aria-expanded={isOpen}
                      className="pressable w-full text-left px-5 py-4 rounded-card flex items-center justify-between gap-3 hover:bg-slate-50 active:bg-slate-100"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <Badge tone={b.type === 'korean_mock' ? SUBJECT_TONE[b.mockSubject ?? 'korean'] : 'brand'}>
                            {bucketLabel(b)}
                          </Badge>
                          <span className="text-[15px] font-semibold text-slate-900 truncate">{b.refTitle}</span>
                        </span>
                        <span className="block text-[13px] text-slate-500 mt-1 tabular-nums">
                          {b.attempts.length}회 응시
                          {best.total > 0 && (
                            <> · 최고 {best.correct}/{best.total} ({Math.round(best.ratio * 100)}%)</>
                          )}
                        </span>
                      </span>
                      <svg
                        className={cx('shrink-0 text-slate-400 transition-transform', isOpen && 'rotate-180')}
                        width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    {isOpen && (
                      <ul className="pb-2">
                        {b.attempts.map((a, i) => (
                          <li key={a.id} className="flex items-center gap-1 pr-3">
                            <Link
                              to={resultPath(a)}
                              className="pressable flex-1 min-w-0 flex items-center justify-between gap-3 px-5 py-3 rounded-2xl hover:bg-slate-50 active:bg-slate-100"
                            >
                              <span className="min-w-0 flex items-center gap-2">
                                <span className="text-[15px] font-medium text-slate-900 tabular-nums">
                                  {b.attempts.length - i}회차
                                </span>
                                <span className="text-[13px] text-slate-500 tabular-nums">{fmtDate(a.createdAt)}</span>
                              </span>
                              <ScoreValue correct={a.correct} total={a.total} />
                            </Link>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleDelete(a)}
                                disabled={deletingId === a.id}
                                className="pressable shrink-0 h-9 px-2.5 rounded-xl text-[13px] font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 active:bg-red-50 disabled:opacity-50"
                              >
                                {deletingId === a.id ? '삭제 중' : '삭제'}
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
