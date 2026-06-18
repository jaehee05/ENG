import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Attempt } from '../lib/types'

function fmtDate(ts: Attempt['createdAt']): string {
  if (!ts) return ''
  const d = ts.toDate()
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

interface Props {
  attempts: Attempt[]
  buildResultPath: (a: Attempt) => string
}

export function MyAttemptsBox({ attempts, buildResultPath }: Props) {
  const [open, setOpen] = useState(false)
  const sorted = [...attempts].sort(
    (a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
  )
  const best = sorted.reduce(
    (acc, a) =>
      a.total > 0 && a.correct / a.total > acc.ratio
        ? { ratio: a.correct / a.total, correct: a.correct, total: a.total }
        : acc,
    { ratio: 0, correct: 0, total: 0 },
  )
  const recent = sorted[0]

  return (
    <details
      className="rounded-lg border border-slate-200 bg-white overflow-hidden"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="list-none cursor-pointer px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50">
        <div className="text-sm flex items-baseline gap-2 flex-wrap">
          <span className="font-medium text-slate-900">내 응시 기록</span>
          <span className="text-xs text-slate-500">{sorted.length}회</span>
          {recent && recent.total > 0 && (
            <span className="text-xs text-slate-500">
              · 최근 {Math.round((recent.correct / recent.total) * 100)}%
            </span>
          )}
          {best.total > 0 && (
            <span className="text-xs text-slate-500">
              · 최고 {Math.round(best.ratio * 100)}%
            </span>
          )}
        </div>
        <span className="text-slate-400 text-xs">{open ? '접기 −' : '펼치기 +'}</span>
      </summary>
      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {sorted.map((a, i) => {
          const ratio = a.total > 0 ? Math.round((a.correct / a.total) * 100) : 0
          return (
            <li
              key={a.id}
              className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-[11px] text-slate-400 w-9">
                  {sorted.length - i}회차
                </span>
                <span className="text-[11px] text-slate-500">
                  {fmtDate(a.createdAt)}
                </span>
                {a.practice && (
                  <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                    연습
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <span className="text-slate-600 text-xs">
                  {a.correct}/{a.total}
                </span>
                <span
                  className={`text-sm font-semibold ${ratio >= 80 ? 'text-brand-700' : ratio >= 50 ? 'text-slate-700' : 'text-red-600'}`}
                >
                  {ratio}%
                </span>
                <Link
                  to={buildResultPath(a)}
                  className="text-xs text-slate-500 hover:text-slate-900 underline-offset-2 hover:underline"
                >
                  보기
                </Link>
              </div>
            </li>
          )
        })}
      </ul>
    </details>
  )
}
