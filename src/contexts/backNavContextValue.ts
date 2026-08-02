import { createContext } from 'react'

export interface BackOverride {
  /** 기록이 없을 때 갈 경로. 생략하면 backNav.ts 의 표를 쓴다. */
  to?: string
  /** 버튼 이름. 생략하면 표의 이름을 쓴다. */
  label?: string
  /** 값이 있으면 이동 전에 확인을 받는다. 응시 중처럼 나가면 잃는 게 있을 때. */
  confirmMessage?: string
}

/**
 * 화면이 자기 뒤로가기를 헤더에 알려주는 통로. Layout 이 값을 들고 있다.
 * null 을 넣으면 덮어쓰기가 풀리고 표의 기본값으로 돌아간다.
 */
export const BackNavContext = createContext<
  ((override: BackOverride | null) => void) | null
>(null)
