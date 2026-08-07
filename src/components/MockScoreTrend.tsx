import { useMemo, useState } from 'react'
import {
  MOCK_SCORE_METRIC_LABEL,
  trendPoints,
  type MockScore,
  type MockScoreMetric,
} from '../lib/types'

/**
 * 모의고사 성적 추이 (관리자 전용).
 *
 * 그리는 것은 '추이에 포함' 으로 표시된 성적뿐이다. 지표는 등급/원점수 중에
 * 고르는데, 등급은 1이 가장 좋으므로 세로축을 뒤집어 위로 갈수록 좋게 그린다.
 *
 * 차트 라이브러리를 쓰지 않고 SVG 로 직접 그린다. 점 몇 개짜리 꺾은선 하나에
 * 의존성을 늘릴 이유가 없고, 앱 번들이 Capgo 로 매번 통째로 나간다.
 */

const PAD = { top: 16, right: 16, bottom: 28, left: 34 }
const W = 520
const H = 200

function fmtTick(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

export function MockScoreTrend({ scores }: { scores: MockScore[] }) {
  const has = useMemo(
    () => ({
      grade: scores.some((s) => s.inTrend && s.grade != null),
      raw: scores.some((s) => s.inTrend && s.raw != null),
    }),
    [scores],
  )
  const [metric, setMetric] = useState<MockScoreMetric>('grade')
  // 고른 지표에 값이 하나도 없으면 값이 있는 쪽을 보여준다.
  const active: MockScoreMetric = has[metric] ? metric : has.grade ? 'grade' : 'raw'

  const points = useMemo(() => trendPoints(scores, active), [scores, active])

  if (points.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        추이에 포함된 성적이 없습니다. 아래 목록에서 그래프에 넣을 시험을 선택하세요.
      </div>
    )
  }

  // 등급은 1~9 고정(위가 1등급), 원점수는 값에 맞춰 여유를 둔다.
  const [lo, hi] =
    active === 'grade'
      ? [1, 9]
      : (() => {
          const vs = points.map((p) => p.value)
          const min = Math.min(...vs)
          const max = Math.max(...vs)
          if (min === max) return [Math.max(0, min - 5), Math.min(100, max + 5)]
          const room = (max - min) * 0.15
          return [Math.max(0, min - room), Math.min(100, max + room)]
        })()

  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const x = (i: number) =>
    PAD.left + (points.length === 1 ? innerW / 2 : (innerW * i) / (points.length - 1))
  const y = (v: number) => {
    const t = (v - lo) / (hi - lo || 1)
    // 등급은 작을수록 좋으므로 위아래를 뒤집는다.
    return PAD.top + (active === 'grade' ? t : 1 - t) * innerH
  }

  const ticks =
    active === 'grade'
      ? [1, 3, 5, 7, 9]
      : Array.from({ length: 5 }, (_, i) => Math.round(lo + ((hi - lo) * i) / 4))

  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')
  const unit = active === 'grade' ? '등급' : '점'

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 text-xs">
          {(['grade', 'raw'] as MockScoreMetric[]).map((k) => (
            <button
              key={k}
              type="button"
              disabled={!has[k]}
              onClick={() => setMetric(k)}
              className={`px-3 py-1.5 touch:py-2 rounded-full transition ${
                active === k
                  ? 'bg-slate-900 text-white'
                  : has[k]
                    ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    : 'bg-slate-50 text-slate-300 cursor-not-allowed'
              }`}
            >
              {MOCK_SCORE_METRIC_LABEL[k]}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">{points.length}개 · 관리자만 볼 수 있음</p>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`모의고사 ${MOCK_SCORE_METRIC_LABEL[active]} 추이`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
            <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" fontSize={9} fill="#94a3b8">
              {t}
            </text>
          </g>
        ))}

        {points.length > 1 && (
          <polyline
            points={line}
            fill="none"
            stroke="#4f46e5"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {points.map((p, i) => (
          <g key={p.score.id}>
            <circle cx={x(i)} cy={y(p.value)} r={4} fill="#4f46e5" />
            <text
              x={x(i)}
              y={y(p.value) - 9}
              textAnchor="middle"
              fontSize={10}
              fontWeight={600}
              fill="#334155"
            >
              {p.value}
              {unit}
            </text>
            <text
              x={x(i)}
              y={H - 10}
              textAnchor="middle"
              fontSize={9}
              fill="#94a3b8"
            >
              {fmtTick(p.score.dateISO)}
            </text>
            <title>
              {p.score.title} · {p.score.dateISO} · {p.value}
              {unit}
            </title>
          </g>
        ))}
      </svg>
    </div>
  )
}
