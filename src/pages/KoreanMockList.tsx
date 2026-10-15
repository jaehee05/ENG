import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  convertAngleBracketsInKoreanMocks,
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
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ListRow,
  PageHeader,
  SkeletonList,
  buttonClass,
  confirm,
  cx,
  type BadgeTone,
} from '../components/ui'

type SubjectFilter = 'all' | MockSubject

const SUBJECT_TONE: Record<MockSubject, BadgeTone> = {
  korean: 'rose',
  english: 'blue',
}

export function KoreanMockList({ manage = false }: { manage?: boolean }) {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const canManage = isAdmin && manage
  const [angleBusy, setAngleBusy] = useState(false)
  const [angleResult, setAngleResult] = useState<string | null>(null)

  async function runAngleFix() {
    if (!(await confirm('저장된 해설과 출제자의 한마디에서 < > 를 〈 〉 로 바꿔요. 계속할까요?'))) return
    setAngleBusy(true)
    setAngleResult(null)
    try {
      const { scanned, changed } = await convertAngleBracketsInKoreanMocks()
      setAngleResult(
        changed
          ? `시험지 ${scanned}개 중 ${changed}개를 바꿨습니다.`
          : `시험지 ${scanned}개를 살펴봤고 바꿀 것이 없었습니다.`,
      )
    } catch (e) {
      setAngleResult(e instanceof Error ? e.message : '변환에 실패했습니다.')
    } finally {
      setAngleBusy(false)
    }
  }
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
    if (!(await confirm(`‘${m.title}’ 모의고사를 삭제할까요?`, { danger: true, confirmText: '삭제' }))) return
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
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* 관리자는 관리 허브에서, 학생은 더보기에서 들어온다 */}
      <PageHeader
        title="모의고사"
        description="답을 OMR처럼 입력하면 바로 채점해요."
        action={
          canManage && (
            <Link to="/admin/korean-mocks/new" className={buttonClass({ size: 'sm' })}>
              새 모의고사
            </Link>
          )
        }
      />

      {canManage && (
        <div className="flex items-center gap-2 px-1">
          {/* 편집기가 치는 즉시 바꿔주기 전에 부등호로 적어둔 해설을 손보는
              일회성 작업. 여러 번 눌러도 안전하다 — 바꿀 게 없는 시험지는
              건드리지 않는다. */}
          <Button size="sm" variant="secondary" onClick={runAngleFix} loading={angleBusy} title="이미 저장된 해설·한마디의 < > 를 〈 〉 로 바꿉니다">
            {'< > → 〈 〉'}
          </Button>
          {angleResult && <p className="text-[13px] text-slate-600">{angleResult}</p>}
        </div>
      )}

      {!singleSubject && (
        <div className="flex items-center gap-1.5" role="tablist">
          {(['all', 'korean', 'english'] as const).map((k) => {
            const on = subjectFilter === k
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setSubjectFilter(k)}
                className={cx(
                  'pressable h-9 px-4 rounded-full text-[14px] font-semibold',
                  on ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 hover:bg-slate-50 active:bg-slate-100',
                )}
              >
                {k === 'all' ? '전체' : MOCK_SUBJECT_LABEL[k]}
              </button>
            )
          })}
        </div>
      )}

      {error && <p className="text-[15px] text-red-500 px-1">{error}</p>}
      {loading ? (
        <SkeletonList rows={4} />
      ) : (
        <Card padded={false}>
          {visibleMocks.length === 0 ? (
            <EmptyState
              title={
                isAdmin
                  ? subjectFilter === 'all'
                    ? '등록된 모의고사가 없어요'
                    : `${MOCK_SUBJECT_LABEL[subjectFilter]} 모의고사가 없어요`
                  : '아직 배정된 모의고사가 없어요'
              }
            />
          ) : (
            visibleMocks.map((m) => {
              const attempted = attemptedRefIds.has(m.id)
              const subj = getMockSubject(m)
              return (
                <div key={m.id} className="flex items-center gap-1 pr-3">
                  <ListRow
                    className="flex-1 min-w-0"
                    to={`/korean-mocks/${m.id}`}
                    title={
                      // 한 줄로 두고 제목을 줄인다 — 줄바꿈하면 행 높이가 제각각이 된다.
                      <span className="flex items-center gap-1.5 min-w-0">
                        <Badge tone={SUBJECT_TONE[subj]}>{MOCK_SUBJECT_LABEL[subj]}</Badge>
                        <span className="truncate">{m.title}</span>
                      </span>
                    }
                    description={`${m.questions.length}문항 · ${formatDate(m.createdAt)}`}
                    trailing={!isAdmin && attempted ? <Badge tone="brand">응시함</Badge> : undefined}
                  />
                  {canManage && (
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, m)}
                      disabled={deletingId === m.id}
                      className="pressable shrink-0 h-9 px-2.5 rounded-xl text-[13px] font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 active:bg-red-50 disabled:opacity-50"
                    >
                      {deletingId === m.id ? '삭제 중' : '삭제'}
                    </button>
                  )}
                </div>
              )
            })
          )}
        </Card>
      )}
    </div>
  )
}
