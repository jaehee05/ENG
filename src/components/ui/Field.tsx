import type { ReactNode } from 'react'
import { cx } from './cx'

/** 입력칸 위 이름표 + (있으면) 아래 도움말. */
export function Field({
  label,
  hint,
  className,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <label className={cx('flex flex-col gap-1.5', className)}>
      <span className="text-[13px] font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-slate-500">{hint}</span>}
    </label>
  )
}
