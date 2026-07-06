import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  deleteKoreanMock,
  formatDate,
  listAssignmentsForStudent,
  listAttemptsForUser,
  listKoreanMocks,
} from '../lib/firestore'
import {
  accountSubjects,
  getMockSubject,
  isAssignmentVisibleToStudent,
  MOCK_SUBJECT_LABEL,
  type Assignment,
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
  const [assignments, setAssignments] = useState<Assignment[]>([])
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

  // 학생 뷰: 자기에게 할당된 모의고사만. 관리자 뷰: 전체.
  useEffect(() => {
    if (!profile || isAdmin) return
    listAssignmentsForStudent(profile.id).then(setAssignments).catch(() => {})
  }, [profile, isAdmin])

  const assignedMockRefIds = useMemo(() => {
    return new Set(
      assignments
        .filter((a) => a.type === 'korean_mock' && isAssignmentVisibleToStudent(a))
        .map((a) => a.refId),
    )
  }, [assignments])

  // 학생 수강 과목에 따라 필터 칩을 축소한다.
  const subj = profile ? accountSubjects(profile) : { korean: true, english: true }
  const singleSubject: MockSubject | null =
    !isAdmin && subj.korean && !subj.english
      ? 'korean'
      : !isAdmin && subj.english && !subj.korean
        ? 'english'
        : null

  // 단일 과목 학생이면 필터를 그 과목으로 고정
  useEffect(() => {
    if (singleSubject && subjectFilter !== singleSubject) {
      setSubjectFilter(singleSubject)
    }
  }, [singleSubject, subjectFilter])

  const attemptedRefIds = useMemo(() => {
    return new Set(
      myAttempts
        .filter((a) => a.type === 'korean_mock')
        .map((a) => a.refId),
    )
  }, [myAttempts])

  const visibleMocks = useMemo(() => {
    // 학생은 자기에게 할당된 것만
    const base = isAdmin
      ? mocks
      : mocks.filter((m) => assignedMockRefIds.has(m.id))
    if (subjectFilter === 'all') return base
    return base.filter((m) => getMockSubject(m) === subjectFilter)
  }, [mocks, subjectFilter, isAdmin, assignedMockRefIds])

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

      {!singleSubject && (
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
      )}

      {loading && <p className="text-slate-500 text-sm">불러오는 중…</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {!loading && visibleMocks.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {isAdmin
            ? subjectFilter === 'all'
              ? '등록된 모의고사가 없어요.'
              : `${MOCK_SUBJECT_LABEL[subjectFilter]} 모의고사가 없어요.`
            : '아직 할당된 모의고사가 없어요.'}
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
