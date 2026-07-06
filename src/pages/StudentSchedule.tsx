import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/useAuth'
import { listAccounts } from '../lib/account'
import {
  listAllClassSessions,
  listClassSessionsForStudent,
  updateClassSession,
} from '../lib/firestore'
import {
  CLASS_SESSION_STATUS_LABEL,
  type ClassSession,
  type ClassSessionStatus,
  type UserAccount,
} from '../lib/types'

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

/** 학생별 색상 (관리자 뷰용). 색상은 8단계 순환. */
const STUDENT_COLORS = [
  { dot: 'bg-sky-500', badge: 'bg-sky-50 text-sky-700 border-sky-200' },
  { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  { dot: 'bg-violet-500', badge: 'bg-violet-50 text-violet-700 border-violet-200' },
  { dot: 'bg-rose-500', badge: 'bg-rose-50 text-rose-700 border-rose-200' },
  { dot: 'bg-teal-500', badge: 'bg-teal-50 text-teal-700 border-teal-200' },
  { dot: 'bg-indigo-500', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { dot: 'bg-orange-500', badge: 'bg-orange-50 text-orange-700 border-orange-200' },
]

function colorForUid(uid: string): (typeof STUDENT_COLORS)[number] {
  let h = 0
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0
  return STUDENT_COLORS[h % STUDENT_COLORS.length]
}

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

  // 실제로 세션이 있는 학생만 필터 옵션에 노출 (관리자 편의)
  const activeStudentsWithSessions = useMemo(() => {
    const uids = new Set<string>()
    for (const s of sessions) uids.add(s.studentUid)
    return students.filter((s) => uids.has(s.id))
  }, [sessions, students])

  const today = todayISO()

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const total = c.year * 12 + c.monthIndex + delta
      return { year: Math.floor(total / 12), monthIndex: ((total % 12) + 12) % 12 }
    })
  }

  function goToday() {
    const now = new Date()
    setCursor({ year: now.getFullYear(), monthIndex: now.getMonth() })
  }

  const monthLabel = `${cursor.year}년 ${cursor.monthIndex + 1}월`

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          {isAdmin ? '관리' : '나의 학습'}
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
          {isAdmin ? '전체 수업 일정' : '수업 일정'}
        </h1>
        {isAdmin && (
          <p className="text-xs text-slate-500 mt-1">
            학생별로 색상이 구분됩니다. 아래 필터로 특정 학생만 볼 수 있습니다.
          </p>
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
            const color = colorForUid(st.id)
            const count = sessions.filter((s) => s.studentUid === st.id).length
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setFilterUid(st.id)}
                className={`text-xs font-medium rounded-full border px-2.5 py-1 flex items-center gap-1.5 ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900'
                    : `${color.badge} hover:brightness-95`
                }`}
              >
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${color.dot}`}
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
            const dow = i % 7
            return (
              <div
                key={c.iso + i}
                className={`min-h-[70px] sm:min-h-[92px] border-r border-b border-slate-100 p-1 sm:p-1.5 ${
                  c.inMonth ? 'bg-white' : 'bg-slate-50/60'
                } ${i % 7 === 6 ? 'border-r-0' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center justify-center text-[11px] sm:text-xs font-medium h-5 min-w-[1.25rem] px-1 rounded-full ${
                      isToday
                        ? 'bg-slate-900 text-white'
                        : c.inMonth
                          ? dow === 0
                            ? 'text-red-500'
                            : dow === 6
                              ? 'text-sky-600'
                              : 'text-slate-700'
                          : 'text-slate-300'
                    }`}
                  >
                    {c.day}
                  </span>
                </div>
                <div className="mt-1 space-y-0.5">
                  {daySessions.slice(0, 3).map((s) => {
                    const st = STATUS_STYLES[s.status]
                    const studentColor = isAdmin ? colorForUid(s.studentUid) : null
                    const studentName = studentNameByUid.get(s.studentUid)
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelected(s)}
                        className="w-full text-left flex items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-100"
                      >
                        <span
                          className={`shrink-0 inline-block w-1 h-3 sm:h-3.5 rounded-full ${
                            studentColor ? studentColor.dot : st.bar
                          }`}
                          aria-hidden
                        />
                        <span
                          className={`truncate text-[10px] sm:text-[11px] ${st.text}`}
                        >
                          <span className="tabular-nums">{s.startTime}</span>{' '}
                          {isAdmin && studentName && (
                            <span className="font-medium">{studentName}</span>
                          )}
                          <span className="opacity-80">
                            {isAdmin && studentName ? ' · ' : ''}
                            {s.title}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                  {daySessions.length > 3 && (
                    <p className="text-[10px] text-slate-400 pl-2">
                      +{daySessions.length - 3}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {!loading && sessions.length === 0 && (
        <p className="text-xs text-slate-500 text-center">
          등록된 수업이 없습니다.
        </p>
      )}

      {selected && (
        <SessionModal
          session={selected}
          studentName={
            isAdmin ? (studentNameByUid.get(selected.studentUid) ?? null) : null
          }
          isAdmin={isAdmin}
          onPatch={(patch) => {
            setSessions((prev) =>
              prev.map((x) => (x.id === selected.id ? { ...x, ...patch } : x)),
            )
            setSelected({ ...selected, ...patch })
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function SessionModal({
  session,
  studentName,
  isAdmin,
  onPatch,
  onClose,
}: {
  session: ClassSession
  studentName: string | null
  isAdmin: boolean
  onPatch: (patch: Partial<ClassSession>) => void
  onClose: () => void
}) {
  const st = STATUS_STYLES[session.status]
  const [savingPaid, setSavingPaid] = useState(false)
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
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 space-y-3"
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
              {session.title}
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
          <div className="flex gap-2 items-start">
            <dt className="w-14 shrink-0 text-slate-500">금액</dt>
            <dd className="text-slate-900 tabular-nums flex items-center gap-2 flex-wrap">
              <span>{fmtCurrency(session.cost)}</span>
              {isAdmin && (
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={!!session.paid}
                    onChange={togglePaid}
                    disabled={savingPaid}
                    className="h-3.5 w-3.5 accent-emerald-600"
                  />
                  <span
                    className={
                      session.paid ? 'text-emerald-700 font-medium' : 'text-slate-500'
                    }
                  >
                    {savingPaid
                      ? '저장 중…'
                      : session.paid
                        ? '결제 완료'
                        : '미결제'}
                  </span>
                </label>
              )}
            </dd>
          </div>
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
      </div>
    </div>
  )
}
