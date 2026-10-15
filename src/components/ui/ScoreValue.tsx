import { cx } from './cx'

/** 맞힌 수/전체 + 퍼센트. 80% 이상 초록, 60% 이상 주황, 그 아래 빨강. */
export function ScoreValue({ correct, total, className }: { correct: number; total: number; className?: string }) {
  const rate = total > 0 ? Math.round((correct / total) * 100) : null
  return (
    <span className={cx('text-right leading-tight', className)}>
      <span
        className={cx(
          'block text-[16px] font-bold tabular-nums',
          rate === null ? 'text-slate-500' : rate >= 80 ? 'text-brand-700' : rate >= 60 ? 'text-amber-600' : 'text-red-500',
        )}
      >
        {correct}/{total}
      </span>
      {rate !== null && <span className="block text-[12px] text-slate-400 tabular-nums">{rate}%</span>}
    </span>
  )
}
