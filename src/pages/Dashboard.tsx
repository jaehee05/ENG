import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  formatDate,
  listAssignmentsForStudent,
  listAttemptsForUser,
} from '../lib/firestore'
import type { Assignment, AssignmentType } from '../lib/types'

const iconCls = 'h-6 w-6'
const iconProps = {
  fill: 'none' as const,
  viewBox: '0 0 24 24',
  strokeWidth: 1.8,
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const VocabIcon = (
  <svg className={iconCls} {...iconProps}>
    <path d="M9 5h6a2 2 0 0 1 2 2v12l-5-2-5 2V7a2 2 0 0 1 2-2Z" />
    <path d="M9 9h6M9 12h4" />
  </svg>
)

const ReadingIcon = (
  <svg className={iconCls} {...iconProps}>
    <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4H10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4.5A1.5 1.5 0 0 1 3 16.5v-11Z" />
    <path d="M21 5.5A1.5 1.5 0 0 0 19.5 4H14a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h5.5a1.5 1.5 0 0 0 1.5-1.5v-11Z" />
  </svg>
)

const WordbookIcon = (
  <svg className={iconCls} {...iconProps}>
    <path d="M6 4h11a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2Z" />
    <path d="M9 9h7" />
  </svg>
)

const HistoryIcon = (
  <svg className={iconCls} {...iconProps}>
    <path d="M3 12a9 9 0 1 0 3.4-7.04" />
    <path d="M3 4v5h5" />
    <path d="M12 8v4l3 2" />
  </svg>
)

interface Card {
  to: string
  title: string
  icon: ReactNode
  gradient: string
  ring: string
}

const cards: Card[] = [
  {
    to: '/vocab',
    title: '단어 시험지',
    icon: VocabIcon,
    gradient: 'from-brand-500 to-brand-500',
    ring: 'group-hover:ring-brand-200',
  },
  {
    to: '/reading',
    title: '지문 문제풀이',
    icon: ReadingIcon,
    gradient: 'from-brand-500 to-brand-700',
    ring: 'group-hover:ring-brand-200',
  },
  {
    to: '/wordbook',
    title: '내 단어장',
    icon: WordbookIcon,
    gradient: 'from-brand-500 to-brand-500',
    ring: 'group-hover:ring-brand-200',
  },
  {
    to: '/history',
    title: '내 기록',
    icon: HistoryIcon,
    gradient: 'from-brand-500 to-brand-700',
    ring: 'group-hover:ring-brand-200',
  },
]

function assignmentPath(a: Assignment): string {
  return a.type === 'vocab' ? `/vocab/${a.refId}` : `/reading/${a.refId}`
}

function isOverdue(a: Assignment): boolean {
  if (!a.dueAt) return false
  return a.dueAt.toMillis() < Date.now()
}

export function Dashboard() {
  const { profile } = useAuth()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [completedKeys, setCompletedKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!profile) return
    Promise.all([
      listAssignmentsForStudent(profile.id),
      listAttemptsForUser(profile.id),
    ])
      .then(([asn, atts]) => {
        setAssignments(asn)
        const keys = new Set<string>()
        for (const a of atts) {
          if (a.refId && (a.type === 'vocab' || a.type === 'reading')) {
            keys.add(`${a.type}:${a.refId}`)
          }
        }
        setCompletedKeys(keys)
      })
      .catch(() => {
        // dashboard 보조 정보. 실패해도 카드는 보여야 함
      })
  }, [profile])

  const open = useMemo(
    () =>
      assignments
        .filter((a) => !completedKeys.has(`${a.type as AssignmentType}:${a.refId}`))
        .sort((a, b) => {
          const ad = a.dueAt?.toMillis() ?? Infinity
          const bd = b.dueAt?.toMillis() ?? Infinity
          return ad - bd
        }),
    [assignments, completedKeys],
  )

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 6) return '늦었어요'
    if (h < 12) return '좋은 아침이에요'
    if (h < 18) return '좋은 오후예요'
    return '좋은 저녁이에요'
  })()

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-700 p-8 sm:p-10 text-white shadow-lift">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -left-10 -bottom-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <p className="relative text-xs uppercase tracking-[0.18em] text-white/70">
          {greeting}
        </p>
        <h1 className="relative mt-3 text-3xl sm:text-4xl font-bold leading-tight">
          {profile?.displayName}님,<br className="sm:hidden" /> 오늘도 한 걸음 더.
        </h1>
      </section>

      {open.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-slate-900">내 과제</h2>
            <span className="text-xs text-slate-500">미완료 {open.length}건</span>
          </div>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
            {open.map((a) => {
              const overdue = isOverdue(a)
              return (
                <li key={a.id}>
                  <Link
                    to={assignmentPath(a)}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-block rounded bg-brand-50 text-brand-700 text-xs font-medium px-2 py-0.5">
                          {a.type === 'vocab' ? '단어 시험지' : '지문'}
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
                    <span className="text-slate-300 text-xl shrink-0">→</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map((c) => (
            <Link
              key={c.to}
              to={c.to}
              className="group relative block rounded-2xl border border-slate-200 bg-white p-6 shadow-soft hover:shadow-lift hover:-translate-y-0.5 transition-all"
            >
              <div
                className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${c.gradient} text-white shadow-md ring-4 ring-white ${c.ring}`}
              >
                {c.icon}
              </div>
              <h2 className="mt-5 text-lg font-semibold text-slate-900">{c.title}</h2>
              <span className="absolute bottom-6 right-6 text-slate-300 group-hover:text-slate-900 transition text-xl">
                →
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
