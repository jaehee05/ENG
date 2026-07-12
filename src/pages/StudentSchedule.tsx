import { useEffect, useMemo, useState } from 'react'
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
  EMPTY_SESSION_FORM,
  fromSession,
  SessionForm,
  type SessionFormResult,
  type SessionFormValues,
} from '../components/SessionForm'

const KST_TZ = 'Asia/Seoul'

const STATUS_STYLES: Record<
  ClassSessionStatus,
  { bar: string; text: string; badge: string }
> = {
  scheduled: {
    bar: 'bg-sky-500',
    text: 'text-sky-800',
    badge: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  done: {
    bar: 'bg-emerald-500',
    text: 'text-emerald-800',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  canceled: {
    bar: 'bg-red-500',
    text: 'text-red-700 line-through',
    badge: 'bg-red-50 text-red-700 border-red-200',
  },
  makeup: {
    bar: 'bg-orange-500',
    text: 'text-orange-800',
    badge: 'bg-orange-50 text-orange-700 border-orange-200',
  },
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
): { label: string; cls: string } {
  if (s.status === 'canceled')
    return { label: '취소', cls: 'bg-red-50 text-red-600 border-red-200' }
  if (s.status === 'makeup')
    return { label: '보강', cls: 'bg-orange-50 text-orange-700 border-orange-200' }
  if (s.status === 'done' || isSessionRecorded(s))
    return { label: '완료', cls: 'bg-brand-50 text-brand-700 border-brand-200' }
  const past = s.dateISO < today || (s.dateISO === today && s.endTime < nowHHmm)
  if (past)
    return { label: '기록', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
  return { label: '예정', cls: 'bg-sky-50 text-sky-700 border-sky-200' }
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
      !window.confirm(
        `"${selected.title}" (${selected.dateISO}) 수업을 삭제하시겠습니까?`,
      )
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

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            {isAdmin ? '관리' : '나의 학습'}
          </p>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
            {isAdmin ? '전체 수업 일정' : '수업 일정'}
          </h1>
          {isAdmin && (
            <p className="text-xs text-slate-500 mt-1">
              학생별로 색상이 구분됩니다. 필터·수업 추가·편집·삭제·보강 확인을
              여기서 처리할 수 있습니다.
            </p>
          )}
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              setAddForm(EMPTY_SESSION_FORM)
              setAddStudentUid('')
              setAddError(null)
              setAddOpen(true)
            }}
            className="rounded-md bg-slate-900 text-white text-xs font-medium px-3 py-1.5 hover:bg-slate-800"
          >
            + 수업 추가
          </button>
        )}
      </header>

      {isAdmin && activeStudentsWithSessions.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setFilterUid('all')}
            className={`text-xs font-medium rounded-full border px-2.5 py-1 ${
              filterUid === 'all'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}
          >
            전체 ({sessions.length})
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
                className={`text-xs font-medium rounded-full border px-2.5 py-1 flex items-center gap-1.5 ${
                  active ? color.active : `${color.badge} hover:brightness-95`
                }`}
              >
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${
                    active ? 'bg-white' : color.dot
                  }`}
                  aria-hidden
                />
                {st.displayName} ({count})
              </button>
            )
          })}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-3 sm:px-5 py-3 border-b border-slate-100">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100"
            aria-label="이전 달"
          >
            ‹
          </button>
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-semibold text-slate-900">
              {monthLabel}
            </h2>
            <button
              type="button"
              onClick={goToday}
              className="text-[11px] font-medium text-slate-500 hover:text-slate-900 border border-slate-200 rounded px-2 py-0.5"
            >
              오늘
            </button>
          </div>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100"
            aria-label="다음 달"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 text-center text-[10px] sm:text-xs font-medium text-slate-500 border-b border-slate-100">
          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
            <div
              key={d}
              className={`py-1.5 ${
                i === 0 ? 'text-red-500' : i === 6 ? 'text-sky-500' : ''
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
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
                className={`min-h-[52px] sm:min-h-[64px] border-r border-b border-slate-100 p-1 flex flex-col items-center gap-1 transition ${
                  isSelected
                    ? 'bg-slate-50'
                    : c.inMonth
                      ? 'bg-white hover:bg-slate-50'
                      : 'bg-slate-50/50'
                } ${i % 7 === 6 ? 'border-r-0' : ''}`}
              >
                <span
                  className={`inline-flex items-center justify-center text-[11px] sm:text-xs font-semibold h-6 w-6 rounded-full ${
                    isSelected
                      ? 'bg-brand-600 text-white'
                      : isToday
                        ? 'bg-brand-100 text-brand-700'
                        : c.inMonth
                          ? dow === 0
                            ? 'text-red-500'
                            : dow === 6
                              ? 'text-sky-600'
                              : 'text-slate-700 font-medium'
                          : 'text-slate-300 font-medium'
                  }`}
                >
                  {c.day}
                </span>
                {daySessions.length > 0 && (
                  <span className="flex items-center gap-0.5 h-2">
                    {daySessions.slice(0, 3).map((s) => {
                      const studentColor = isAdmin
                        ? colorForStudent(
                            s.studentUid,
                            studentColorKeyByUid.get(s.studentUid),
                          )
                        : null
                      return (
                        <span
                          key={s.id}
                          className={`inline-block w-1.5 h-1.5 rounded-full ${
                            s.status === 'canceled'
                              ? 'bg-slate-300'
                              : studentColor
                                ? studentColor.dot
                                : 'bg-brand-500'
                          }`}
                          aria-hidden
                        />
                      )
                    })}
                    {daySessions.length > 3 && (
                      <span className="text-[9px] leading-none text-slate-400">
                        +
                      </span>
                    )}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 선택한 날짜의 수업 리스트 */}
      <section className="space-y-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold text-slate-900">
            {fmtDayHeading(selectedDateISO)}
          </h2>
          {selectedSessions.length > 0 && (
            <span className="text-xs text-slate-400">
              {selectedSessions.length}개
            </span>
          )}
        </div>
        {loading ? (
          <p className="text-xs text-slate-400 py-6 text-center">불러오는 중…</p>
        ) : selectedSessions.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center rounded-xl border border-dashed border-slate-200">
            이 날 등록된 수업이 없습니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {selectedSessions.map((s) => {
              const badge = sessionBadge(s, today, nowHHmm)
              const studentName = isAdmin
                ? studentNameByUid.get(s.studentUid)
                : null
              const studentColor = isAdmin
                ? colorForStudent(
                    s.studentUid,
                    studentColorKeyByUid.get(s.studentUid),
                  )
                : null
              const canceled = s.status === 'canceled'
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(s)}
                    className="w-full text-left rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-slate-300 hover:bg-slate-50/60 transition flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex items-stretch gap-3">
                      <span
                        className={`w-1 rounded-full shrink-0 ${
                          studentColor ? studentColor.dot : 'bg-brand-500'
                        } ${canceled ? 'opacity-40' : ''}`}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 tabular-nums">
                          {s.startTime} ~ {s.endTime}
                        </p>
                        <p
                          className={`text-sm font-semibold truncate ${
                            canceled
                              ? 'line-through text-slate-400'
                              : 'text-slate-900'
                          }`}
                        >
                          {studentName ? `${studentName} · ` : ''}
                          {s.title}
                        </p>
                        {s.location && (
                          <p className="text-xs text-slate-400 truncate">
                            {s.location}
                          </p>
                        )}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 inline-block rounded-full text-[10px] font-medium px-2 py-0.5 border ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {isAdmin && makeupDeficits.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-semibold text-slate-900">
              보강 필요
            </h2>
            <span className="text-xs text-slate-500">
              4주 정산 시 취소된 수업만큼 보강 세션을 추가해야 합니다.
            </span>
          </div>
          <ul className="rounded-lg border border-orange-200 bg-orange-50/40 divide-y divide-orange-100">
            {makeupDeficits.map((row) => (
              <li key={row.uid} className="px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-900">
                    {row.name}
                  </p>
                  <span className="text-xs">
                    <span className="text-red-700 font-semibold">
                      취소 {row.canceled.length}
                    </span>
                    <span className="text-slate-400"> · </span>
                    <span className="text-orange-700 font-medium">
                      보강 {row.makeup}
                    </span>
                    <span className="text-slate-400"> · </span>
                    <span className="text-orange-800 font-semibold">
                      부족 {row.deficit}
                    </span>
                  </span>
                </div>
                <ul className="text-[11px] text-slate-600 pl-1 space-y-0.5">
                  {row.canceled.slice(0, 5).map((s) => (
                    <li key={s.id} className="tabular-nums">
                      {s.dateISO} {s.startTime}–{s.endTime} · {s.title}
                    </li>
                  ))}
                  {row.canceled.length > 5 && (
                    <li className="text-slate-400">
                      … 외 {row.canceled.length - 5}건
                    </li>
                  )}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAdmin && addOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm"
          onClick={() => !addSaving && setAddOpen(false)}
        >
          <div
            className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 space-y-3 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-900">수업 추가</h3>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                disabled={addSaving}
                className="text-slate-400 hover:text-slate-900 text-lg leading-none px-1"
              >
                ✕
              </button>
            </div>
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
          </div>
        </div>
      )}

      {selected && (
        <SessionModal
          session={selected}
          studentName={
            isAdmin ? (studentNameByUid.get(selected.studentUid) ?? null) : null
          }
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
            setSessions((prev) =>
              prev.map((x) => (x.id === selected.id ? { ...x, ...patch } : x)),
            )
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
  const st = STATUS_STYLES[session.status]
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
    } catch (e) {
      setPayError(e instanceof Error ? e.message : '수업 기록 저장 실패')
    } finally {
      setSavingRecord(false)
    }
  }

  const recordInputCls =
    'rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm"
      onClick={editMode ? undefined : onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span
              className={`inline-block rounded-full text-[10px] font-medium px-2 py-0.5 border ${st.badge}`}
            >
              {CLASS_SESSION_STATUS_LABEL[session.status]}
            </span>
            <h3 className={`mt-1.5 text-lg font-semibold ${st.text}`}>
              {editMode ? '수업 편집' : session.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-900 text-lg leading-none px-1"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

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
          <>
            <dl className="space-y-2 text-sm">
              {studentName && (
                <div className="flex gap-2">
                  <dt className="w-14 shrink-0 text-slate-500">학생</dt>
                  <dd className="text-slate-900 font-medium">{studentName}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-slate-500">날짜</dt>
                <dd className="text-slate-900">{dateLabel}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-slate-500">시간</dt>
                <dd className="text-slate-900 tabular-nums">
                  {session.startTime} – {session.endTime}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-slate-500">장소</dt>
                <dd className="text-slate-900">{session.location || '—'}</dd>
              </div>
              {isAdmin && (
                <div className="flex gap-2 items-start">
                  <dt className="w-14 shrink-0 text-slate-500">금액</dt>
                  <dd className="text-slate-900 tabular-nums flex items-center gap-2 flex-wrap">
                    <span>{fmtCurrency(session.cost)}</span>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={!!session.paid}
                        onChange={togglePaid}
                        disabled={savingPaid}
                        className="h-3.5 w-3.5 accent-emerald-600"
                      />
                      <span
                        className={
                          session.paid ? 'text-emerald-700 font-medium' : ''
                        }
                      >
                        결제 완료
                      </span>
                      {savingPaid && (
                        <span className="text-slate-400">저장 중…</span>
                      )}
                    </label>
                  </dd>
                </div>
              )}
              {isAdmin && payError && (
                <p className="text-xs text-red-600 pl-16">{payError}</p>
              )}
              {session.note && (
                <div className="flex gap-2">
                  <dt className="w-14 shrink-0 text-slate-500">메모</dt>
                  <dd className="text-slate-900 whitespace-pre-wrap">{session.note}</dd>
                </div>
              )}
            </dl>

            {/* 수업 기록: 출석 + 진행내용 + 피드백 */}
            <div className="pt-2 border-t border-slate-100 space-y-2.5">
              <p className="text-[11px] font-medium text-slate-500">수업 기록</p>
              {isAdmin ? (
                <>
                  <div className="flex gap-1.5">
                    {(Object.keys(SESSION_ATTENDANCE_LABEL) as SessionAttendance[]).map(
                      (a) => {
                        const on = attendance === a
                        const tone =
                          a === 'present'
                            ? 'bg-brand-600 border-brand-600'
                            : a === 'late'
                              ? 'bg-amber-500 border-amber-500'
                              : 'bg-red-500 border-red-500'
                        return (
                          <button
                            key={a}
                            type="button"
                            onClick={() => {
                              setAttendance(on ? undefined : a)
                              setRecordSaved(false)
                            }}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium border transition ${
                              on
                                ? `${tone} text-white`
                                : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {SESSION_ATTENDANCE_LABEL[a]}
                          </button>
                        )
                      },
                    )}
                  </div>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-slate-500">진행 내용</span>
                    <textarea
                      value={lessonContent}
                      onChange={(e) => {
                        setLessonContent(e.target.value)
                        setRecordSaved(false)
                      }}
                      rows={2}
                      placeholder="오늘 진행한 내용"
                      className={recordInputCls}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-slate-500">피드백</span>
                    <textarea
                      value={feedback}
                      onChange={(e) => {
                        setFeedback(e.target.value)
                        setRecordSaved(false)
                      }}
                      rows={2}
                      placeholder="학생·학부모에게 전할 피드백"
                      className={recordInputCls}
                    />
                  </label>
                  <div className="flex items-center justify-end gap-2">
                    {recordSaved && (
                      <span className="text-[11px] text-brand-600">저장됨 ✓</span>
                    )}
                    <button
                      type="button"
                      onClick={saveRecord}
                      disabled={savingRecord}
                      className="rounded-md bg-brand-600 text-white text-xs font-medium px-3 py-1.5 hover:bg-brand-700 disabled:opacity-50"
                    >
                      {savingRecord ? '저장 중…' : '수업 기록 저장'}
                    </button>
                  </div>
                </>
              ) : isSessionRecorded(session) ? (
                <dl className="space-y-1.5 text-sm">
                  {session.attendance && (
                    <div className="flex gap-2">
                      <dt className="w-14 shrink-0 text-slate-500">출석</dt>
                      <dd className="text-slate-900">
                        {SESSION_ATTENDANCE_LABEL[session.attendance]}
                      </dd>
                    </div>
                  )}
                  {session.lessonContent && (
                    <div className="flex gap-2">
                      <dt className="w-14 shrink-0 text-slate-500">진행</dt>
                      <dd className="text-slate-900 whitespace-pre-wrap">
                        {session.lessonContent}
                      </dd>
                    </div>
                  )}
                  {session.feedback && (
                    <div className="flex gap-2">
                      <dt className="w-14 shrink-0 text-slate-500">피드백</dt>
                      <dd className="text-slate-900 whitespace-pre-wrap">
                        {session.feedback}
                      </dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="text-xs text-slate-400">아직 수업 기록이 없습니다.</p>
              )}
            </div>

            {isAdmin && (
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[11px] font-medium text-slate-500 mb-1.5">
                  상태 변경
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(CLASS_SESSION_STATUS_LABEL) as ClassSessionStatus[]).map(
                    (stv) => {
                      const active = session.status === stv
                      return (
                        <button
                          key={stv}
                          type="button"
                          onClick={() => setStatus(stv)}
                          disabled={savingStatus || active}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium border transition disabled:opacity-60 ${
                            active
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {CLASS_SESSION_STATUS_LABEL[stv]}
                        </button>
                      )
                    },
                  )}
                </div>
                {(session.status === 'done' || session.status === 'makeup') && (
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    완료·보강 상태이면 결제/정산에서 이 수업 금액이 잔액에서 차감됩니다.
                  </p>
                )}
              </div>
            )}
            {isAdmin && (
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={deleting}
                  className="text-xs text-slate-400 hover:text-red-600 px-2 py-1 disabled:opacity-50"
                >
                  {deleting ? '삭제 중…' : '삭제'}
                </button>
                <button
                  type="button"
                  onClick={onStartEdit}
                  className="rounded-md border border-slate-300 text-slate-700 text-xs font-medium px-3 py-1.5 hover:bg-slate-50"
                >
                  편집
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
