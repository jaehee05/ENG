import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

/**
 * 회색 바탕 위의 흰 면. 테두리·그림자 없이 면과 여백으로만 구분한다.
 * 목록을 담을 땐 padded={false} 로 두고 ListRow 가 제 여백을 갖게 한다.
 */
export function Card({
  padded = true,
  className,
  children,
  ...rest
}: { padded?: boolean; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx('bg-white rounded-card', padded ? 'p-5' : 'py-1.5', className)}
      {...rest}
    >
      {children}
    </div>
  )
}
