import type { ClassSession, ClassSessionStatus, Payment } from './types'

const KST_TZ = 'Asia/Seoul'

/** 잔액에서 차감(수입 집계)되는 수업 상태: 완료·보강. 취소·예정은 제외. */
export function isConsumed(status: ClassSessionStatus): boolean {
  return status === 'done' || status === 'makeup'
}

/** 오늘 날짜(Asia/Seoul, YYYY-MM-DD). */
export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function fmtCurrency(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`
}

/** 'YYYY-MM-DD' → 'M월 D일'. */
export function fmtDateLabel(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}월 ${Number(d)}일`
}

export interface Balance {
  paid: number
  used: number
  balance: number
  /** 앞으로 예정 수업 중 현재 잔액으로 커버되는 횟수. */
  coveredUpcoming: number
  /** 잔액이 소진되어 결제가 필요해지는 첫 수업일 (없으면 null). */
  dueDateISO: string | null
}

/**
 * 한 학생의 선불 잔액과 "다음 결제 필요일"을 계산한다.
 * 잔액 = Σ결제 − Σ(완료·보강 수업 cost). 이후 오늘 이후의 예정 수업을
 * 날짜순으로 잔액에서 소진해, 잔액이 마이너스가 되는 첫 수업일이 결제 필요일.
 *
 * payments/sessions 는 해당 학생(studentUid) 것만 넘긴다.
 */
export function computeStudentBalance(
  payments: Payment[],
  sessions: ClassSession[],
  today: string,
): Balance {
  let paid = 0
  for (const p of payments) paid += p.amount || 0

  let used = 0
  const upcoming: ClassSession[] = []
  for (const s of sessions) {
    if (isConsumed(s.status)) used += s.cost || 0
    else if (s.status === 'scheduled' && s.dateISO >= today) upcoming.push(s)
  }

  const balance = paid - used
  upcoming.sort((a, c) => (a.dateISO < c.dateISO ? -1 : 1))

  let running = balance
  let coveredUpcoming = 0
  let dueDateISO: string | null = null
  for (const s of upcoming) {
    running -= s.cost || 0
    if (running < 0) {
      dueDateISO = s.dateISO
      break
    }
    coveredUpcoming++
  }

  return { paid, used, balance, coveredUpcoming, dueDateISO }
}
