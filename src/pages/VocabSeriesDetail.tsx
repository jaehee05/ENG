import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  formatDate,
  listAttemptsForUser,
  listVocabSeries,
  listVocabSets,
} from '../lib/firestore'
import { groupBySeries, visibleSetsFor } from '../lib/vocabGroups'
import { sheetStatuses, type SheetStatus } from '../lib/vocabStatus'
import { Card, EmptyState, ListRow, PageHeader, ScoreValue, Section, SkeletonList } from '../components/ui'

/** DAY 한 줄. 응시 전엔 ›, 응시 후엔 최고 점수. */
function DayRow({ day, st }: { day: number; st: SheetStatus }) {
  return (
    <ListRow
      to={`/vocab/${st.set.id}`}
      leading={
        <span className="inline-flex h-10 min-w-[3.25rem] items-center justify-center rounded-xl bg-slate-100 px-2 text-[13px] font-bold text-slate-700 tabular-nums">
          DAY {day}
        </span>
      }
      title={
        <>
          {st.set.words.length}단어
          <span className="ml-1.5 text-[13px] font-normal text-slate-400">
            {st.set.format === 'choice' ? '5지선다' : '주관식'}
          </span>
        </>
      }
      description={
        st.last
          ? `최근 응시 ${formatDate(st.last.createdAt)}${st.tries.length > 1 ? ` · ${st.tries.length}회` : ''}`
          : undefined
      }
      trailing={st.best ? <ScoreValue correct={st.best.correct} total={st.best.total} /> : undefined}
    />
  )
}

/**
 * 학생용 교재 상세 — DAY 1 부터 아래로.
 *
 * 이미 정식 응시한 DAY 는 아래쪽에 따로 모은다. 연습만 한 DAY 는 아직 안 푼
 * 것으로 본다 — 다른 화면들도 연습을 통계에서 빼므로 여기만 다르면 어긋난다.
 */
export function VocabSeriesDetail() {
  const { seriesId } = useParams<{ seriesId: string }>()
  const { profile } = useAuth()
  // 관리자는 배정과 무관하게 전부 본다 — 시험지 상세에서 되돌아올 때
  // 빈 화면을 만나지 않게.
  const isAdmin = profile?.role === 'admin'
  const [title, setTitle] = useState('')
  const [days, setDays] = useState<{ day: number; st: SheetStatus }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile || !seriesId) return
    let cancelled = false
    Promise.all([listVocabSeries(), listVocabSets(), listAttemptsForUser(profile.id)])
      .then(([allSeries, allSets, atts]) => {
        if (cancelled) return
        const mine = isAdmin ? allSets : visibleSetsFor(allSets, profile.id)
        const { groups } = groupBySeries(allSeries, mine)
        const group = groups.find((g) => g.series.id === seriesId)
        if (!group) {
          setError('이 교재의 시험지를 찾을 수 없습니다.')
          return
        }
        const statuses = sheetStatuses(
          group.days.map((d) => d.set),
          atts,
        )
        setTitle(group.series.title)
        setDays(group.days.map((d, i) => ({ day: d.day, st: statuses[i] })))
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '불러오기 실패')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [profile, seriesId, isAdmin])

  const todo = useMemo(() => days.filter((d) => d.st.best === null), [days])
  const done = useMemo(() => days.filter((d) => d.st.best !== null), [days])

  if (loading) return <SkeletonList rows={5} className="max-w-2xl mx-auto" />
  if (error) return <p className="text-[15px] text-red-500 px-1">{error}</p>

  return (
    <div className="space-y-7 max-w-2xl mx-auto">
      <PageHeader
        title={title}
        description={
          <span className="tabular-nums">
            전체 {days.length}개 · 응시 {done.length} · 남음 {todo.length}
          </span>
        }
      />

      <Section title={`풀어야 할 시험지 ${todo.length}`}>
        <Card padded={false}>
          {todo.length === 0 ? (
            <EmptyState title="이 교재는 전부 응시했어요" />
          ) : (
            todo.map((d) => <DayRow key={d.st.set.id} day={d.day} st={d.st} />)
          )}
        </Card>
      </Section>

      {done.length > 0 && (
        <Section title={`이미 응시한 시험지 ${done.length}`}>
          <Card padded={false}>
            {done.map((d) => (
              <DayRow key={d.st.set.id} day={d.day} st={d.st} />
            ))}
          </Card>
        </Section>
      )}
    </div>
  )
}
