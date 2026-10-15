/** 조건부 클래스 이어 붙이기. 거짓 값은 버린다. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
