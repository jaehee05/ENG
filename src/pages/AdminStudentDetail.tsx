import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAccount } from '../lib/account'
import { listAttemptsForUser } from '../lib/firestore'
import { listMyWordbook } from '../lib/wordbook'
import type { Attempt, UserAccount, WordLookup } from '../lib/types'

function fmtDate(ts: { toDate: () => Date } | null | undefined): string {
  if (!ts) return ''
  const d = ts.toDate()
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
}

const TYPE_LABEL: Record<Attempt['type'], string> = {
  vocab: '단어 시험지',
  reading: '지문 문제풀이',
  wordbook: '내 단어장 시험',
}

const TYPE_CLASS: Record<Attempt['type'], string> = {
  vocab: 'bg-indigo-50 text-indigo-700',
  reading: 'bg-violet-50 text-violet-700',
  wordbook: 'bg-emerald-50 text-emerald-700',
}

type TypeFilter = 'all' | Attempt['type']

export function AdminStudentDetail() {
  const { id } = useParams<{ id: string }>()
  const [account, setAccount] = useState<UserAccount | null>(null)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [wordbook, setWordbook] = useState<WordLookup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  useEffect(() => {
    if (!id) return
    let cancelled = false
    Promise.all([getAccount(id), listAttemptsForUser(id), listMyWordbook(id)])
      .then(([acc, atts, wb]) => {
        if (cancelled) return
        if (!acc) {
          setError('학생을 찾을 수 없습니다.')
          return
        }
        setAccount(acc)
        setAttempts(atts)
        setWordbook(wb)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '불러오기에 실패했습니다.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const stats = useMemo(() => {
    const ratios = attempts
      .filter((a) => a.total > 0)
      .map((a) => Math.round((a.correct / a.total) * 100))
    const vocab = attempts.filter((a) => a.type === 'vocab')
    const reading = attempts.filter((a) => a.type === 'reading')
    return {
      totalAttempts: attempts.length,
      avgRatio: avg(ratios),
      vocabAvg: avg(
        vocab.filter((a) => a.total > 0).map((a) => Math.round((a.correct / a.total) * 100)),
      ),
      readingAvg: avg(
        reading
          .filter((a) => a.total > 0)
          .map((a) => Math.round((a.correct / a.total) * 100)),
      ),
      wordbookSize: wordbook.length,
      wordbookTotalLookups: wordbook.reduce((sum, w) => sum + (w.count ?? 0), 0),
      lastActivity: attempts[0]?.createdAt ?? null,
    }
  }, [attempts, wordbook])

  const filteredAttempts = useMemo(
    () => (typeFilter === 'all' ? attempts : attempts.filter((a) => a.type === typeFilter)),
    [attempts, typeFilter],
  )

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!account) return null

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/students" className="text-sm text-slate-500 hover:text-slate-900">
          ← 학생 관리
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900 mt-2">{account.displayName}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {account.school || '학교 미입력'} · {account.email}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
          <span>학생 연락처: {account.phone || '-'}</span>
          <span>학부모 연락처: {account.parentPhone || '-'}</span>
          <span>가입일: {fmtDate(account.createdAt)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="총 시험" value={`${stats.totalAttempts}회`} />
        <StatCard
          label="평균 정답률"
          value={stats.totalAttempts > 0 ? `${stats.avgRatio}%` : '-'}
        />
        <StatCard
          label="단어장"
          value={`${stats.wordbookSize}개`}
          sub={`누적 조회 ${stats.wordbookTotalLookups}회`}
        />
        <StatCard
          label="최근 활동"
          value={stats.lastActivity ? fmtDate(stats.lastActivity) : '-'}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatCard
          label="단어 시험지 평균"
          value={
            attempts.some((a) => a.type === 'vocab' && a.total > 0)
              ? `${stats.vocabAvg}%`
              : '-'
          }
          sub={`총 ${attempts.filter((a) => a.type === 'vocab').length}회`}
        />
        <StatCard
          label="지문 문제풀이 평균"
          value={
            attempts.some((a) => a.type === 'reading' && a.total > 0)
              ? `${stats.readingAvg}%`
              : '-'
          }
          sub={`총 ${attempts.filter((a) => a.type === 'reading').length}회`}
        />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-base font-semibold text-slate-900">시험 이력</h2>
          <div className="flex items-center gap-1 text-xs">
            {(['all', 'vocab', 'reading', 'wordbook'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTypeFilter(k)}
                className={`px-3 py-1.5 rounded-full transition ${
                  typeFilter === k
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {k === 'all' ? '전체' : TYPE_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        {filteredAttempts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            기록이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">유형</th>
                  <th className="px-4 py-3 text-left font-semibold">제목</th>
                  <th className="px-4 py-3 text-left font-semibold">점수</th>
                  <th className="px-4 py-3 text-left font-semibold">정답률</th>
                  <th className="px-4 py-3 text-left font-semibold">날짜</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAttempts.map((a) => {
                  const ratio = a.total > 0 ? Math.round((a.correct / a.total) * 100) : 0
                  return (
                    <tr key={a.id}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${TYPE_CLASS[a.type]}`}>
                          {TYPE_LABEL[a.type]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-900">{a.refTitle}</td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {a.correct} / {a.total}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`text-sm font-medium ${
                            ratio >= 80
                              ? 'text-emerald-700'
                              : ratio >= 50
                                ? 'text-amber-700'
                                : 'text-red-700'
                          }`}
                        >
                          {ratio}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                        {fmtDate(a.createdAt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">
          단어장 ({wordbook.length})
        </h2>
        {wordbook.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            모은 단어가 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[...wordbook]
              .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
              .slice(0, 20)
              .map((w) => (
                <div
                  key={w.en}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm flex items-baseline justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{w.en}</p>
                    <p className="text-slate-500 truncate text-xs">{w.ko}</p>
                  </div>
                  <span className="inline-block rounded-full bg-yellow-50 text-yellow-800 text-xs font-medium px-2 py-0.5 whitespace-nowrap">
                    {w.count}회
                  </span>
                </div>
              ))}
          </div>
        )}
        {wordbook.length > 20 && (
          <p className="text-xs text-slate-500">조회 횟수 상위 20개만 표시 (총 {wordbook.length}개)</p>
        )}
      </section>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-semibold text-slate-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}
