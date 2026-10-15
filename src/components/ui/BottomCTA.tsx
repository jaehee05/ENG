import type { ReactNode } from 'react'
import { cx } from './cx'

/**
 * 화면의 주 행동 하나를 아래에 붙여 두는 버튼 바.
 *
 * fixed 가 아니라 sticky 로 붙인다. Layout 의 본문은 하단 탭바 위에서 끝나는
 * 스크롤 영역이라, 그 안에서 sticky bottom-0 이면 탭바 바로 위에 저절로 앉는다
 * — 탭바 높이나 safe-area 를 계산할 필요가 없다. 그래서 반드시 화면 맨 끝에 둔다.
 *
 * Layout 밖(로그인·회원가입)처럼 탭바가 없는 화면에선 standalone 으로 아이폰 홈
 * 막대 자리를 직접 비운다.
 */
export function BottomCTA({
  children,
  standalone = false,
  className,
}: {
  children: ReactNode
  standalone?: boolean
  className?: string
}) {
  return (
    <div
      className={cx(
        'sticky bottom-0 z-20 -mx-1 px-1 pt-6 pb-3 mt-4',
        // 위쪽은 바탕색으로 서서히 — 버튼 뒤로 지나가는 글자가 잘려 보이지 않게.
        'bg-gradient-to-t from-surface via-surface/95 to-surface/0',
        className,
      )}
      style={standalone ? { paddingBottom: 'max(12px, env(safe-area-inset-bottom))' } : undefined}
    >
      <div className="flex gap-2">{children}</div>
    </div>
  )
}
