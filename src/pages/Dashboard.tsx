import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  formatDate,
  isAssignmentDone,
  listAnnouncements,
  listAssignmentsForStudent,
  listAttemptsForUser,
  listClassSessionsForStudent,
  listPaymentsForStudent,
} from '../lib/firestore'
import { accountSubjects, isAssignmentVisibleToStudent } from '../lib/types'
import { computeStudentBalance, fmtDateLabel, todayISO } from '../lib/payments'
import type { Announcement, Assignment, Attempt, ClassSession } from '../lib/types'

interface ShortcutCard {
  to: string
  title: string
  desc: string
  icon: ReactNode
}

const sIcon = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const shortcuts: ShortcutCard[] = [
  {
    to: '/reading',
    title: '지문 문제풀이',
    desc: '오늘 풀 지문',
    icon: (
      <svg {...sIcon}>
        <path d="M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2V5Z" />
        <path d="M20 5a2 2 0 0 0-2-2h-5v18h5a2 2 0 0 0 2-2V5Z" />
      </svg>
    ),
  },
  {
    to: '/vocab',
    title: '단어 시험지',
    desc: 'DAY 단위 시험',
    icon: (
      <svg {...sIcon}>
        <path d="M9 4h6a2 2 0 0 1 2 2v14l-5-2-5 2V6a2 2 0 0 1 2-2Z" />
        <path d="M9 8h6M9 11h4" />
      </svg>
    ),
  },
  {
    to: '/wordbook',
    title: '내 단어장',
    desc: '모은 단어 복습',
    icon: (
      <svg {...sIcon}>
        <path d="M5 3h11a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2Z" />
      </svg>
    ),
  },
  {
    to: '/history',
    title: '내 기록',
    desc: '지난 시험 점수',
    icon: (
      <svg {...sIcon}>
        <path d="M3 12a9 9 0 1 0 3.4-7.04" />
        <path d="M3 4v5h5" />
        <path d="M12 8v4l3 2" />
      </svg>
    ),
  },
]

function assignmentPath(a: Assignment): string | null {
  if (a.type === 'vocab') return `/vocab/${a.refId}`
  if (a.type === 'reading') return `/reading/${a.refId}`
  return null
}

function assignmentLabel(a: Assignment): string {
  if (a.type === 'vocab') return '단어 시험지'
  if (a.type === 'reading') return '지문'
  return '외부 과제'
}

function isOverdue(a: Assignment): boolean {
  if (!a.dueAt) return false
  return a.dueAt.toMillis() < Date.now()
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** KST 현재 시각 'HH:mm'. */
function nowHHmmKST(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date())
}

/** 오늘 이후(진행 중 포함)의 가장 가까운 예정·보강 수업. 없으면 null. */
function pickNextSession(sessions: ClassSession[]): ClassSession | null {
  const today = todayISO()
  const now = nowHHmmKST()
  const upcoming = sessions
    .filter(
      (s) =>
        (s.status === 'scheduled' || s.status === 'makeup') &&
        (s.dateISO > today || (s.dateISO === today && s.endTime >= now)),
    )
    .sort(
      (a, b) =>
        a.dateISO.localeCompare(b.dateISO) ||
        a.startTime.localeCompare(b.startTime),
    )
  return upcoming[0] ?? null
}

/** 'YYYY-MM-DD' → 'M월 D일 (요일)'. */
function fmtWhenLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()]
  return `${m}월 ${d}일 (${wd})`
}

const TITLE_RE = /^(.+?)\s+(\d+(?:-\d+)?)\s*(?:번|문제)?\s*$/

function parseTitle(title: string): { category: string; tag: string } | null {
  const m = TITLE_RE.exec(title.trim())
  if (!m) return null
  return { category: m[1].trim(), tag: m[2] }
}

type OpenItem =
  | { kind: 'single'; a: Assignment; sortKey: number }
  | { kind: 'group'; category: string; items: Assignment[]; sortKey: number }

export function Dashboard() {
  const { profile } = useAuth()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [topAnnouncement, setTopAnnouncement] = useState<Announcement | null>(
    null,
  )
  // 학생 본인의 다음 결제 필요일(없으면 null → 표시 안 함).
  const [dueDateISO, setDueDateISO] = useState<string | null>(null)
  // 학생 본인의 다음(진행 중 포함) 수업(없으면 null → 표시 안 함).
  const [nextSession, setNextSession] = useState<ClassSession | null>(null)

  // 국어만 수강하는 학생: 홈은 보여주되 '학습' 바로가기(지문·단어 등)는 숨기고
  // 과제 리스트를 메인으로 둔다.
  const koreanOnly =
    !!profile &&
    profile.role === 'student' &&
    (() => {
      const s = accountSubjects(profile)
      return s.korean && !s.english
    })()


  useEffect(() => {
    if (!profile) return
    Promise.all([
      listAssignmentsForStudent(profile.id),
      listAttemptsForUser(profile.id),
      listAnnouncements(),
    ])
      .then(([asn, atts, ann]) => {
        setAssignments(asn.filter((a) => isAssignmentVisibleToStudent(a)))
        setAttempts(atts)
        const sorted = [...ann].sort((a, b) => {
          if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1
          return (
            (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)
          )
        })
        setTopAnnouncement(sorted[0] ?? null)
      })
      .catch(() => {
        // dashboard 보조 정보. 실패해도 카드는 보여야 함
      })
  }, [profile])

  useEffect(() => {
    if (!profile || profile.role !== 'student') return
    let alive = true
    Promise.all([
      listPaymentsForStudent(profile.id),
      listClassSessionsForStudent(profile.id),
    ])
      .then(([pays, sess]) => {
        if (!alive) return
        setDueDateISO(computeStudentBalance(pays, sess, todayISO()).dueDateISO)
        setNextSession(pickNextSession(sess))
      })
      .catch(() => {
        // 결제 정보는 보조. 실패해도 대시보드는 유지.
      })
    return () => {
      alive = false
    }
  }, [profile])

  const openRaw = useMemo(
    () => assignments.filter((a) => !isAssignmentDone(a, attempts)),
    [assignments, attempts],
  )

  const openItems = useMemo<OpenItem[]>(() => {
    const items: OpenItem[] = []
    const groups = new Map<string, Assignment[]>()

    for (const a of openRaw) {
      if (a.type !== 'reading') {
        items.push({
          kind: 'single',
          a,
          sortKey: a.dueAt?.toMillis() ?? Infinity,
        })
        continue
      }
      const parsed = parseTitle(a.refTitle)
      if (!parsed) {
        items.push({
          kind: 'single',
          a,
          sortKey: a.dueAt?.toMillis() ?? Infinity,
        })
        continue
      }
      if (!groups.has(parsed.category)) groups.set(parsed.category, [])
      groups.get(parsed.category)!.push(a)
    }

    for (const [category, list] of groups) {
      if (list.length === 1) {
        const a = list[0]
        items.push({
          kind: 'single',
          a,
          sortKey: a.dueAt?.toMillis() ?? Infinity,
        })
        continue
      }
      const minDue = Math.min(
        ...list.map((a) => a.dueAt?.toMillis() ?? Infinity),
      )
      const sortedItems = [...list].sort((x, y) => {
        const xn = parseTitle(x.refTitle)?.tag ?? ''
        const yn = parseTitle(y.refTitle)?.tag ?? ''
        return xn.localeCompare(yn, 'ko', { numeric: true })
      })
      items.push({
        kind: 'group',
        category,
        items: sortedItems,
        sortKey: minDue,
      })
    }
    return items.sort((a, b) => a.sortKey - b.sortKey)
  }, [openRaw])

  const totalOpen = openRaw.length
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  function toggleExpanded(category: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 6) return '늦었어요'
    if (h < 12) return '좋은 아침이에요'
    if (h < 18) return '좋은 오후예요'
    return '좋은 저녁이에요'
  })()

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs text-slate-500 mb-1">{greeting}</p>
        <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
          <h1 className="text-2xl sm:text-[28px] font-semibold text-slate-900 tracking-tight">
            {profile?.displayName}님
          </h1>
          {dueDateISO && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 text-amber-700 text-xs font-medium px-2 py-0.5">
              다음 결제 {fmtDateLabel(dueDateISO)}
            </span>
          )}
        </div>
        {totalOpen > 0 ? (
          <p className="text-sm text-slate-500 mt-1.5">
            오늘 끝낼 과제가{' '}
            <span className="text-slate-900 font-medium">{totalOpen}건</span>{' '}
            남았어요.
          </p>
        ) : (
          <p className="text-sm text-slate-500 mt-1.5">
            오늘 부여된 과제가 없어요. 자유 학습 시간.
          </p>
        )}
      </section>

      {topAnnouncement && (
        <Link
          to="/notice"
          className="block rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-slate-300 hover:bg-slate-50/60 transition"
        >
          <div className="flex items-center gap-2 mb-1">
            {topAnnouncement.pinned && (
              <span className="inline-block rounded bg-amber-50 text-amber-700 text-[10px] font-medium px-1.5 py-0.5 border border-amber-200">
                📌
              </span>
            )}
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              공지
            </span>
          </div>
          <p className="text-[15px] font-semibold text-slate-900 truncate">
            {topAnnouncement.title}
          </p>
          {topAnnouncement.body && (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
              {topAnnouncement.body}
            </p>
          )}
        </Link>
      )}

      {nextSession && (
        <Link
          to="/schedule"
          className="block rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-slate-300 hover:bg-slate-50/60 transition"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              다음 수업
            </span>
            {nextSession.status === 'makeup' && (
              <span className="inline-block rounded bg-orange-50 text-orange-700 text-[10px] font-medium px-1.5 py-0.5 border border-orange-200">
                보강
              </span>
            )}
          </div>
          <p className="text-[15px] font-semibold text-slate-900 truncate">
            {nextSession.title}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-0.5">
            <span className="text-slate-700 font-medium">
              {fmtWhenLabel(nextSession.dateISO)}
            </span>
            <span className="tabular-nums">
              {nextSession.startTime}–{nextSession.endTime}
            </span>
            {nextSession.location && <span>· {nextSession.location}</span>}
          </div>
        </Link>
      )}

      {totalOpen > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wider">
              내 과제
            </h2>
            <span className="text-xs text-slate-500">{totalOpen}건</span>
          </div>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white overflow-hidden">
            {openItems.map((item) => {
              if (item.kind === 'single') {
                const a = item.a
                const overdue = isOverdue(a)
                const path = assignmentPath(a)
                const body = (
                  <>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-block rounded bg-brand-50 text-brand-700 text-xs font-medium px-2 py-0.5">
                          {assignmentLabel(a)}
                        </span>
                        <span className="text-sm font-semibold text-slate-900 truncate">
                          {a.refTitle}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-1">
                        {a.dueAt && (
                          <span className={overdue ? 'text-red-600 font-medium' : ''}>
                            마감: {formatDate(a.dueAt)}
                            {overdue && ' (지남)'}
                          </span>
                        )}
                        {a.note && <span className="text-slate-600">· {a.note}</span>}
                      </div>
                    </div>
                    <span className="text-slate-300 text-xl shrink-0">
                      {path ? '→' : ''}
                    </span>
                  </>
                )
                return (
                  <li key={a.id}>
                    {path ? (
                      <Link
                        to={path}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="flex items-center justify-between gap-3 px-4 py-3">
                        {body}
                      </div>
                    )}
                  </li>
                )
              }
              // group
              const isOpen = expanded.has(item.category)
              const overdueCount = item.items.filter(isOverdue).length
              const earliest = item.items
                .filter((a) => a.dueAt)
                .sort((a, b) => (a.dueAt!.toMillis() - b.dueAt!.toMillis()))[0]
              return (
                <li key={`g-${item.category}`}>
                  <button
                    type="button"
                    onClick={() => toggleExpanded(item.category)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-block rounded bg-brand-50 text-brand-700 text-xs font-medium px-2 py-0.5">
                          지문 묶음
                        </span>
                        <span className="text-sm font-semibold text-slate-900 truncate">
                          {item.category}
                        </span>
                        <span className="text-xs text-slate-500">
                          ({item.items.length}개)
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-1">
                        {earliest && (
                          <span
                            className={
                              isOverdue(earliest) ? 'text-red-600 font-medium' : ''
                            }
                          >
                            가장 빠른 마감: {formatDate(earliest.dueAt)}
                          </span>
                        )}
                        {overdueCount > 0 && (
                          <span className="text-red-600">
                            지난 과제 {overdueCount}건
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-slate-400 text-base shrink-0">
                      {isOpen ? '▴' : '▾'}
                    </span>
                  </button>
                  {isOpen && (
                    <ul className="divide-y divide-slate-100 bg-slate-50/60 border-t border-slate-100">
                      {item.items.map((a) => {
                        const overdue = isOverdue(a)
                        const parsed = parseTitle(a.refTitle)
                        const label = parsed ? `${parsed.tag}번` : a.refTitle
                        return (
                          <li key={a.id}>
                            <Link
                              to={assignmentPath(a) ?? '#'}
                              className="flex items-center justify-between gap-3 pl-10 pr-4 py-2.5 hover:bg-white"
                            >
                              <div className="min-w-0">
                                <span className="text-sm text-slate-900">
                                  {label}
                                </span>
                                {a.dueAt && (
                                  <span
                                    className={`ml-3 text-xs ${overdue ? 'text-red-600' : 'text-slate-500'}`}
                                  >
                                    마감: {formatDate(a.dueAt)}
                                    {overdue && ' (지남)'}
                                  </span>
                                )}
                                {a.note && (
                                  <span className="ml-3 text-xs text-slate-500">
                                    · {a.note}
                                  </span>
                                )}
                              </div>
                              <span className="text-slate-300 text-base shrink-0">→</span>
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {!koreanOnly && (
        <section className="space-y-2.5">
          <h2 className="text-[13px] font-semibold text-slate-900 uppercase tracking-wider">
            학습
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {shortcuts.map((c) => (
              <Link
                key={c.to}
                to={c.to}
                className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300 hover:bg-slate-50/60 transition"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                  {c.icon}
                </span>
                <p className="mt-3 text-[15px] font-semibold text-slate-900">
                  {c.title}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{c.desc}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
