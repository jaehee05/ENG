import type { MockGradeCut } from '../lib/types'

// 1~5등급 컷만 입력. 화면에는 5등급부터 "5등급 이하"로 나온다.
const GRADES = [1, 2, 3, 4, 5]

/**
 * 등급컷 편집기. 1~8등급 각각 원점수(minScore)를 직접 입력/수정.
 * AI 생성 버튼은 초안을 채우는 보조 용도(있을 때만 노출).
 */
export function MockCutoffEditor({
  cutoffs,
  onChange,
  onGenerate,
  generating,
  generateError,
  generateLabel = 'AI 등급컷 생성',
  totalPoints,
}: {
  cutoffs: MockGradeCut[]
  onChange: (next: MockGradeCut[]) => void
  onGenerate?: () => void
  generating?: boolean
  generateError?: string | null
  generateLabel?: string
  totalPoints?: number
}) {
  const byGrade = new Map(cutoffs.map((c) => [c.grade, c.minScore]))

  function setGrade(grade: number, raw: string) {
    const n = Number.parseInt(raw, 10)
    const next = cutoffs.filter((c) => c.grade !== grade)
    if (Number.isFinite(n)) next.push({ grade, minScore: n })
    next.sort((a, b) => a.grade - b.grade)
    onChange(next)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-700">등급컷</p>
          <p className="text-[11px] text-slate-500">
            등급별 원점수를 직접 입력·수정하세요{typeof totalPoints === 'number' ? ` (총점 ${totalPoints}점)` : ''}. 비우면 해당 등급 미표시.
          </p>
        </div>
        {onGenerate && (
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating}
            className="shrink-0 rounded-md bg-brand-600 text-white text-xs font-semibold px-3 py-1.5 hover:bg-brand-700 disabled:opacity-50"
          >
            {generating ? '생성 중…' : generateLabel}
          </button>
        )}
      </div>
      {generateError && <p className="text-[11px] text-red-600">{generateError}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {GRADES.map((g) => (
          <label
            key={g}
            className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5"
          >
            <span className="text-xs text-slate-500 shrink-0">{g}등급</span>
            <input
              type="number"
              min={0}
              value={byGrade.get(g) ?? ''}
              onChange={(e) => setGrade(g, e.target.value)}
              placeholder="—"
              className="w-full min-w-0 text-sm text-right tabular-nums bg-transparent focus:outline-none"
            />
            <span className="text-xs text-slate-400 shrink-0">점</span>
          </label>
        ))}
      </div>
    </div>
  )
}
