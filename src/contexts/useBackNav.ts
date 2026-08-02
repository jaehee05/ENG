import { useContext, useEffect } from 'react'
import { BackNavContext, type BackOverride } from './backNavContextValue'

/**
 * 헤더 뒤로가기를 이 화면에 맞게 덮어쓴다.
 *
 * 대부분의 화면은 이걸 부를 필요가 없다 — lib/backNav.ts 의 표가 경로만 보고
 * 목적지를 정한다. 표로 알 수 없을 때만 쓴다:
 *   - 확인 문구가 필요할 때 (응시 중 이탈)
 *   - 목적지가 화면이 읽어 온 데이터에 따라 달라질 때 (시험지 → 소속 교재)
 *
 * 훅이므로 조건문·이른 return 보다 위에서 불러야 한다. 아직 데이터를 못 읽어
 * 목적지를 모르면 to 를 undefined 로 두면 된다 — 그동안은 표의 값이 쓰인다.
 */
export function useBackNav({ to, label, confirmMessage }: BackOverride) {
  const setOverride = useContext(BackNavContext)

  useEffect(() => {
    if (!setOverride) return
    setOverride({ to, label, confirmMessage })
    return () => setOverride(null)
  }, [setOverride, to, label, confirmMessage])
}
