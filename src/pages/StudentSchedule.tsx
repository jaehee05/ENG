import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  getScheduleToken,
  listClassSessionsForStudent,
} from '../lib/firestore'
import {
  CLASS_SESSION_STATUS_LABEL,
  type ClassSession,
  type ClassSessionStatus,
  type ScheduleToken,
} from '../lib/types'

const KST_TZ = 'Asia/Seoul'

const STATUS_STYLES: Record<
  ClassSessionStatus,
  { bar: string; text: string; badge: string; label: string }
> = {
  scheduled: {
    bar: 'bg-sky-500',
    text: 'text-sky-800',
    badge: 'bg-sky-50 text-sky-700 border-sky-200',
    label: '예정',
  },
  done: {
    bar: 'bg-emerald-500',
    text: 'text-emerald-800',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    label: '완료',
  },
  canceled: {
    bar: 'bg-red-500',
    text: 'text-red-700 line-through',
    badge: 'bg-red-50 text-red-700 border-red-200',
    label: '취소',
  },
  makeup: {
    bar: 'bg-orange-500',
    text: 'text-orange-800',
    badge: 'bg-orange-50 text-orange-700 border-orange-200',
    label: '보강',
  },
}

/** Asia/Seoul 로컬 기준 오늘 날짜 YYYY-MM-DD. */
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

/** 주어진 (year, monthIndex) 로 캘린더 셀 배열 생성. 이전/다음 달 여백 포함, 일요일 시작. */
function buildCalendarCells(
  year: number,
  monthIndex: number,
): { iso: string; day: number; inMonth: boolean }[] {
  const first = new Date(year, monthIndex, 1)
  const firstDow = first.getDay() // 0=Sun
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const cells: { iso: string; day: number; inMonth: boolean }[] = []

  // leading — previous month
  const prevMonthLast = new Date(year, monthIndex, 0).getDate()
  const prevYear = monthIndex === 0 ? year - 1 : year
  const prevMonth = monthIndex === 0 ? 11 : monthIndex - 1
  for (let i = firstDow - 1; i >= 0; i--) {
    const d = prevMonthLast - i
    cells.push({ iso: isoOf(prevYear, prevMonth, d), day: d, inMonth: false })
  }

  // in-month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: isoOf(year, monthIndex, d), day: d, inMonth: true })
  }

  // trailing — next month, fill to multiple of 7
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

export function StudentSchedule() {
  const { token } = useParams<{ token: string }>()
  const [meta, setMeta] = useState<ScheduleToken | null>(null)
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), monthIndex: now.getMonth() }
  })
  const [selected, setSelected] = useState<ClassSession | null>(null)

  useEffect(() => {
    if (!token) {
      setNotFound(true)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const m = await getScheduleToken(token)
        if (!m) {
          if (!cancelled) {
            setNotFound(true)
            setLoading(false)
          }
          return
        }
        const s = await listClassSessionsForStudent(m.studentUid)
        if (cancelled) return
        setMeta(m)
        setSessions(s)
        setLoading(false)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : '불러오기 실패')
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const cells = useMemo(
    () => buildCalendarCells(cursor.year, cursor.monthIndex),
    [cursor],
  )

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, ClassSession[]>()
    for (const s of sessions) {
      const arr = map.get(s.dateISO) ?? []
      arr.push(s)
      map.set(s.dateISO, arr)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.startTime.localeCompare(b.startTime))
    }
    return map
  }, [sessions])

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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 text-sm">
        불러오는 중…
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <p className="text-5xl font-bold text-slate-300 mb-3">404</p>
          <p className="text-slate-700 font-medium mb-1">
            일정을 찾을 수 없습니다
          </p>
          <p className="text-xs text-slate-500">
            링크가 만료되었거나 잘못된 주소입니다.
          </p>
        </div>
      </div>
    )
  }

  if (error || !meta) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 text-center">
        <p className="text-sm text-red-600">{error ?? '오류가 발생했습니다.'}</p>
      </div>
    )
  }

  const monthLabel = `${cursor.year}년 ${cursor.monthIndex + 1}월`

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-3 sm:px-6 py-5 sm:py-8">
        <header className="mb-4 sm:mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            수업 일정
          </p>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">
            {meta.studentName} 학생 수업 일정
          </h1>
        </header>

        <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm">
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
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSelected(s)}
                          className="w-full text-left flex items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-100"
                        >
                          <span
                            className={`shrink-0 inline-block w-1 h-3 sm:h-3.5 rounded-full ${st.bar}`}
                            aria-hidden
                          />
                          <span
                            className={`truncate text-[10px] sm:text-[11px] ${st.text}`}
                          >
                            <span className="tabular-nums">{s.startTime}</span>{' '}
                            <span className="opacity-80">{s.title}</span>
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

        <p className="mt-3 text-[10px] text-slate-400 text-center">
          시간대 기준: 한국 표준시(KST)
        </p>
      </div>

      {selected && (
        <SessionModal
          session={selected}
          hideCost={meta.hideCost}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function SessionModal({
  session,
  hideCost,
  onClose,
}: {
  session: ClassSession
  hideCost: boolean
  onClose: () => void
}) {
  const st = STATUS_STYLES[session.status]
  const dateLabel = (() => {
    const [y, m, d] = session.dateISO.split('-').map((x) => parseInt(x, 10))
    const weekday = new Date(y, m - 1, d).toLocaleDateString('ko-KR', {
      weekday: 'short',
    })
    return `${y}.${pad(m)}.${pad(d)} (${weekday})`
  })()

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
          {!hideCost && (
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 text-slate-500">비용</dt>
              <dd className="text-slate-900 tabular-nums">
                {fmtCurrency(session.cost)}
              </dd>
            </div>
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
