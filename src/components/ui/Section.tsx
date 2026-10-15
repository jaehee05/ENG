import type { ReactNode } from 'react'
import { cx } from './cx'

/** 섹션 제목 + 그 아래 카드 묶음. 제목 오른쪽엔 ‘전체 보기’ 같은 링크를 둘 수 있다. */
export function Section({
  title,
  description,
  action,
  className,
  children,
}: {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={cx('space-y-3', className)}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-3 px-1">
          <div className="min-w-0">
            {title && <h2 className="text-[17px] font-bold text-slate-900 tracking-tight">{title}</h2>}
            {description && <p className="text-[13px] text-slate-500 mt-0.5">{description}</p>}
          </div>
          {action && <div className="shrink-0 text-[13px] font-medium text-slate-500">{action}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
