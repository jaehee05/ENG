import { useCallback, useSyncExternalStore } from 'react'

/**
 * CSS 미디어쿼리 결과를 React 상태로 노출한다.
 * 레이아웃을 CSS만으로 분기할 수 없을 때(= 기기에 따라 렌더 트리 자체가 달라질 때) 사용.
 *
 * useEffect + setState 대신 useSyncExternalStore를 쓴 이유:
 * 첫 렌더부터 올바른 값을 반환하므로 레이아웃이 한 번 깜빡이지 않는다.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** tailwind.config.js 의 xl(1280) — 맥북/대형 아이패드 가로. 2단 레이아웃 분기 기준. */
export const DESKTOP_QUERY = '(min-width: 1280px)'
