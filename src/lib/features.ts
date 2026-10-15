/**
 * 화면에서만 끄는 기능 스위치.
 *
 * 코드·라우트·데이터는 그대로 두고 진입점만 감춘다. 되살릴 때 여기 하나만
 * true 로 바꾸면 되도록, 감추는 자리마다 이 값을 보고 판단하게 한다.
 */

/**
 * 내 단어장 (2026-08-01 숨김).
 *
 * 끄면 학생 네비·홈 바로가기·더보기, 관리자 학생 상세의 단어장 탭·통계
 * 카드·기록 필터가 사라진다. /wordbook 라우트와 이미 쌓인 응시 기록은
 * 건드리지 않는다 — 주소를 직접 치면 열리고, 지난 기록은 그대로 보인다.
 */
export const WORDBOOK_ENABLED = false

/**
 * 모의고사 응시 화면의 ‘OMR 사진으로 불러오기’ (2026-10-15 켬).
 *
 * 사진을 고를 때 iOS 가 카메라 권한 문구(Info.plist)를 요구하는데, 그 문구가 없는
 * 앱에서 카메라를 열면 앱이 그대로 죽는다. Info.plist 는 네이티브 쪽이라 Capgo
 * OTA 로는 안 나가고 앱스토어 빌드로만 나간다. 그래서 웹은 바로 켜고, 앱은
 * 문구가 들어간 빌드(OMR_MIN_NATIVE_VERSION 이상)에서만 보인다.
 * 개발 서버에서는 이 값과 상관없이 보인다.
 */
export const OMR_PHOTO_ENABLED = true

/**
 * 카메라·사진 권한 문구가 처음 들어간 네이티브 앱 버전(CFBundleShortVersionString).
 * 1.0 에는 문구가 없다 — 그 앱에서 버튼을 보이면 카메라를 고르는 순간 죽는다.
 */
export const OMR_MIN_NATIVE_VERSION = '1.1'

/** '1.10' > '1.9' 처럼 점으로 나눈 숫자끼리 비교한다. */
export function isVersionAtLeast(version: string, min: string): boolean {
  const a = version.split('.').map((n) => parseInt(n, 10) || 0)
  const b = min.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return true
}
