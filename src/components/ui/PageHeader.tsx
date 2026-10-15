import type { ReactNode } from 'react'
import { cx } from './cx'

/** 화면 제목. 화면마다 크기·굵기가 제각각이던 것을 하나로. */
export function PageHeader({
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
    <header className={cx('flex items-start justify-between gap-3 px-1', className)}>
      <div className="min-w-0">
        <h1 className="text-[24px] sm:text-[26px] font-bold text-slate-900 tracking-tight leading-tight">
          {title}
        </h1>
        {description && <p className="text-[15px] text-slate-500 mt-1.5">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}
