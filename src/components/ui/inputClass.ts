import { cx } from './cx'

/**
 * 입력칸 모양. 테두리 대신 회색 면, 누르면 흰 면 + 초록 테두리.
 * iOS 는 16px 보다 작은 입력칸에 포커스하면 화면을 확대해 버려 글자를 16px 로 둔다.
 */
export function inputClass(className?: string): string {
  return cx(
    'w-full h-12 rounded-xl bg-slate-100 px-4 text-[16px] text-slate-900 placeholder:text-slate-400',
    'border border-transparent focus:bg-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20',
    'disabled:opacity-50 transition-colors',
    className,
  )
}
