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
