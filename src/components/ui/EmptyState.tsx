import type { ReactNode } from 'react'
import { cx } from './cx'

/** 빈 목록. 점선 상자 대신 가운데 짧은 문장 + (있으면) 할 수 있는 행동 하나. */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('py-12 px-6 text-center', className)}>
      <p className="text-[15px] font-semibold text-slate-700">{title}</p>
      {description && <p className="text-[13px] text-slate-500 mt-1">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
