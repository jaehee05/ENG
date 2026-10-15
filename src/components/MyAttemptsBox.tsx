import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Attempt } from '../lib/types'
import { Badge, Card, ScoreValue, cx } from './ui'

function fmtDate(ts: Attempt['createdAt']): string {
  if (!ts) return ''
  const d = ts.toDate()
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

interface Props {
  attempts: Attempt[]
  buildResultPath: (a: Attempt) => string
  /**
   * 있으면 기록마다 삭제 버튼이 붙는다. 관리자 전용 — 확인과 실제 삭제는
   * 호출부가 맡는다(응시 횟수 제한이 어떻게 풀리는지는 화면마다 다르다).
   */
  onDelete?: (a: Attempt) => void
  /** 삭제 중인 기록 id. 그 줄의 버튼만 잠근다. */
  deletingId?: string | null
}

/** 내 응시 기록 — 접힌 채로 요약(횟수·최근·최고)만, 펼치면 회차별 줄. */
export function MyAttemptsBox({
  attempts,
  buildResultPath,
  onDelete,
  deletingId,
}: Props) {
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
    <Card padded={false}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="pressable w-full flex items-center justify-between gap-3 px-5 py-4 text-left rounded-card hover:bg-slate-50 active:bg-slate-100"
      >
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-slate-900">
            내 응시 기록 <span className="text-slate-400 font-medium tabular-nums">{sorted.length}회</span>
          </span>
          <span className="block text-[13px] text-slate-500 mt-0.5 tabular-nums">
            {recent && recent.total > 0 && `최근 ${Math.round((recent.correct / recent.total) * 100)}%`}
            {best.total > 0 && ` · 최고 ${Math.round(best.ratio * 100)}%`}
          </span>
        </span>
        <svg
          className={cx('shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
          width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul className="pb-2">
          {sorted.map((a, i) => (
            <li key={a.id} className="flex items-center gap-1 pr-3">
              <Link
                to={buildResultPath(a)}
                className="pressable flex-1 min-w-0 flex items-center justify-between gap-3 px-5 py-3 rounded-2xl hover:bg-slate-50 active:bg-slate-100"
              >
                <span className="min-w-0 flex items-center gap-2">
                  <span className="text-[15px] font-medium text-slate-900 tabular-nums">{sorted.length - i}회차</span>
                  <span className="text-[13px] text-slate-500 tabular-nums">{fmtDate(a.createdAt)}</span>
                  {a.practice && <Badge tone="amber">연습</Badge>}
                </span>
                <ScoreValue correct={a.correct} total={a.total} />
              </Link>
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(a)}
                  disabled={deletingId === a.id}
                  className="pressable shrink-0 h-9 px-2.5 rounded-xl text-[13px] font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 active:bg-red-50 disabled:opacity-50"
                >
                  {deletingId === a.id ? '삭제 중' : '삭제'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
