import type { ReactNode } from 'react'
import { cx } from './cx'

/**
 * 화면의 주 행동 하나를 화면 아래에 붙여 두는 버튼 바.
 *
 * sticky 로 붙이면 본문이 짧은 화면에서 버튼이 본문 바로 밑(화면 가운데)에
 * 떠 버린다. 그래서 fixed 로 띄우고, 하단 탭바 높이는 Layout 이 재서 넣어 주는
 * --tabbar-h 로 비켜 앉는다. 본문 끝이 버튼에 가리지 않게 같은 높이의 빈칸을
 * 제자리에 남긴다.
 *
 * Layout 밖(로그인·회원가입)처럼 탭바가 없는 화면은 --tabbar-h 가 0 이라
 * 아이폰 홈 막대 자리만 비우면 된다 — standalone 이 그 일을 한다.
 */
export function BottomCTA({
  children,
  standalone = false,
  className,
  width = 'max-w-2xl',
}: {
  children: ReactNode
  standalone?: boolean
  className?: string
  /** 버튼 줄 최대 폭. 화면 본문 폭과 맞춘다. */
  width?: string
}) {
  return (
    <>
      <div aria-hidden className="h-24" />
      <div
        className={cx(
          'fixed inset-x-0 z-20 px-5 sm:px-6 pt-6 pb-3',
          // 위쪽은 바탕색으로 서서히 — 버튼 뒤로 지나가는 글자가 잘려 보이지 않게.
          'bg-gradient-to-t from-surface via-surface/95 to-surface/0',
          className,
        )}
        style={{
          bottom: 'var(--tabbar-h, 0px)',
          paddingBottom: standalone ? 'max(12px, env(safe-area-inset-bottom))' : undefined,
        }}
      >
        <div className={cx('mx-auto flex gap-2', width)}>{children}</div>
      </div>
    </>
  )
}
