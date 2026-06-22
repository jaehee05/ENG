import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { getAccount } from '../lib/account'
import {
  createAssignment,
  deleteAssignment,
  deleteAttempt,
  ensureDefaultCategories,
  listAssignmentsForStudent,
  listAttemptsForUser,
  listReadings,
  listVocabSets,
  setAssignmentManualStatus,
  updateAssignment,
} from '../lib/firestore'
import { sendPushNotification } from '../lib/ppurioApi'
import { buildWeeklyReportVars } from '../lib/weeklyReport'
import { listMyWordbook } from '../lib/wordbook'
import {
  getAssignmentStatusView,
  getDDay,
  type Assignment,
  type AssignmentType,
  type AssignmentCategory,
  type AssignmentStatusView,
  type Attempt,
  type CategoryConfig,
  type DDayView,
  type Reading,
  type UserAccount,
  type VocabSet,
  type WordLookup,
} from '../lib/types'

function isNotYetStarted(a: Assignment): boolean {
  if (!a.startAt) return false
  return a.startAt.toMillis() > Date.now()
}

function defaultCategoryKey(type: AssignmentType): AssignmentCategory {
  if (type === 'vocab') return 'vocab'
  if (type === 'reading') return 'problem'
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

const TYPE_LABEL: Record<Attempt['type'], string> = {
  vocab: '단어 시험지',
  reading: '지문 문제풀이',
  wordbook: '내 단어장 시험',
}

const TYPE_CLASS: Record<Attempt['type'], string> = {
  vocab: 'bg-brand-50 text-brand-700',
  reading: 'bg-brand-50 text-brand-800',
  wordbook: 'bg-brand-50 text-brand-700',
}

type TypeFilter = 'all' | Attempt['type']

export function AdminStudentDetail() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const [account, setAccount] = useState<UserAccount | null>(null)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [wordbook, setWordbook] = useState<WordLookup[]>([])
  const [vocabSets, setVocabSets] = useState<VocabSet[]>([])
  const [readings, setReadings] = useState<Reading[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const [assignType, setAssignType] = useState<AssignmentType>('reading')
  const [assignCategory, setAssignCategory] = useState<AssignmentCategory>('problem')
  const [categories, setCategories] = useState<CategoryConfig[]>([])
  const [assignRefId, setAssignRefId] = useState('')
  const [assignStart, setAssignStart] = useState('')
  const [assignDue, setAssignDue] = useState('')
  const [assignNote, setAssignNote] = useState('')
  const [assignMinCorrect, setAssignMinCorrect] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)

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
      listAssignmentsForStudent(id),
      ensureDefaultCategories(),
    ])
      .then(([acc, atts, wb, vs, rd, asn, cats]) => {
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

  const progress = useMemo(() => {
    const vocabDone = new Set(
      attempts.filter((a) => a.type === 'vocab' && a.refId).map((a) => a.refId),
    )
    const readingDone = new Set(
      attempts.filter((a) => a.type === 'reading' && a.refId).map((a) => a.refId),
    )
    return {
      vocabDone: vocabDone.size,
      vocabTotal: vocabSets.length,
      readingDone: readingDone.size,
      readingTotal: readings.length,
    }
  }, [attempts, vocabSets, readings])

  const [bundleMode, setBundleMode] = useState(false)
  const [bundleCategory, setBundleCategory] = useState('')

  const readingCategories = useMemo(() => {
    const TITLE_RE = /^(.+?)\s+(\d+(?:-\d+)?)\s*(?:번|문제)?\s*$/
    const map = new Map<string, Reading[]>()
    for (const r of readings) {
      const m = TITLE_RE.exec(r.title.trim())
      if (!m) continue
      const cat = m[1].trim()
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(r)
    }
    return [...map.entries()]
      .map(([category, list]) => ({ category, list }))
      .sort((a, b) =>
        a.category.localeCompare(b.category, 'ko', { numeric: true }),
      )
  }, [readings])

  const assignOptions = assignType === 'vocab' ? vocabSets : readings
  const [customTitle, setCustomTitle] = useState('')
  const [pushOnAssign, setPushOnAssign] = useState(true)

  async function maybePushAssignment(titles: string[]) {
    if (!pushOnAssign || !id) return
    try {
      let dueText = ''
      if (assignDue) {
        const d = new Date(assignDue)
        if (!Number.isNaN(d.getTime())) {
          dueText = ` (마감 ${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')})`
        }
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
    const dueDate = assignDue ? new Date(assignDue) : null
    if (dueDate && Number.isNaN(dueDate.getTime())) {
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
      } catch (err) {
        setAssignError(err instanceof Error ? err.message : '과제 부여에 실패했습니다.')
      } finally {
        setAssigning(false)
      }
      return
    }

    if (bundleMode && assignType === 'reading') {
      const group = readingCategories.find((g) => g.category === bundleCategory)
      if (!group || group.list.length === 0) {
        setAssignError('묶음 과제로 부여할 시험명을 선택하세요.')
        return
      }
      setAssigning(true)
      try {
        for (const r of group.list) {
          await createAssignment({
            studentUid: id,
            studentName: account.displayName,
            assignedBy: profile.id,
            assignedByName: profile.displayName,
            type: 'reading',
            category: assignCategory,
            refId: r.id,
            refTitle: r.title,
            note: assignNote,
            startAt: startDate,
            dueAt: dueDate,
          })
        }
        setBundleCategory('')
        setAssignStart('')
        setAssignDue('')
        setAssignNote('')
        await maybePushAssignment(group.list.map((r) => r.title))
        await reloadAssignments()
      } catch (err) {
        setAssignError(err instanceof Error ? err.message : '과제 부여에 실패했습니다.')
      } finally {
        setAssigning(false)
      }
      return
    }

    if (!assignRefId) {
      setAssignError('과제로 부여할 항목을 선택하세요.')
      return
    }
    const source = assignType === 'vocab' ? vocabSets : readings
    const target = source.find((s) => s.id === assignRefId)
    if (!target) {
      setAssignError('선택한 항목을 찾을 수 없습니다.')
      return
    }
    let minCorrect: number | undefined
    if (assignType === 'vocab' && assignMinCorrect.trim()) {
      const n = Number.parseInt(assignMinCorrect, 10)
      if (Number.isFinite(n) && n > 0) minCorrect = n
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
      setAssignMinCorrect('')
      await maybePushAssignment([target.title])
      await reloadAssignments()
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

  return (
    <div className="space-y-5">
      <header>
        <Link
          to="/admin/students"
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          ← 학생 관리
        </Link>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mt-2 mb-1">
          학생 상세
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
          {account.displayName}
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          {account.school || '학교 미입력'} · {account.email}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-slate-500">
          <span>학생 {account.phone || '-'}</span>
          <span>학부모 {account.parentPhone || '-'}</span>
          <span>가입 {fmtDate(account.createdAt)}</span>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatCard label="총 시험" value={`${stats.totalAttempts}`} />
        <StatCard
          label="평균"
          value={stats.totalAttempts > 0 ? `${stats.avgRatio}%` : '—'}
        />
        <StatCard
          label="단어장"
          value={`${stats.wordbookSize}`}
          sub={`조회 ${stats.wordbookTotalLookups}`}
        />
        <StatCard
          label="최근"
          value={stats.lastActivity ? fmtDate(stats.lastActivity) : '—'}
        />
      </div>

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

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">학습 진행도</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
      </section>

      <WeeklyReportPreview
        studentName={account.displayName}
        assignments={assignments}
        attempts={attempts}
      />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">과제</h2>
          <span className="text-xs text-slate-500">총 {assignments.length}건</span>
        </div>

        <form
          onSubmit={handleAssign}
          className="rounded-lg border border-brand-200 bg-brand-50/40 p-4 space-y-4"
        >
          {/* 1. 유형 — 세그먼트 컨트롤 */}
          <div>
            <p className="text-xs font-medium text-slate-600 mb-1.5">유형</p>
            <div className="grid grid-cols-3 gap-1 rounded-md border border-slate-200 bg-white p-1">
              {(
                [
                  { key: 'reading', label: '지문 문제풀이' },
                  { key: 'vocab', label: '단어 시험지' },
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
                      setAssignCategory(defaultCategoryKey(opt.key))
                      if (opt.key !== 'reading') setBundleMode(false)
                    }}
                    className={`rounded px-2 py-1.5 text-xs font-medium transition ${
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
            {assignType === 'reading' && readingCategories.length > 0 && (
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bundleMode}
                  onChange={(e) => setBundleMode(e.target.checked)}
                  className="accent-brand-600"
                />
                <span className="font-medium">묶음(풀세트)으로 부여</span>
                <span className="text-slate-400">
                  같은 시험명의 지문 전부를 한 번에 부여
                </span>
              </label>
            )}
            {assignType === 'custom' && (
              <p className="text-[11px] text-slate-500 mt-1.5">
                학생 풀이 화면 없는 외부 과제. 완료는 관리자가 수동 표시.
              </p>
            )}
          </div>

          {/* 2. 대상 — 지문/시험지/제목 */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {assignType === 'custom'
                ? '과제명'
                : assignType === 'vocab'
                  ? '단어 시험지'
                  : bundleMode
                    ? '시험명 묶음'
                    : '지문'}
            </label>
            {assignType === 'custom' ? (
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="예: 학원 종이 시험지 3회, 모의고사 오답노트 등"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            ) : assignType === 'reading' && bundleMode ? (
              <select
                value={bundleCategory}
                onChange={(e) => setBundleCategory(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">— 선택 —</option>
                {readingCategories.map((g) => (
                  <option key={g.category} value={g.category}>
                    {g.category} ({g.list.length}개)
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={assignRefId}
                onChange={(e) => setAssignRefId(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">— 선택 —</option>
                {assignOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* 3. 마감일 + 분류 — 핵심 옵션 두 줄 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            {assignType === 'vocab' && !bundleMode && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  완료 기준{' '}
                  <span className="text-slate-400 font-normal">
                    (최소 정답 수, 선택)
                  </span>
                </label>
                <input
                  type="number"
                  min={1}
                  value={assignMinCorrect}
                  onChange={(e) => setAssignMinCorrect(e.target.value)}
                  placeholder="예: 25"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
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
              className="rounded-md bg-slate-900 text-white text-sm font-semibold px-5 py-2 hover:bg-slate-800 disabled:opacity-50"
            >
              {assigning ? '부여 중…' : '과제 부여'}
            </button>
          </div>
        </form>

        {assignments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            아직 부여한 과제가 없습니다.
          </div>
        ) : (
          (() => {
            // 진행 중(미완료) — D-day 오름차순(지난 것 가장 위) → 마감 없음은 맨 뒤
            // 완료 — 부여일 내림차순
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
            return (
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
                          onSave={(input) =>
                            handleSaveAssignmentEdit(x.a, input)
                          }
                          fmtDate={fmtDate}
                        />
                      ))}
                    </ul>
                  </div>
                )}
                {done.length > 0 && (
                  <details className="space-y-1.5" open={pending.length === 0}>
                    <summary className="text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700 select-none">
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
                          onSave={(input) =>
                            handleSaveAssignmentEdit(x.a, input)
                          }
                          fmtDate={fmtDate}
                        />
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )
          })()
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-base font-semibold text-slate-900">시험 이력</h2>
          <div className="flex items-center gap-1 text-xs">
            {(['all', 'vocab', 'reading', 'wordbook'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTypeFilter(k)}
                className={`px-3 py-1.5 rounded-full transition ${
                  typeFilter === k
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {k === 'all' ? '전체' : TYPE_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        {filteredAttempts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            기록이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
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
                  const resultPath =
                    a.type === 'vocab'
                      ? `/vocab/${a.refId}/result/${a.id}`
                      : a.type === 'reading'
                        ? `/reading/${a.refId}/result/${a.id}`
                        : `/wordbook/result/${a.id}`
                  return (
                    <tr key={a.id}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${TYPE_CLASS[a.type]}`}>
                          {TYPE_LABEL[a.type]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-900">
                        <Link
                          to={resultPath}
                          className="text-slate-900 hover:text-brand-700 hover:underline"
                        >
                          {a.refTitle}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {a.correct} / {a.total}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`text-sm font-medium ${
                            ratio >= 80
                              ? 'text-brand-700'
                              : ratio >= 50
                                ? 'text-brand-700'
                                : 'text-red-700'
                          }`}
                        >
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
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">
          단어장 ({wordbook.length})
        </h2>
        {wordbook.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            모은 단어가 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
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
        )}
        {wordbook.length > 20 && (
          <p className="text-xs text-slate-500">조회 횟수 상위 20개만 표시 (총 {wordbook.length}개)</p>
        )}
      </section>
    </div>
  )
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
      input.dueAt = eDue ? new Date(`${eDue}T00:00`) : null
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
    <li className="px-4 py-3">
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
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium border transition cursor-pointer hover:brightness-95 ${
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
            className="text-xs text-slate-500 hover:text-slate-900 px-1"
          >
            {editing ? '닫기' : '수정'}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-xs text-slate-400 hover:text-red-600 px-1"
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
              className="rounded-md border border-slate-300 text-slate-700 text-xs font-medium px-3 py-1.5 hover:bg-slate-100"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="rounded-md bg-slate-900 text-white text-xs font-medium px-3 py-1.5 hover:bg-slate-800 disabled:opacity-50"
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
    <section className="space-y-3">
      <details className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 select-none flex items-center justify-between">
          <span>📨 주간 리포트 미리보기 (지난 7일)</span>
          <span className="text-[11px] font-normal text-slate-500">
            실제 발송과 동일한 7일 윈도우
          </span>
        </summary>
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100">
          <p className="text-[11px] text-slate-500 mt-2">
            <strong className="font-semibold text-slate-700">
              {studentName}님
            </strong>{' '}
            앞으로 발송될 var1~var3 내용. 마지막 격려 멘트(var4)는 알림톡 설정의
            주간 리포트 closing 값으로 들어갑니다.
          </p>
          <div className="space-y-2">
            <PreviewBlock label="var1" body={vars.var1} />
            <PreviewBlock label="var2" body={vars.var2} />
            <PreviewBlock label="var3" body={vars.var3} />
          </div>
        </div>
      </details>
    </section>
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
