import type { ReactNode } from 'react'
import { cx } from './cx'

export type BadgeTone = 'brand' | 'gray' | 'amber' | 'red' | 'blue' | 'dark'

const TONE: Record<BadgeTone, string> = {
  brand: 'bg-brand-50 text-brand-700',
  gray: 'bg-slate-100 text-slate-600',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-600',
  blue: 'bg-sky-50 text-sky-700',
  dark: 'bg-slate-900 text-white',
}

/** 상태 배지 — 화면마다 다르던 완료/미완료/진행 중 표시를 하나로. */
export function Badge({
  tone = 'gray',
  size = 'sm',
  className,
  children,
}: {
  tone?: BadgeTone
  size?: 'sm' | 'md'
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full font-semibold whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[12px]' : 'px-2.5 py-1 text-[13px]',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
