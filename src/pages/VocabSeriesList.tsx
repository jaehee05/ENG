import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  formatDate,
  listAttemptsForUser,
  listVocabSeries,
  listVocabSets,
} from '../lib/firestore'
import { groupBySeries, visibleSetsFor, type SeriesGroup } from '../lib/vocabGroups'
import { sheetStatuses } from '../lib/vocabStatus'
import type { Attempt, VocabSet } from '../lib/types'
import { Badge, Card, EmptyState, ListRow, PageHeader, ScoreValue, Section, SkeletonList } from '../components/ui'

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
    <div className="space-y-7 max-w-2xl mx-auto">
      <PageHeader title="단어 시험지" description="교재를 누르면 DAY 시험지가 순서대로 나와요." />

      {loading && <SkeletonList rows={3} />}
      {error && <p className="text-[15px] text-red-500 px-1">{error}</p>}
      {!loading && !error && rows.length === 0 && loose.length === 0 && (
        <Card padded={false}>
          <EmptyState title="아직 배정된 시험지가 없어요" description="선생님이 시험지를 배정하면 여기에 나와요." />
        </Card>
      )}

      {rows.length > 0 && (
        <div className="space-y-3">
          {rows.map(({ group, taken, untaken, nextDay }) => {
            const pct = group.days.length > 0 ? Math.round((taken / group.days.length) * 100) : 0
            return (
              <Link
                key={group.series.id}
                to={`/vocab/series/${group.series.id}`}
                className="pressable block rounded-card bg-white p-5 hover:bg-slate-50 active:bg-slate-100"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[17px] font-bold text-slate-900 truncate">{group.series.title}</h2>
                    <p className="text-[13px] text-slate-500 mt-0.5 tabular-nums">
                      DAY {group.days.length}개 · 응시 {taken} · 남음 {untaken}
                    </p>
                  </div>
                  {nextDay === null ? (
                    <Badge tone="brand" size="md">전부 완료</Badge>
                  ) : (
                    <Badge tone="dark" size="md">다음 DAY {nextDay}</Badge>
                  )}
                </div>
                {/* 진행 막대 — 몇 DAY 남았는지 한눈에 */}
                <div className="mt-4 flex items-center gap-3">
                  <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[13px] font-semibold text-slate-600 tabular-nums w-10 text-right">{pct}%</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* 교재가 생기기 전에 만든 시험지. 묶을 데가 없어 그대로 낸다. */}
      {looseStatuses.length > 0 && (
        <Section title="기타 시험지">
          <Card padded={false}>
            {looseStatuses.map((st) => (
              <ListRow
                key={st.set.id}
                to={`/vocab/${st.set.id}`}
                title={st.set.title}
                description={`${st.set.words.length}단어 · ${formatDate(st.set.createdAt)}`}
                trailing={st.best ? <ScoreValue correct={st.best.correct} total={st.best.total} /> : undefined}
              />
            ))}
          </Card>
        </Section>
      )}
    </div>
  )
}
