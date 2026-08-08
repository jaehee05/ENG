import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MOCK_SCORE_METRIC_LABEL,
  trendPoints,
  type MockScore,
  type MockScoreMetric,
} from '../lib/types'

/**
 * 모의고사 성적 추이 (관리자 전용).
 *
 * '추이에 포함'으로 표시된 성적만 그린다. 지표는 등급/원점수 중에 고르고,
 * 등급은 1이 가장 좋으므로 축을 뒤집어 위로 갈수록 좋게 그린다.
 *
 * 차트 라이브러리를 쓰지 않는다. 점 몇 개짜리 꺾은선 하나에 의존성을 늘릴
 * 이유가 없고, 번들이 Capgo 로 매번 통째로 나간다.
 *
 * SVG 를 viewBox 로 늘리지 않고 컨테이너 실제 폭에 맞춰 그린다. viewBox 로
 * 늘리면 아이폰에서 글자까지 같이 줄어 6px 짜리 눈금이 된다.
 */

// 통과 확인된 계열색 (brand-700). 흰 바탕 대비 3:1 이상.
const SERIES = '#4b8b4b'
const GRID = '#eef2f7'
const AXIS_INK = '#94a3b8'
const LABEL_INK = '#334155'
/** 값을 전부 적을 때, 최고 회차가 아닌 값에 쓰는 옅은 먹. */
const AXIS_LABEL_INK = '#64748b'

// 오른쪽은 마지막 회차 값을 선 끝에 적을 자리를 비워 둔다.
const PAD = { top: 20, right: 48, bottom: 28, left: 32 }
const HEIGHT = 216

/** 'YYYY-MM-DD' → 'M/D'. */
function fmtTick(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

/** 'YYYY-MM-DD' → 'YYYY년 M월 D일'. */
function fmtFull(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${y}년 ${Number(m)}월 ${Number(d)}일`
}

/** 0·20·40 처럼 떨어지는 눈금 값. */
function niceTicks(lo: number, hi: number, count: number): number[] {
  const span = hi - lo || 1
  const rough = span / count
  const mag = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? mag * 10
  const first = Math.ceil(lo / step) * step
  const out: number[] = []
  for (let v = first; v <= hi + 1e-9; v += step) out.push(Math.round(v * 100) / 100)
  return out
}

export function MockScoreTrend({
  scores,
  metric: fixedMetric,
  subtitle = '직접 입력한 성적 · 관리자만 볼 수 있음',
  caption,
  animate = true,
  labelAll = false,
}: {
  scores: MockScore[]
  /** 지표를 고정한다. 주면 전환 버튼이 사라진다 (성적표 출력용). */
  metric?: MockScoreMetric
  /** 제목 아래 설명. null 이면 숨긴다. */
  subtitle?: string | null
  /** 그래프 아래 문구. 없으면 회차 수를 적는다. null 이면 숨긴다. */
  caption?: string | null
  /** 등장 애니메이션. 인쇄할 때는 끈다 — 그리는 중에 찍히면 안 된다. */
  animate?: boolean
  /**
   * 모든 회차에 값을 적는다. 인쇄물처럼 손을 올려 볼 수 없는 자리에서 쓴다.
   * 화면에서는 마지막·최고 회차만 적는 편이 읽기 좋다.
   */
  labelAll?: boolean
}) {
  const has = useMemo(
    () => ({
      grade: scores.some((s) => s.inTrend && s.grade != null),
      raw: scores.some((s) => s.inTrend && s.raw != null),
    }),
    [scores],
  )
  const [metric, setMetric] = useState<MockScoreMetric>('grade')
  // 고른 지표에 값이 하나도 없으면 값이 있는 쪽으로 넘어간다.
  const active: MockScoreMetric =
    fixedMetric ?? (has[metric] ? metric : has.grade ? 'grade' : 'raw')
  const points = useMemo(() => trendPoints(scores, active), [scores, active])

  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(560)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.max(260, Math.round(entry.contentRect.width)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const metricToggle = (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {(['grade', 'raw'] as MockScoreMetric[]).map((k) => (
        <button
          key={k}
          type="button"
          disabled={!has[k]}
          onClick={() => setMetric(k)}
          className={`rounded-md px-3 py-1 touch:py-1.5 text-xs font-medium transition ${
            active === k
              ? 'bg-white text-slate-900 shadow-sm'
              : has[k]
                ? 'text-slate-500 hover:text-slate-800'
                : 'text-slate-300 cursor-not-allowed'
          }`}
        >
          {MOCK_SCORE_METRIC_LABEL[k]}
        </button>
      ))}
    </div>
  )

  const header = (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">
          국어 {MOCK_SCORE_METRIC_LABEL[active]} 추이
        </h3>
        {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {!fixedMetric && (has.grade || has.raw) && metricToggle}
    </div>
  )

  if (points.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        {header}
        <div className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
          추이에 넣은 성적이 없습니다.
          <span className="block text-xs text-slate-400 mt-1">
            ‘모의고사 성적’ 탭에서 성적을 넣고 ‘추이’를 켜면 여기에 그려집니다.
          </span>
        </div>
      </section>
    )
  }

  // 등급은 1을 늘 맨 위에 두되, 아래는 실제 등급까지만 그린다. 1~9 를 항상
  // 펼치면 2~4등급대 학생의 그래프가 아래 절반을 비운 채 납작해진다.
  const [lo, hi] =
    active === 'grade'
      ? [1, Math.min(9, Math.max(4, Math.max(...points.map((p) => p.value)) + 1))]
      : (() => {
          const vs = points.map((p) => p.value)
          const min = Math.min(...vs)
          const max = Math.max(...vs)
          if (min === max) return [Math.max(0, min - 5), Math.min(100, max + 5)]
          const room = (max - min) * 0.2
          return [Math.max(0, Math.floor(min - room)), Math.min(100, Math.ceil(max + room))]
        })()

  const innerW = width - PAD.left - PAD.right
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const x = (i: number) =>
    PAD.left + (points.length === 1 ? innerW / 2 : (innerW * i) / (points.length - 1))
  const y = (v: number) => {
    const t = (v - lo) / (hi - lo || 1)
    return PAD.top + (active === 'grade' ? t : 1 - t) * innerH
  }

  const ticks =
    active === 'grade'
      ? (() => {
          const step = Math.max(1, Math.ceil((hi - lo) / 4))
          const out: number[] = []
          for (let v = lo; v <= hi; v += step) out.push(v)
          return out
        })()
      : niceTicks(lo, hi, 4)
  const unit = active === 'grade' ? '등급' : '점'

  // 값이 붙는 자리는 두 곳뿐이다 — 마지막 회차와 가장 좋았던 회차.
  const lastIdx = points.length - 1
  const bestIdx = points.reduce(
    (best, p, i) =>
      (active === 'grade' ? p.value < points[best].value : p.value > points[best].value)
        ? i
        : best,
    0,
  )

  // x축 라벨이 겹치지 않을 만큼만 남긴다.
  const maxTicks = Math.max(2, Math.floor(innerW / 52))
  const step = Math.ceil(points.length / maxTicks)
  const showTick = (i: number) => i === lastIdx || i % step === 0

  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')
  const area = `${PAD.left},${PAD.top + innerH} ${line} ${x(lastIdx)},${PAD.top + innerH}`

  /** i 번째 점이 나타날 시각(초). 선이 그 자리를 지날 때 맞춰 붙는다. */
  const dotDelay = (i: number) =>
    points.length === 1 ? 0.1 : 0.1 + (0.8 * i) / (points.length - 1)

  /**
   * 값을 점 위에 둘지 아래에 둘지. 양옆보다 화면상 아래에 있는 점(골짜기)은
   * 위쪽이 꺾은선으로 막혀 있으므로 아래에 적는다.
   */
  const labelBelow = (i: number) => {
    const yi = y(points[i].value)
    const near = [i > 0 ? y(points[i - 1].value) : null, i < lastIdx ? y(points[i + 1].value) : null]
      .filter((v): v is number => v != null)
    const below = near.length > 0 && yi > near.reduce((a, b) => a + b, 0) / near.length
    // 그림 밖으로 나가면 반대쪽에 붙인다. 아래로 넘치면 x축 눈금과 겹친다.
    if (below && yi + 18 > PAD.top + innerH) return false
    if (!below && yi - 13 < PAD.top + 2) return true
    return below
  }

  const hovered = hover != null ? points[hover] : null

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    let nearest = 0
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(x(i) - px) < Math.abs(x(nearest) - px)) nearest = i
    }
    setHover(nearest)
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      {header}

      <div ref={wrapRef} className="relative">
        <svg
          key={active}
          width={width}
          height={HEIGHT}
          /* viewBox 를 함께 두면 화면에서는 1:1 로 그려지고, 인쇄처럼 폭이 좁아진
             지면에서는 잘리는 대신 비례해서 줄어든다. */
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="block touch-none select-none font-sans"
          style={{
            fontFamily: 'inherit',
            fontVariantNumeric: 'tabular-nums',
            maxWidth: '100%',
            height: 'auto',
          }}
          onPointerMove={handleMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`국어 모의고사 ${MOCK_SCORE_METRIC_LABEL[active]} 추이. ${points
            .map((p) => `${p.score.title} ${p.value}${unit}`)
            .join(', ')}`}
        >
          <defs>
            <linearGradient id="mockTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES} stopOpacity={0.14} />
              <stop offset="100%" stopColor={SERIES} stopOpacity={0.01} />
            </linearGradient>
          </defs>

          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke={GRID}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y(t) + 4}
                textAnchor="end"
                fontSize={11}
                fill={AXIS_INK}
              >
                {t}
              </text>
            </g>
          ))}

          {points.length > 1 && (
            <polygon points={area} fill="url(#mockTrendFill)" className={animate ? 'trend-area' : undefined} />
          )}

          {hovered && (
            <line
              x1={x(hover!)}
              x2={x(hover!)}
              y1={PAD.top - 6}
              y2={PAD.top + innerH}
              stroke="#cbd5e1"
              strokeWidth={1}
            />
          )}

          {points.length > 1 && (
            <polyline
              points={line}
              pathLength={1}
              fill="none"
              stroke={SERIES}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              className={animate ? 'trend-line' : undefined}
            />
          )}

          {points.map((p, i) => (
            <g key={p.score.id}>
              <circle
                cx={x(i)}
                cy={y(p.value)}
                r={hover === i ? 5.5 : 4}
                fill={SERIES}
                stroke="#ffffff"
                strokeWidth={2}
                className={animate ? 'trend-dot' : undefined}
                style={animate ? { animationDelay: `${dotDelay(i)}s` } : undefined}
              />
              {i === lastIdx && (
                <text
                  x={x(i) + 11}
                  y={y(p.value) + 4}
                  textAnchor="start"
                  fontSize={13}
                  fontWeight={600}
                  fill={LABEL_INK}
                  className={animate ? 'trend-label' : undefined}
                  style={animate ? { animationDelay: `${dotDelay(i) + 0.1}s` } : undefined}
                >
                  {p.value}
                  {unit}
                </text>
              )}
              {(labelAll || i === bestIdx) && i !== lastIdx && (
                <text
                  /* 왼쪽 끝 점은 가운데 정렬하면 y축 눈금 위로 삐져나간다.
                     그 점만 오른쪽으로 뻗게 한다. */
                  x={i === 0 ? x(i) + 3 : x(i)}
                  y={y(p.value) + (labelBelow(i) ? 18 : -13)}
                  textAnchor={i === 0 ? 'start' : 'middle'}
                  fontSize={12}
                  fontWeight={labelAll && i !== bestIdx ? 500 : 600}
                  fill={labelAll && i !== bestIdx ? AXIS_LABEL_INK : LABEL_INK}
                  className={animate ? 'trend-label' : undefined}
                  style={animate ? { animationDelay: `${dotDelay(i) + 0.1}s` } : undefined}
                >
                  {p.value}
                  {unit}
                </text>
              )}
              {showTick(i) && (
                <text
                  x={x(i)}
                  y={HEIGHT - 8}
                  textAnchor={i === 0 ? 'start' : i === lastIdx ? 'end' : 'middle'}
                  fontSize={11}
                  fill={AXIS_INK}
                >
                  {fmtTick(p.score.dateISO)}
                </text>
              )}
            </g>
          ))}
        </svg>

        {hovered && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-soft"
            style={{
              left: Math.min(Math.max(x(hover!) - 70, 0), Math.max(0, width - 148)),
              top: 0,
              width: 148,
            }}
          >
            <p className="text-sm font-semibold text-slate-900 tabular-nums">
              {hovered.value}
              {unit}
            </p>
            <p className="text-[11px] text-slate-600 truncate">{hovered.score.title}</p>
            <p className="text-[11px] text-slate-400">{fmtFull(hovered.score.dateISO)}</p>
          </div>
        )}
      </div>

      {caption !== null && (
        <p className="text-[11px] text-slate-400">
          {caption ?? `${points.length}개 회차 · 값 전체는 ‘모의고사 성적’ 탭 목록에 있습니다.`}
        </p>
      )}
    </section>
  )
}
