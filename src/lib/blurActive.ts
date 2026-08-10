/**
 * 지금 포커스를 쥔 요소의 포커스를 푼다.
 *
 * iOS(WKWebView)는 포커스를 가진 입력칸이 화면에서 사라지면 키보드만 내려가고
 * 그 위의 액세서리 바(∧ ∨ 완료)가 남는다. 로그인 직후 홈 화면에 그 바가 떠
 * 있던 것이 이 경우다 — 비밀번호 칸이 포커스를 쥔 채로 화면이 바뀌었다.
 *
 * 화면을 옮기기 전이나 폼을 보낼 때 한 번 불러 준다.
 */
export function blurActiveElement(): void {
  if (typeof document === 'undefined') return
  const el = document.activeElement
  if (el instanceof HTMLElement && el !== document.body) el.blur()
}
