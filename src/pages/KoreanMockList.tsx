import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  deleteKoreanMock,
  formatDate,
  listAttemptsForUser,
  listKoreanMocks,
} from '../lib/firestore'
import {
  getMockSubject,
  MOCK_SUBJECT_LABEL,
  type Attempt,
  type KoreanMock,
  type MockSubject,
} from '../lib/types'

type SubjectFilter = 'all' | MockSubject

const SUBJECT_BADGE_CLASS: Record<MockSubject, string> = {
  korean: 'bg-rose-50 text-rose-700 border-rose-200',
  english: 'bg-sky-50 text-sky-700 border-sky-200',
}

export function KoreanMockList({ manage = false }: { manage?: boolean }) {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const canManage = isAdmin && manage
  const [mocks, setMocks] = useState<KoreanMock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [myAttempts, setMyAttempts] = useState<Attempt[]>([])
  const [subjectFilter, setSubjectFilter] = useState<SubjectFilter>('all')

  useEffect(() => {
    listKoreanMocks()
      .then(setMocks)
      .catch((e) => setError(e.message ?? '목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!profile) return
    listAttemptsForUser(profile.id).then(setMyAttempts).catch(() => {})
  }, [profile])

  const attemptedRefIds = useMemo(() => {
    return new Set(
      myAttempts
        .filter((a) => a.type === 'korean_mock')
        .map((a) => a.refId),
    )
  }, [myAttempts])

  const visibleMocks = useMemo(() => {
    if (subjectFilter === 'all') return mocks
    return mocks.filter((m) => getMockSubject(m) === subjectFilter)
  }, [mocks, subjectFilter])

  async function handleDelete(e: React.MouseEvent, m: KoreanMock) {
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm(`"${m.title}" 모의고사를 삭제하시겠습니까?`)) return
    setDeletingId(m.id)
    try {
      await deleteKoreanMock(m.id)
      setMocks((prev) => prev.filter((x) => x.id !== m.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            {manage ? '관리' : '모의고사'}
          </p>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
            모의고사
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            답안을 OMR 방식으로 입력하여 채점받을 수 있습니다.
          </p>
        </div>
        {canManage && (
          <Link
            to="/admin/korean-mocks/new"
            className="rounded-md bg-slate-900 text-white text-xs font-medium px-3 py-1.5 hover:bg-slate-800"
          >
            + 새 모의고사
          </Link>
        )}
      </header>

      <div className="flex items-center gap-1 text-xs">
        {(['all', 'korean', 'english'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setSubjectFilter(k)}
            className={`px-3 py-1.5 rounded-full transition ${
              subjectFilter === k
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {k === 'all' ? '전체' : MOCK_SUBJECT_LABEL[k]}
          </button>
        ))}
      </div>

      {loading && <p className="text-slate-500 text-sm">불러오는 중…</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {!loading && visibleMocks.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {subjectFilter === 'all'
            ? '등록된 모의고사가 없어요.'
            : `${MOCK_SUBJECT_LABEL[subjectFilter]} 모의고사가 없어요.`}
        </div>
      )}

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white overflow-hidden">
        {visibleMocks.map((m) => {
          const attempted = attemptedRefIds.has(m.id)
          const subj = getMockSubject(m)
          return (
            <li key={m.id} className="relative">
              <Link
                to={`/korean-mocks/${m.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50 active:bg-slate-100"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-block rounded-full text-[10px] font-medium px-2 py-0.5 border ${SUBJECT_BADGE_CLASS[subj]}`}
                    >
                      {MOCK_SUBJECT_LABEL[subj]}
                    </span>
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {m.title}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    문항 {m.questions.length}개 · 등록 {formatDate(m.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!isAdmin && attempted && (
                    <span className="rounded-full bg-brand-100 text-brand-700 text-[11px] font-medium px-2 py-0.5 border border-brand-200">
                      응시함
                    </span>
                  )}
                  <span className="text-slate-300 text-base">›</span>
                </div>
              </Link>
              {canManage && (
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, m)}
                  disabled={deletingId === m.id}
                  className="absolute top-2 right-10 text-[11px] text-slate-400 hover:text-red-600 px-1 disabled:opacity-50"
                >
                  {deletingId === m.id ? '삭제 중…' : '삭제'}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
