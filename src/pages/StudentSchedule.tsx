import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../contexts/useAuth'
import { listAccounts } from '../lib/account'
import {
  createClassSessionsBatch,
  deleteClassSession,
  listAllClassSessions,
  listClassSessionsForStudent,
  updateClassSession,
} from '../lib/firestore'
import {
  CLASS_SESSION_STATUS_LABEL,
  isSessionRecorded,
  SESSION_ATTENDANCE_LABEL,
  type ClassSession,
  type ClassSessionStatus,
  type SessionAttendance,
  type UserAccount,
} from '../lib/types'
import { colorForStudent } from '../lib/studentColor'
import {
  Badge,
  BottomSheet,
  Button,
  Card,
  EmptyState,
  Field,
  ListRow,
  PageHeader,
  Section,
  SkeletonList,
  confirm,
  cx,
  inputClass,
  toast,
  type BadgeTone,
} from '../components/ui'
import {
  EMPTY_SESSION_FORM,
  fromSession,
  SessionForm,
  type SessionFormResult,
  type SessionFormValues,
} from '../components/SessionForm'

const KST_TZ = 'Asia/Seoul'

/** 수업 상태 배지 색. */
const STATUS_TONE: Record<ClassSessionStatus, BadgeTone> = {
  scheduled: 'blue',
  done: 'brand',
  canceled: 'red',
  makeup: 'orange',
  off: 'gray',
}

function todayISO(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(new Date())
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function isoOf(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`
}

function buildCalendarCells(
  year: number,
  monthIndex: number,
): { iso: string; day: number; inMonth: boolean }[] {
  const first = new Date(year, monthIndex, 1)
  const firstDow = first.getDay()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const cells: { iso: string; day: number; inMonth: boolean }[] = []
  const prevMonthLast = new Date(year, monthIndex, 0).getDate()
  const prevYear = monthIndex === 0 ? year - 1 : year
  const prevMonth = monthIndex === 0 ? 11 : monthIndex - 1
  for (let i = firstDow - 1; i >= 0; i--) {
    const d = prevMonthLast - i
    cells.push({ iso: isoOf(prevYear, prevMonth, d), day: d, inMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: isoOf(year, monthIndex, d), day: d, inMonth: true })
  }
  const trailing = (7 - (cells.length % 7)) % 7
  const nextYear = monthIndex === 11 ? year + 1 : year
  const nextMonth = monthIndex === 11 ? 0 : monthIndex + 1
  for (let d = 1; d <= trailing; d++) {
    cells.push({ iso: isoOf(nextYear, nextMonth, d), day: d, inMonth: false })
  }
  return cells
}

function fmtCurrency(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`
}

/** KST 현재 시각 'HH:mm'. */
function nowHHmmKST(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: KST_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date())
}

/** 'YYYY-MM-DD' → 'M월 D일 (요일)'. */
function fmtDayHeading(iso: string): string {
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10))
  const wd = new Date(y, m - 1, d).toLocaleDateString('ko-KR', {
    weekday: 'short',
  })
  return `${m}월 ${d}일 (${wd})`
}

/**
 * 세션의 달력/리스트 배지. 취소·보강은 상태 그대로,
 * 그 외에는 기록 여부/완료/지난 수업(기록 필요)/예정으로 판정.
 */
function sessionBadge(
  s: ClassSession,
  today: string,
  nowHHmm: string,
): { label: string; tone: BadgeTone } {
  if (s.status === 'canceled') return { label: '취소', tone: 'red' }
  if (s.status === 'off') return { label: '휴강', tone: 'gray' }
  if (s.status === 'makeup') return { label: '보강', tone: 'orange' }
  if (s.status === 'done' || isSessionRecorded(s)) return { label: '완료', tone: 'brand' }
  const past = s.dateISO < today || (s.dateISO === today && s.endTime < nowHHmm)
  if (past) return { label: '기록', tone: 'amber' }
  return { label: '예정', tone: 'blue' }
}

// 학생 색상 팔레트/조회 로직은 src/lib/studentColor.ts 로 분리.

export function StudentSchedule() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [students, setStudents] = useState<UserAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterUid, setFilterUid] = useState<string>('all')

  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), monthIndex: now.getMonth() }
  })
  const [selected, setSelected] = useState<ClassSession | null>(null)
  const [selectedDateISO, setSelectedDateISO] = useState<string>(() => todayISO())

  // 관리자 CRUD 상태
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState<SessionFormValues>(EMPTY_SESSION_FORM)
  const [addStudentUid, setAddStudentUid] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState<SessionFormValues>(EMPTY_SESSION_FORM)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    setLoading(true)
    const p = isAdmin
      ? Promise.all([listAllClassSessions(), listAccounts()])
      : Promise.all([
          listClassSessionsForStudent(profile.id),
          Promise.resolve<UserAccount[]>([]),
        ])
    p.then(([s, accs]) => {
      if (cancelled) return
      setSessions(s)
      setStudents(
        accs.filter((a) => a.role === 'student' && a.status === 'active'),
      )
      setLoading(false)
    }).catch((e) => {
      if (!cancelled) {
        setError(e instanceof Error ? e.message : '불러오기 실패')
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [profile, isAdmin])

  const cells = useMemo(
    () => buildCalendarCells(cursor.year, cursor.monthIndex),
    [cursor],
  )

  const filteredSessions = useMemo(() => {
    if (!isAdmin || filterUid === 'all') return sessions
    return sessions.filter((s) => s.studentUid === filterUid)
  }, [sessions, isAdmin, filterUid])

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, ClassSession[]>()
    for (const s of filteredSessions) {
      const arr = map.get(s.dateISO) ?? []
      arr.push(s)
      map.set(s.dateISO, arr)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.startTime.localeCompare(b.startTime))
    }
    return map
  }, [filteredSessions])

  const studentNameByUid = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of students) map.set(s.id, s.displayName)
    return map
  }, [students])

  const studentColorKeyByUid = useMemo(() => {
    const map = new Map<string, string | undefined>()
    for (const s of students) map.set(s.id, s.colorKey)
    return map
  }, [students])

  // 실제로 세션이 있는 학생만 필터 옵션에 노출 (관리자 편의)
  const activeStudentsWithSessions = useMemo(() => {
    const uids = new Set<string>()
    for (const s of sessions) uids.add(s.studentUid)
    return students.filter((s) => uids.has(s.id))
  }, [sessions, students])

  // 보강 부족: 학생별 취소 - 보강 (과거 세션만 카운트)
  const makeupDeficits = useMemo(() => {
    if (!isAdmin) return []
    const today = todayISO()
    const stats = new Map<
      string,
      { canceled: ClassSession[]; makeup: number }
    >()
    for (const s of sessions) {
      if (s.dateISO > today) continue // 미래 세션은 제외
      const cur = stats.get(s.studentUid) ?? { canceled: [], makeup: 0 }
      if (s.status === 'canceled') cur.canceled.push(s)
      else if (s.status === 'makeup') cur.makeup++
      stats.set(s.studentUid, cur)
    }
    const rows: {
      uid: string
      name: string
      canceled: ClassSession[]
      makeup: number
      deficit: number
    }[] = []
    for (const [uid, { canceled, makeup }] of stats) {
      const deficit = canceled.length - makeup
      if (deficit <= 0) continue
      rows.push({
        uid,
        name: studentNameByUid.get(uid) ?? '(알 수 없음)',
        canceled: canceled.sort((a, b) => b.dateISO.localeCompare(a.dateISO)),
        makeup,
        deficit,
      })
    }
    return rows.sort((a, b) => b.deficit - a.deficit)
  }, [sessions, isAdmin, studentNameByUid])

  const today = todayISO()
  const nowHHmm = nowHHmmKST()
  const selectedSessions = sessionsByDate.get(selectedDateISO) ?? []

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const total = c.year * 12 + c.monthIndex + delta
      return { year: Math.floor(total / 12), monthIndex: ((total % 12) + 12) % 12 }
    })
  }

  function goToday() {
    const now = new Date()
    setCursor({ year: now.getFullYear(), monthIndex: now.getMonth() })
    setSelectedDateISO(todayISO())
  }

  async function reloadAdminSessions() {
    const s = await listAllClassSessions()
    setSessions(s)
  }

  async function handleAdd(v: SessionFormResult) {
    if (!addStudentUid) return
    setAddSaving(true)
    setAddError(null)
    try {
      // 반복이면 선택 요일로 기간 내 여러 날짜, 아니면 단일 날짜.
      const inputs = v.dates.map((dateISO) => ({
        studentUid: addStudentUid,
        title: v.title,
        dateISO,
        startTime: v.startTime,
        endTime: v.endTime,
        location: v.location,
        cost: v.cost,
        status: v.status,
        paid: v.paid,
        note: v.note,
      }))
      await createClassSessionsBatch(inputs)
      setAddOpen(false)
      setAddForm(EMPTY_SESSION_FORM)
      setAddStudentUid('')
      await reloadAdminSessions()
    } catch (e) {
      setAddError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setAddSaving(false)
    }
  }

  async function handleEdit(v: SessionFormResult) {
    if (!selected) return
    setEditSaving(true)
    setEditError(null)
    try {
      await updateClassSession(selected.id, v)
      const patched: ClassSession = { ...selected, ...v }
      setSessions((prev) => prev.map((x) => (x.id === selected.id ? patched : x)))
      setSelected(patched)
      setEditMode(false)
    } catch (e) {
      setEditError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete() {
    if (!selected) return
    if (
      !(await confirm(`‘${selected.title}’ (${selected.dateISO}) 수업을 삭제할까요?`, {
        danger: true,
        confirmText: '삭제',
      }))
    )
      return
    setDeleting(true)
    try {
      await deleteClassSession(selected.id)
      setSessions((prev) => prev.filter((x) => x.id !== selected.id))
      setSelected(null)
      setEditMode(false)
    } catch (e) {
      setEditError(e instanceof Error ? e.message : '삭제 실패')
    } finally {
      setDeleting(false)
    }
  }

  const monthLabel = `${cursor.year}년 ${cursor.monthIndex + 1}월`

  const addDirty =
    addStudentUid !== '' || JSON.stringify(addForm) !== JSON.stringify(EMPTY_SESSION_FORM)

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <PageHeader
        title={isAdmin ? '전체 수업 일정' : '수업 일정'}
        description={isAdmin ? '학생별로 색이 달라요. 수업 추가·편집·보강 확인을 여기서 해요.' : undefined}
        action={
          isAdmin && (
            <Button
              size="sm"
              onClick={() => {
                setAddForm(EMPTY_SESSION_FORM)
                setAddStudentUid('')
                setAddError(null)
                setAddOpen(true)
              }}
            >
              수업 추가
            </Button>
          )
        }
      />

      {isAdmin && activeStudentsWithSessions.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setFilterUid('all')}
            className={cx(
              'pressable h-9 px-3.5 rounded-full text-[13px] font-semibold',
              filterUid === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50 active:bg-slate-100',
            )}
          >
            전체 <span className="tabular-nums">{sessions.length}</span>
          </button>
          {activeStudentsWithSessions.map((st) => {
            const active = filterUid === st.id
            const color = colorForStudent(st.id, st.colorKey)
            const count = sessions.filter((s) => s.studentUid === st.id).length
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setFilterUid(st.id)}
                className={cx(
                  'pressable h-9 px-3.5 rounded-full text-[13px] font-semibold flex items-center gap-1.5 border',
                  active ? color.active : `${color.badge} hover:brightness-95`,
                )}
              >
                <span className={cx('inline-block w-1.5 h-1.5 rounded-full', active ? 'bg-white' : color.dot)} aria-hidden />
                {st.displayName} <span className="tabular-nums">{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {error && <p className="text-[13px] text-red-500 px-1">{error}</p>}

      <Card className="px-3 py-4 sm:px-5">
        <div className="flex items-center justify-between px-1 pb-3">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="pressable h-10 w-10 inline-flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 active:bg-slate-100"
            aria-label="이전 달"
          >
            <ChevronIcon dir="left" />
          </button>
          <div className="flex items-center gap-2">
            <h2 className="text-[17px] font-bold text-slate-900 tabular-nums">{monthLabel}</h2>
            <button
              type="button"
              onClick={goToday}
              className="pressable h-7 px-2.5 rounded-full bg-slate-100 text-[12px] font-semibold text-slate-600 hover:bg-slate-200 active:bg-slate-200"
            >
              오늘
            </button>
          </div>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="pressable h-10 w-10 inline-flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 active:bg-slate-100"
            aria-label="다음 달"
          >
            <ChevronIcon dir="right" />
          </button>
        </div>

        <div className="grid grid-cols-7 text-center text-[12px] font-medium text-slate-400 pb-1">
          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
            <div key={d} className={cx('py-1', i === 0 && 'text-red-400', i === 6 && 'text-sky-500')}>
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((c, i) => {
            const daySessions = sessionsByDate.get(c.iso) ?? []
            const isToday = c.iso === today
            const isSelected = c.iso === selectedDateISO
            const dow = i % 7
            return (
              <button
                key={c.iso + i}
                type="button"
                onClick={() => setSelectedDateISO(c.iso)}
                aria-pressed={isSelected}
                aria-label={`${c.iso}${daySessions.length ? `, 수업 ${daySessions.length}개` : ''}`}
                className="pressable h-12 sm:h-14 flex flex-col items-center justify-center gap-1 rounded-xl"
              >
                <span
                  className={cx(
                    'inline-flex items-center justify-center h-8 w-8 rounded-full text-[14px] font-semibold tabular-nums',
                    isSelected
                      ? 'bg-slate-900 text-white'
                      : isToday
                        ? 'bg-brand-100 text-brand-700'
                        : c.inMonth
                          ? dow === 0
                            ? 'text-red-400'
                            : dow === 6
                              ? 'text-sky-500'
                              : 'text-slate-700'
                          : 'text-slate-300',
                  )}
                >
                  {c.day}
                </span>
                <span className="flex items-center gap-0.5 h-1.5">
                  {daySessions.slice(0, 3).map((s) => {
                    const studentColor = isAdmin
                      ? colorForStudent(s.studentUid, studentColorKeyByUid.get(s.studentUid))
                      : null
                    return (
                      <span
                        key={s.id}
                        className={cx(
                          'inline-block w-1.5 h-1.5 rounded-full',
                          s.status === 'canceled' || s.status === 'off'
                            ? 'bg-slate-300'
                            : studentColor
                              ? studentColor.dot
                              : 'bg-brand-500',
                        )}
                        aria-hidden
                      />
                    )
                  })}
                  {daySessions.length > 3 && <span className="text-[9px] leading-none text-slate-400">+</span>}
                </span>
              </button>
            )
          })}
        </div>
      </Card>

      {/* 선택한 날짜의 수업 */}
      <Section
        title={fmtDayHeading(selectedDateISO)}
        action={selectedSessions.length > 0 ? <span className="tabular-nums">{selectedSessions.length}개</span> : undefined}
      >
        {loading ? (
          <SkeletonList rows={2} />
        ) : (
          <Card padded={false}>
            {selectedSessions.length === 0 ? (
              <EmptyState title="이 날 수업이 없어요" className="py-8" />
            ) : (
              selectedSessions.map((s) => {
                const badge = sessionBadge(s, today, nowHHmm)
                const studentName = isAdmin ? studentNameByUid.get(s.studentUid) : null
                const studentColor = isAdmin
                  ? colorForStudent(s.studentUid, studentColorKeyByUid.get(s.studentUid))
                  : null
                const canceled = s.status === 'canceled' || s.status === 'off'
                return (
                  <ListRow
                    key={s.id}
                    onClick={() => setSelected(s)}
                    chevron={false}
                    leading={
                      <span
                        className={cx(
                          'w-1 h-10 rounded-full',
                          studentColor ? studentColor.dot : 'bg-brand-500',
                          canceled && 'opacity-40',
                        )}
                        aria-hidden
                      />
                    }
                    title={
                      <span className={cx(canceled && 'line-through text-slate-400')}>
                        {studentName ? `${studentName} · ` : ''}
                        {s.title}
                      </span>
                    }
                    description={
                      <span className="tabular-nums">
                        {s.startTime}–{s.endTime}
                        {s.location && ` · ${s.location}`}
                      </span>
                    }
                    trailing={<Badge tone={badge.tone}>{badge.label}</Badge>}
                  />
                )
              })
            )}
          </Card>
        )}
      </Section>

      {isAdmin && makeupDeficits.length > 0 && (
        <Section title="보강 필요" description="4주 정산 때 취소된 수업만큼 보강을 넣어야 해요.">
          <Card padded={false}>
            {makeupDeficits.map((row) => (
              <div key={row.uid} className="px-5 py-3.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-[15px] font-semibold text-slate-900">{row.name}</p>
                  <span className="flex items-center gap-1.5">
                    <Badge tone="red">취소 {row.canceled.length}</Badge>
                    <Badge tone="orange">보강 {row.makeup}</Badge>
                    <Badge tone="dark">부족 {row.deficit}</Badge>
                  </span>
                </div>
                <ul className="text-[13px] text-slate-500 space-y-0.5">
                  {row.canceled.slice(0, 5).map((s) => (
                    <li key={s.id} className="tabular-nums">
                      {s.dateISO} {s.startTime}–{s.endTime} · {s.title}
                    </li>
                  ))}
                  {row.canceled.length > 5 && <li className="text-slate-400">… 외 {row.canceled.length - 5}건</li>}
                </ul>
              </div>
            ))}
          </Card>
        </Section>
      )}

      {isAdmin && (
        <BottomSheet
          open={addOpen}
          onClose={() => setAddOpen(false)}
          title="수업 추가"
          dirty={addDirty}
          disabled={addSaving}
        >
          <SessionForm
            value={addForm}
            onChange={setAddForm}
            students={students}
            studentUid={addStudentUid}
            onStudentChange={setAddStudentUid}
            allowRepeat
            onSubmit={handleAdd}
            onCancel={() => setAddOpen(false)}
            submitLabel="등록"
            saving={addSaving}
            error={addError}
          />
        </BottomSheet>
      )}

      {selected && (
        <SessionModal
          session={selected}
          studentName={isAdmin ? (studentNameByUid.get(selected.studentUid) ?? null) : null}
          isAdmin={isAdmin}
          editMode={editMode}
          editForm={editForm}
          editSaving={editSaving}
          editError={editError}
          deleting={deleting}
          onStartEdit={() => {
            setEditForm(fromSession(selected))
            setEditError(null)
            setEditMode(true)
          }}
          onCancelEdit={() => setEditMode(false)}
          onEditFormChange={setEditForm}
          onSaveEdit={handleEdit}
          onDelete={handleDelete}
          onPatch={(patch) => {
            setSessions((prev) => prev.map((x) => (x.id === selected.id ? { ...x, ...patch } : x)))
            setSelected({ ...selected, ...patch })
          }}
          onClose={() => {
            setSelected(null)
            setEditMode(false)
          }}
        />
      )}
    </div>
  )
}

function ChevronIcon({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={dir === 'left' ? 'M15 18l-6-6 6-6' : 'M9 6l6 6-6 6'} />
    </svg>
  )
}

/** 시트 안 정보 한 줄 — 왼쪽 이름표, 오른쪽 값. */
function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-[15px] text-slate-500">{label}</dt>
      <dd className="min-w-0 text-[15px] text-slate-900 text-right whitespace-pre-wrap break-words">{children}</dd>
    </div>
  )
}

function SessionModal({
  session,
  studentName,
  isAdmin,
  editMode,
  editForm,
  editSaving,
  editError,
  deleting,
  onStartEdit,
  onCancelEdit,
  onEditFormChange,
  onSaveEdit,
  onDelete,
  onPatch,
  onClose,
}: {
  session: ClassSession
  studentName: string | null
  isAdmin: boolean
  editMode: boolean
  editForm: SessionFormValues
  editSaving: boolean
  editError: string | null
  deleting: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onEditFormChange: (v: SessionFormValues) => void
  onSaveEdit: (v: SessionFormResult) => Promise<void>
  onDelete: () => Promise<void>
  onPatch: (patch: Partial<ClassSession>) => void
  onClose: () => void
}) {
  const [savingPaid, setSavingPaid] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const dateLabel = (() => {
    const [y, m, d] = session.dateISO.split('-').map((x) => parseInt(x, 10))
    const weekday = new Date(y, m - 1, d).toLocaleDateString('ko-KR', {
      weekday: 'short',
    })
    return `${y}.${pad(m)}.${pad(d)} (${weekday})`
  })()

  async function togglePaid() {
    if (!isAdmin) return
    const next = !session.paid
    setSavingPaid(true)
    setPayError(null)
    try {
      await updateClassSession(session.id, { paid: next })
      onPatch({ paid: next })
    } catch (e) {
      setPayError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSavingPaid(false)
    }
  }

  async function setStatus(next: ClassSessionStatus) {
    if (!isAdmin || next === session.status) return
    setSavingStatus(true)
    setPayError(null)
    try {
      await updateClassSession(session.id, { status: next })
      onPatch({ status: next })
    } catch (e) {
      setPayError(e instanceof Error ? e.message : '상태 변경 실패')
    } finally {
      setSavingStatus(false)
    }
  }

  // ── 수업 기록 (출석 + 일지) ──
  const [attendance, setAttendance] = useState<SessionAttendance | undefined>(
    session.attendance,
  )
  const [lessonContent, setLessonContent] = useState(session.lessonContent ?? '')
  const [feedback, setFeedback] = useState(session.feedback ?? '')
  const [savingRecord, setSavingRecord] = useState(false)
  const [recordSaved, setRecordSaved] = useState(false)

  async function saveRecord() {
    if (!isAdmin) return
    setSavingRecord(true)
    setPayError(null)
    try {
      const patch: Partial<ClassSession> = {
        attendance,
        lessonContent,
        feedback,
      }
      // 기록을 남기면 예정 → 완료로 자동 처리(취소/보강은 그대로).
      const hasRecord =
        !!attendance || !!lessonContent.trim() || !!feedback.trim()
      if (session.status === 'scheduled' && hasRecord) patch.status = 'done'
      await updateClassSession(session.id, patch)
      onPatch(patch)
      setRecordSaved(true)
      toast('수업 기록을 저장했어요')
    } catch (e) {
      setPayError(e instanceof Error ? e.message : '수업 기록 저장 실패')
    } finally {
      setSavingRecord(false)
    }
  }

  const chip = (on: boolean, onTone = 'bg-slate-900 text-white') =>
    cx(
      'pressable h-9 px-3.5 rounded-full text-[13px] font-semibold disabled:opacity-60',
      on ? onTone : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-200',
    )

  return (
    <BottomSheet
      open
      onClose={onClose}
      // 편집 중엔 바깥을 스쳐도 바로 닫히지 않게 한 번 묻는다.
      dirty={editMode}
      disabled={editSaving || deleting}
      title={
        editMode ? (
          '수업 편집'
        ) : (
          <span className="block">
            <Badge tone={STATUS_TONE[session.status]}>{CLASS_SESSION_STATUS_LABEL[session.status]}</Badge>
            <span
              className={cx(
                'block mt-1.5',
                (session.status === 'canceled' || session.status === 'off') && 'line-through text-slate-400',
              )}
            >
              {session.title}
            </span>
          </span>
        )
      }
      footer={
        isAdmin && !editMode ? (
          <>
            <Button variant="dangerSoft" size="lg" onClick={onDelete} loading={deleting}>
              삭제
            </Button>
            <Button variant="secondary" size="lg" block onClick={onStartEdit}>
              편집
            </Button>
          </>
        ) : undefined
      }
    >
      {editMode ? (
        <SessionForm
          value={editForm}
          onChange={onEditFormChange}
          onSubmit={onSaveEdit}
          onCancel={onCancelEdit}
          submitLabel="저장"
          saving={editSaving}
          error={editError}
        />
      ) : (
        <div className="space-y-6">
          <dl>
            {studentName && <InfoRow label="학생">{studentName}</InfoRow>}
            <InfoRow label="날짜">{dateLabel}</InfoRow>
            <InfoRow label="시간">
              <span className="tabular-nums">
                {session.startTime} – {session.endTime}
              </span>
            </InfoRow>
            <InfoRow label="장소">{session.location || '—'}</InfoRow>
            {isAdmin && (
              <InfoRow label="금액">
                <span className="inline-flex items-center gap-3 tabular-nums">
                  {fmtCurrency(session.cost)}
                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-[13px] text-slate-600">
                    <input
                      type="checkbox"
                      checked={!!session.paid}
                      onChange={togglePaid}
                      disabled={savingPaid}
                      className="h-4 w-4 accent-brand-600"
                    />
                    <span className={session.paid ? 'text-brand-700 font-semibold' : ''}>결제 완료</span>
                  </label>
                </span>
              </InfoRow>
            )}
            {session.note && <InfoRow label="메모">{session.note}</InfoRow>}
          </dl>
          {isAdmin && payError && <p className="text-[13px] text-red-500">{payError}</p>}

          {/* 수업 기록: 출석 + 진행내용 + 피드백 */}
          <section className="space-y-3">
            <h3 className="text-[15px] font-bold text-slate-900">수업 기록</h3>
            {isAdmin ? (
              <>
                <div className="flex gap-1.5">
                  {(Object.keys(SESSION_ATTENDANCE_LABEL) as SessionAttendance[]).map((a) => {
                    const on = attendance === a
                    const tone =
                      a === 'present' ? 'bg-brand-600 text-white' : a === 'late' ? 'bg-amber-500 text-white' : 'bg-red-500 text-white'
                    return (
                      <button
                        key={a}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          setAttendance(on ? undefined : a)
                          setRecordSaved(false)
                        }}
                        className={chip(on, tone)}
                      >
                        {SESSION_ATTENDANCE_LABEL[a]}
                      </button>
                    )
                  })}
                </div>
                <Field label="진행 내용">
                  <textarea
                    value={lessonContent}
                    onChange={(e) => {
                      setLessonContent(e.target.value)
                      setRecordSaved(false)
                    }}
                    rows={2}
                    placeholder="오늘 진행한 내용"
                    className={inputClass('h-auto py-3')}
                  />
                </Field>
                <Field label="피드백">
                  <textarea
                    value={feedback}
                    onChange={(e) => {
                      setFeedback(e.target.value)
                      setRecordSaved(false)
                    }}
                    rows={2}
                    placeholder="학생·학부모에게 전할 피드백"
                    className={inputClass('h-auto py-3')}
                  />
                </Field>
                <Button block variant={recordSaved ? 'secondary' : 'primary'} onClick={saveRecord} loading={savingRecord}>
                  {recordSaved ? '저장했어요' : '수업 기록 저장'}
                </Button>
              </>
            ) : isSessionRecorded(session) ? (
              <dl>
                {session.attendance && <InfoRow label="출석">{SESSION_ATTENDANCE_LABEL[session.attendance]}</InfoRow>}
                {session.lessonContent && <InfoRow label="진행">{session.lessonContent}</InfoRow>}
                {session.feedback && <InfoRow label="피드백">{session.feedback}</InfoRow>}
              </dl>
            ) : (
              <p className="text-[14px] text-slate-500">아직 수업 기록이 없어요.</p>
            )}
          </section>

          {isAdmin && (
            <section className="space-y-3">
              <h3 className="text-[15px] font-bold text-slate-900">상태 변경</h3>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(CLASS_SESSION_STATUS_LABEL) as ClassSessionStatus[]).map((stv) => {
                  const active = session.status === stv
                  return (
                    <button
                      key={stv}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setStatus(stv)}
                      disabled={savingStatus || active}
                      className={chip(active)}
                    >
                      {CLASS_SESSION_STATUS_LABEL[stv]}
                    </button>
                  )
                })}
              </div>
              {(session.status === 'done' || session.status === 'makeup') && (
                <p className="text-[13px] text-slate-500">
                  완료·보강 상태면 결제/정산에서 이 수업 금액이 잔액에서 빠져요.
                </p>
              )}
            </section>
          )}
        </div>
      )}
    </BottomSheet>
  )
}
