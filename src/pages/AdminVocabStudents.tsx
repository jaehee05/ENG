import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listAccounts } from '../lib/account'
import { formatDate, listAllAttempts, listVocabSets } from '../lib/firestore'
import { sheetStatuses, summarizeVocab, type VocabSummary } from '../lib/vocabStatus'
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

/**
 * 관리자가 단어 탭에서 처음 보는 화면. 학생을 고르면 그 학생의 시험 현황으로
 * 넘어간다. 예전에는 여기서 관리자 자기 시험지를 보여줬는데, 관리자에게
 * 배정된 시험지는 없으니 늘 빈 화면이었다.
 */
export function AdminVocabStudents() {
  const [rows, setRows] = useState<
    { account: UserAccount; summary: VocabSummary }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([listAccounts(), listVocabSets(), listAllAttempts()])
      .then(([accs, sets, attempts]) => {
        if (cancelled) return
        setRows(buildRows(accs, sets, attempts))
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
  }, [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(
      (r) =>
        r.account.displayName.toLowerCase().includes(needle) ||
        (r.account.school ?? '').toLowerCase().includes(needle),
    )
  }, [rows, q])

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <header className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            관리
          </p>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
            학생별 단어 시험 현황
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            학생을 누르면 시험지별 응시 결과를 볼 수 있습니다.
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Link
            to="/vocab/corpora"
            className="rounded-md border border-slate-300 text-slate-700 text-xs font-medium px-3 py-1.5 hover:bg-slate-50"
          >
            교재
          </Link>
          <Link
            to="/admin/vocab"
            className="rounded-md border border-slate-300 text-slate-700 text-xs font-medium px-3 py-1.5 hover:bg-slate-50"
          >
            시험지 관리
          </Link>
        </div>
      </header>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="학생 이름 · 학교로 찾기"
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          {rows.length === 0 ? '활성 학생이 없습니다.' : '찾는 학생이 없습니다.'}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map(({ account, summary }) => (
            <li key={account.id}>
              <Link
                to={`/vocab/student/${account.id}`}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-brand-300 hover:bg-brand-50/30 transition"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 truncate">
                    {account.displayName}
                    {account.school && (
                      <span className="ml-1.5 text-xs font-normal text-slate-500">
                        {account.school}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {summary.total === 0 ? (
                      '시험지 없음'
                    ) : (
                      <>
                        시험지 {summary.total}개 · 응시 {summary.taken}
                        {summary.untaken > 0 && (
                          <span className="text-amber-700">
                            {' '}
                            · 미응시 {summary.untaken}
                          </span>
                        )}
                        {' · '}
                        기준 통과 {summary.passed}
                      </>
                    )}
                  </p>
                  {summary.lastAt && (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      최근 응시 {formatDate(summary.lastAt)}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-lg font-semibold ${rateTone(summary.avgRate)}`}>
                    {summary.avgRate === null ? '—' : `${summary.avgRate}%`}
                  </p>
                  <p className="text-[10px] text-slate-400">평균 정답률</p>
                </div>
                <span className="shrink-0 text-slate-300" aria-hidden>
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function buildRows(
  accounts: UserAccount[],
  sets: VocabSet[],
  attempts: Attempt[],
): { account: UserAccount; summary: VocabSummary }[] {
  // 시험지는 교재 공용이라 기본적으로 모든 학생이 같은 목록을 푼다. 둘만
  // 예외다 — 병합 전 옛 시험지의 소유자(아래 ownedBy)와, 교재에서 공개
  // 대상을 지정한 시험지(학생마다 걸러낸다).
  const shared = sets.filter((s) => !s.studentUid)
  const ownedBy = new Map<string, VocabSet[]>()
  for (const s of sets) {
    if (!s.studentUid) continue
    const cur = ownedBy.get(s.studentUid)
    if (cur) cur.push(s)
    else ownedBy.set(s.studentUid, [s])
  }
  const attemptsBy = new Map<string, Attempt[]>()
  for (const a of attempts) {
    if (a.type !== 'vocab' || !a.studentUid) continue
    const cur = attemptsBy.get(a.studentUid)
    if (cur) cur.push(a)
    else attemptsBy.set(a.studentUid, [a])
  }

  return accounts
    .filter((a) => a.role === 'student' && a.status === 'active')
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko'))
    .map((account) => ({
      account,
      summary: summarizeVocab(
        sheetStatuses(
          [
            ...shared.filter((s) => isVisibleToStudent(s, account.id)),
            ...(ownedBy.get(account.id) ?? []),
          ],
          attemptsBy.get(account.id) ?? [],
        ),
        VOCAB_PASS_THRESHOLD,
      ),
    }))
}
