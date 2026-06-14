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
    <div className="rounded-lg border border-brand-200 bg-brand-50/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-brand-50/70 transition"
      >
        <div className="text-sm">
          <span className="font-semibold text-brand-700">내 응시 기록 {sorted.length}회</span>
          {recent && recent.total > 0 && (
            <span className="ml-2 text-slate-600">
              최근 {recent.correct}/{recent.total} ({Math.round((recent.correct / recent.total) * 100)}%)
            </span>
          )}
          {best.total > 0 && (
            <span className="ml-2 text-slate-500 text-xs">
              · 최고 {Math.round(best.ratio * 100)}%
            </span>
          )}
        </div>
        <span className="text-brand-700 text-sm">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <ul className="divide-y divide-brand-100 border-t border-brand-100 bg-white">
          {sorted.map((a, i) => {
            const ratio = a.total > 0 ? Math.round((a.correct / a.total) * 100) : 0
            return (
              <li key={a.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs text-slate-400 w-10">{sorted.length - i}회차</span>
                  <span className="text-slate-500 text-xs">{fmtDate(a.createdAt)}</span>
                  {a.practice && (
                    <span className="text-[10px] text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
                      연습
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-slate-700">
                    {a.correct}/{a.total}
                  </span>
                  <span
                    className={`font-medium ${ratio >= 80 ? 'text-brand-700' : ratio >= 50 ? 'text-slate-700' : 'text-red-600'}`}
                  >
                    {ratio}%
                  </span>
                  <Link
                    to={buildResultPath(a)}
                    className="text-xs text-brand-700 hover:underline"
                  >
                    다시 보기
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
