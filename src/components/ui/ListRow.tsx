import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from './cx'

interface Props {
  title: ReactNode
  description?: ReactNode
  /** 왼쪽 아이콘·썸네일. */
  leading?: ReactNode
  /** 오른쪽 값(점수·상태 배지 등). */
  trailing?: ReactNode
  /** 오른쪽 끝 ›. 링크·버튼이면 기본으로 붙는다. */
  chevron?: boolean
  to?: string
  onClick?: () => void
  disabled?: boolean
  className?: string
}

/**
 * 목록 한 줄. 카드(Card padded={false}) 안에 이어 붙인다.
 * 줄 사이는 선이 아니라 여백으로 나눈다 — 각 줄이 제 높이(최소 60px)를 갖는다.
 */
export function ListRow({
  title,
  description,
  leading,
  trailing,
  chevron,
  to,
  onClick,
  disabled,
  className,
}: Props) {
  const interactive = !!(to || onClick) && !disabled
  const showChevron = chevron ?? interactive
  const body = (
    <>
      {leading && <span className="shrink-0 flex items-center">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-slate-900 truncate">{title}</span>
        {description && (
          <span className="block text-[13px] text-slate-500 mt-0.5 truncate">{description}</span>
        )}
      </span>
      {trailing && <span className="shrink-0 flex items-center gap-2 text-[15px] text-slate-600">{trailing}</span>}
      {showChevron && (
        <svg className="shrink-0 text-slate-300" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 6l6 6-6 6" />
        </svg>
      )}
    </>
  )
  const cls = cx(
    'w-full flex items-center gap-3 px-5 py-3.5 min-h-[60px] text-left rounded-2xl',
    interactive && 'pressable active:bg-slate-100 hover:bg-slate-50',
    disabled && 'opacity-50',
    className,
  )
  if (to && !disabled) {
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={cls}>
        {body}
      </button>
    )
  }
  return <div className={cls}>{body}</div>
}
