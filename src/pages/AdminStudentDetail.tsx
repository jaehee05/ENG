import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { ScheduleManager } from '../components/ScheduleManager'
import { DESKTOP_QUERY, useMediaQuery } from '../lib/useMediaQuery'
import { WORDBOOK_ENABLED } from '../lib/features'
import {
  getAccount,
  updateAccountColorKey,
  updateAccountProfile,
  updateAccountSubjects,
} from '../lib/account'
import {
  colorForStudent,
  STUDENT_COLORS,
  STUDENT_COLOR_KEYS,
} from '../lib/studentColor'
import {
  createAssignment,
  deleteAssignment,
  deleteAttempt,
  ensureDefaultCategories,
  listAssignmentsForStudent,
  listAttemptsForUser,
  listKoreanMocks,
  listReadings,
  listVocabSets,
  setAssignmentManualStatus,
  updateAssignment,
} from '../lib/firestore'
import { sendPushNotification } from '../lib/ppurioApi'
import { buildWeeklyReportVars } from '../lib/weeklyReport'
import { listMyWordbook } from '../lib/wordbook'
import {
  accountSubjects,
  dueDateFromInput,
  getAssignmentStatusView,
  getDDay,
  type Assignment,
  type AssignmentType,
  type AssignmentCategory,
  type AssignmentStatusView,
  type Attempt,
  type CategoryConfig,
  type DDayView,
  type KoreanMock,
  type MockSubject,
  MOCK_SUBJECT_LABEL,
  type Reading,
  type UserAccount,
  type VocabSet,
  type WordLookup,
  isVisibleToStudent,
} from '../lib/types'

/**
 * 단어 과제 통과 기준 기본값. DAY 시험지가 보통 30단어라 25개를 잡는다.
 * 단어가 이보다 적은 시험지는 부여할 때 그 시험지 단어 수로 낮춘다 —
 * 안 그러면 영영 통과할 수 없는 과제가 된다.
 */
const DEFAULT_MIN_CORRECT = '25'

/**
 * 시험지를 DAY 번호 순으로. 만든 순서(최신 먼저)로 두면 여러 개를 이어서
 * 고를 때 거꾸로 훑어야 한다. numeric 비교라 DAY 2 가 DAY 10 앞에 온다.
 */
function byDay(a: VocabSet, b: VocabSet): number {
  return a.title.localeCompare(b.title, 'ko', { numeric: true })
}

/**
 * 통과 기준을 그 시험지 단어 수까지로 낮춘다. 교재 마지막 DAY 는 단어가
 * 모자랄 수 있는데(70단어를 30씩 나누면 마지막은 10), 기준이 단어 수보다
 * 높으면 다 맞혀도 통과가 안 된다.
 */
function cappedMinCorrect(
  minCorrect: number | undefined,
  set: VocabSet,
): number | undefined {
  const words = set.words?.length ?? 0
  if (!minCorrect || words === 0) return minCorrect
  return Math.min(minCorrect, words)
}

function isNotYetStarted(a: Assignment): boolean {
  if (!a.startAt) return false
  return a.startAt.toMillis() > Date.now()
}

function defaultCategoryKey(type: AssignmentType): AssignmentCategory {
  if (type === 'vocab') return 'vocab'
  if (type === 'reading') return 'problem'
  if (type === 'korean_mock') return 'mock'
  return 'etc'
}

function fmtDate(ts: { toDate: () => Date } | null | undefined): string {
  if (!ts) return ''
  const d = ts.toDate()
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
}

/** 정답률 색. 80↑ 양호 · 50~79 주의 · 50↓ 위험 */
function ratioClass(ratio: number): string {
  if (ratio >= 80) return 'text-brand-700'
  if (ratio >= 50) return 'text-amber-700'
  return 'text-red-700'
}

const TYPE_LABEL: Record<Attempt['type'], string> = {
  vocab: '단어 시험지',
  reading: '지문 문제풀이',
  wordbook: '내 단어장 시험',
  korean_mock: '국어 모의고사',
}

const TYPE_CLASS: Record<Attempt['type'], string> = {
  vocab: 'bg-brand-50 text-brand-700',
  reading: 'bg-brand-50 text-brand-800',
  wordbook: 'bg-brand-50 text-brand-700',
  korean_mock: 'bg-rose-50 text-rose-700',
}

type TypeFilter = 'all' | Attempt['type']

/**
 * 시험 이력 필터 칩.
 *
 * 내 단어장은 숨김이라 칩에서 뺀다. 이미 쌓인 단어장 응시 기록은 '전체' 에
 * 그대로 남는다 — 기능을 감추는 것이지 기록을 지우는 게 아니다.
 */
const ATTEMPT_FILTERS: readonly TypeFilter[] = [
  'all',
  'vocab',
  'reading',
  'korean_mock',
  ...(WORDBOOK_ENABLED ? (['wordbook'] as const) : []),
]

/**
 * 탭 구성. 자주 쓰는 순서대로 두고 첫 탭(과제)을 기본값으로 한다.
 * — 이 화면에 들어오는 목적 대부분이 "과제 현황 확인"이라서다.
 */
type TabKey =
  | 'assignments'
  | 'attempts'
  | 'metrics'
  | 'schedule'
  | 'wordbook'
  | 'settings'

export function AdminStudentDetail() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [tab, setTab] = useState<TabKey>('assignments')
  const [account, setAccount] = useState<UserAccount | null>(null)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [wordbook, setWordbook] = useState<WordLookup[]>([])
  const [vocabSets, setVocabSets] = useState<VocabSet[]>([])
  const [readings, setReadings] = useState<Reading[]>([])
  const [koreanMocks, setKoreanMocks] = useState<KoreanMock[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const [assignType, setAssignType] = useState<AssignmentType>('vocab')
  const [assignCategory, setAssignCategory] = useState<AssignmentCategory>('vocab')
  const [categories, setCategories] = useState<CategoryConfig[]>([])
  const [assignRefId, setAssignRefId] = useState('')
  /** 단어는 DAY 시험지를 한 번에 여러 개 부여한다. 시험지마다 과제 1건. */
  const [vocabIds, setVocabIds] = useState<string[]>([])
  const [assignStart, setAssignStart] = useState('')
  const [assignDue, setAssignDue] = useState('')
  const [assignNote, setAssignNote] = useState('')
  /** 단어 과제 통과 기준(최소 정답 수). 30단어 DAY 기준 25개가 기본. */
  const [assignMinCorrect, setAssignMinCorrect] = useState(DEFAULT_MIN_CORRECT)
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  // 과제 부여 폼은 기본 접힘. 목록(= 보러 온 것)이 먼저 보이도록.
  const [assignFormOpen, setAssignFormOpen] = useState(false)

  async function reloadAssignments() {
    if (!id) return
    setAssignments(await listAssignmentsForStudent(id))
  }

  useEffect(() => {
    if (!id) return
    let cancelled = false
    Promise.all([
      getAccount(id),
      listAttemptsForUser(id),
      listMyWordbook(id),
      listVocabSets(),
      listReadings(),
      listKoreanMocks(),
      listAssignmentsForStudent(id),
      ensureDefaultCategories(),
    ])
      .then(([acc, atts, wb, vs, rd, km, asn, cats]) => {
        if (cancelled) return
        if (!acc) {
          setError('학생을 찾을 수 없습니다.')
          return
        }
        setAccount(acc)
        setAttempts(atts)
        setWordbook(wb)
        setVocabSets(vs)
        setReadings(rd)
        setKoreanMocks(km)
        setAssignments(asn)
        setCategories(cats)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '불러오기에 실패했습니다.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const stats = useMemo(() => {
    const ratios = attempts
      .filter((a) => a.total > 0)
      .map((a) => Math.round((a.correct / a.total) * 100))
    const vocab = attempts.filter((a) => a.type === 'vocab')
    const reading = attempts.filter((a) => a.type === 'reading')
    return {
      totalAttempts: attempts.length,
      avgRatio: avg(ratios),
      vocabAvg: avg(
        vocab.filter((a) => a.total > 0).map((a) => Math.round((a.correct / a.total) * 100)),
      ),
      readingAvg: avg(
        reading
          .filter((a) => a.total > 0)
          .map((a) => Math.round((a.correct / a.total) * 100)),
      ),
      wordbookSize: wordbook.length,
      wordbookTotalLookups: wordbook.reduce((sum, w) => sum + (w.count ?? 0), 0),
      lastActivity: attempts[0]?.createdAt ?? null,
    }
  }, [attempts, wordbook])

  const filteredAttempts = useMemo(
    () => (typeFilter === 'all' ? attempts : attempts.filter((a) => a.type === typeFilter)),
    [attempts, typeFilter],
  )

  /**
   * 부여 후보 시험지. 시험지는 교재마다 하나씩이라 모든 학생이 같은 것을
   * 푼다. 병합 전 옛 시험지는 아직 소유자가 붙어 있어 다른 학생 것은 빼고,
   * 교재에서 공개 대상을 지정한 시험지도 이 학생이 볼 수 있는 것만 남긴다 —
   * 못 보는 시험지를 과제로 부여하면 학생 화면에서 열리지 않는다.
   */
  const studentVocabSets = useMemo(
    () =>
      vocabSets.filter(
        (s) =>
          (!s.studentUid || s.studentUid === id) &&
          (!id || isVisibleToStudent(s, id)),
      ),
    [vocabSets, id],
  )
  const sortedVocabSets = useMemo(
    () => [...studentVocabSets].sort(byDay),
    [studentVocabSets],
  )
  /** 이미 부여한 시험지 — 여러 개 고를 때 중복 부여를 눈으로 걸러내라고 표시한다. */
  const assignedVocabIds = useMemo(
    () =>
      new Set(
        assignments.filter((a) => a.type === 'vocab' && a.refId).map((a) => a.refId),
      ),
    [assignments],
  )

  const progress = useMemo(() => {
    const vocabDone = new Set(
      attempts.filter((a) => a.type === 'vocab' && a.refId).map((a) => a.refId),
    )
    const readingDone = new Set(
      attempts.filter((a) => a.type === 'reading' && a.refId).map((a) => a.refId),
    )
    return {
      vocabDone: vocabDone.size,
      // 시험지가 교재 공용이라 분모는 이 학생이 풀 수 있는 전체 시험지 수다
      vocabTotal: studentVocabSets.length,
      readingDone: readingDone.size,
      readingTotal: readings.length,
    }
  }, [attempts, studentVocabSets, readings])

  /**
   * 진행 중(미완료) — D-day 오름차순(지난 것 가장 위) → 마감 없음은 맨 뒤
   * 완료 — 부여일 내림차순
   * 탭 배지에서도 개수를 쓰므로 렌더 밖으로 끌어올렸다.
   */
  const groupedAssignments = useMemo(() => {
    const enriched = assignments.map((a) => ({
      a,
      status: getAssignmentStatusView(a, attempts),
      dday: getDDay(a.dueAt),
    }))
    const pending = enriched
      .filter((x) => x.status.status !== 'done')
      .sort((x, y) => {
        const xv = x.dday.days
        const yv = y.dday.days
        if (xv == null && yv == null) return 0
        if (xv == null) return 1
        if (yv == null) return -1
        return xv - yv
      })
    const done = enriched
      .filter((x) => x.status.status === 'done')
      .sort((x, y) => {
        const xt = x.a.createdAt?.toMillis?.() ?? 0
        const yt = y.a.createdAt?.toMillis?.() ?? 0
        return yt - xt
      })
    return { pending, done }
  }, [assignments, attempts])

  function toggleVocabId(vid: string) {
    setVocabIds((prev) =>
      prev.includes(vid) ? prev.filter((x) => x !== vid) : [...prev, vid],
    )
  }

  const minCorrectNum = Number.parseInt(assignMinCorrect, 10)
  /** 통과 기준보다 단어가 적어, 부여할 때 기준이 낮춰질 시험지 수. */
  const cappedCount = useMemo(() => {
    if (!Number.isFinite(minCorrectNum) || minCorrectNum <= 0) return 0
    return vocabIds.filter((vid) => {
      const w = studentVocabSets.find((s) => s.id === vid)?.words?.length ?? 0
      return w > 0 && w < minCorrectNum
    }).length
  }, [vocabIds, studentVocabSets, minCorrectNum])
  /** 고른 것 중 이미 부여한 시험지 수. 막지는 않고 알려만 준다. */
  const reassignCount = vocabIds.filter((vid) => assignedVocabIds.has(vid)).length

  function renderVocabRow(s: VocabSet) {
    const words = s.words?.length ?? 0
    return (
      <label
        key={s.id}
        className="flex items-center gap-2 px-3 py-2 touch:py-2.5 text-sm cursor-pointer hover:bg-slate-50"
      >
        <input
          type="checkbox"
          checked={vocabIds.includes(s.id)}
          onChange={() => toggleVocabId(s.id)}
          className="accent-brand-600 shrink-0"
        />
        <span className="flex-1 min-w-0 truncate text-slate-800">{s.title}</span>
        {assignedVocabIds.has(s.id) && (
          <span className="shrink-0 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5">
            부여됨
          </span>
        )}
        <span className="shrink-0 text-[11px] text-slate-400">{words}단어</span>
      </label>
    )
  }
  const [customTitle, setCustomTitle] = useState('')
  const [pushOnAssign, setPushOnAssign] = useState(true)

  async function maybePushAssignment(titles: string[]) {
    if (!pushOnAssign || !id) return
    try {
      let dueText = ''
      const d = dueDateFromInput(assignDue)
      if (d) {
        dueText = ` (마감 ${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')})`
      }
      const body =
        titles.length === 1
          ? `${titles[0]}${dueText}`
          : `${titles[0]} 외 ${titles.length - 1}건${dueText}`
      await sendPushNotification({
        uids: [id],
        title: '📝 새 과제가 부여되었어요',
        body,
        link: '/assignments',
      })
    } catch {
      // 실패해도 과제 부여 자체엔 영향 없음
    }
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault()
    setAssignError(null)
    if (!id || !account || !profile) return
    // 마감일은 그 날 23:59 까지가 기한이다
    const dueDate = dueDateFromInput(assignDue)
    if (assignDue && !dueDate) {
      setAssignError('마감일이 올바르지 않습니다.')
      return
    }
    const startDate = assignStart ? new Date(`${assignStart}T00:00`) : null
    if (startDate && Number.isNaN(startDate.getTime())) {
      setAssignError('시작일이 올바르지 않습니다.')
      return
    }

    if (assignType === 'custom') {
      const title = customTitle.trim()
      if (!title) {
        setAssignError('과제명을 입력하세요.')
        return
      }
      setAssigning(true)
      try {
        await createAssignment({
          studentUid: id,
          studentName: account.displayName,
          assignedBy: profile.id,
          assignedByName: profile.displayName,
          type: 'custom',
          category: assignCategory,
          refId: '',
          refTitle: title,
          note: assignNote,
          startAt: startDate,
          dueAt: dueDate,
        })
        setCustomTitle('')
        setAssignStart('')
        setAssignDue('')
        setAssignNote('')
        await maybePushAssignment([title])
        await reloadAssignments()
        setAssignFormOpen(false)
      } catch (err) {
        setAssignError(err instanceof Error ? err.message : '과제 부여에 실패했습니다.')
      } finally {
        setAssigning(false)
      }
      return
    }

    let minCorrect: number | undefined
    if (assignType === 'vocab' && assignMinCorrect.trim()) {
      const n = Number.parseInt(assignMinCorrect, 10)
      if (Number.isFinite(n) && n > 0) minCorrect = n
    }

    if (assignType === 'vocab') {
      // 목록에 없던 id 는 여기서 걸러진다
      const picked = vocabIds
        .map((vid) => studentVocabSets.find((s) => s.id === vid))
        .filter((s): s is VocabSet => Boolean(s))
        .sort(byDay)
      if (picked.length === 0) {
        setAssignError('과제로 부여할 시험지를 선택하세요.')
        return
      }
      setAssigning(true)
      // 하나씩 만든다. 중간에 실패해도 여기까지 만든 것은 그대로 두고,
      // 알림과 목록에도 반영한 뒤 몇 개까지 됐는지 알린다.
      const made: VocabSet[] = []
      try {
        for (const v of picked) {
          await createAssignment({
            studentUid: id,
            studentName: account.displayName,
            assignedBy: profile.id,
            assignedByName: profile.displayName,
            type: 'vocab',
            category: assignCategory,
            refId: v.id,
            refTitle: v.title,
            note: assignNote,
            minCorrect: cappedMinCorrect(minCorrect, v),
            startAt: startDate,
            dueAt: dueDate,
          })
          made.push(v)
        }
        setVocabIds([])
        setAssignStart('')
        setAssignDue('')
        setAssignNote('')
        setAssignMinCorrect(DEFAULT_MIN_CORRECT)
        setAssignFormOpen(false)
      } catch (err) {
        // 이미 부여된 것은 선택에서 뺀다 — 그대로 다시 누르면 중복으로 들어간다
        const doneIds = new Set(made.map((v) => v.id))
        setVocabIds((prev) => prev.filter((x) => !doneIds.has(x)))
        setAssignError(
          (err instanceof Error ? err.message : '과제 부여에 실패했습니다.') +
            (made.length > 0 ? ` (${made.length}개까지는 부여됨 · 나머지만 남겨 뒀습니다)` : ''),
        )
      } finally {
        if (made.length > 0) {
          await maybePushAssignment(made.map((v) => v.title))
          await reloadAssignments()
        }
        setAssigning(false)
      }
      return
    }

    if (!assignRefId) {
      setAssignError('과제로 부여할 항목을 선택하세요.')
      return
    }
    const source = assignType === 'korean_mock' ? koreanMocks : readings
    const target = source.find((s) => s.id === assignRefId)
    if (!target) {
      setAssignError('선택한 항목을 찾을 수 없습니다.')
      return
    }
    setAssigning(true)
    try {
      await createAssignment({
        studentUid: id,
        studentName: account.displayName,
        assignedBy: profile.id,
        assignedByName: profile.displayName,
        type: assignType,
        category: assignCategory,
        refId: assignRefId,
        refTitle: target.title,
        note: assignNote,
        minCorrect,
        startAt: startDate,
        dueAt: dueDate,
      })
      setAssignRefId('')
      setAssignStart('')
      setAssignDue('')
      setAssignNote('')
      setAssignMinCorrect(DEFAULT_MIN_CORRECT)
      await maybePushAssignment([target.title])
      await reloadAssignments()
      setAssignFormOpen(false)
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : '과제 부여에 실패했습니다.')
    } finally {
      setAssigning(false)
    }
  }

  async function handleDeleteAssignment(asn: Assignment) {
    if (!window.confirm(`"${asn.refTitle}" 과제를 삭제하시겠습니까?`)) return
    await deleteAssignment(asn.id)
    await reloadAssignments()
  }

  async function handleSaveAssignmentEdit(
    asn: Assignment,
    input: {
      startAt?: Date | null
      dueAt?: Date | null
      note?: string
      minCorrect?: number | null
      category?: AssignmentCategory
      refTitle?: string
    },
  ) {
    await updateAssignment(asn.id, input)
    await reloadAssignments()
  }

  async function handleToggleAssignmentDone(asn: Assignment) {
    // 학생 응시로 자동 완료된 과제도 관리자가 강제로 토글할 수 있게 manualStatus 사용.
    const currentlyDone = getAssignmentStatusView(asn, attempts).status === 'done'
    const next: 'done' | 'undone' = currentlyDone ? 'undone' : 'done'
    try {
      await setAssignmentManualStatus(asn.id, next)
      setAssignments((prev) =>
        prev.map((x) =>
          x.id === asn.id
            ? { ...x, manualStatus: next, manualDone: next === 'done' }
            : x,
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '상태 변경 실패')
    }
  }

  async function handleDeleteAttempt(att: Attempt) {
    if (!window.confirm(`"${att.refTitle}" 시험 기록을 삭제하시겠습니까?`)) return
    try {
      await deleteAttempt(att.id)
      setAttempts((prev) => prev.filter((a) => a.id !== att.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패')
    }
  }

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!account) return null

  const { pending, done } = groupedAssignments
  const tel = (account.phone || account.parentPhone || '').replace(/[^0-9+]/g, '')

  const tabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: 'assignments', label: '과제', badge: pending.length },
    { key: 'attempts', label: '시험 이력', badge: attempts.length },
    { key: 'metrics', label: '학습 지표' },
    { key: 'schedule', label: '일정' },
    { key: 'settings', label: '설정' },
  ]

  // ── 기기에 따라 사이드바 또는 탭 안쪽으로 들어가는 조각들 ──────────────

  const contactActions = (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* 시험지는 교재마다 하나씩 만들고, 여기서는 그것을 과제로 부여한다. */}
      <Link
        to="/vocab/corpora"
        className="rounded-md bg-slate-900 text-white text-xs font-medium px-3 py-2 touch:py-2.5 hover:bg-slate-800"
      >
        교재
      </Link>
      {tel && (
        <>
          <a
            href={`tel:${tel}`}
            title="전화"
            className="rounded-md border border-brand-200 bg-brand-50 text-brand-700 text-xs font-medium px-3 py-2 touch:py-2.5 hover:bg-brand-100"
          >
            전화
          </a>
          <a
            href={`sms:${tel}`}
            title="문자"
            className="rounded-md border border-slate-200 text-slate-600 text-xs font-medium px-3 py-2 touch:py-2.5 hover:bg-slate-50"
          >
            문자
          </a>
        </>
      )}
    </div>
  )

  const keyStats = (
    <div className="grid grid-cols-2 gap-2">
      <StatCard label="총 시험" value={`${stats.totalAttempts}`} />
      <StatCard
        label="평균"
        value={stats.totalAttempts > 0 ? `${stats.avgRatio}%` : '—'}
      />
      <StatCard
        label="최근"
        value={stats.lastActivity ? fmtDate(stats.lastActivity) : '—'}
      />
    </div>
  )

  const progressCards = (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2">
      <ProgressCard
        label="단어 시험지"
        done={progress.vocabDone}
        total={progress.vocabTotal}
      />
      <ProgressCard
        label="지문 문제풀이"
        done={progress.readingDone}
        total={progress.readingTotal}
      />
    </div>
  )

  // ── 탭 내용 ────────────────────────────────────────────────────────

  const assignmentsPanel = (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          진행 중 <b className="font-semibold text-slate-900">{pending.length}</b> ·
          완료 <b className="font-semibold text-slate-900">{done.length}</b>
        </p>
        <button
          type="button"
          onClick={() => setAssignFormOpen((v) => !v)}
          className="rounded-md bg-slate-900 text-white text-sm font-semibold px-4 py-2 touch:py-2.5 hover:bg-slate-800"
        >
          {assignFormOpen ? '닫기' : '+ 과제 부여'}
        </button>
      </div>

      {assignFormOpen && (
        <form
          onSubmit={handleAssign}
          className="rounded-lg border border-brand-200 bg-brand-50/40 p-4 space-y-4"
        >
          {/* 1. 유형 — 세그먼트 컨트롤 */}
          <div>
            <p className="text-xs font-medium text-slate-600 mb-1.5">유형</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 rounded-md border border-slate-200 bg-white p-1">
              {(
                [
                  { key: 'vocab', label: '단어 시험지' },
                  { key: 'korean_mock', label: '모의고사' },
                  { key: 'custom', label: '외부 과제' },
                ] as { key: AssignmentType; label: string }[]
              ).map((opt) => {
                const active = assignType === opt.key
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setAssignType(opt.key)
                      setAssignRefId('')
                      setVocabIds([])
                      setAssignCategory(defaultCategoryKey(opt.key))
                    }}
                    className={`rounded px-2 py-1.5 touch:py-2 text-xs font-medium transition ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
            {assignType === 'custom' && (
              <p className="text-[11px] text-slate-500 mt-1.5">
                학생 풀이 화면 없는 외부 과제. 완료는 관리자가 수동 표시.
              </p>
            )}
          </div>

          {/* 2. 대상 — 시험지/모의고사/제목 */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {assignType === 'custom'
                ? '과제명'
                : assignType === 'vocab'
                  ? '단어 시험지'
                  : '모의고사'}
            </label>
            {assignType === 'custom' ? (
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="예: 학원 종이 시험지 3회, 모의고사 오답노트 등"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            ) : assignType === 'vocab' ? (
              <div className="rounded-md border border-slate-300 bg-white">
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200">
                  <span className="text-xs text-slate-600">
                    {vocabIds.length > 0
                      ? `${vocabIds.length}개 선택 · 과제 ${vocabIds.length}건으로 부여`
                      : '여러 개 고를 수 있습니다'}
                  </span>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setVocabIds(sortedVocabSets.map((s) => s.id))}
                      className="text-[11px] text-slate-600 hover:text-slate-900 underline underline-offset-2"
                    >
                      전체 선택
                    </button>
                    <button
                      type="button"
                      onClick={() => setVocabIds([])}
                      className="text-[11px] text-slate-600 hover:text-slate-900 underline underline-offset-2"
                    >
                      해제
                    </button>
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                  {sortedVocabSets.map(renderVocabRow)}
                </div>
              </div>
            ) : (
              <select
                value={assignRefId}
                onChange={(e) => setAssignRefId(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">— 선택 —</option>
                {koreanMocks.map((o) => (
                  <option key={o.id} value={o.id}>
                    [{MOCK_SUBJECT_LABEL[(o.subject ?? 'korean') as MockSubject]}]{' '}
                    {o.title}
                  </option>
                ))}
              </select>
            )}
            {assignType === 'vocab' && sortedVocabSets.length === 0 && (
              <p className="text-[11px] text-slate-500 mt-1.5">
                단어 시험지가 아직 없습니다. 교재에서 DAY 시험지를 먼저 만드세요.
              </p>
            )}
            {reassignCount > 0 && (
              <p className="text-[11px] text-amber-700 mt-1.5">
                고른 것 중 {reassignCount}개는 이미 부여한 시험지입니다. 그대로 두면
                같은 시험지 과제가 하나 더 생깁니다.
              </p>
            )}
          </div>

          {/* 3. 일정 + 분류 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                시작일 <span className="text-slate-400 font-normal">(선택 · 이 날부터 학생에게 노출)</span>
              </label>
              <input
                type="date"
                value={assignStart}
                onChange={(e) => setAssignStart(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                마감일 <span className="text-slate-400 font-normal">(선택)</span>
              </label>
              <input
                type="date"
                value={assignDue}
                onChange={(e) => setAssignDue(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                과제 페이지 분류
              </label>
              <select
                value={assignCategory}
                onChange={(e) =>
                  setAssignCategory(e.target.value as AssignmentCategory)
                }
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {categories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 4. 부가 옵션 — 메모 + vocab 완료 기준 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                메모 <span className="text-slate-400 font-normal">(선택)</span>
              </label>
              <input
                type="text"
                value={assignNote}
                onChange={(e) => setAssignNote(e.target.value)}
                placeholder="예: 시간 재고 풀어보기"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            {assignType === 'vocab' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  완료 기준{' '}
                  <span className="text-slate-400 font-normal">
                    (최소 정답 수 · 비우면 제한 없음)
                  </span>
                </label>
                <input
                  type="number"
                  min={1}
                  value={assignMinCorrect}
                  onChange={(e) => setAssignMinCorrect(e.target.value)}
                  placeholder="비우면 응시만 하면 완료"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                {cappedCount > 0 && (
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    고른 것 중 {cappedCount}개는 단어가 {minCorrectNum}개보다 적어, 그
                    시험지의 단어 수를 기준으로 부여합니다.
                  </p>
                )}
              </div>
            )}
          </div>

          {assignError && <p className="text-sm text-red-600">{assignError}</p>}

          {/* 5. 푸시 + 부여 버튼 */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-brand-200">
            <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={pushOnAssign}
                onChange={(e) => setPushOnAssign(e.target.checked)}
                className="accent-brand-600"
              />
              학생에게 푸시 알림 발송
            </label>
            <button
              type="submit"
              disabled={assigning}
              className="rounded-md bg-slate-900 text-white text-sm font-semibold px-5 py-2 touch:py-2.5 hover:bg-slate-800 disabled:opacity-50"
            >
              {assigning
                ? '부여 중…'
                : assignType === 'vocab' && vocabIds.length > 1
                  ? `과제 ${vocabIds.length}건 부여`
                  : '과제 부여'}
            </button>
          </div>
        </form>
      )}

      {assignments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          아직 부여한 과제가 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {pending.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                진행 중 ({pending.length})
              </p>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                {pending.map((x) => (
                  <AssignmentRow
                    key={x.a.id}
                    a={x.a}
                    status={x.status}
                    dday={x.dday}
                    categories={categories}
                    onToggleDone={() => handleToggleAssignmentDone(x.a)}
                    onDelete={() => handleDeleteAssignment(x.a)}
                    onSave={(input) => handleSaveAssignmentEdit(x.a, input)}
                    fmtDate={fmtDate}
                  />
                ))}
              </ul>
            </div>
          )}
          {done.length > 0 && (
            <details className="space-y-1.5" open={pending.length === 0}>
              <summary className="text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700 select-none py-1">
                완료 ({done.length})
              </summary>
              <ul className="mt-1.5 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                {done.map((x) => (
                  <AssignmentRow
                    key={x.a.id}
                    a={x.a}
                    status={x.status}
                    dday={x.dday}
                    categories={categories}
                    onToggleDone={() => handleToggleAssignmentDone(x.a)}
                    onDelete={() => handleDeleteAssignment(x.a)}
                    onSave={(input) => handleSaveAssignmentEdit(x.a, input)}
                    fmtDate={fmtDate}
                  />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )

  const attemptsPanel = (
    <div className="space-y-3">
      <div className="flex items-center gap-1 text-xs overflow-x-auto pb-1">
        {ATTEMPT_FILTERS.map((k) => (
          <button
            key={k}
            onClick={() => setTypeFilter(k)}
            className={`px-3 py-1.5 touch:py-2 rounded-full whitespace-nowrap transition ${
              typeFilter === k
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {k === 'all' ? '전체' : TYPE_LABEL[k]}
          </button>
        ))}
      </div>

      {filteredAttempts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          기록이 없습니다.
        </div>
      ) : (
        <>
          {/* 아이폰: 카드 목록. 6열 테이블을 가로로 밀어 보게 하지 않는다. */}
          <ul className="md:hidden space-y-2">
            {filteredAttempts.map((a) => {
              const ratio = a.total > 0 ? Math.round((a.correct / a.total) * 100) : 0
              return (
                <li
                  key={a.id}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${TYPE_CLASS[a.type]}`}
                      >
                        {TYPE_LABEL[a.type]}
                      </span>
                      <Link
                        to={attemptResultPath(a)}
                        className="block mt-1 text-sm font-medium text-slate-900 hover:text-brand-700 break-words"
                      >
                        {a.refTitle}
                      </Link>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {fmtDate(a.createdAt)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-lg font-semibold ${ratioClass(ratio)}`}>
                        {ratio}%
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {a.correct} / {a.total}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleDeleteAttempt(a)}
                        className="text-[11px] text-slate-400 hover:text-red-600 mt-1 py-1"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>

          {/* 아이패드 이상: 테이블 */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">유형</th>
                  <th className="px-4 py-3 text-left font-semibold">제목</th>
                  <th className="px-4 py-3 text-left font-semibold">점수</th>
                  <th className="px-4 py-3 text-left font-semibold">정답률</th>
                  <th className="px-4 py-3 text-left font-semibold">날짜</th>
                  <th className="px-4 py-3 text-left font-semibold w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAttempts.map((a) => {
                  const ratio = a.total > 0 ? Math.round((a.correct / a.total) * 100) : 0
                  return (
                    <tr key={a.id}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${TYPE_CLASS[a.type]}`}
                        >
                          {TYPE_LABEL[a.type]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-900">
                        <Link
                          to={attemptResultPath(a)}
                          className="text-slate-900 hover:text-brand-700 hover:underline"
                        >
                          {a.refTitle}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {a.correct} / {a.total}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-sm font-medium ${ratioClass(ratio)}`}>
                          {ratio}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                        {fmtDate(a.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => handleDeleteAttempt(a)}
                            className="text-xs text-slate-400 hover:text-red-600 px-1"
                            aria-label="삭제"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )

  const metricsPanel = (
    <div className="space-y-4">
      {/* 데스크탑에선 이 둘이 사이드바에 상시 노출되므로 탭에서 뺀다. */}
      {!isDesktop && (
        <>
          {keyStats}
          {progressCards}
        </>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <StatCard
          label="단어 시험지 평균"
          value={
            attempts.some((a) => a.type === 'vocab' && a.total > 0)
              ? `${stats.vocabAvg}%`
              : '—'
          }
          sub={`${attempts.filter((a) => a.type === 'vocab').length}회 응시`}
        />
        <StatCard
          label="지문 평균"
          value={
            attempts.some((a) => a.type === 'reading' && a.total > 0)
              ? `${stats.readingAvg}%`
              : '—'
          }
          sub={`${attempts.filter((a) => a.type === 'reading').length}회 응시`}
        />
      </div>
      <WeeklyReportPreview
        studentName={account.displayName}
        assignments={assignments}
        attempts={attempts}
      />
    </div>
  )

  const wordbookPanel =
    wordbook.length === 0 ? (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        모은 단어가 없습니다.
      </div>
    ) : (
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2">
          {[...wordbook]
            .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
            .slice(0, 20)
            .map((w) => (
              <div
                key={w.en}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm flex items-baseline justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{w.en}</p>
                  <p className="text-slate-500 truncate text-xs">{w.ko}</p>
                </div>
                <span className="inline-block rounded-full bg-brand-50 text-brand-700 text-xs font-medium px-2 py-0.5 whitespace-nowrap">
                  {w.count}회
                </span>
              </div>
            ))}
        </div>
        {wordbook.length > 20 && (
          <p className="text-xs text-slate-500">
            조회 횟수 상위 20개만 표시 (총 {wordbook.length}개)
          </p>
        )}
      </div>
    )

  const settingsPanel = (
    <div className="max-w-2xl space-y-1 rounded-lg border border-slate-200 bg-white p-4">
      <ProfileEditor account={account} onSaved={(next) => setAccount(next)} />
      <SubjectPicker
        account={account}
        onSaved={(next) => setAccount({ ...account, subjects: next })}
      />
      <ColorPicker
        account={account}
        onSaved={(next) => setAccount({ ...account, colorKey: next })}
      />
      {/* 지문 문제풀이가 학생 비노출로 바뀌면서 "접근 허용" 체크박스는 아무 효과가
          없어져 제거했다. 되살리려면 Layout.tsx 의 canReading 과 함께 복구할 것. */}
    </div>
  )

  const panels: Record<TabKey, React.ReactNode> = {
    assignments: assignmentsPanel,
    attempts: attemptsPanel,
    metrics: metricsPanel,
    schedule: <ScheduleManager studentUid={account.id} />,
    wordbook: wordbookPanel,
    settings: settingsPanel,
  }

  return (
    <div className="space-y-4">
      <Link
        to="/admin/students"
        className="inline-block text-xs text-slate-500 hover:text-slate-900"
      >
        ← 학생 관리
      </Link>

      <div className="xl:flex xl:gap-6 xl:items-start">
        {/* 맥북·대형 태블릿 가로: 좌측 고정 사이드바. 학생을 보는 내내 신원과 핵심 지표가 붙어 있는다. */}
        <aside className="hidden xl:block w-72 2xl:w-80 shrink-0 xl:sticky xl:top-4 space-y-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
              {account.displayName}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {account.school || '학교 미입력'}
            </p>
            <p className="text-xs text-slate-500 break-all">{account.email}</p>
            <div className="mt-2 space-y-0.5 text-[11px] text-slate-500">
              <p>학생 {account.phone || '-'}</p>
              <p>학부모 {account.parentPhone || '-'}</p>
              <p>가입 {fmtDate(account.createdAt)}</p>
            </div>
          </div>
          {contactActions}
          {keyStats}
          {progressCards}
        </aside>

        <div className="min-w-0 flex-1 space-y-4">
          {/* 아이폰·아이패드: 압축 헤더 + 요약 한 줄 */}
          <header className="xl:hidden space-y-2">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
                  {account.displayName}
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  {account.school || '학교 미입력'} · {account.email}
                </p>
              </div>
              {contactActions}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
              <span>
                총 <b className="font-semibold text-slate-900">{stats.totalAttempts}</b>회
              </span>
              <span className="text-slate-300">·</span>
              <span>
                평균{' '}
                <b className="font-semibold text-slate-900">
                  {stats.totalAttempts > 0 ? `${stats.avgRatio}%` : '—'}
                </b>
              </span>
              <span className="text-slate-300">·</span>
              <span>
                진행 중 과제{' '}
                <b className="font-semibold text-slate-900">{pending.length}</b>
              </span>
              {stats.lastActivity && (
                <>
                  <span className="text-slate-300">·</span>
                  <span>최근 {fmtDate(stats.lastActivity)}</span>
                </>
              )}
            </div>
          </header>

          {/* 탭 — 폰에서는 가로 스크롤 */}
          <div className="border-b border-slate-200 overflow-x-auto">
            <div className="flex min-w-max">
              {tabs.map((t) => {
                const active = tab === t.key
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={`relative px-3 sm:px-4 h-11 touch:h-12 text-sm font-medium whitespace-nowrap transition ${
                      active
                        ? 'text-slate-900'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {t.label}
                    {t.badge != null && t.badge > 0 && (
                      <span
                        className={`ml-1.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold align-middle ${
                          active
                            ? 'bg-brand-100 text-brand-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {t.badge}
                      </span>
                    )}
                    {active && (
                      <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {panels[tab]}
        </div>
      </div>
    </div>
  )
}

function attemptResultPath(a: Attempt): string {
  if (a.type === 'vocab') return `/vocab/${a.refId}/result/${a.id}`
  if (a.type === 'reading') return `/reading/${a.refId}/result/${a.id}`
  if (a.type === 'korean_mock') return `/korean-mocks/${a.refId}/result/${a.id}`
  return `/wordbook/result/${a.id}`
}

const STATUS_TONE_CLASS: Record<AssignmentStatusView['tone'], string> = {
  brand: 'bg-brand-100 text-brand-700 border-brand-200',
  amber: 'bg-amber-100 text-amber-800 border-amber-200',
  red: 'bg-red-100 text-red-700 border-red-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
}

const DDAY_TONE_CLASS: Record<DDayView['tone'], string> = {
  overdue: 'bg-red-100 text-red-700 border-red-200',
  today: 'bg-amber-100 text-amber-800 border-amber-200',
  soon: 'bg-amber-50 text-amber-700 border-amber-200',
  normal: 'bg-slate-100 text-slate-600 border-slate-200',
  none: 'bg-slate-50 text-slate-500 border-slate-200',
}

const TYPE_SHORT: Record<Assignment['type'], string> = {
  vocab: '단어',
  reading: '지문',
  korean_mock: '국어',
  custom: '외부',
}

function tsToDateInput(ts: { toDate: () => Date } | null | undefined): string {
  if (!ts) return ''
  const d = ts.toDate()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function AssignmentRow({
  a,
  status,
  dday,
  categories,
  onToggleDone,
  onDelete,
  onSave,
  fmtDate,
}: {
  a: Assignment
  status: AssignmentStatusView
  dday: DDayView
  categories: CategoryConfig[]
  onToggleDone: () => void
  onDelete: () => void
  onSave: (input: {
    startAt?: Date | null
    dueAt?: Date | null
    note?: string
    minCorrect?: number | null
    category?: AssignmentCategory
    refTitle?: string
  }) => Promise<void>
  fmtDate: (ts: { toDate: () => Date } | null | undefined) => string
}) {

  const [editing, setEditing] = useState(false)
  const [eStart, setEStart] = useState('')
  const [eDue, setEDue] = useState('')
  const [eNote, setENote] = useState('')
  const [eMinCorrect, setEMinCorrect] = useState('')
  const [eCategory, setECategory] = useState<AssignmentCategory>('etc')
  const [eRefTitle, setERefTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  function startEdit() {
    setEStart(tsToDateInput(a.startAt))
    setEDue(tsToDateInput(a.dueAt))
    setENote(a.note ?? '')
    setEMinCorrect(a.minCorrect ? String(a.minCorrect) : '')
    setECategory(a.category ?? (a.type === 'vocab' ? 'vocab' : a.type === 'reading' ? 'problem' : 'etc'))
    setERefTitle(a.refTitle)
    setEditError(null)
    setEditing(true)
  }

  async function handleSubmit() {
    setSaving(true)
    setEditError(null)
    try {
      const input: Parameters<typeof onSave>[0] = {
        category: eCategory,
        note: eNote,
      }
      input.startAt = eStart ? new Date(`${eStart}T00:00`) : null
      input.dueAt = dueDateFromInput(eDue)
      if (a.type === 'vocab') {
        const n = Number.parseInt(eMinCorrect, 10)
        input.minCorrect = Number.isFinite(n) && n > 0 ? n : null
      }
      if (a.type === 'custom') {
        const t = eRefTitle.trim()
        if (!t) {
          setEditError('과제명을 비울 수 없습니다.')
          setSaving(false)
          return
        }
        input.refTitle = t
      }
      await onSave(input)
      setEditing(false)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="px-4 py-3 touch:py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {TYPE_SHORT[a.type]}
            </span>
            <button
              type="button"
              onClick={onToggleDone}
              title="클릭으로 완료 ↔ 미완료 전환 (학생이 완료한 과제도 강제 변경 가능)"
              className={`rounded-full px-2 py-0.5 touch:py-1 text-[11px] font-medium border transition cursor-pointer hover:brightness-95 ${
                STATUS_TONE_CLASS[status.tone]
              }`}
            >
              {status.label}
            </button>
            {dday.tone !== 'none' && (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                  DDAY_TONE_CLASS[dday.tone]
                }`}
              >
                {dday.label}
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-900 mt-1 truncate">
            {a.refTitle}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500 mt-0.5">
            {isNotYetStarted(a) && (
              <span className="text-amber-600 font-medium">
                {fmtDate(a.startAt)}부터 노출 (예정)
              </span>
            )}
            {a.dueAt && <span>마감 {fmtDate(a.dueAt)}</span>}
            <span>부여 {fmtDate(a.createdAt)}</span>
            {a.minCorrect && a.minCorrect > 0 && (
              <span className="text-slate-600">완료 기준 {a.minCorrect}개↑</span>
            )}
            {a.note && <span className="text-slate-600">· {a.note}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => (editing ? setEditing(false) : startEdit())}
            className="text-xs text-slate-500 hover:text-slate-900 px-1 py-1"
          >
            {editing ? '닫기' : '수정'}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-xs text-slate-400 hover:text-red-600 px-1 py-1"
          >
            삭제
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50/70 p-3 space-y-2">
          {a.type === 'custom' && (
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                과제명
              </label>
              <input
                type="text"
                value={eRefTitle}
                onChange={(e) => setERefTitle(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                시작일 <span className="text-slate-400 font-normal">(비우면 즉시 노출)</span>
              </label>
              <input
                type="date"
                value={eStart}
                onChange={(e) => setEStart(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                마감일 <span className="text-slate-400 font-normal">(비우면 제거)</span>
              </label>
              <input
                type="date"
                value={eDue}
                onChange={(e) => setEDue(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                분류
              </label>
              <select
                value={eCategory}
                onChange={(e) =>
                  setECategory(e.target.value as AssignmentCategory)
                }
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {categories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={a.type === 'vocab' ? '' : 'sm:col-span-2'}>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                메모
              </label>
              <input
                type="text"
                value={eNote}
                onChange={(e) => setENote(e.target.value)}
                placeholder="예: 시간 재고 풀어보기"
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            {a.type === 'vocab' && (
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  완료 기준{' '}
                  <span className="text-slate-400 font-normal">
                    (최소 정답 수, 비우면 제거)
                  </span>
                </label>
                <input
                  type="number"
                  min={1}
                  value={eMinCorrect}
                  onChange={(e) => setEMinCorrect(e.target.value)}
                  placeholder="예: 25"
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            )}
          </div>
          {editError && <p className="text-xs text-red-600">{editError}</p>}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border border-slate-300 text-slate-700 text-xs font-medium px-3 py-1.5 touch:py-2 hover:bg-slate-100"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="rounded-md bg-slate-900 text-white text-xs font-medium px-3 py-1.5 touch:py-2 hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

function WeeklyReportPreview({
  studentName,
  assignments,
  attempts,
}: {
  studentName: string
  assignments: Assignment[]
  attempts: Attempt[]
}) {
  const vars = useMemo(
    () => buildWeeklyReportVars(assignments, attempts),
    [assignments, attempts],
  )
  return (
    <details className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 select-none flex items-center justify-between gap-2">
        <span>📨 주간 리포트 미리보기 (지난 7일)</span>
        <span className="text-[11px] font-normal text-slate-500 hidden sm:inline">
          실제 발송과 동일한 7일 윈도우
        </span>
      </summary>
      <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100">
        <p className="text-[11px] text-slate-500 mt-2">
          <strong className="font-semibold text-slate-700">{studentName}님</strong>{' '}
          앞으로 발송될 var1~var3 내용. 마지막 격려 멘트(var4)는 알림톡 설정의 주간
          리포트 closing 값으로 들어갑니다.
        </p>
        <div className="space-y-2">
          <PreviewBlock label="var1" body={vars.var1} />
          <PreviewBlock label="var2" body={vars.var2} />
          <PreviewBlock label="var3" body={vars.var3} />
        </div>
      </div>
    </details>
  )
}

function PreviewBlock({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/60 overflow-hidden">
      <div className="px-3 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider bg-white border-b border-slate-200">
        {label}
      </div>
      <pre className="px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">
        {body}
      </pre>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">{label}</p>
      <p className="text-xl font-semibold text-slate-900 mt-0.5 tracking-tight">{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function ProgressCard({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1.5">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">{label}</p>
        <p className="text-[10px] text-slate-500">{pct}%</p>
      </div>
      <p className="text-xl font-semibold text-slate-900 tracking-tight">
        {done}
        <span className="text-sm text-slate-400 font-medium"> / {total}</span>
      </p>
      <div className="h-1 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/**
 * 학생 기본 정보 수정 — 이름·학교·이메일·전화.
 *
 * 상태(승인/거절)와 비밀번호는 학생 관리 목록에 이미 있어 여기 안 넣는다.
 * 역할(관리자/학생)도 뺐다 — 이 화면에서 실수로 바꿀 일이 아니다.
 */
function ProfileEditor({
  account,
  onSaved,
}: {
  account: UserAccount
  onSaved: (next: UserAccount) => void
}) {
  const [open, setOpen] = useState(false)
  const [displayName, setDisplayName] = useState(account.displayName)
  const [email, setEmail] = useState(account.email)
  const [school, setSchool] = useState(account.school ?? '')
  const [phone, setPhone] = useState(account.phone ?? '')
  const [parentPhone, setParentPhone] = useState(account.parentPhone ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  function start() {
    // 열 때마다 현재 값으로 되돌린다 — 저장 안 하고 닫았다 다시 열면
    // 지난번에 고치다 만 값이 남아 있으면 안 된다.
    setDisplayName(account.displayName)
    setEmail(account.email)
    setSchool(account.school ?? '')
    setPhone(account.phone ?? '')
    setParentPhone(account.parentPhone ?? '')
    setErr(null)
    setDone(null)
    setOpen(true)
  }

  async function save() {
    setSaving(true)
    setErr(null)
    try {
      const next = await updateAccountProfile(account.id, {
        displayName,
        email,
        school,
        phone,
        parentPhone,
      })
      onSaved(next)
      setOpen(false)
      setDone('학생 정보를 저장했습니다.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <div className="pb-3 mb-1 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-xs text-slate-600 space-y-0.5">
            <p className="text-sm font-medium text-slate-900">
              {account.displayName}
            </p>
            <p>{account.school || '학교 미입력'}</p>
            <p className="break-all">{account.email}</p>
            <p>
              학생 {account.phone || '-'} · 학부모 {account.parentPhone || '-'}
            </p>
          </div>
          <button
            type="button"
            onClick={start}
            className="shrink-0 rounded-md border border-slate-300 text-slate-700 text-[11px] font-medium px-2.5 py-1 touch:py-1.5 hover:bg-slate-50"
          >
            정보 수정
          </button>
        </div>
        {done && <p className="text-[11px] text-brand-700 mt-1.5">{done}</p>}
      </div>
    )
  }

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    placeholder?: string,
  ) => (
    <div>
      <label className="block text-[10px] text-slate-500 mb-0.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  )

  return (
    <div className="pb-3 mb-1 border-b border-slate-100 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {field('이름', displayName, setDisplayName)}
        {field('학교', school, setSchool, '예: 한빛고')}
        {field('이메일 (로그인 아이디)', email, setEmail)}
        <div />
        {field('학생 전화', phone, setPhone, '010-0000-0000')}
        {field('학부모 전화', parentPhone, setParentPhone, '010-0000-0000')}
      </div>
      <p className="text-[10px] text-slate-400">
        전화번호는 저장할 때 010-0000-0000 형태로 정리됩니다. 비밀번호와 승인
        상태는 학생 관리 목록에서 바꿉니다.
      </p>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md bg-slate-900 text-white text-xs font-medium px-3 py-1.5 hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-slate-300 text-slate-700 text-xs font-medium px-3 py-1.5 hover:bg-slate-50"
        >
          취소
        </button>
      </div>
    </div>
  )
}

function SubjectPicker({
  account,
  onSaved,
}: {
  account: UserAccount
  onSaved: (subjects: MockSubject[]) => void
}) {
  const cur = accountSubjects(account)
  const [korean, setKorean] = useState(cur.korean)
  const [english, setEnglish] = useState(cur.english)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const changed = korean !== cur.korean || english !== cur.english
  const valid = korean || english

  async function save() {
    if (!valid) {
      setErr('과목을 하나 이상 선택하세요.')
      return
    }
    setSaving(true)
    setErr(null)
    const next: MockSubject[] = []
    if (korean) next.push('korean')
    if (english) next.push('english')
    try {
      await updateAccountSubjects(account.id, next)
      onSaved(next)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 flex items-center gap-3 flex-wrap text-xs">
      <span className="text-slate-500">수강 과목:</span>
      <label className="inline-flex items-center gap-1.5 cursor-pointer py-1">
        <input
          type="checkbox"
          checked={korean}
          onChange={(e) => setKorean(e.target.checked)}
          className="h-3.5 w-3.5"
        />
        국어
      </label>
      <label className="inline-flex items-center gap-1.5 cursor-pointer py-1">
        <input
          type="checkbox"
          checked={english}
          onChange={(e) => setEnglish(e.target.checked)}
          className="h-3.5 w-3.5"
        />
        영어
      </label>
      {changed && (
        <button
          type="button"
          onClick={save}
          disabled={saving || !valid}
          className="rounded-md bg-slate-900 text-white text-[11px] font-medium px-2.5 py-1 touch:py-1.5 hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      )}
      {err && <span className="text-red-600">{err}</span>}
    </div>
  )
}

function ColorPicker({
  account,
  onSaved,
}: {
  account: UserAccount
  onSaved: (colorKey: string) => void
}) {
  const currentColor = colorForStudent(account.id, account.colorKey)
  const [saving, setSaving] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function pick(key: string) {
    if (key === account.colorKey) return
    setSaving(key)
    setErr(null)
    try {
      await updateAccountColorKey(account.id, key)
      onSaved(key)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
      <span className="text-slate-500">캘린더 색상:</span>
      <div className="flex items-center gap-1.5">
        {STUDENT_COLOR_KEYS.map((k) => {
          const c = STUDENT_COLORS[k]
          const active = k === currentColor.key
          return (
            <button
              key={k}
              type="button"
              onClick={() => pick(k)}
              disabled={saving !== null}
              title={c.label}
              aria-label={c.label}
              className={`w-5 h-5 touch:w-6 touch:h-6 rounded-full border-2 transition ${c.dot} ${
                active ? 'border-slate-900 scale-110' : 'border-white'
              } disabled:opacity-50`}
            />
          )
        })}
      </div>
      {!account.colorKey && (
        <span className="text-slate-400">(자동 지정 · {currentColor.label})</span>
      )}
      {saving && <span className="text-slate-400">저장 중…</span>}
      {err && <span className="text-red-600">{err}</span>}
    </div>
  )
}
