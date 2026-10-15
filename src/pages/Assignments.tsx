import { useEffect, useMemo, useState, type FormEvent } from 'react'
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
  isAssignmentOverdue as isOverdue,
  isAssignmentVisibleToStudent,
  MOCK_SUBJECT_LABEL,
  type Assignment,
  type Attempt,
  type CategoryConfig,
  type KoreanMock,
  type MockSubject,
  type PersonalTodo,
} from '../lib/types'
import {
  Badge,
  Card,
  EmptyState,
  ListRow,
  PageHeader,
  Section,
  SkeletonList,
  cx,
  inputClass,
  type BadgeTone,
} from '../components/ui'

const SUBJECT_TONE: Record<MockSubject, BadgeTone> = {
  korean: 'rose',
  english: 'blue',
}

function assignmentPath(a: Assignment): string | null {
  if (a.type === 'vocab') return `/vocab/${a.refId}`
  if (a.type === 'reading') return `/reading/${a.refId}`
  if (a.type === 'korean_mock') return `/korean-mocks/${a.refId}`
  return null
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

/** 완료 여부 체크 원 (클로버 대체). onToggle 있으면 버튼, 없으면 상태 표시. */
function DoneCircle({
  done,
  color,
  onToggle,
}: {
  done: boolean
  color?: string
  onToggle?: () => void
}) {
  const cls = `shrink-0 h-6 w-6 rounded-full border-2 flex items-center justify-center transition ${onToggle ? 'pressable ' : ''}${
    done ? 'border-transparent' : 'border-slate-300'
  }`
  const style = done ? { backgroundColor: color ?? '#2f8a3e' } : undefined
  const inner = done ? (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ) : null
  if (onToggle) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={cls}
        style={style}
        aria-label={done ? '완료됨' : '미완료'}
      >
        {inner}
      </button>
    )
  }
  return (
    <span className={cls} style={style} aria-hidden>
      {inner}
    </span>
  )
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
    const todayStr = todayISO()
    const map: Record<string, Assignment[]> = {}
    for (const c of categories) map[c.key] = []
    for (const a of assignments) {
      // 마감일 다음날부터 숨김 (당일까지는 완료해도 계속 표시)
      const dueISO = tsToISO(a.dueAt)
      if (dueISO && dueISO < todayStr) continue
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

  const totalOpen = useMemo(() => {
    const todayStr = todayISO()
    return assignments.filter((a) => {
      const dueISO = tsToISO(a.dueAt)
      if (dueISO && dueISO < todayStr) return false // 마감 지난 건 제외
      return !isAssignmentDone(a, attempts)
    }).length
  }, [assignments, attempts])

  const overallDone = useMemo(() => {
    const doneAsn = assignments.filter((a) => isAssignmentDone(a, attempts)).length
    const doneTodo = todos.filter((t) => t.done).length
    return doneAsn + doneTodo
  }, [assignments, attempts, todos])

  const overallTotal = assignments.length + todos.length

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

  /** 과제 한 줄 — 완료 원 + 제목(완료면 흐리게) + 마감·메모. 계획표와 카테고리 목록이 같이 쓴다. */
  function assignmentRow(a: Assignment, color?: string) {
    const done = isAssignmentDone(a, attempts)
    const overdue = isOverdue(a) && !done
    const mockSubj = a.type === 'korean_mock' ? mockSubjectById[a.refId] : undefined
    return (
      <ListRow
        key={a.id}
        to={assignmentPath(a) ?? undefined}
        leading={<DoneCircle done={done} color={color} />}
        title={
          <span className="flex items-center gap-1.5 min-w-0">
            {mockSubj && <Badge tone={SUBJECT_TONE[mockSubj]}>{MOCK_SUBJECT_LABEL[mockSubj]}</Badge>}
            <span className={cx('truncate', done && 'text-slate-400 line-through')}>{a.refTitle}</span>
          </span>
        }
        description={
          a.dueAt || a.note ? (
            <>
              {a.dueAt && (
                <span className={overdue ? 'text-red-500 font-medium' : ''}>
                  {formatDate(a.dueAt)}까지{overdue && ' · 지남'}
                </span>
              )}
              {a.dueAt && a.note && ' · '}
              {a.note}
            </>
          ) : undefined
        }
      />
    )
  }

  return (
    <div className="space-y-7 max-w-2xl mx-auto">
      <PageHeader
        title="과제"
        description={
          loading ? undefined : (
            <>
              남은 과제 <span className="font-semibold text-slate-900">{totalOpen}개</span>
              {overallTotal > 0 && <span className="tabular-nums"> · 완료 {overallDone}/{overallTotal}</span>}
            </>
          )
        }
      />

      {loading && <SkeletonList rows={4} />}

      {/* 학습 계획표 캘린더 (마감일 기준) */}
      {!loading && (
        <div className="space-y-5">
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
              <h2 className="text-[17px] font-bold text-slate-900 tabular-nums">
                {cursor.year}년 {cursor.monthIndex + 1}월
              </h2>
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
              {WEEKDAY_LABELS.map((d, i) => (
                <div key={d} className={cx('py-1', i === 0 && 'text-red-400', i === 6 && 'text-sky-500')}>
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-y-1">
              {monthCells.map((c, i) => {
                const isToday = c.iso === today
                const isSelected = c.iso === selectedDateISO
                const status = dayStatus(c.iso)
                const dow = i % 7
                const numCls = isSelected
                  ? 'bg-slate-900 text-white'
                  : status === 'allDone'
                    ? 'bg-brand-100 text-brand-700'
                    : status === 'incomplete'
                      ? 'bg-red-50 text-red-500'
                      : c.inMonth
                        ? dow === 0
                          ? 'text-red-400'
                          : dow === 6
                            ? 'text-sky-500'
                            : 'text-slate-700'
                        : 'text-slate-300'
                return (
                  <button
                    key={c.iso + i}
                    type="button"
                    onClick={() => setSelectedDateISO(c.iso)}
                    aria-pressed={isSelected}
                    aria-label={`${c.iso}${status === 'incomplete' ? ', 남은 과제 있음' : status === 'allDone' ? ', 과제 완료' : ''}`}
                    className="pressable h-11 sm:h-12 flex items-center justify-center rounded-xl"
                  >
                    <span
                      className={cx(
                        'inline-flex items-center justify-center h-9 w-9 rounded-full text-[14px] font-semibold tabular-nums',
                        numCls,
                        isToday && !isSelected && 'ring-2 ring-slate-900/15',
                      )}
                    >
                      {c.day}
                    </span>
                  </button>
                )
              })}
            </div>
          </Card>

          <Section title={fmtDayHeading(selectedDateISO)} description="이 날 마감인 과제">
            <Card padded={false}>
              {selectedDayAsn.length === 0 ? (
                <EmptyState title="이 날 마감인 과제가 없어요" className="py-8" />
              ) : (
                selectedDayAsn.map((a) => assignmentRow(a))
              )}
            </Card>
          </Section>
        </div>
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
            <Section
              key={cat.key}
              title={
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cat.color }} aria-hidden />
                  {cat.label}
                </span>
              }
              action={<span className="tabular-nums">{doneCount}/{totalCount}</span>}
            >
              <Card padded={false}>
                {items.map((a) => assignmentRow(a, cat.color))}

                {/* 기타: 학생 개인 할 일 (직접 추가/완료) */}
                {isEtc &&
                  sortedTodos.map((t) => (
                    <ListRow
                      key={t.id}
                      leading={
                        <DoneCircle
                          done={t.done}
                          color={etcMeta?.color ?? cat.color}
                          onToggle={() => toggleTodo(t)}
                        />
                      }
                      title={<span className={cx(t.done && 'text-slate-400 line-through')}>{t.text}</span>}
                      trailing={
                        <button
                          type="button"
                          onClick={() => removeTodo(t)}
                          className="pressable -mr-2 h-9 w-9 inline-flex items-center justify-center rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 active:bg-red-50"
                          aria-label={`‘${t.text}’ 삭제`}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                            <path d="M6 6l12 12M18 6L6 18" />
                          </svg>
                        </button>
                      }
                    />
                  ))}

                {isEtc && items.length === 0 && todos.length === 0 && (
                  <p className="px-5 pt-3 pb-1 text-[13px] text-slate-500">직접 할 일을 추가해 보세요.</p>
                )}

                {/* 기타: 추가 입력 */}
                {isEtc && (
                  <form onSubmit={handleAddTodo} className="flex items-center gap-2 px-3 py-2">
                    <input
                      value={newTodo}
                      onChange={(e) => setNewTodo(e.target.value)}
                      placeholder="할 일 추가"
                      aria-label="할 일 추가"
                      className={inputClass('h-11')}
                    />
                    {newTodo.trim() && (
                      <button
                        type="submit"
                        disabled={adding}
                        className="pressable shrink-0 h-11 px-4 rounded-xl bg-slate-900 text-white text-[14px] font-semibold disabled:opacity-50"
                      >
                        추가
                      </button>
                    )}
                  </form>
                )}
              </Card>
            </Section>
          )
        })}
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
    <div className="space-y-5 max-w-2xl mx-auto">
      <PageHeader title="과제 부여" description="학생을 고르면 그 학생의 과제 부여·현황 화면으로 가요." />

      {students.length > 5 && (
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="학생 이름·학교 검색"
          aria-label="학생 검색"
          className={inputClass('bg-white')}
        />
      )}

      {loading ? (
        <SkeletonList rows={5} />
      ) : (
        <Card padded={false}>
          {filtered.length === 0 ? (
            <EmptyState title={q.trim() ? '검색 결과가 없어요' : '활성 학생이 없어요'} />
          ) : (
            filtered.map((s) => (
              <ListRow
                key={s.id}
                to={`/admin/students/${s.id}`}
                title={s.displayName}
                description={s.school || undefined}
              />
            ))
          )}
        </Card>
      )}
    </div>
  )
}
