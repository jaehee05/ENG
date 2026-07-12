import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Clover, CloverCheck, progressToLeaves } from '../components/Clover'
import { useAuth } from '../contexts/useAuth'
import { listAccounts } from '../lib/account'
import type { UserAccount } from '../lib/types'
import {
  addTodo,
  deleteTodo,
  ensureDefaultCategories,
  formatDate,
  isAssignmentDone,
  listAssignmentsForStudent,
  listAttemptsForUser,
  listKoreanMocks,
  listTodosForStudent,
  setTodoDone,
} from '../lib/firestore'
import {
  assignmentCategory,
  getMockSubject,
  isAssignmentVisibleToStudent,
  MOCK_SUBJECT_LABEL,
  type Assignment,
  type Attempt,
  type CategoryConfig,
  type KoreanMock,
  type MockSubject,
  type PersonalTodo,
} from '../lib/types'

const SUBJECT_BADGE_CLASS: Record<MockSubject, string> = {
  korean: 'bg-rose-50 text-rose-700 border-rose-200',
  english: 'bg-sky-50 text-sky-700 border-sky-200',
}

function assignmentPath(a: Assignment): string | null {
  if (a.type === 'vocab') return `/vocab/${a.refId}`
  if (a.type === 'reading') return `/reading/${a.refId}`
  if (a.type === 'korean_mock') return `/korean-mocks/${a.refId}`
  return null
}

function isOverdue(a: Assignment): boolean {
  if (!a.dueAt) return false
  return a.dueAt.toMillis() < Date.now()
}

// ───── 과제 캘린더 헬퍼 ─────
const KST_TZ = 'Asia/Seoul'
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Timestamp → KST 'YYYY-MM-DD'. */
function tsToISO(ts: { toDate(): Date } | null | undefined): string | null {
  if (!ts) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ts.toDate())
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function buildMonthCells(
  year: number,
  monthIndex: number,
): { iso: string; day: number; inMonth: boolean }[] {
  const first = new Date(year, monthIndex, 1)
  const firstDow = first.getDay()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const prevLast = new Date(year, monthIndex, 0).getDate()
  const prevY = monthIndex === 0 ? year - 1 : year
  const prevM = monthIndex === 0 ? 11 : monthIndex - 1
  const nextY = monthIndex === 11 ? year + 1 : year
  const nextM = monthIndex === 11 ? 0 : monthIndex + 1
  const cells: { iso: string; day: number; inMonth: boolean }[] = []
  for (let i = firstDow - 1; i >= 0; i--) {
    const d = prevLast - i
    cells.push({ iso: `${prevY}-${pad2(prevM + 1)}-${pad2(d)}`, day: d, inMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: `${year}-${pad2(monthIndex + 1)}-${pad2(d)}`, day: d, inMonth: true })
  }
  const trailing = (7 - (cells.length % 7)) % 7
  for (let d = 1; d <= trailing; d++) {
    cells.push({ iso: `${nextY}-${pad2(nextM + 1)}-${pad2(d)}`, day: d, inMonth: false })
  }
  return cells
}

function fmtDayHeading(iso: string): string {
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10))
  const wd = new Date(y, m - 1, d).toLocaleDateString('ko-KR', { weekday: 'short' })
  return `${m}월 ${d}일 (${wd})`
}

export function Assignments() {
  const { profile } = useAuth()
  // 관리자는 본인 과제 대신 학생에게 과제를 부여하는 진입 화면을 본다.
  if (profile?.role === 'admin') return <AdminAssignEntry />
  return <StudentAssignments />
}

function StudentAssignments() {
  const { profile } = useAuth()
  const [categories, setCategories] = useState<CategoryConfig[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [todos, setTodos] = useState<PersonalTodo[]>([])
  const [mocks, setMocks] = useState<KoreanMock[]>([])
  const [loading, setLoading] = useState(true)
  const [newTodo, setNewTodo] = useState('')
  const [adding, setAdding] = useState(false)
  const [cursor, setCursor] = useState(() => {
    const [y, m] = todayISO().split('-').map(Number)
    return { year: y, monthIndex: m - 1 }
  })
  const [selectedDateISO, setSelectedDateISO] = useState<string>(() => todayISO())

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    Promise.all([
      listAssignmentsForStudent(profile.id),
      listAttemptsForUser(profile.id),
      listTodosForStudent(profile.id),
      ensureDefaultCategories(),
      listKoreanMocks().catch(() => [] as KoreanMock[]),
    ])
      .then(([asn, atts, tds, cats, mks]) => {
        if (cancelled) return
        // 시작일이 미래인 과제는 아직 학생에게 숨김
        setAssignments(asn.filter((a) => isAssignmentVisibleToStudent(a)))
        setAttempts(atts)
        setTodos(tds)
        setCategories(cats)
        setMocks(mks)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [profile])

  const mockSubjectById = useMemo(() => {
    const map: Record<string, MockSubject> = {}
    for (const m of mocks) map[m.id] = getMockSubject(m)
    return map
  }, [mocks])

  /** 카테고리 키 → 설정 lookup. 어떤 과제가 알 수 없는 키를 갖고 있으면 'etc'로 폴백. */
  const catByKey = useMemo(() => {
    const map: Record<string, CategoryConfig> = {}
    for (const c of categories) map[c.key] = c
    return map
  }, [categories])

  const etcMeta = catByKey['etc']

  // 카테고리별로 과제 묶기 (모르는 키는 etc로 합침)
  const byCategory = useMemo(() => {
    const map: Record<string, Assignment[]> = {}
    for (const c of categories) map[c.key] = []
    for (const a of assignments) {
      const key = assignmentCategory(a)
      if (map[key]) map[key].push(a)
      else if (map['etc']) map['etc'].push(a)
    }
    const sortFn = (x: Assignment, y: Assignment) => {
      const dx = isAssignmentDone(x, attempts) ? 1 : 0
      const dy = isAssignmentDone(y, attempts) ? 1 : 0
      if (dx !== dy) return dx - dy // 미완료 먼저
      const tx = x.dueAt?.toMillis() ?? Infinity
      const ty = y.dueAt?.toMillis() ?? Infinity
      if (tx !== ty) return tx - ty
      return x.refTitle.localeCompare(y.refTitle, 'ko', { numeric: true })
    }
    for (const k of Object.keys(map)) map[k].sort(sortFn)
    return map
  }, [assignments, attempts, categories])

  const totalOpen = useMemo(
    () => assignments.filter((a) => !isAssignmentDone(a, attempts)).length,
    [assignments, attempts],
  )

  const overallDone = useMemo(() => {
    const doneAsn = assignments.filter((a) => isAssignmentDone(a, attempts)).length
    const doneTodo = todos.filter((t) => t.done).length
    return doneAsn + doneTodo
  }, [assignments, attempts, todos])

  const overallTotal = assignments.length + todos.length

  /** 헤더 클로버는 모든 카테고리 중 첫 번째 색을 쓴다 (보통 problem 색). */
  const headerColor = categories[0]?.color ?? '#10b981'
  const headerLeaves = progressToLeaves(overallDone, overallTotal)

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

  const sortedTodos = useMemo(
    () => [...todos].sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0)),
    [todos],
  )

  // ── 학습 계획표 캘린더 ──
  const monthCells = useMemo(
    () => buildMonthCells(cursor.year, cursor.monthIndex),
    [cursor],
  )
  const asnByDate = useMemo(() => {
    const map = new Map<string, Assignment[]>()
    for (const a of assignments) {
      const iso = tsToISO(a.dueAt)
      if (!iso) continue
      const arr = map.get(iso) ?? []
      arr.push(a)
      map.set(iso, arr)
    }
    return map
  }, [assignments])
  const today = todayISO()
  const selectedDayAsn = asnByDate.get(selectedDateISO) ?? []
  function dayStatus(iso: string): 'allDone' | 'incomplete' | 'none' {
    const arr = asnByDate.get(iso)
    if (!arr || arr.length === 0) return 'none'
    return arr.every((a) => isAssignmentDone(a, attempts)) ? 'allDone' : 'incomplete'
  }
  function shiftMonth(delta: number) {
    setCursor((c) => {
      const total = c.year * 12 + c.monthIndex + delta
      return { year: Math.floor(total / 12), monthIndex: ((total % 12) + 12) % 12 }
    })
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            나의 학습
          </p>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
            과제
          </h1>
          {!loading && (
            <p className="text-xs text-slate-500 mt-1">
              남은 과제 {totalOpen}개
              {overallTotal > 0 && (
                <>
                  {' · '}오늘 {overallDone}/{overallTotal}
                </>
              )}
            </p>
          )}
        </div>
        {!loading && overallTotal > 0 && (
          <Clover filled={headerLeaves} color={headerColor} size={44} />
        )}
      </header>

      {loading && <p className="text-slate-500 text-sm">불러오는 중…</p>}

      {/* 학습 계획표 캘린더 (마감일 기준) */}
      {!loading && (
        <section className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100"
                aria-label="이전 달"
              >
                ‹
              </button>
              <div className="text-center leading-tight">
                <p className="text-[11px] text-slate-400">{cursor.year}년</p>
                <h2 className="text-sm font-semibold text-slate-900">
                  {cursor.monthIndex + 1}월
                </h2>
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
              {WEEKDAY_LABELS.map((d, i) => (
                <div
                  key={d}
                  className={`py-1.5 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-sky-500' : ''}`}
                >
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {monthCells.map((c, i) => {
                const isToday = c.iso === today
                const isSelected = c.iso === selectedDateISO
                const status = dayStatus(c.iso)
                const dow = i % 7
                const numCls = isSelected
                  ? 'bg-brand-600 text-white'
                  : status === 'allDone'
                    ? 'bg-brand-100 text-brand-700'
                    : status === 'incomplete'
                      ? 'bg-red-100 text-red-600'
                      : c.inMonth
                        ? dow === 0
                          ? 'text-red-500'
                          : dow === 6
                            ? 'text-sky-600'
                            : 'text-slate-700'
                        : 'text-slate-300'
                return (
                  <button
                    key={c.iso + i}
                    type="button"
                    onClick={() => setSelectedDateISO(c.iso)}
                    className={`min-h-[44px] sm:min-h-[52px] border-r border-b border-slate-100 flex items-center justify-center ${
                      i % 7 === 6 ? 'border-r-0' : ''
                    } ${!c.inMonth ? 'bg-slate-50/50' : 'hover:bg-slate-50'}`}
                  >
                    <span
                      className={`inline-flex items-center justify-center h-7 w-7 rounded-full text-xs font-semibold ${numCls} ${
                        isToday && !isSelected ? 'ring-1 ring-slate-300' : ''
                      }`}
                    >
                      {c.day}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-center text-[11px] font-medium text-slate-400">
              학습 계획 · {fmtDayHeading(selectedDateISO)}
            </p>
            {selectedDayAsn.length === 0 ? (
              <p className="text-xs text-slate-400 py-5 text-center rounded-xl border border-dashed border-slate-200">
                이 날 마감인 과제가 없습니다.
              </p>
            ) : (
              <ul className="space-y-2">
                {selectedDayAsn.map((a) => {
                  const done = isAssignmentDone(a, attempts)
                  const path = assignmentPath(a)
                  const inner = (
                    <>
                      <span
                        className={`shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                          done ? 'bg-brand-600 border-brand-600' : 'border-slate-300'
                        }`}
                      >
                        {done && (
                          <span className="h-2 w-2 rounded-full bg-white" aria-hidden />
                        )}
                      </span>
                      <p
                        className={`flex-1 min-w-0 text-sm truncate ${
                          done ? 'text-slate-400 line-through' : 'text-slate-900'
                        }`}
                      >
                        {a.refTitle}
                      </p>
                      {path && <span className="text-slate-300 text-lg shrink-0">→</span>}
                    </>
                  )
                  return (
                    <li key={a.id}>
                      {path ? (
                        <Link
                          to={path}
                          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 hover:bg-slate-50"
                        >
                          {inner}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                          {inner}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      )}

      {!loading &&
        categories.map((cat) => {
          const items = byCategory[cat.key] ?? []
          const isEtc = cat.key === 'etc'
          // 기타를 제외한 카테고리는 과제가 있을 때만 표시
          if (!isEtc && items.length === 0) return null

          const doneCount =
            items.filter((a) => isAssignmentDone(a, attempts)).length +
            (isEtc ? todos.filter((t) => t.done).length : 0)
          const totalCount = items.length + (isEtc ? todos.length : 0)

          return (
            <section key={cat.key} className="space-y-2">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: cat.color }}
                  aria-hidden
                />
                <h2 className="text-sm font-semibold text-slate-800">{cat.label}</h2>
                <span className="text-xs text-slate-400">
                  {doneCount}/{totalCount}
                </span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
                {items.map((a) => {
                  const done = isAssignmentDone(a, attempts)
                  const overdue = isOverdue(a) && !done
                  const path = assignmentPath(a)
                  const mockSubj =
                    a.type === 'korean_mock' ? mockSubjectById[a.refId] : undefined
                  const inner = (
                    <>
                      <CloverCheck done={done} color={cat.color} size={26} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {mockSubj && (
                            <span
                              className={`shrink-0 inline-block rounded-full text-[10px] font-medium px-1.5 py-0.5 border ${SUBJECT_BADGE_CLASS[mockSubj]}`}
                            >
                              {MOCK_SUBJECT_LABEL[mockSubj]}
                            </span>
                          )}
                          <p
                            className={`text-sm truncate ${
                              done ? 'text-slate-400 line-through' : 'text-slate-900'
                            }`}
                          >
                            {a.refTitle}
                          </p>
                        </div>
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
                      <CloverCheck
                        done={t.done}
                        color={etcMeta?.color ?? cat.color}
                        size={26}
                        onToggle={() => toggleTodo(t)}
                      />
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

// 관리자 과제 탭: 학생을 골라 과제 부여 화면(학생 상세)으로 이동.
function AdminAssignEntry() {
  const [students, setStudents] = useState<UserAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    let cancelled = false
    listAccounts()
      .then((accs) => {
        if (cancelled) return
        setStudents(
          accs
            .filter((a) => a.role === 'student' && a.status === 'active')
            .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko')),
        )
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw) return students
    return students.filter(
      (s) =>
        s.displayName.toLowerCase().includes(kw) ||
        (s.school ?? '').toLowerCase().includes(kw),
    )
  }, [students, q])

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          관리
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
          과제 부여
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          학생을 선택하면 그 학생의 과제 부여·현황 화면으로 이동합니다.
        </p>
      </header>

      {students.length > 5 && (
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="학생 이름·학교 검색"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      )}

      {loading ? (
        <p className="text-slate-500 text-sm">불러오는 중…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          활성 학생이 없습니다.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
          {filtered.map((s) => (
            <Link
              key={s.id}
              to={`/admin/students/${s.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {s.displayName}
                  {s.school ? (
                    <span className="text-slate-400 font-normal"> · {s.school}</span>
                  ) : null}
                </p>
              </div>
              <span className="text-slate-300 text-lg shrink-0">→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
