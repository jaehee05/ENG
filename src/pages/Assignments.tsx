import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  addTodo,
  deleteTodo,
  formatDate,
  isAssignmentDone,
  listAssignmentsForStudent,
  listAttemptsForUser,
  listTodosForStudent,
  setTodoDone,
} from '../lib/firestore'
import {
  assignmentCategory,
  type Assignment,
  type AssignmentCategory,
  type Attempt,
  type PersonalTodo,
} from '../lib/types'

function assignmentPath(a: Assignment): string | null {
  if (a.type === 'vocab') return `/vocab/${a.refId}`
  if (a.type === 'reading') return `/reading/${a.refId}`
  return null
}

function isOverdue(a: Assignment): boolean {
  if (!a.dueAt) return false
  return a.dueAt.toMillis() < Date.now()
}

interface CategoryMeta {
  key: AssignmentCategory
  label: string
  dot: string
  ring: string
}

// 표시 순서: 문제 풀이 → 단어 시험 → 모의고사 → 기타
const CATEGORIES: CategoryMeta[] = [
  { key: 'problem', label: '문제 풀이', dot: 'bg-sky-500', ring: 'border-sky-500 text-sky-600' },
  { key: 'vocab', label: '단어 시험', dot: 'bg-violet-500', ring: 'border-violet-500 text-violet-600' },
  { key: 'mock', label: '모의고사', dot: 'bg-rose-500', ring: 'border-rose-500 text-rose-600' },
  { key: 'etc', label: '기타', dot: 'bg-emerald-500', ring: 'border-emerald-500 text-emerald-600' },
]

/** Todomate 스타일 동그란 체크 표시. */
function CheckCircle({
  done,
  meta,
  onToggle,
}: {
  done: boolean
  meta: CategoryMeta
  onToggle?: () => void
}) {
  const cls = `shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition ${
    done ? `${meta.dot} border-transparent text-white` : `bg-white ${meta.ring}`
  }`
  const check = (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12l5 5L20 6" />
    </svg>
  )
  if (onToggle) {
    return (
      <button type="button" onClick={onToggle} className={cls} aria-label={done ? '완료 취소' : '완료'}>
        {done && check}
      </button>
    )
  }
  return (
    <span className={cls} aria-hidden>
      {done && check}
    </span>
  )
}

export function Assignments() {
  const { profile } = useAuth()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [todos, setTodos] = useState<PersonalTodo[]>([])
  const [loading, setLoading] = useState(true)
  const [newTodo, setNewTodo] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    Promise.all([
      listAssignmentsForStudent(profile.id),
      listAttemptsForUser(profile.id),
      listTodosForStudent(profile.id),
    ])
      .then(([asn, atts, tds]) => {
        if (cancelled) return
        setAssignments(asn)
        setAttempts(atts)
        setTodos(tds)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [profile])

  // 분류별로 과제 묶기
  const byCategory = useMemo(() => {
    const map: Record<AssignmentCategory, Assignment[]> = {
      problem: [],
      vocab: [],
      mock: [],
      etc: [],
    }
    for (const a of assignments) map[assignmentCategory(a)].push(a)
    const sortFn = (x: Assignment, y: Assignment) => {
      const dx = isAssignmentDone(x, attempts) ? 1 : 0
      const dy = isAssignmentDone(y, attempts) ? 1 : 0
      if (dx !== dy) return dx - dy // 미완료 먼저
      const tx = x.dueAt?.toMillis() ?? Infinity
      const ty = y.dueAt?.toMillis() ?? Infinity
      if (tx !== ty) return tx - ty
      return x.refTitle.localeCompare(y.refTitle, 'ko', { numeric: true })
    }
    for (const k of Object.keys(map) as AssignmentCategory[]) map[k].sort(sortFn)
    return map
  }, [assignments, attempts])

  const totalOpen = useMemo(
    () => assignments.filter((a) => !isAssignmentDone(a, attempts)).length,
    [assignments, attempts],
  )

  async function handleAddTodo(e: FormEvent) {
    e.preventDefault()
    const text = newTodo.trim()
    if (!text || !profile) return
    setAdding(true)
    try {
      const id = await addTodo({ studentUid: profile.id, text })
      setTodos((prev) => [
        ...prev,
        { id, studentUid: profile.id, text, done: false, createdAt: null },
      ])
      setNewTodo('')
    } catch {
      // ignore
    } finally {
      setAdding(false)
    }
  }

  async function toggleTodo(t: PersonalTodo) {
    const next = !t.done
    setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: next } : x)))
    try {
      await setTodoDone(t.id, next)
    } catch {
      setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !next } : x)))
    }
  }

  async function removeTodo(t: PersonalTodo) {
    const prev = todos
    setTodos((cur) => cur.filter((x) => x.id !== t.id))
    try {
      await deleteTodo(t.id)
    } catch {
      setTodos(prev)
    }
  }

  const etcMeta = CATEGORIES.find((c) => c.key === 'etc')!
  const sortedTodos = useMemo(
    () => [...todos].sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0)),
    [todos],
  )

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          나의 학습
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
          과제
        </h1>
        {!loading && (
          <p className="text-xs text-slate-500 mt-1">남은 과제 {totalOpen}개</p>
        )}
      </header>

      {loading && <p className="text-slate-500 text-sm">불러오는 중…</p>}

      {!loading &&
        CATEGORIES.map((meta) => {
          const items = byCategory[meta.key]
          const isEtc = meta.key === 'etc'
          // 기타를 제외한 카테고리는 과제가 있을 때만 표시
          if (!isEtc && items.length === 0) return null

          const doneCount =
            items.filter((a) => isAssignmentDone(a, attempts)).length +
            (isEtc ? todos.filter((t) => t.done).length : 0)
          const totalCount = items.length + (isEtc ? todos.length : 0)

          return (
            <section key={meta.key} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                <h2 className="text-sm font-semibold text-slate-800">{meta.label}</h2>
                <span className="text-xs text-slate-400">
                  {doneCount}/{totalCount}
                </span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
                {items.map((a) => {
                  const done = isAssignmentDone(a, attempts)
                  const overdue = isOverdue(a) && !done
                  const path = assignmentPath(a)
                  const inner = (
                    <>
                      <CheckCircle done={done} meta={meta} />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm truncate ${
                            done ? 'text-slate-400 line-through' : 'text-slate-900'
                          }`}
                        >
                          {a.refTitle}
                        </p>
                        {(a.dueAt || a.note) && (
                          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {a.dueAt && (
                              <span className={overdue ? 'text-red-600 font-medium' : ''}>
                                마감 {formatDate(a.dueAt)}
                                {overdue && ' (지남)'}
                              </span>
                            )}
                            {a.dueAt && a.note && ' · '}
                            {a.note}
                          </p>
                        )}
                      </div>
                      {path && <span className="text-slate-300 text-lg shrink-0">→</span>}
                    </>
                  )
                  return (
                    <div key={a.id}>
                      {path ? (
                        <Link
                          to={path}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
                        >
                          {inner}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 px-4 py-3">{inner}</div>
                      )}
                    </div>
                  )
                })}

                {/* 기타: 학생 개인 할 일 (직접 추가/완료) */}
                {isEtc &&
                  sortedTodos.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-3 group">
                      <CheckCircle done={t.done} meta={etcMeta} onToggle={() => toggleTodo(t)} />
                      <p
                        className={`min-w-0 flex-1 text-sm truncate ${
                          t.done ? 'text-slate-400 line-through' : 'text-slate-900'
                        }`}
                      >
                        {t.text}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeTodo(t)}
                        className="shrink-0 text-slate-300 hover:text-red-500 text-sm px-1"
                        aria-label="삭제"
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                {isEtc && items.length === 0 && todos.length === 0 && (
                  <p className="px-4 py-3 text-xs text-slate-400">
                    직접 할 일을 추가해 보세요.
                  </p>
                )}

                {/* 기타: 추가 입력 */}
                {isEtc && (
                  <form
                    onSubmit={handleAddTodo}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-50/60"
                  >
                    <span className="shrink-0 h-5 w-5 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-sm">
                      +
                    </span>
                    <input
                      value={newTodo}
                      onChange={(e) => setNewTodo(e.target.value)}
                      placeholder="할 일 추가"
                      className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                    {newTodo.trim() && (
                      <button
                        type="submit"
                        disabled={adding}
                        className="shrink-0 rounded-md bg-slate-900 text-white text-xs font-medium px-3 py-1.5 hover:bg-slate-800 disabled:opacity-50"
                      >
                        추가
                      </button>
                    )}
                  </form>
                )}
              </div>
            </section>
          )
        })}
    </div>
  )
}
