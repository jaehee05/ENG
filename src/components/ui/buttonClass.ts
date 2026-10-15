import { cx } from './cx'

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger' | 'dangerSoft'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-700',
  secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-200',
  text: 'bg-transparent text-slate-600 hover:bg-slate-100 active:bg-slate-100',
  danger: 'bg-red-500 text-white hover:bg-red-600 active:bg-red-600',
  dangerSoft: 'bg-red-50 text-red-600 hover:bg-red-100 active:bg-red-100',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-[13px] rounded-xl',
  md: 'h-12 px-5 text-[15px] rounded-2xl',
  lg: 'h-14 px-6 text-[16px] rounded-2xl',
}

/**
 * Link 에도 같은 모양을 입히려고 클래스만 따로 낸다.
 *   <Link to="…" className={buttonClass({ block: true })}>시험 보기</Link>
 */
export function buttonClass({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  className?: string
} = {}): string {
  return cx(
    'pressable inline-flex items-center justify-center gap-1.5 font-semibold whitespace-nowrap select-none',
    'disabled:opacity-40 disabled:pointer-events-none aria-disabled:opacity-40 aria-disabled:pointer-events-none',
    VARIANT[variant],
    SIZE[size],
    block && 'w-full',
    className,
  )
}
