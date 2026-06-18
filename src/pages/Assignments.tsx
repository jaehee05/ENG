import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  formatDate,
  isAssignmentDone,
  listAssignmentsForStudent,
  listAttemptsForUser,
} from '../lib/firestore'
import type { Assignment, Attempt } from '../lib/types'

const TITLE_RE = /^(.+?)\s+(\d+(?:-\d+)?)\s*(?:번|문제)?\s*$/

function parseTitle(title: string): { category: string; tag: string } | null {
  const m = TITLE_RE.exec(title.trim())
  if (!m) return null
  return { category: m[1].trim(), tag: m[2] }
}

function assignmentPath(a: Assignment): string | null {
  if (a.type === 'vocab') return `/vocab/${a.refId}`
  if (a.type === 'reading') return `/reading/${a.refId}`
  return null
}

function assignmentLabel(a: Assignment): string {
  if (a.type === 'vocab') return '단어'
  if (a.type === 'reading') return '지문'
  return '외부'
}

function isOverdue(a: Assignment): boolean {
  if (!a.dueAt) return false
  return a.dueAt.toMillis() < Date.now()
}

type Tab = 'open' | 'done' | 'all'

interface SingleItem {
  kind: 'single'
  a: Assignment
  sortKey: number
}
interface GroupItem {
  kind: 'group'
  category: string
  items: Assignment[]
  sortKey: number
}
type Item = SingleItem | GroupItem

function buildItems(list: Assignment[]): Item[] {
  const items: Item[] = []
  const groups = new Map<string, Assignment[]>()
  for (const a of list) {
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
  for (const [category, sub] of groups) {
    if (sub.length === 1) {
      const a = sub[0]
      items.push({
        kind: 'single',
        a,
        sortKey: a.dueAt?.toMillis() ?? Infinity,
      })
      continue
    }
    const minDue = Math.min(...sub.map((a) => a.dueAt?.toMillis() ?? Infinity))
    const sorted = [...sub].sort((x, y) => {
      const xn = parseTitle(x.refTitle)?.tag ?? ''
      const yn = parseTitle(y.refTitle)?.tag ?? ''
      return xn.localeCompare(yn, 'ko', { numeric: true })
    })
    items.push({
      kind: 'group',
      category,
      items: sorted,
      sortKey: minDue,
    })
  }
  return items.sort((a, b) => a.sortKey - b.sortKey)
}

export function Assignments() {
  const { profile } = useAuth()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('open')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    Promise.all([
      listAssignmentsForStudent(profile.id),
      listAttemptsForUser(profile.id),
    ])
      .then(([asn, atts]) => {
        if (cancelled) return
        setAssignments(asn)
        setAttempts(atts)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [profile])

  function toggle(category: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  const open = useMemo(
    () => assignments.filter((a) => !isAssignmentDone(a, attempts)),
    [assignments, attempts],
  )
  const done = useMemo(
    () => assignments.filter((a) => isAssignmentDone(a, attempts)),
    [assignments, attempts],
  )

  const visible = tab === 'open' ? open : tab === 'done' ? done : assignments
  const items = useMemo(() => buildItems(visible), [visible])

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          나의 학습
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
          과제
        </h1>
        {!loading && (
          <p className="text-xs text-slate-500 mt-1">
            미완료 {open.length} · 완료 {done.length}
          </p>
        )}
      </header>

      <div className="flex items-center gap-1 text-xs">
        {(['open', 'done', 'all'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-full transition ${
              tab === k
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {k === 'open' ? '미완료' : k === 'done' ? '완료' : '전체'}
            <span className="ml-1 text-[10px] opacity-70">
              {k === 'open'
                ? open.length
                : k === 'done'
                  ? done.length
                  : assignments.length}
            </span>
          </button>
        ))}
      </div>

      {loading && <p className="text-slate-500 text-sm">불러오는 중…</p>}
      {!loading && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {tab === 'open'
            ? '미완료 과제가 없어요. 잘 하고 있어요!'
            : tab === 'done'
              ? '완료한 과제가 아직 없어요.'
              : '부여된 과제가 없어요.'}
        </div>
      )}

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white overflow-hidden">
        {items.map((item) => {
          if (item.kind === 'single') {
            const a = item.a
            const overdue = isOverdue(a)
            const path = assignmentPath(a)
            const done = isAssignmentDone(a, attempts)
            const body = (
              <>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-block rounded text-[10px] font-medium px-1.5 py-0.5 ${
                        done
                          ? 'bg-brand-50 text-brand-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {assignmentLabel(a)} {done ? '· 완료' : ''}
                    </span>
                    <span className="text-sm font-medium text-slate-900 truncate">
                      {a.refTitle}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 text-[11px] text-slate-500 mt-1">
                    {a.dueAt && (
                      <span className={overdue && !done ? 'text-red-600 font-medium' : ''}>
                        마감 {formatDate(a.dueAt)}
                        {overdue && !done && ' (지남)'}
                      </span>
                    )}
                    {a.note && <span className="text-slate-600">· {a.note}</span>}
                  </div>
                </div>
                <span className="text-slate-300 text-lg shrink-0">
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
          const isOpen = expanded.has(item.category)
          const overdueCount = item.items.filter(isOverdue).length
          const doneInGroup = item.items.filter((a) =>
            isAssignmentDone(a, attempts),
          ).length
          return (
            <li key={`g-${item.category}`}>
              <button
                type="button"
                onClick={() => toggle(item.category)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 text-left"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-block rounded bg-slate-100 text-slate-600 text-[10px] font-medium px-1.5 py-0.5">
                      지문 묶음
                    </span>
                    <span className="text-sm font-medium text-slate-900 truncate">
                      {item.category}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {doneInGroup}/{item.items.length}
                    </span>
                  </div>
                  {overdueCount > 0 && (
                    <p className="text-[11px] text-red-600 mt-1">
                      지난 과제 {overdueCount}건
                    </p>
                  )}
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
                    const doneA = isAssignmentDone(a, attempts)
                    return (
                      <li key={a.id}>
                        <Link
                          to={assignmentPath(a) ?? '#'}
                          className="flex items-center justify-between gap-3 pl-10 pr-4 py-2.5 hover:bg-white"
                        >
                          <div className="min-w-0 flex items-center gap-2">
                            <span className="text-sm text-slate-900">
                              {label}
                            </span>
                            {doneA && (
                              <span className="text-[10px] text-brand-700">
                                ✓
                              </span>
                            )}
                            {a.dueAt && (
                              <span
                                className={`text-[11px] ${overdue && !doneA ? 'text-red-600' : 'text-slate-500'}`}
                              >
                                마감 {formatDate(a.dueAt)}
                              </span>
                            )}
                          </div>
                          <span className="text-slate-300 text-base shrink-0">
                            →
                          </span>
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
    </div>
  )
}
