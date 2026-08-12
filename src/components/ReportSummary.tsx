/**
 * 성적표 상단의 요약 칸.
 *
 * 추이 성적표(AdminMockReport)와 회차 성적표(AdminMockAttemptReport)가
 * 같은 문서로 보여야 해서 여기 한 곳에 둔다.
 */
export function ReportSummary({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="flex-1 rounded-lg border border-slate-200 px-4 py-3">
      <p className="text-[11px] tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>}
    </div>
  )
}
