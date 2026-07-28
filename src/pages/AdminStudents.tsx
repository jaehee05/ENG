import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { BackLink } from '../components/BackLink'
import { useAuth } from '../contexts/useAuth'
import { formatPhoneKR } from '../lib/phone'
import {
  createPreregisteredStudent,
  deleteAccount,
  listAccounts,
  setAccountPassword,
  setAccountStatus,
} from '../lib/account'
import {
  isAssignmentDone,
  listAllAssignments,
  listAllAttempts,
  regradeAllReadings,
} from '../lib/firestore'
import {
  sendAssignmentStatusNow,
  sendWeeklyReportNow,
} from '../lib/ppurioApi'
import type {
  Assignment,
  Attempt,
  MockSubject,
  UserAccount,
  UserStatus,
} from '../lib/types'

const STATUS_LABEL: Record<UserStatus, string> = {
  pending: '승인 대기',
  active: '활성',
  rejected: '거부',
}

const STATUS_CLASS: Record<UserStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  active: 'bg-brand-100 text-brand-700',
  rejected: 'bg-slate-200 text-slate-600',
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const VOCAB_PASS_THRESHOLD = 25

interface StudentStats {
  asnTotal: number
  asnDone: number
  asnRate: number | null
  vocabSessions: number
  vocabPass: number
  readingTotal: number
  readingCorrect: number
  readingRate: number | null
}

function inLastWeek(ts: { toMillis(): number } | null | undefined): boolean {
  if (!ts) return false
  return ts.toMillis() >= Date.now() - WEEK_MS
}

function computeStats(
  assignments: Assignment[],
  attempts: Attempt[],
): StudentStats {
  const recentAsn = assignments.filter((a) => inLastWeek(a.dueAt || a.createdAt))
  const recentAtt = attempts.filter(
    (a) => inLastWeek(a.createdAt) && !a.practice,
  )
  const asnDone = recentAsn.filter((a) => isAssignmentDone(a, attempts)).length
  const asnRate =
    recentAsn.length > 0 ? Math.round((asnDone / recentAsn.length) * 100) : null

  const vocabAtt = recentAtt.filter((a) => a.type === 'vocab')
  const vocabPass = vocabAtt.filter(
    (a) => (a.correct ?? 0) >= VOCAB_PASS_THRESHOLD,
  ).length

  const readingAtt = recentAtt.filter((a) => a.type === 'reading')
  const readingTotal = readingAtt.reduce((s, a) => s + (a.total || 0), 0)
  const readingCorrect = readingAtt.reduce((s, a) => s + (a.correct || 0), 0)
  const readingRate =
    readingTotal > 0 ? Math.round((readingCorrect / readingTotal) * 100) : null

  return {
    asnTotal: recentAsn.length,
    asnDone,
    asnRate,
    vocabSessions: vocabAtt.length,
    vocabPass,
    readingTotal,
    readingCorrect,
    readingRate,
  }
}

function fmt(ts: UserAccount['createdAt']): string {
  if (!ts) return ''
  const d = ts.toDate()
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

/** 전화번호 → tel:/sms: 에 쓸 숫자만. 없으면 null. */
function telDigits(phone?: string): string | null {
  if (!phone) return null
  const d = phone.replace(/[^0-9+]/g, '')
  return d || null
}

const PhoneGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.9.36 1.78.7 2.61a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.47-1.27a2 2 0 0 1 2.11-.45c.83.34 1.71.57 2.61.7A2 2 0 0 1 22 16.92Z" />
  </svg>
)

const MsgGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
  </svg>
)

function StatTile({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string
  value: string
  sub?: string
  tone?: 'neutral' | 'good' | 'warn' | 'bad'
}) {
  const toneCls = {
    neutral: 'text-slate-900',
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-red-600',
  }[tone]
  return (
    <div className="flex-1 min-w-0 rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`text-base font-semibold mt-0.5 ${toneCls}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 truncate">{sub}</p>}
    </div>
  )
}

function StudentCard({
  account,
  stats,
  pendingActions,
  onAction,
  busyAction,
}: {
  account: UserAccount
  stats: StudentStats
  pendingActions: Set<string>
  busyAction: string | null
  onAction: (
    kind:
      | 'approve'
      | 'reject'
      | 'password'
      | 'delete'
      | 'weeklyReport'
      | 'assignmentStatus',
  ) => void
}) {
  const isActive = account.status === 'active'
  const asnRateTone: 'good' | 'warn' | 'bad' | 'neutral' =
    stats.asnRate == null
      ? 'neutral'
      : stats.asnRate >= 80
        ? 'good'
        : stats.asnRate >= 50
          ? 'warn'
          : 'bad'
  const readingRateTone: 'good' | 'warn' | 'bad' | 'neutral' =
    stats.readingRate == null
      ? 'neutral'
      : stats.readingRate >= 80
        ? 'good'
        : stats.readingRate >= 60
          ? 'warn'
          : 'bad'

  const isBusy = (k: string) =>
    busyAction === `${account.id}:${k}` || pendingActions.has(`${account.id}:${k}`)

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            to={`/admin/students/${account.id}`}
            className="text-base font-semibold text-slate-900 hover:underline"
          >
            {account.displayName}
          </Link>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            {account.school || '학교 미입력'}
          </p>
          <p className="text-[11px] text-slate-400 truncate">
            {account.phone || '-'}
            {account.parentPhone && ` · 학부모 ${account.parentPhone}`}
          </p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[account.status]}`}
          >
            {STATUS_LABEL[account.status]}
          </span>
          {account.preregistered && (
            <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-violet-50 text-violet-700 border border-violet-200">
              사전 등록
            </span>
          )}
          {(() => {
            const tel = telDigits(account.phone || account.parentPhone)
            if (!tel) return null
            return (
              <div className="flex items-center gap-1">
                <a
                  href={`tel:${tel}`}
                  title="전화"
                  aria-label="전화"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-700 hover:bg-brand-100 transition"
                >
                  <PhoneGlyph />
                </a>
                <a
                  href={`sms:${tel}`}
                  title="문자"
                  aria-label="문자"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
                >
                  <MsgGlyph />
                </a>
              </div>
            )
          })()}
        </div>
      </header>

      {isActive && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              지난 7일
            </p>
            <p className="text-[10px] text-slate-400">{fmt(account.createdAt)} 가입</p>
          </div>
          <div className="flex gap-2">
            <StatTile
              label="과제율"
              value={stats.asnRate == null ? '—' : `${stats.asnRate}%`}
              sub={
                stats.asnTotal === 0
                  ? '과제 없음'
                  : `${stats.asnDone}/${stats.asnTotal}완료`
              }
              tone={asnRateTone}
            />
            <StatTile
              label="단어 통과"
              value={`${stats.vocabPass}회`}
              sub={
                stats.vocabSessions === 0
                  ? '응시 없음'
                  : `${stats.vocabSessions}회 응시`
              }
            />
            <StatTile
              label="문제 정답률"
              value={stats.readingRate == null ? '—' : `${stats.readingRate}%`}
              sub={
                stats.readingTotal === 0
                  ? '응시 없음'
                  : `${stats.readingCorrect}/${stats.readingTotal}문`
              }
              tone={readingRateTone}
            />
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {account.status === 'pending' && (
          <>
            <button
              onClick={() => onAction('approve')}
              className="rounded-md bg-brand-600 text-white text-xs font-medium px-3 py-1.5 hover:bg-brand-700"
            >
              승인
            </button>
            <button
              onClick={() => onAction('reject')}
              className="rounded-md bg-slate-200 text-slate-700 text-xs font-medium px-3 py-1.5 hover:bg-slate-300"
            >
              거부
            </button>
          </>
        )}
        {account.status === 'rejected' && (
          <button
            onClick={() => onAction('approve')}
            className="rounded-md bg-brand-600 text-white text-xs font-medium px-3 py-1.5 hover:bg-brand-700"
          >
            승인으로 변경
          </button>
        )}
        {isActive && (
          <>
            <button
              onClick={() => onAction('weeklyReport')}
              disabled={isBusy('weeklyReport')}
              className="rounded-md bg-slate-900 text-white text-xs font-medium px-3 py-1.5 hover:bg-slate-800 disabled:opacity-50"
              title="이 학생에게 지난 7일 주간 리포트 알림톡 즉시 발송"
            >
              {isBusy('weeklyReport') ? '발송 중…' : '주간 리포트'}
            </button>
            <button
              onClick={() => onAction('assignmentStatus')}
              disabled={isBusy('assignmentStatus')}
              className="rounded-md border border-slate-300 text-slate-700 text-xs font-medium px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
              title="이 학생에게 과제 현황 알림톡 즉시 발송"
            >
              {isBusy('assignmentStatus') ? '발송 중…' : '과제 알림'}
            </button>
          </>
        )}
        <Link
          to={`/admin/students/${account.id}`}
          className="rounded-md border border-slate-200 text-slate-600 text-xs font-medium px-3 py-1.5 hover:bg-slate-50"
        >
          상세
        </Link>
        <button
          onClick={() => onAction('password')}
          className="rounded-md border border-slate-200 text-slate-600 text-xs font-medium px-3 py-1.5 hover:bg-slate-50"
        >
          비번
        </button>
        <button
          onClick={() => onAction('delete')}
          className="rounded-md text-red-600 text-xs font-medium px-3 py-1.5 hover:bg-red-50 ml-auto"
        >
          삭제
        </button>
      </div>
    </article>
  )
}

type StatusFilter = 'all' | UserStatus

export function AdminStudents() {
  const { profile } = useAuth()
  const [accounts, setAccounts] = useState<UserAccount[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [acc, asn, att] = await Promise.all([
        listAccounts(),
        listAllAssignments(),
        listAllAttempts(),
      ])
      setAccounts(acc)
      setAssignments(asn)
      setAttempts(att)
    } catch (e) {
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  /** studentUid 별로 그룹핑된 assignments / attempts (메모이즈) */
  const byStudent = useMemo(() => {
    const asnMap: Record<string, Assignment[]> = {}
    const attMap: Record<string, Attempt[]> = {}
    for (const a of assignments) {
      ;(asnMap[a.studentUid] ??= []).push(a)
    }
    for (const a of attempts) {
      ;(attMap[a.studentUid] ??= []).push(a)
    }
    return { asnMap, attMap }
  }, [assignments, attempts])

  async function handleAction(
    student: UserAccount,
    kind:
      | 'approve'
      | 'reject'
      | 'password'
      | 'delete'
      | 'weeklyReport'
      | 'assignmentStatus',
  ) {
    setFeedback(null)
    const tag = `${student.id}:${kind}`
    setBusyAction(tag)
    try {
      if (kind === 'approve') {
        await setAccountStatus(student.id, 'active')
        await loadAll()
      } else if (kind === 'reject') {
        await setAccountStatus(student.id, 'rejected')
        await loadAll()
      } else if (kind === 'password') {
        const pw = window.prompt('새 비밀번호를 입력하세요')
        if (!pw) return
        await setAccountPassword(student.id, pw)
        setFeedback({ kind: 'ok', msg: `${student.displayName} 비밀번호 변경됨` })
      } else if (kind === 'delete') {
        if (!window.confirm(`${student.displayName} 님의 계정을 정말 삭제할까요?`)) {
          return
        }
        await deleteAccount(student.id)
        await loadAll()
      } else if (kind === 'weeklyReport') {
        if (!window.confirm(`${student.displayName} 님에게 지난 7일 주간 리포트를 지금 보낼까요?`)) {
          return
        }
        const r = await sendWeeklyReportNow(student.id)
        setFeedback({
          kind: r.failed > 0 ? 'err' : 'ok',
          msg: `${student.displayName} 주간 리포트: 성공 ${r.sent} · 실패 ${r.failed}`,
        })
      } else if (kind === 'assignmentStatus') {
        if (!window.confirm(`${student.displayName} 님에게 과제 현황 알림톡을 지금 보낼까요?`)) {
          return
        }
        const r = await sendAssignmentStatusNow(student.id)
        setFeedback({
          kind: r.failed > 0 ? 'err' : 'ok',
          msg: `${student.displayName} 과제 알림: 성공 ${r.sent} · 실패 ${r.failed}`,
        })
      }
    } catch (e) {
      setFeedback({
        kind: 'err',
        msg: e instanceof Error ? e.message : '작업 실패',
      })
    } finally {
      setBusyAction(null)
    }
  }

  const [showPrereg, setShowPrereg] = useState(false)

  const [regrading, setRegrading] = useState(false)
  const [regradeNote, setRegradeNote] = useState<string | null>(null)
  async function handleRegradeAll() {
    if (
      !window.confirm(
        '모든 지문 시험 기록을 현재 정답 기준으로 다시 채점합니다. 진행할까요?',
      )
    )
      return
    setRegrading(true)
    setRegradeNote(null)
    try {
      const r = await regradeAllReadings()
      setRegradeNote(
        `지문 ${r.readings}건 검토 · 변경된 응시 기록 ${r.updated}건 재채점 완료`,
      )
    } catch (e) {
      setRegradeNote(e instanceof Error ? e.message : '재채점에 실패했습니다.')
    } finally {
      setRegrading(false)
    }
  }

  const others = accounts.filter((a) => a.id !== profile?.id)
  const me = accounts.find((a) => a.id === profile?.id)
  const pendingCount = others.filter((a) => a.status === 'pending').length
  const activeCount = others.filter((a) => a.status === 'active').length

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return others
      .filter((a) => filter === 'all' || a.status === filter)
      .filter((a) => {
        if (!q) return true
        return (
          a.displayName.toLowerCase().includes(q) ||
          (a.school || '').toLowerCase().includes(q) ||
          (a.phone || '').includes(q) ||
          (a.email || '').toLowerCase().includes(q)
        )
      })
      .sort((x, y) => {
        // 대기 먼저, 그 다음 활성, 그 다음 거부
        const order = { pending: 0, active: 1, rejected: 2 }
        const od = order[x.status] - order[y.status]
        if (od !== 0) return od
        return x.displayName.localeCompare(y.displayName, 'ko')
      })
  }, [others, filter, search])

  return (
    <div className="space-y-5">
      <BackLink to="/admin" label="관리" />
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          관리자
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
          학생 관리
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          전체 {others.length}명 · 활성 {activeCount} · 승인 대기 {pendingCount}
        </p>
      </header>

      {feedback && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            feedback.kind === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {feedback.msg}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs">
          <span className="font-medium text-slate-900">{me?.displayName}</span>
          <span className="text-slate-500"> · {me?.email}</span>
          <span className="ml-1.5 inline-block rounded bg-brand-50 text-brand-700 px-1.5 py-0.5 text-[10px] font-medium align-middle">
            관리자
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setShowPrereg((v) => !v)}
            className={`rounded-md text-xs font-medium px-3 py-1.5 border ${
              showPrereg
                ? 'bg-slate-900 text-white border-slate-900'
                : 'border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {showPrereg ? '닫기' : '+ 학생 미리 등록'}
          </button>
          <button
            type="button"
            onClick={handleRegradeAll}
            disabled={regrading}
            className="rounded-md border border-slate-200 text-slate-700 text-xs font-medium px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
            title="모든 학생의 지문 시험 기록을 현재 정답 기준으로 재채점"
          >
            {regrading ? '재채점 중…' : '지문 일괄 재채점'}
          </button>
        </div>
      </div>
      {showPrereg && (
        <PreregForm
          onCreated={(a) => {
            setAccounts((prev) => [a, ...prev])
            setShowPrereg(false)
            setFeedback({
              kind: 'ok',
              msg: `${a.displayName} 사전 등록 완료. 학생이 같은 이름·전화(${a.phone}) 로 회원가입하면 자동 연결됩니다.`,
            })
          }}
        />
      )}
      {regradeNote && <p className="text-xs text-brand-700 -mt-3">{regradeNote}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
          {(['all', 'pending', 'active', 'rejected'] as const).map((s) => {
            const label =
              s === 'all'
                ? '전체'
                : s === 'pending'
                  ? `대기 ${pendingCount}`
                  : s === 'active'
                    ? `활성 ${activeCount}`
                    : '거부'
            return (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                  filter === s
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름 / 학교 / 전화번호 검색"
          className="flex-1 min-w-[180px] max-w-xs rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {loading && <p className="text-slate-500 text-sm">불러오는 중…</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {!loading && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          {others.length === 0 ? '아직 가입한 학생이 없습니다.' : '조건에 맞는 학생이 없어요.'}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((a) => {
          const studentAsn = byStudent.asnMap[a.id] ?? []
          const studentAtt = byStudent.attMap[a.id] ?? []
          const stats = computeStats(studentAsn, studentAtt)
          return (
            <StudentCard
              key={a.id}
              account={a}
              stats={stats}
              pendingActions={new Set<string>()}
              busyAction={busyAction}
              onAction={(kind) => handleAction(a, kind)}
            />
          )
        })}
      </div>
    </div>
  )
}

function PreregForm({
  onCreated,
}: {
  onCreated: (account: UserAccount) => void
}) {
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [school, setSchool] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [korean, setKorean] = useState(true)
  const [english, setEnglish] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!korean && !english) {
      setErr('과목을 하나 이상 선택하세요.')
      return
    }
    const subjects: MockSubject[] = []
    if (korean) subjects.push('korean')
    if (english) subjects.push('english')
    setSaving(true)
    try {
      const created = await createPreregisteredStudent({
        displayName,
        phone,
        school,
        parentPhone,
        subjects,
      })
      onCreated(created)
      setDisplayName('')
      setPhone('')
      setSchool('')
      setParentPhone('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '등록 실패')
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-brand-200 bg-brand-50/40 p-4 space-y-3"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">
            이름 <span className="text-red-500">*</span>
          </span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">
            학생 전화 <span className="text-red-500">*</span>
          </span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => setPhone(formatPhoneKR(phone))}
            required
            placeholder="가입 시 매칭 키"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">학교</span>
          <input
            type="text"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">학부모 전화</span>
          <input
            type="tel"
            value={parentPhone}
            onChange={(e) => setParentPhone(e.target.value)}
            onBlur={() => setParentPhone(formatPhoneKR(parentPhone))}
            className={inputCls}
          />
        </label>
      </div>
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <span className="text-slate-600 font-medium">수강 과목</span>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={korean}
            onChange={(e) => setKorean(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          국어
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={english}
            onChange={(e) => setEnglish(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          영어
        </label>
      </div>
      <p className="text-[11px] text-slate-500">
        학생이 <strong>같은 이름 · 같은 전화번호</strong>로 회원가입하면 이
        계정에 자동으로 연결되고 즉시 활성 상태가 됩니다. 이메일과 비밀번호는
        학생이 가입 시 직접 설정합니다.
      </p>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-slate-900 text-white text-xs font-medium px-3 py-1.5 hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? '등록 중…' : '사전 등록'}
        </button>
      </div>
    </form>
  )
}
