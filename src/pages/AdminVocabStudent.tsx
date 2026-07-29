import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BackLink } from '../components/BackLink'
import { getAccount } from '../lib/account'
import {
  formatDate,
  listAttemptsForUser,
  listVocabSetsForStudent,
} from '../lib/firestore'
import {
  sheetStatuses,
  summarizeVocab,
  type SheetStatus,
  type VocabSummary,
} from '../lib/vocabStatus'
import type { UserAccount } from '../lib/types'

/** 통과로 볼 최소 정답 수. 과제 부여 기본값과 같게 맞춘다. */
const VOCAB_PASS_THRESHOLD = 25

function rateTone(rate: number | null): string {
  if (rate === null) return 'text-slate-400'
  if (rate >= 80) return 'text-brand-700'
  if (rate >= 60) return 'text-amber-700'
  return 'text-red-600'
}

/** 관리자용 — 학생 한 명의 시험지별 응시 현황. */
export function AdminVocabStudent() {
  const { uid } = useParams<{ uid: string }>()
  const [account, setAccount] = useState<UserAccount | null>(null)
  const [rows, setRows] = useState<SheetStatus[]>([])
  const [summary, setSummary] = useState<VocabSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    Promise.all([
      getAccount(uid),
      listVocabSetsForStudent(uid),
      listAttemptsForUser(uid),
    ])
      .then(([acc, sets, attempts]) => {
        if (cancelled) return
        if (!acc) {
          setError('학생을 찾을 수 없습니다.')
          return
        }
        // DAY 번호 순. 만든 순서로 두면 DAY 10 이 DAY 2 앞에 온다.
        const sorted = [...sets].sort((a, b) =>
          a.title.localeCompare(b.title, 'ko', { numeric: true }),
        )
        const list = sheetStatuses(sorted, attempts)
        setAccount(acc)
        setRows(list)
        setSummary(summarizeVocab(list, VOCAB_PASS_THRESHOLD))
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
  }, [uid])

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!account || !summary) return null

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <BackLink to="/vocab" label="학생 목록" />

      <header className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
            {account.displayName}
            <span className="ml-2 text-sm font-normal text-slate-500">
              단어 시험 현황
            </span>
          </h1>
          {account.school && (
            <p className="text-sm text-slate-500 mt-1">{account.school}</p>
          )}
        </div>
        <Link
          to={`/admin/students/${account.id}`}
          className="rounded-md border border-slate-300 text-slate-700 text-xs font-medium px-3 py-1.5 hover:bg-slate-50"
        >
          학생 상세 · 과제 부여
        </Link>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatBox label="시험지" value={String(summary.total)} />
        <StatBox
          label="응시"
          value={`${summary.taken}`}
          sub={summary.untaken > 0 ? `미응시 ${summary.untaken}` : undefined}
        />
        <StatBox
          label={`기준 통과 (${VOCAB_PASS_THRESHOLD}개↑)`}
          value={String(summary.passed)}
        />
        <StatBox
          label="평균 정답률"
          value={summary.avgRate === null ? '—' : `${summary.avgRate}%`}
          tone={rateTone(summary.avgRate)}
        />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          이 학생의 단어 시험지가 없습니다.{' '}
          <Link to="/vocab/corpora" className="text-brand-700 underline">
            교재에서 DAY 시험지 만들기
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.set.id}
              className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/vocab/${r.set.id}`}
                    className="font-medium text-slate-900 hover:underline break-keep"
                  >
                    {r.set.title}
                  </Link>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {r.set.words?.length ?? 0}단어
                    {r.set.format === 'choice' ? ' · 5지선다' : ' · 주관식'}
                    {r.practiceCount > 0 && ` · 연습 ${r.practiceCount}회`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {r.best ? (
                    <>
                      <p className={`text-base font-semibold ${rateTone(r.bestRate)}`}>
                        {r.best.correct}/{r.best.total}
                        {r.bestRate !== null && (
                          <span className="ml-1 text-xs font-normal">
                            ({r.bestRate}%)
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {r.tries.length}회 응시 · 최고점
                      </p>
                    </>
                  ) : (
                    <span className="inline-block rounded-full bg-slate-100 text-slate-500 text-[11px] font-medium px-2 py-0.5">
                      미응시
                    </span>
                  )}
                </div>
              </div>

              {r.tries.length > 0 && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                  {/* 최근 것부터. 응시가 많으면 앞의 5회만 보여준다. */}
                  {r.tries.slice(0, 5).map((a) => (
                    <Link
                      key={a.id}
                      to={`/vocab/${r.set.id}/result/${a.id}`}
                      className="rounded-md border border-slate-200 text-slate-600 text-[11px] px-2 py-1 hover:bg-slate-50"
                    >
                      {formatDate(a.createdAt) || '날짜 없음'} · {a.correct}/{a.total}
                    </Link>
                  ))}
                  {r.tries.length > 5 && (
                    <span className="text-[11px] text-slate-400">
                      외 {r.tries.length - 5}회
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StatBox({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className={`text-lg font-semibold ${tone ?? 'text-slate-900'}`}>{value}</p>
      {sub && <p className="text-[10px] text-amber-700">{sub}</p>}
    </div>
  )
}
