interface CloverProps {
  /** 0..4 — 채워진 잎 개수. */
  filled: number
  /** 채워진 잎의 hex 색상. */
  color: string
  size?: number
  className?: string
}

const LEAVES: { cx: number; cy: number }[] = [
  { cx: 12, cy: 6 }, // top
  { cx: 18, cy: 12 }, // right
  { cx: 12, cy: 18 }, // bottom
  { cx: 6, cy: 12 }, // left
]

export function Clover({ filled, color, size = 24, className }: CloverProps) {
  const f = Math.max(0, Math.min(4, Math.round(filled)))
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
    >
      {LEAVES.map((leaf, i) => {
        const on = i < f
        return (
          <circle
            key={i}
            cx={leaf.cx}
            cy={leaf.cy}
            r={5}
            fill={on ? color : '#f1f5f9'}
            stroke={on ? color : '#cbd5e1'}
            strokeWidth="1"
          />
        )
      })}
      <circle cx={12} cy={12} r={1.4} fill={f === 4 ? color : '#cbd5e1'} />
    </svg>
  )
}

/** doneCount/totalCount 를 0..4 잎 개수로 매핑. total==done 이면 항상 4. */
export function progressToLeaves(done: number, total: number): number {
  if (total <= 0) return 0
  if (done >= total) return 4
  return Math.max(0, Math.min(3, Math.floor((done / total) * 4)))
}

interface CloverCheckProps {
  done: boolean
  /** 완료 시 채워질 hex 색상. */
  color: string
  size?: number
  onToggle?: () => void
  ariaLabel?: string
}

/** 네잎클로버 모양의 체크 토글 (Todomate 스타일).
 *  4개 원이 가운데에서 겹쳐 하나의 클로버 실루엣. 완료 시 색상 채움 + 흰 체크. */
export function CloverCheck({
  done,
  color,
  size = 26,
  onToggle,
  ariaLabel,
}: CloverCheckProps) {
  const fill = done ? color : '#e2e8f0'
  const inner = (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <g fill={fill}>
        <circle cx={12} cy={8} r={6} />
        <circle cx={16} cy={12} r={6} />
        <circle cx={12} cy={16} r={6} />
        <circle cx={8} cy={12} r={6} />
      </g>
      {done && (
        <path
          d="M8.5 12.2 L11 14.6 L15.6 9.8"
          fill="none"
          stroke="#fff"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
  if (onToggle) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-label={ariaLabel ?? (done ? '완료 취소' : '완료')}
        className="shrink-0 inline-flex items-center justify-center"
      >
        {inner}
      </button>
    )
  }
  return <span className="shrink-0 inline-flex items-center justify-center">{inner}</span>
}
