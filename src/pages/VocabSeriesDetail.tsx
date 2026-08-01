import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BackLink } from '../components/BackLink'
import { useAuth } from '../contexts/useAuth'
import {
  formatDate,
  listAttemptsForUser,
  listVocabSeries,
  listVocabSets,
} from '../lib/firestore'
import { groupBySeries, visibleSetsFor } from '../lib/vocabGroups'
import { sheetStatuses, type SheetStatus } from '../lib/vocabStatus'

/** DAY 한 줄. 응시 전/후 모양이 달라 묶어 둔다. */
function DayRow({ day, st }: { day: number; st: SheetStatus }) {
  const rate = st.bestRate
  return (
    <li>
      <Link
        to={`/vocab/${st.set.id}`}
        className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50 active:bg-slate-100"
      >
        <div className="min-w-0 flex items-center gap-3">
          <span className="shrink-0 inline-flex items-center justify-center min-w-11 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold px-2 py-1">
            DAY {day}
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-medium text-slate-900 truncate">
              {st.set.words.length}단어
              <span className="ml-1.5 text-xs font-normal text-slate-400">
                {st.set.format === 'choice' ? '5지선다' : '주관식'}
              </span>
            </p>
            {st.last && (
              <p className="text-[11px] text-slate-400 mt-0.5">
                최근 응시 {formatDate(st.last.createdAt)}
                {st.tries.length > 1 && ` · ${st.tries.length}회`}
              </p>
            )}
          </div>
        </div>
        {st.best ? (
          <span className="shrink-0 text-right">
            <span
              className={`block text-sm font-semibold ${
                rate === null
                  ? 'text-slate-500'
                  : rate >= 80
                    ? 'text-brand-700'
                    : rate >= 60
                      ? 'text-amber-700'
                      : 'text-red-600'
              }`}
            >
              {st.best.correct}/{st.best.total}
            </span>
            {rate !== null && (
              <span className="block text-[10px] text-slate-400">{rate}%</span>
            )}
          </span>
        ) : (
          <span className="text-slate-300 text-lg shrink-0">→</span>
        )}
      </Link>
    </li>
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

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중…</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <BackLink to="/vocab" label="단어 시험지" />

      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          교재
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
          {title}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          전체 {days.length}개 · 응시 {done.length} · 잔여 {todo.length}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">
          풀어야 할 시험지 ({todo.length})
        </h2>
        {todo.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            이 교재는 전부 응시했어요.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white overflow-hidden">
            {todo.map((d) => (
              <DayRow key={d.st.set.id} day={d.day} st={d.st} />
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-500">
            이미 응시한 시험지 ({done.length})
          </h2>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50/60 overflow-hidden">
            {done.map((d) => (
              <DayRow key={d.st.set.id} day={d.day} st={d.st} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
