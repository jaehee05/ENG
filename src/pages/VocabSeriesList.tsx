import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  formatDate,
  listAttemptsForUser,
  listVocabSeries,
  listVocabSets,
} from '../lib/firestore'
import { groupBySeries, visibleSetsFor, type SeriesGroup } from '../lib/studentVocab'
import { sheetStatuses } from '../lib/vocabStatus'
import type { Attempt, VocabSet } from '../lib/types'

interface Row {
  group: SeriesGroup
  taken: number
  untaken: number
  /** 다음에 풀 DAY. 아직 안 푼 것 중 가장 앞. 다 풀었으면 null. */
  nextDay: number | null
}

/**
 * 학생용 단어 탭 첫 화면 — 교재 목록.
 *
 * 예전에는 DAY 시험지를 한 줄로 쭉 펼쳤는데, 교재가 여러 개면 남의 교재까지
 * 섞여 몇십 줄이 됐다. 교재를 한 번 거쳐 들어가게 바꾼다.
 */
export function VocabSeriesList() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [loose, setLoose] = useState<VocabSet[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    Promise.all([listVocabSeries(), listVocabSets(), listAttemptsForUser(profile.id)])
      .then(([allSeries, allSets, atts]) => {
        if (cancelled) return
        const mine = visibleSetsFor(allSets, profile.id)
        const { groups, loose: rest } = groupBySeries(allSeries, mine)
        setRows(
          groups.map((group) => {
            const statuses = sheetStatuses(
              group.days.map((d) => d.set),
              atts,
            )
            const taken = statuses.filter((s) => s.best !== null).length
            // sheetStatuses 는 넣은 순서를 그대로 돌려주므로 인덱스가 맞는다
            const nextIdx = statuses.findIndex((s) => s.best === null)
            return {
              group,
              taken,
              untaken: group.days.length - taken,
              nextDay: nextIdx >= 0 ? group.days[nextIdx].day : null,
            }
          }),
        )
        setLoose(rest)
        setAttempts(atts)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [profile])

  const looseStatuses = useMemo(
    () => sheetStatuses(loose, attempts),
    [loose, attempts],
  )

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          학습
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
          단어 시험지
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          교재를 누르면 DAY 시험지가 순서대로 나옵니다.
        </p>
      </header>

      {loading && <p className="text-slate-500 text-sm">불러오는 중…</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {!loading && rows.length === 0 && loose.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          아직 배정된 시험지가 없어요.
        </div>
      )}

      <div className="space-y-3">
        {rows.map(({ group, taken, untaken, nextDay }) => (
          <Link
            key={group.series.id}
            to={`/vocab/series/${group.series.id}`}
            className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-300 hover:shadow-md transition"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900 truncate">
                {group.series.title}
              </h2>
              <span className="text-xs text-slate-400 whitespace-nowrap">
                DAY {group.days.length}개
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {nextDay === null ? (
                <span className="inline-block rounded-full bg-brand-100 text-brand-700 text-[11px] font-semibold px-2 py-0.5">
                  전부 완료
                </span>
              ) : (
                <span className="inline-block rounded-full bg-slate-900 text-white text-[11px] font-semibold px-2 py-0.5">
                  다음 DAY {nextDay}
                </span>
              )}
              <span className="text-xs text-slate-500">
                응시 {taken} · 남은 {untaken}
              </span>
            </div>
            {/* 진행 막대 — 몇 DAY 남았는지 한눈에 */}
            <div className="mt-2.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-brand-500"
                style={{
                  width: `${group.days.length > 0 ? (taken / group.days.length) * 100 : 0}%`,
                }}
              />
            </div>
          </Link>
        ))}
      </div>

      {/* 교재가 생기기 전에 만든 시험지. 묶을 데가 없어 그대로 낸다. */}
      {looseStatuses.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">기타 시험지</h2>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white overflow-hidden">
            {looseStatuses.map((st) => (
              <li key={st.set.id}>
                <Link
                  to={`/vocab/${st.set.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50 active:bg-slate-100"
                >
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium text-slate-900 truncate">
                      {st.set.title}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {st.set.words.length}단어 · {formatDate(st.set.createdAt)}
                    </p>
                  </div>
                  {st.best ? (
                    <span className="text-xs text-slate-500 shrink-0">
                      {st.best.correct}/{st.best.total}
                    </span>
                  ) : (
                    <span className="text-slate-300 text-lg shrink-0">→</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
