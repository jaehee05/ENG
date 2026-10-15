import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  clearDDay,
  formatDate,
  getDDay,
  isAssignmentDone,
  listAnnouncements,
  listAssignmentsForStudent,
  listAttemptsForUser,
  listClassSessionsForStudent,
  listPaymentsForStudent,
  setDDay,
} from '../lib/firestore'
import {
  isAssignmentOverdue as isOverdue,
  isAssignmentVisibleToStudent,
} from '../lib/types'
import {
  Badge,
  BottomSheet,
  Button,
  Card,
  EmptyState,
  Field,
  ListRow,
  Section,
  confirm,
  cx,
  inputClass,
} from '../components/ui'
import { computeStudentBalance, fmtDateLabel, todayISO } from '../lib/payments'
import type {
  Announcement,
  Assignment,
  Attempt,
  ClassSession,
  DDaySetting,
} from '../lib/types'

/** 목표일까지 남은 일수 (KST 날짜 기준). */
function daysUntil(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const [ty, tm, td] = todayISO().split('-').map(Number)
  return Math.round(
    (Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000,
  )
}

function fmtDDayDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${y}년 ${m}월 ${d}일`
}

/** 과제 줄을 눌렀을 때 갈 곳. 과제 탭(Assignments)과 규칙을 맞춘다. */
function assignmentPath(a: Assignment): string | null {
  if (a.type === 'vocab') return `/vocab/${a.refId}`
  if (a.type === 'reading') return `/reading/${a.refId}`
  if (a.type === 'korean_mock') return `/korean-mocks/${a.refId}`
  return null
}

function assignmentLabel(a: Assignment): string {
  if (a.type === 'vocab') return '단어 시험지'
  if (a.type === 'reading') return '지문'
  if (a.type === 'korean_mock') return '모의고사'
  return '외부 과제'
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

/** 홈의 과제 현황 타일 — 숫자를 크게. */
function StatTile({
  label,
  value,
  to,
  tone,
}: {
  label: string
  value: number
  to: string
  tone?: 'danger'
}) {
  return (
    <Link
      to={to}
      className="pressable block rounded-card bg-white px-4 py-4 hover:bg-slate-50 active:bg-slate-100"
    >
      <p className="text-[13px] text-slate-500">{label}</p>
      <p
        className={cx(
          'text-[28px] font-bold tracking-tight tabular-nums mt-1 leading-none',
          tone === 'danger' ? 'text-red-500' : 'text-slate-900',
        )}
      >
        {value}
      </p>
    </Link>
  )
}

/** 응시 기록에서 결과 화면 경로. MyHistory 와 같은 규칙. */
function attemptResultPath(a: Attempt): string {
  if (a.type === 'vocab') return `/vocab/${a.refId}/result/${a.id}`
  if (a.type === 'reading') return `/reading/${a.refId}/result/${a.id}`
  if (a.type === 'korean_mock') return `/korean-mocks/${a.refId}/result/${a.id}`
  return `/wordbook/result/${a.id}`
}

function fmtAttemptDate(ts: Attempt['createdAt']): string {
  if (!ts) return ''
  const d = ts.toDate()
  return `${d.getMonth() + 1}/${d.getDate()}`
}

type AttemptFilter = 'vocab' | 'korean_mock'

const ATTEMPT_FILTERS: { key: AttemptFilter; label: string }[] = [
  { key: 'vocab', label: '단어 시험' },
  { key: 'korean_mock', label: '모의고사' },
]

/** 목록 줄에 붙는 종류 표시. 홈은 단어/모의고사만 내므로 둘만 있으면 된다. */
const ATTEMPT_TYPE_LABEL: Partial<Record<Attempt['type'], string>> = {
  vocab: '단어 시험',
  korean_mock: '모의고사',
}

/** 목록 줄 왼쪽의 둥근 아이콘 자리. */
function RowIcon({ tone, children }: { tone: 'blue' | 'amber'; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex h-10 w-10 items-center justify-center rounded-xl',
        tone === 'blue' ? 'bg-sky-50 text-sky-600' : 'bg-amber-50 text-amber-600',
      )}
    >
      {children}
    </span>
  )
}

const glyphProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}
const calendarGlyph = (
  <svg {...glyphProps}>
    <rect x="3" y="4" width="18" height="18" rx="3" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
)
const megaphoneGlyph = (
  <svg {...glyphProps}>
    <path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1Z" />
    <path d="M16 9a3 3 0 0 1 0 6" />
  </svg>
)

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
  // 홈 D-day (관리자 설정, 전체 공통).
  const [dday, setDdayState] = useState<DDaySetting | null>(null)
  const [ddayOpen, setDdayOpen] = useState(false)
  const [ddayTitle, setDdayTitle] = useState('')
  const [ddayDate, setDdayDate] = useState('')
  const [ddaySaving, setDdaySaving] = useState(false)
  const isAdmin = profile?.role === 'admin'


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

  useEffect(() => {
    let alive = true
    getDDay()
      .then((d) => {
        if (alive) setDdayState(d)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  function openDdayEdit() {
    setDdayTitle(dday?.title ?? '')
    setDdayDate(dday?.dateISO ?? '')
    setDdayOpen(true)
  }
  async function saveDday() {
    if (!ddayTitle.trim() || !ddayDate) return
    setDdaySaving(true)
    try {
      const next = { title: ddayTitle.trim(), dateISO: ddayDate }
      await setDDay(next)
      setDdayState(next)
      setDdayOpen(false)
    } catch {
      // ignore
    } finally {
      setDdaySaving(false)
    }
  }
  async function removeDday() {
    if (!(await confirm('D-day를 삭제할까요?', { danger: true, confirmText: '삭제' }))) return
    setDdaySaving(true)
    try {
      await clearDDay()
      setDdayState(null)
      setDdayOpen(false)
    } catch {
      // ignore
    } finally {
      setDdaySaving(false)
    }
  }

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

  /** 과제 현황 — 진행 중 / 기한 지남 / 완료. 버튼 대신 홈에 세워 둔다. */
  const assignStats = useMemo(() => {
    const overdue = openRaw.filter((a) => isOverdue(a)).length
    return {
      open: openRaw.length,
      overdue,
      done: assignments.length - openRaw.length,
    }
  }, [assignments, openRaw])

  /**
   * 시험 현황 — 정식 응시만. 연습을 섞으면 다른 화면들(!practice 기준)과
   * 같은 학생 숫자가 어긋난다.
   *
   * 지문·내 단어장은 뺀다 — 지문은 기능이 없어졌고(#11) 내 단어장은
   * 숨김이다(features.ts). 지난 기록은 '내 기록' 에 그대로 있다.
   */
  const gradedAttempts = useMemo(
    () =>
      [...attempts]
        .filter(
          (a) => !a.practice && (a.type === 'vocab' || a.type === 'korean_mock'),
        )
        .sort(
          (x, y) => (y.createdAt?.toMillis() ?? 0) - (x.createdAt?.toMillis() ?? 0),
        ),
    [attempts],
  )
  const [pickedFilter, setPickedFilter] = useState<AttemptFilter | null>(null)
  /**
   * 아직 안 고른 학생에게는 가장 최근에 응시한 종류를 편다. 'vocab' 로
   * 못박으면 국어만 듣는 학생은 홈에 들어올 때마다 빈 목록을 본다.
   * 기록이 아예 없으면 단어 쪽으로 둔다.
   */
  const attemptFilter: AttemptFilter =
    pickedFilter ??
    (gradedAttempts[0]?.type === 'korean_mock' ? 'korean_mock' : 'vocab')
  const shownAttempts = useMemo(
    () => gradedAttempts.filter((a) => a.type === attemptFilter).slice(0, 5),
    [gradedAttempts, attemptFilter],
  )

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

  const ddayDirty =
    ddayTitle.trim() !== (dday?.title ?? '').trim() || ddayDate !== (dday?.dateISO ?? '')

  /** 과제 한 줄의 보조 문구 — 마감(지나면 빨갛게)과 메모. */
  function dueLine(a: Assignment) {
    const overdue = isOverdue(a)
    return (
      <>
        {a.dueAt && (
          <span className={overdue ? 'text-red-500 font-medium' : ''}>
            {formatDate(a.dueAt)}까지{overdue && ' · 지남'}
          </span>
        )}
        {a.note && <span>{a.dueAt ? ' · ' : ''}{a.note}</span>}
      </>
    )
  }

  return (
    <div className="space-y-7 max-w-2xl mx-auto">
      <section className="px-1 pt-2">
        <p className="text-[15px] text-slate-500">{greeting}</p>
        <div className="flex items-center gap-x-2 gap-y-1 flex-wrap mt-0.5">
          <h1 className="text-[26px] font-bold text-slate-900 tracking-tight">
            {profile?.displayName}님
          </h1>
          {dueDateISO && <Badge tone="amber" size="md">다음 결제 {fmtDateLabel(dueDateISO)}</Badge>}
        </div>
        <p className="text-[15px] text-slate-600 mt-1">
          {totalOpen > 0 ? (
            <>
              끝낼 과제가 <span className="font-bold text-slate-900">{totalOpen}개</span> 남았어요.
            </>
          ) : (
            '남은 과제가 없어요. 자유 학습 시간이에요.'
          )}
        </p>
      </section>

      {/* D-day (관리자 설정, 전체 공통) — 숫자를 크게 */}
      {dday
        ? (() => {
            const n = daysUntil(dday.dateISO)
            const inner = (
              <>
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-[15px] font-semibold text-slate-900 truncate">{dday.title}</p>
                  <p className="text-[13px] text-slate-500 mt-0.5">{fmtDDayDate(dday.dateISO)}</p>
                </div>
                <span className="shrink-0 text-[32px] font-bold text-slate-900 tabular-nums tracking-tight leading-none">
                  {n > 0 ? `D-${n}` : n === 0 ? 'D-DAY' : '종료'}
                </span>
              </>
            )
            return isAdmin ? (
              <button
                type="button"
                onClick={openDdayEdit}
                className="pressable w-full flex items-center gap-4 rounded-card bg-white px-5 py-5 hover:bg-slate-50 active:bg-slate-100"
              >
                {inner}
              </button>
            ) : (
              <Card className="flex items-center gap-4">{inner}</Card>
            )
          })()
        : isAdmin && (
            <Button variant="secondary" block onClick={openDdayEdit}>
              D-day 설정
            </Button>
          )}

      {(topAnnouncement || nextSession) && (
        <Card padded={false}>
          {nextSession && (
            <ListRow
              to="/schedule"
              leading={<RowIcon tone="blue">{calendarGlyph}</RowIcon>}
              title={
                <span className="inline-flex items-center gap-1.5 max-w-full">
                  <span className="truncate">{nextSession.title}</span>
                  {nextSession.status === 'makeup' && <Badge tone="amber">보강</Badge>}
                </span>
              }
              description={
                <span className="tabular-nums">
                  {fmtWhenLabel(nextSession.dateISO)} {nextSession.startTime}–{nextSession.endTime}
                  {nextSession.location && ` · ${nextSession.location}`}
                </span>
              }
            />
          )}
          {topAnnouncement && (
            <ListRow
              to="/notice"
              leading={<RowIcon tone="amber">{megaphoneGlyph}</RowIcon>}
              title={
                <>
                  {topAnnouncement.pinned && <span className="sr-only">고정 공지 </span>}
                  {topAnnouncement.title}
                </>
              }
              description={topAnnouncement.body || '공지'}
            />
          )}
        </Card>
      )}

      {totalOpen > 0 && (
        <Section title="내 과제" action={<Link to="/assignments">{totalOpen}개 ›</Link>}>
          <Card padded={false}>
            {openItems.map((item) => {
              if (item.kind === 'single') {
                const a = item.a
                return (
                  <ListRow
                    key={a.id}
                    to={assignmentPath(a) ?? undefined}
                    title={a.refTitle}
                    description={
                      <>
                        {assignmentLabel(a)}
                        {(a.dueAt || a.note) && ' · '}
                        {dueLine(a)}
                      </>
                    }
                  />
                )
              }
              // 같은 지문 묶음 — 눌러서 펼친다
              const isOpen = expanded.has(item.category)
              const overdueCount = item.items.filter((a) => isOverdue(a)).length
              const earliest = item.items
                .filter((a) => a.dueAt)
                .sort((a, b) => a.dueAt!.toMillis() - b.dueAt!.toMillis())[0]
              return (
                <div key={`g-${item.category}`}>
                  <ListRow
                    onClick={() => toggleExpanded(item.category)}
                    chevron={false}
                    title={`${item.category} (${item.items.length}개)`}
                    description={
                      <>
                        지문 묶음
                        {earliest && (
                          <span className={isOverdue(earliest) ? 'text-red-500 font-medium' : ''}>
                            {' · '}
                            {formatDate(earliest.dueAt)}까지
                          </span>
                        )}
                        {overdueCount > 0 && <span className="text-red-500"> · 지남 {overdueCount}개</span>}
                      </>
                    }
                    trailing={
                      <svg
                        className={cx('text-slate-400 transition-transform', isOpen && 'rotate-180')}
                        width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    }
                  />
                  {isOpen && (
                    <div className="mx-3 mb-2 rounded-2xl bg-slate-50 py-1">
                      {item.items.map((a) => {
                        const parsed = parseTitle(a.refTitle)
                        return (
                          <ListRow
                            key={a.id}
                            to={assignmentPath(a) ?? undefined}
                            className="min-h-[52px] py-2.5"
                            title={parsed ? `${parsed.tag}번` : a.refTitle}
                            description={a.dueAt || a.note ? dueLine(a) : undefined}
                          />
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </Card>
        </Section>
      )}

      <Section title="과제 현황">
        <div className="grid grid-cols-3 gap-2.5">
          <StatTile label="진행 중" value={assignStats.open} to="/assignments" />
          <StatTile
            label="기한 지남"
            value={assignStats.overdue}
            tone={assignStats.overdue > 0 ? 'danger' : undefined}
            to="/assignments"
          />
          <StatTile label="완료" value={assignStats.done} to="/assignments" />
        </div>
      </Section>

      <Section title="시험 현황" action={<Link to="/history">전체 기록 ›</Link>}>
        <div className="flex items-center gap-1.5" role="tablist">
          {ATTEMPT_FILTERS.map((f) => {
            const on = attemptFilter === f.key
            return (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setPickedFilter(f.key)}
                className={cx(
                  'pressable h-9 px-4 rounded-full text-[14px] font-semibold',
                  on ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 hover:bg-slate-50 active:bg-slate-100',
                )}
              >
                {f.label}
              </button>
            )
          })}
        </div>
        <Card padded={false}>
          {shownAttempts.length === 0 ? (
            <EmptyState
              title={
                attemptFilter === 'vocab'
                  ? '아직 응시한 단어 시험이 없어요'
                  : '아직 응시한 모의고사가 없어요'
              }
            />
          ) : (
            shownAttempts.map((a) => {
              const ratio = a.total > 0 ? Math.round((a.correct / a.total) * 100) : null
              return (
                <ListRow
                  key={a.id}
                  to={attemptResultPath(a)}
                  title={a.refTitle}
                  description={`${ATTEMPT_TYPE_LABEL[a.type] ?? ''} · ${fmtAttemptDate(a.createdAt)}`}
                  trailing={
                    <span className="text-right leading-tight">
                      <span
                        className={cx(
                          'block text-[16px] font-bold tabular-nums',
                          ratio === null
                            ? 'text-slate-500'
                            : ratio >= 80
                              ? 'text-brand-700'
                              : ratio >= 60
                                ? 'text-amber-600'
                                : 'text-red-500',
                        )}
                      >
                        {a.correct}/{a.total}
                      </span>
                      {ratio !== null && (
                        <span className="block text-[12px] text-slate-400 tabular-nums">{ratio}%</span>
                      )}
                    </span>
                  }
                />
              )
            })
          )}
        </Card>
      </Section>

      {/* D-day 설정 (관리자) */}
      <BottomSheet
        open={ddayOpen}
        onClose={() => setDdayOpen(false)}
        title="D-day 설정"
        dirty={ddayDirty}
        disabled={ddaySaving}
        footer={
          <>
            {dday && (
              <Button variant="dangerSoft" size="lg" onClick={removeDday} disabled={ddaySaving}>
                삭제
              </Button>
            )}
            <Button
              size="lg"
              block
              onClick={saveDday}
              loading={ddaySaving}
              disabled={!ddayTitle.trim() || !ddayDate}
            >
              저장
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="목표 이름">
            <input
              type="text"
              value={ddayTitle}
              onChange={(e) => setDdayTitle(e.target.value)}
              placeholder="예: 2027 대수능"
              className={inputClass()}
            />
          </Field>
          <Field label="목표일">
            <input
              type="date"
              value={ddayDate}
              onChange={(e) => setDdayDate(e.target.value)}
              className={inputClass()}
            />
          </Field>
        </div>
      </BottomSheet>
    </div>
  )
}
