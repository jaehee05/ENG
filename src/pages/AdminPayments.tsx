import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/useAuth'
import { listAccounts } from '../lib/account'
import {
  createPayment,
  deletePayment,
  listAllClassSessions,
  listAllPayments,
} from '../lib/firestore'
import type { ClassSession, Payment, UserAccount } from '../lib/types'

const KST_TZ = 'Asia/Seoul'

function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function fmtCurrency(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`
}

function fmtDateLabel(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}월 ${Number(d)}일`
}

interface Balance {
  paid: number
  used: number
  balance: number
  /** 앞으로 예정 수업 중 현재 잔액으로 커버되는 횟수. */
  coveredUpcoming: number
  /** 잔액이 소진되어 결제가 필요해지는 첫 수업일 (없으면 null). */
  dueDateISO: string | null
}

interface Tx {
  key: string
  dateISO: string
  kind: 'payment' | 'class'
  label: string
  delta: number
  balanceAfter: number
  paymentId?: string
}

export function AdminPayments() {
  const { profile } = useAuth()
  const [accounts, setAccounts] = useState<UserAccount[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUid, setSelectedUid] = useState<string | null>(null)

  const [amount, setAmount] = useState('')
  const [dateISO, setDateISO] = useState(todayISO())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const today = todayISO()
  const curMonth = today.slice(0, 7)

  useEffect(() => {
    let cancelled = false
    Promise.all([listAccounts(), listAllPayments(), listAllClassSessions()])
      .then(([accs, pays, sess]) => {
        if (cancelled) return
        setAccounts(accs)
        setPayments(pays)
        setSessions(sess)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const students = useMemo(
    () =>
      accounts
        .filter((a) => a.role === 'student' && a.status === 'active')
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko')),
    [accounts],
  )

  // 수입 = 완료된 수업의 금액 합계 (이번 달 / 전체)
  const income = useMemo(() => {
    let month = 0
    let total = 0
    let received = 0 // 이번 달 실제 입금(결제) 합계
    for (const s of sessions) {
      if (s.status !== 'done') continue
      total += s.cost || 0
      if (s.dateISO.slice(0, 7) === curMonth) month += s.cost || 0
    }
    for (const p of payments) {
      if (p.dateISO.slice(0, 7) === curMonth) received += p.amount || 0
    }
    return { month, total, received }
  }, [sessions, payments, curMonth])

  const balanceByUid = useMemo(() => {
    const map = new Map<string, Balance>()
    const upcomingByUid = new Map<string, ClassSession[]>()
    for (const s of students) {
      map.set(s.id, {
        paid: 0,
        used: 0,
        balance: 0,
        coveredUpcoming: 0,
        dueDateISO: null,
      })
    }
    for (const p of payments) {
      const b = map.get(p.studentUid)
      if (b) b.paid += p.amount || 0
    }
    for (const s of sessions) {
      const b = map.get(s.studentUid)
      if (!b) continue
      if (s.status === 'done') b.used += s.cost || 0
      else if (s.status === 'scheduled' && s.dateISO >= today) {
        const arr = upcomingByUid.get(s.studentUid) ?? []
        arr.push(s)
        upcomingByUid.set(s.studentUid, arr)
      }
    }
    for (const [uid, b] of map) {
      b.balance = b.paid - b.used
      const up = (upcomingByUid.get(uid) ?? [])
        .slice()
        .sort((a, c) => (a.dateISO < c.dateISO ? -1 : 1))
      let running = b.balance
      for (const s of up) {
        running -= s.cost || 0
        if (running < 0) {
          b.dueDateISO = s.dateISO
          break
        }
        b.coveredUpcoming++
      }
    }
    return map
  }, [students, payments, sessions, today])

  const selectedStudent = students.find((s) => s.id === selectedUid) ?? null
  const sel = selectedStudent ? balanceByUid.get(selectedStudent.id) : null

  // 선택 학생의 시간순 원장 (결제 +, 완료 수업 −) + 러닝 잔액
  const ledger = useMemo<Tx[]>(() => {
    if (!selectedUid) return []
    const rows: Omit<Tx, 'balanceAfter'>[] = []
    for (const p of payments) {
      if (p.studentUid !== selectedUid) continue
      rows.push({
        key: `p-${p.id}`,
        dateISO: p.dateISO,
        kind: 'payment',
        label: p.note?.trim() ? `결제 · ${p.note.trim()}` : '결제',
        delta: p.amount || 0,
        paymentId: p.id,
      })
    }
    for (const s of sessions) {
      if (s.studentUid !== selectedUid || s.status !== 'done') continue
      rows.push({
        key: `s-${s.id}`,
        dateISO: s.dateISO,
        kind: 'class',
        label: `수업 완료 · ${s.title}`,
        delta: -(s.cost || 0),
      })
    }
    rows.sort((a, b) => {
      if (a.dateISO !== b.dateISO) return a.dateISO < b.dateISO ? -1 : 1
      if (a.kind !== b.kind) return a.kind === 'payment' ? -1 : 1
      return 0
    })
    let running = 0
    const withBalance: Tx[] = rows.map((r) => {
      running += r.delta
      return { ...r, balanceAfter: running }
    })
    return withBalance.reverse()
  }, [selectedUid, payments, sessions])

  // 선택 학생의 예정 수업 + 러닝 잔액 예측 (결제 필요 시점)
  const forecast = useMemo(() => {
    if (!selectedUid || !sel) return []
    const up = sessions
      .filter(
        (s) =>
          s.studentUid === selectedUid &&
          s.status === 'scheduled' &&
          s.dateISO >= today,
      )
      .sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1))
    let running = sel.balance
    return up.map((s) => {
      running -= s.cost || 0
      return { s, after: running }
    })
  }, [selectedUid, sel, sessions, today])

  async function handleAddPayment(e: FormEvent) {
    e.preventDefault()
    if (!selectedStudent || !profile) return
    const amt = Number.parseInt(amount, 10)
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('금액은 0보다 큰 숫자여야 합니다.')
      return
    }
    if (!dateISO) {
      setError('결제일을 선택하세요.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const id = await createPayment({
        studentUid: selectedStudent.id,
        studentName: selectedStudent.displayName,
        amount: amt,
        dateISO,
        note,
        createdBy: profile.id,
        createdByName: profile.displayName,
      })
      setPayments((prev) => [
        {
          id,
          studentUid: selectedStudent.id,
          studentName: selectedStudent.displayName,
          amount: amt,
          dateISO,
          note: note.trim() || undefined,
          createdBy: profile.id,
          createdByName: profile.displayName,
          createdAt: null,
        },
        ...prev,
      ])
      setAmount('')
      setNote('')
      setDateISO(todayISO())
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeletePayment(p: Payment) {
    if (
      !window.confirm(
        `${fmtDateLabel(p.dateISO)} 결제 ${fmtCurrency(p.amount)}를 삭제할까요?`,
      )
    )
      return
    const prev = payments
    setPayments((cur) => cur.filter((x) => x.id !== p.id))
    try {
      await deletePayment(p.id)
    } catch {
      setPayments(prev)
    }
  }

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중…</p>

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          관리
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
          결제 / 정산
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          수입은 <b>완료한 수업</b> 기준으로 집계됩니다. 선불 결제를 적립하면 수업을 완료할 때마다 잔액이 차감되고, 잔액이 부족해지는 수업일을 <b>결제 필요일</b>로 알려줘요.
        </p>
      </header>

      {!selectedStudent && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-3.5">
            <p className="text-[11px] text-slate-500">이번 달 수입 (완료 수업)</p>
            <p className="text-lg font-bold text-brand-700 tabular-nums mt-0.5">
              {fmtCurrency(income.month)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              이번 달 입금 {fmtCurrency(income.received)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3.5">
            <p className="text-[11px] text-slate-500">전체 누적 수입</p>
            <p className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">
              {fmtCurrency(income.total)}
            </p>
          </div>
        </div>
      )}

      {!selectedStudent ? (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
          {students.length === 0 && (
            <p className="px-4 py-6 text-sm text-slate-400 text-center">
              활성 학생이 없습니다.
            </p>
          )}
          {students.map((s) => {
            const b = balanceByUid.get(s.id)!
            const low = b.balance <= 0
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSelectedUid(s.id)
                  setError(null)
                }}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {s.displayName}
                    {s.school ? (
                      <span className="text-slate-400 font-normal"> · {s.school}</span>
                    ) : null}
                  </p>
                  {b.dueDateISO ? (
                    <p className="text-[11px] text-red-600 font-medium mt-0.5">
                      {fmtDateLabel(b.dueDateISO)} 수업 전 결제 필요
                      {b.coveredUpcoming > 0 && ` (앞으로 ${b.coveredUpcoming}회 가능)`}
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      결제 {fmtCurrency(b.paid)} · 완료 {fmtCurrency(b.used)}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p
                    className={`text-sm font-semibold tabular-nums ${
                      low ? 'text-red-600' : 'text-slate-900'
                    }`}
                  >
                    {fmtCurrency(b.balance)}
                  </p>
                  <p className="text-[10px] text-slate-400">잔액</p>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setSelectedUid(null)}
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            ← 전체 학생
          </button>

          <h2 className="text-lg font-semibold text-slate-900">
            {selectedStudent.displayName}
          </h2>

          {sel && (
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-[11px] text-slate-500">총 결제</p>
                <p className="text-sm font-semibold text-slate-900 tabular-nums mt-0.5">
                  {fmtCurrency(sel.paid)}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-[11px] text-slate-500">완료 수업 차감</p>
                <p className="text-sm font-semibold text-slate-900 tabular-nums mt-0.5">
                  {fmtCurrency(sel.used)}
                </p>
              </div>
              <div
                className={`rounded-lg border p-3 ${
                  sel.balance <= 0
                    ? 'border-red-200 bg-red-50'
                    : 'border-brand-200 bg-brand-50/60'
                }`}
              >
                <p className="text-[11px] text-slate-500">남은 잔액</p>
                <p
                  className={`text-sm font-bold tabular-nums mt-0.5 ${
                    sel.balance <= 0 ? 'text-red-600' : 'text-brand-700'
                  }`}
                >
                  {fmtCurrency(sel.balance)}
                </p>
              </div>
            </div>
          )}

          {sel && (
            <div
              className={`rounded-lg border px-4 py-2.5 text-sm ${
                sel.dueDateISO
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
            >
              {sel.dueDateISO
                ? `⚠️ ${fmtDateLabel(sel.dueDateISO)} 수업 전까지 결제가 필요해요. (현재 잔액으로 앞으로 ${sel.coveredUpcoming}회 수업 가능)`
                : forecast.length > 0
                  ? `✅ 예정된 ${forecast.length}회 수업까지 잔액으로 충분해요.`
                  : '예정된 수업이 없어요.'}
            </div>
          )}

          {/* 예정 수업 예측 */}
          {forecast.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">
                  예정 수업 · 잔액 예측
                </h3>
              </div>
              <ul className="divide-y divide-slate-100">
                {forecast.map(({ s, after }) => (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-16 shrink-0 text-xs text-slate-500 tabular-nums">
                      {fmtDateLabel(s.dateISO)}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-slate-800 truncate">
                      {s.title}
                    </span>
                    <span className="shrink-0 text-xs text-slate-500 tabular-nums">
                      −{fmtCurrency(s.cost || 0).replace('원', '')}
                    </span>
                    <span
                      className={`w-24 shrink-0 text-right text-xs font-medium tabular-nums ${
                        after < 0 ? 'text-red-600' : 'text-slate-500'
                      }`}
                    >
                      {after < 0 ? '부족 ' : '잔액 '}
                      {after.toLocaleString('ko-KR')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 결제 추가 */}
          <form
            onSubmit={handleAddPayment}
            className="rounded-lg border border-slate-200 bg-white p-4 space-y-3"
          >
            <h3 className="text-sm font-semibold text-slate-700">결제 추가</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">결제일</span>
                <input
                  type="date"
                  value={dateISO}
                  onChange={(e) => setDateISO(e.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">금액 (원)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="예: 400000"
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">메모 (선택)</span>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="예: 4월분 · 계좌이체"
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </label>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? '저장 중…' : '결제 등록'}
              </button>
            </div>
          </form>

          {/* 원장 (시간순) */}
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">거래 내역</h3>
            </div>
            {ledger.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-400 text-center">
                아직 결제·완료 수업 기록이 없습니다.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {ledger.map((tx) => (
                  <li key={tx.key} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-16 shrink-0 text-xs text-slate-500 tabular-nums">
                      {fmtDateLabel(tx.dateISO)}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        tx.kind === 'payment'
                          ? 'bg-brand-100 text-brand-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {tx.kind === 'payment' ? '결제' : '차감'}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-slate-800 truncate">
                      {tx.label}
                    </span>
                    <span
                      className={`shrink-0 text-sm font-medium tabular-nums ${
                        tx.delta >= 0 ? 'text-emerald-700' : 'text-slate-700'
                      }`}
                    >
                      {tx.delta >= 0 ? '+' : '−'}
                      {fmtCurrency(Math.abs(tx.delta)).replace('원', '')}
                    </span>
                    <span className="w-20 shrink-0 text-right text-[11px] text-slate-400 tabular-nums">
                      잔액 {tx.balanceAfter.toLocaleString('ko-KR')}
                    </span>
                    {tx.paymentId ? (
                      <button
                        type="button"
                        onClick={() => {
                          const p = payments.find((x) => x.id === tx.paymentId)
                          if (p) void handleDeletePayment(p)
                        }}
                        className="shrink-0 text-slate-300 hover:text-red-500 text-xs px-1"
                        aria-label="결제 삭제"
                      >
                        ✕
                      </button>
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-[11px] text-slate-400">
            차감은 수업 일정에서 수업 상태를 <b>완료</b>로 바꾸면 자동 반영됩니다.
          </p>
        </div>
      )}
    </div>
  )
}
