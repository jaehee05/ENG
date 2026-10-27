import type { ReactNode } from 'react'
import { cx } from './ui'
import { OmrCard, OmrColumn } from './OmrSheet'
import { omrTone } from '../lib/omrTheme'
import { COMMON_KEY, topWrongRates, type MockStatsView } from '../lib/mockStats'
import type { KoreanMockResult, MockGradeCut } from '../lib/types'

export type StatsSource = 'team' | 'national'

const STATS_SOURCE_LABEL: Record<StatsSource, string> = {
  team: 'OUR-TEAM',
  national: '전국단위',
}

/** 맨 위 점수 카드 — 짙은 상록색. 앱 초록·결과 OMR 초록과 한 계열로 맞췄다. */
export function ScoreHero({
  title,
  studentName,
  score,
  totalPoints,
  grade,
  gradeOpenEnded,
  parts,
}: {
  title: string
  studentName: string
  score: number
  totalPoints: number
  grade: number | null
  /** 등급컷이 5등급까지뿐이라 그 아래를 못 가를 때 — 'N등급 이하'. */
  gradeOpenEnded: boolean
  /** 아래 줄 — 공통·선택·표준점수·백분위. 값이 없으면 '-'. */
  parts: { label: string; value: string }[]
}) {
  return (
    <div
      className="rounded-[28px] px-6 pt-6 pb-7 text-white shadow-[0_18px_40px_-20px_rgba(15,47,42,0.75)]"
      // 오른쪽 위 은은한 빛 + 짙은 상록 그라데이션 — 평면 단색보다 깊이가 생긴다.
      style={{
        backgroundImage:
          'radial-gradient(circle at 92% 0%, rgba(167,243,208,0.22), transparent 45%), linear-gradient(135deg, #1f5a43 0%, #17463a 50%, #0f2f2a 100%)',
      }}
    >
      <p className="text-[15px] font-bold truncate">{title}</p>
      <p className="text-[12px] text-white/80 mt-0.5">{studentName}</p>
      <p className="mt-4 text-center text-[12px] text-white/85">내 점수</p>
      <p className="text-center leading-none mt-1">
        <span className="text-[76px] font-black tracking-tight tabular-nums">{score}</span>
        <span className="ml-1 text-[26px] font-bold text-white/85 tabular-nums">/ {totalPoints}</span>
      </p>
      {grade != null && (
        <div className="mt-4 flex justify-center">
          <span className="inline-flex items-baseline gap-1 rounded-full bg-[#d9f99d] px-5 py-1.5 text-[#14532d] shadow-sm">
            {gradeOpenEnded ? (
              <span className="text-[15px] font-extrabold">{grade}등급 이하</span>
            ) : (
              <>
                <span className="text-[24px] font-black tabular-nums">{grade}</span>
                <span className="text-[13px] font-bold">등급</span>
              </>
            )}
          </span>
        </div>
      )}
      <div className="mt-5 grid gap-1 border-t border-white/15 pt-4" style={{ gridTemplateColumns: `repeat(${parts.length}, minmax(0, 1fr))` }}>
        {parts.map((p) => (
          <div key={p.label} className="text-center min-w-0">
            <p className="text-[11px] font-bold text-white/70 truncate">{p.label}</p>
            <p className="mt-0.5 text-[24px] font-black tabular-nums leading-tight">{p.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SourceTabs({
  value,
  onChange,
  options,
}: {
  value: StatsSource
  onChange: (s: StatsSource) => void
  options: StatsSource[]
}) {
  return (
    <div className="flex gap-2" role="tablist">
      {options.map((s) => {
        const on = s === value
        return (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(s)}
            className={cx(
              'pressable h-10 px-5 rounded-full text-[14px] font-extrabold',
              on
                ? 'bg-[#17463a] text-white shadow-[0_6px_16px_-6px_rgba(15,47,42,0.6)]'
                : 'border border-slate-300 text-slate-600 bg-white/60',
            )}
          >
            {STATS_SOURCE_LABEL[s]}
          </button>
        )
      })}
    </div>
  )
}

function SectionTitle({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      <span aria-hidden className="h-5 w-1 rounded-full bg-slate-900" />
      <h3 className="text-[16px] font-bold text-slate-900">{children}</h3>
      {note && <span className="text-[11px] text-slate-500">{note}</span>}
    </div>
  )
}

const TH = 'border border-slate-200 bg-slate-100 px-2 py-2.5 text-[12px] font-medium text-slate-500'
const TD = 'border border-slate-200 px-2 py-2.5 text-center tabular-nums'

/** 등급컷 표 — 등급 | 과목별 원점수 컷 | 표준점수. */
export function GradeCutTable({
  stats,
  electiveNames,
  myGrade,
  note,
}: {
  stats: MockStatsView
  /** 선택과목 이름들. 없는 시험이면 빈 배열 → '원점수' 한 칸. */
  electiveNames: string[]
  myGrade: number | null
  note?: string
}) {
  const cols = electiveNames.length ? electiveNames.map((n) => ({ key: n, label: n })) : [{ key: COMMON_KEY, label: '원점수' }]
  const cutOf = (key: string) => new Map((stats.cutoffs[key] ?? []).map((c: MockGradeCut) => [c.grade, c.minScore]))
  const maps = cols.map((c) => cutOf(c.key))
  const stdMap = new Map(stats.stdCutoffs.map((c) => [c.grade, c.minScore]))
  const grades = [...new Set([...maps.flatMap((m) => [...m.keys()]), ...stdMap.keys()])].sort((a, b) => a - b)
  if (grades.length === 0) return null
  const showStd = stdMap.size > 0
  return (
    <section className="space-y-3">
      <SectionTitle note={note}>등급컷</SectionTitle>
      <table className="w-full border-collapse bg-white/70 text-[14px]">
        <thead>
          <tr>
            <th className={cx(TH, 'w-[15%]')}>등급</th>
            {cols.map((c) => (
              <th key={c.key} className={TH}>{c.label}</th>
            ))}
            {showStd && <th className={TH}>표준점수</th>}
          </tr>
        </thead>
        <tbody>
          {grades.map((g) => (
            <tr key={g} className={g === myGrade ? 'bg-[#ecfccb]' : undefined}>
              <td className={cx(TD, 'text-[12px] font-semibold text-slate-500')}>{g}</td>
              {maps.map((m, i) => (
                <td key={i} className={cx(TD, 'font-bold text-slate-900')}>{m.get(g) ?? '-'}</td>
              ))}
              {showStd && <td className={cx(TD, 'font-bold text-slate-900')}>{stdMap.get(g) ?? '-'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/** 오답률 Top 8 — 공통 문항, 나의 정오와 나란히. */
export function WrongRateTop({
  stats,
  results,
  commonNumbers,
  note,
}: {
  stats: MockStatsView
  results: KoreanMockResult[]
  commonNumbers: number[]
  note: string
}) {
  const byNumber = new Map(results.map((r) => [r.number, r]))
  const correctBy = new Map(results.map((r) => [r.number, r.correctAnswer]))
  const top = topWrongRates(stats.rates, correctBy, commonNumbers)
  if (top.length === 0) return null
  return (
    <section className="space-y-3">
      <SectionTitle note={note}>오답률 Top {top.length}</SectionTitle>
      <table className="w-full border-collapse bg-white/70 text-[14px]">
        <thead>
          <tr>
            <th className={cx(TH, 'w-[15%]')}>순위</th>
            <th className={TH}>문번</th>
            <th className={TH}>오답률</th>
            <th className={TH}>나</th>
          </tr>
        </thead>
        <tbody>
          {top.map((t, i) => {
            const r = byNumber.get(t.number)
            return (
              <tr key={t.number}>
                <td className={cx(TD, 'text-[12px] font-semibold text-slate-500')}>{i + 1}</td>
                <td className={cx(TD, 'font-bold text-slate-900')}>{t.number}번</td>
                <td className={cx(TD, 'font-bold text-slate-900')}>{t.wrongRate.toFixed(1)}%</td>
                <td className={TD}>
                  {!r || r.userAnswer === 0 ? (
                    <span className="text-[13px] text-slate-400">미응답</span>
                  ) : r.correct ? (
                    <span className="text-[13px] font-medium text-emerald-500">정답</span>
                  ) : (
                    <span className="text-[13px] font-medium text-red-500">오답</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

/** 결과 OMR 의 칸 하나 — 정답은 초록으로 칠하고, 내가 고른 오답은 빨강. 아래 선택률. */
function ResultBubble({
  n,
  correct,
  mineWrong,
  rate,
}: {
  n: number
  correct: boolean
  mineWrong: boolean
  rate: number | undefined
}) {
  return (
    <span className="inline-flex flex-col items-center gap-[2px] min-w-0">
      <span
        className={cx(
          'inline-flex w-[18px] h-[24px] items-center justify-center rounded-full text-[10px] font-semibold tabular-nums',
          correct
            ? 'bg-[#10b981] text-white'
            : mineWrong
              ? 'bg-[#ef4444] text-white'
              : 'border-[1.5px] border-[#efb5b0] text-[#e8877f] bg-white/40',
        )}
      >
        {n}
      </span>
      {rate !== undefined && (
        <span className="text-[8.5px] leading-none font-semibold text-[#2563eb] tabular-nums">{rate.toFixed(1)}</span>
      )}
    </span>
  )
}

/** 문항별 정답 비교 — 공통 두 단 + 선택과목 한 단(반 폭). */
export function AnswerCompareOmr({
  results,
  commonNumbers,
  electiveName,
  commonTitle,
  stats,
  note,
  onRowClick,
}: {
  results: KoreanMockResult[]
  commonNumbers: number[]
  electiveName?: string
  commonTitle: string
  stats: MockStatsView
  note: string
  onRowClick?: (number: number) => void
}) {
  const tone = omrTone('result')
  const byNumber = new Map(results.map((r) => [r.number, r]))
  const commonSet = new Set(commonNumbers)
  const commonRows = results.filter((r) => commonSet.has(r.number)).map((r) => ({ number: r.number, key: r.number }))
  const electiveRows = results.filter((r) => !commonSet.has(r.number)).map((r) => ({ number: r.number, key: r.number }))
  const mid = Math.ceil(commonRows.length / 2)
  const hasRates = stats.rates.size > 0
  const render = (num: number) => {
    const r = byNumber.get(num)
    const rates = stats.rates.get(num)
    return [1, 2, 3, 4, 5].map((n) => (
      <ResultBubble
        key={n}
        n={n}
        correct={r?.correctAnswer === n}
        mineWrong={!!r && !r.correct && r.userAnswer === n}
        rate={rates?.[n - 1]}
      />
    ))
  }
  const resultNum = () => '!font-extrabold !text-[#1f7a45] !text-[15px]'
  const rowHeight = hasRates ? 'h-[40px]' : 'h-[31px]'
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5 flex-wrap">
        <span aria-hidden className="h-5 w-1 rounded-full bg-slate-900" />
        <h3 className="text-[16px] font-bold text-slate-900">문항별 정답 비교</h3>
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#10b981]" />정답
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#ef4444]" />오답
        </span>
        {hasRates && <span className="text-[11px] text-slate-600">{note}</span>}
      </div>
      <div className="rounded-xl bg-[#fffbe8] p-2.5 space-y-2.5">
        <OmrCard title={commonTitle} tone="result" className="rounded-none">
          <div className="grid grid-cols-2">
            <OmrColumn items={commonRows.slice(0, mid)} rowLines tone="result" renderAnswers={render} rowHeight={rowHeight} onRowClick={onRowClick} numClass={resultNum} />
            <OmrColumn
              items={commonRows.slice(mid)}
              rowLines
              tone="result"
              renderAnswers={render}
              rowHeight={rowHeight}
              onRowClick={onRowClick}
              numClass={resultNum}
              className={cx('border-l', tone.line)}
            />
          </div>
        </OmrCard>
        {electiveRows.length > 0 && (
          <div className="grid grid-cols-2">
            <OmrCard title={electiveName ?? '선택과목'} tone="result" className="rounded-none">
              <OmrColumn items={electiveRows} rowLines tone="result" renderAnswers={render} rowHeight={rowHeight} onRowClick={onRowClick} numClass={resultNum} />
            </OmrCard>
          </div>
        )}
      </div>
    </section>
  )
}
