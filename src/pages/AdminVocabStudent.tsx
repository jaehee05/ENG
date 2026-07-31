import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BackLink } from '../components/BackLink'
import { getAccount } from '../lib/account'
import {
  deleteAttempt,
  formatDate,
  listAttemptsForUser,
  listVocabSets,
} from '../lib/firestore'
import { sheetStatuses, summarizeVocab } from '../lib/vocabStatus'
import {
  isVisibleToStudent,
  type Attempt,
  type UserAccount,
  type VocabSet,
} from '../lib/types'

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
  // 기록을 지우면 현황을 다시 계산해야 해서 원본을 들고 있는다.
  const [sets, setSets] = useState<VocabSet[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    Promise.all([getAccount(uid), listVocabSets(), listAttemptsForUser(uid)])
      .then(([acc, all, atts]) => {
        if (cancelled) return
        if (!acc) {
          setError('학생을 찾을 수 없습니다.')
          return
        }
        // 시험지는 교재 공용이다. 병합 전 옛 시험지의 소유자와, 교재에서
        // 지정한 공개 대상만 걸러 이 학생이 실제로 보는 목록을 만든다.
        const sets = all.filter(
          (s) =>
            (!s.studentUid || s.studentUid === uid) && isVisibleToStudent(s, uid),
        )
        // DAY 번호 순. 만든 순서로 두면 DAY 10 이 DAY 2 앞에 온다.
        const sorted = [...sets].sort((a, b) =>
          a.title.localeCompare(b.title, 'ko', { numeric: true }),
        )
        setAccount(acc)
        setSets(sorted)
        setAttempts(atts)
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

  const rows = useMemo(() => sheetStatuses(sets, attempts), [sets, attempts])
  const summary = useMemo(
    () => summarizeVocab(rows, VOCAB_PASS_THRESHOLD),
    [rows],
  )

  /**
   * 응시 기록 삭제. 정식 응시를 지우면 응시 횟수 제한이 그만큼 풀리므로,
   * 다시 풀게 해 주려고 지우는 쓰임이 많다.
   */
  async function handleDeleteAttempt(a: Attempt, sheetTitle: string) {
    if (
      !window.confirm(
        `${sheetTitle}\n${formatDate(a.createdAt) || '날짜 없음'} · ${a.correct}/${a.total} 기록을 삭제하시겠습니까?\n` +
          (a.practice
            ? '연습 기록이라 응시 횟수에는 영향이 없습니다.'
            : '응시 횟수 제한이 있으면 학생이 한 번 더 풀 수 있게 됩니다.'),
      )
    )
      return
    setDeletingId(a.id)
    try {
      await deleteAttempt(a.id)
      setAttempts((prev) => prev.filter((x) => x.id !== a.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : '기록 삭제 실패')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!account) return null

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
                    {r.practiceTries.length > 0 &&
                      ` · 연습 ${r.practiceTries.length}회`}
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

              {/* 연습도 함께 — 지울 수 있어야 하므로 목록에 낸다 */}
              {[...r.tries, ...r.practiceTries].length > 0 && (
                <ul className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-1">
                  {[...r.tries, ...r.practiceTries].map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-[11px]">
                      <span className="text-slate-500 shrink-0">
                        {formatDate(a.createdAt) || '날짜 없음'}
                      </span>
                      {a.practice && (
                        <span className="shrink-0 rounded bg-amber-50 text-amber-700 border border-amber-200 px-1 py-0.5 text-[10px]">
                          연습
                        </span>
                      )}
                      <span className="text-slate-600">
                        {a.correct}/{a.total}
                      </span>
                      <Link
                        to={`/vocab/${r.set.id}/result/${a.id}`}
                        className="ml-auto shrink-0 text-slate-500 hover:text-slate-900 underline underline-offset-2"
                      >
                        보기
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteAttempt(a, r.set.title)}
                        disabled={deletingId === a.id}
                        className="shrink-0 text-slate-400 hover:text-red-600 underline underline-offset-2 disabled:opacity-50"
                      >
                        {deletingId === a.id ? '삭제 중…' : '삭제'}
                      </button>
                    </li>
                  ))}
                </ul>
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
