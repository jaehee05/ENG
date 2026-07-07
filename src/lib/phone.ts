/**
 * 한국 전화번호를 하이픈 형식(010-0000-0000)으로 정규화한다.
 * 숫자만 추출 후 자리수에 맞춰 하이픈을 넣는다. 알 수 없는 형식은 trim만 해서 반환.
 * 예) "01000000000" → "010-0000-0000", "010 1234 5678" → "010-1234-5678"
 */
export function formatPhoneKR(raw?: string | null): string {
  const d = (raw ?? '').replace(/\D/g, '')
  if (!d) return ''
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
  if (d.length === 10) {
    if (d.startsWith('02')) return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  }
  if (d.length === 9 && d.startsWith('02')) {
    return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`
  }
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`
  return (raw ?? '').trim()
}
