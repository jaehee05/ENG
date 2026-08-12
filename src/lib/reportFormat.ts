import type { Timestamp } from 'firebase/firestore'

/**
 * 성적표 두 장(추이·회차)이 같은 날짜 표기를 쓰도록 모아 둔 것.
 * 인쇄물이라 한국 시간 기준으로만 찍는다.
 */

/** 'YYYY-MM-DD' → '2026. 6. 4.' */
export function fmtReportDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${y}. ${Number(m)}. ${Number(d)}.`
}

/** 발행일. '2026년 8월 12일' */
export function todayLabel(): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date())
}

/** Timestamp → KST 'YYYY-MM-DD'. 없으면 빈 문자열. */
export function isoKST(ts: Timestamp | null | undefined): string {
  const d = ts?.toDate()
  if (!d) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}
