import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { getAccount } from '../lib/account'
import {
  createAssignment,
  deleteAssignment,
  deleteAttempt,
  listAssignmentsForStudent,
  listAttemptsForUser,
  listReadings,
  listVocabSets,
} from '../lib/firestore'
import { listMyWordbook } from '../lib/wordbook'
import type {
  Assignment,
  AssignmentType,
  Attempt,
  Reading,
  UserAccount,
  VocabSet,
  WordLookup,
} from '../lib/types'

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
  vocab: 'bg-brand-50 text-brand-700',
  reading: 'bg-brand-50 text-brand-800',
  wordbook: 'bg-brand-50 text-brand-700',
}

type TypeFilter = 'all' | Attempt['type']

export function AdminStudentDetail() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const [account, setAccount] = useState<UserAccount | null>(null)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [wordbook, setWordbook] = useState<WordLookup[]>([])
  const [vocabSets, setVocabSets] = useState<VocabSet[]>([])
  const [readings, setReadings] = useState<Reading[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const [assignType, setAssignType] = useState<AssignmentType>('reading')
  const [assignRefId, setAssignRefId] = useState('')
  const [assignDue, setAssignDue] = useState('')
  const [assignNote, setAssignNote] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)

  async function reloadAssignments() {
    if (!id) return
    setAssignments(await listAssignmentsForStudent(id))
  }

  useEffect(() => {
    if (!id) return
    let cancelled = false
    Promise.all([
      getAccount(id),
      listAttemptsForUser(id),
      listMyWordbook(id),
      listVocabSets(),
      listReadings(),
      listAssignmentsForStudent(id),
    ])
      .then(([acc, atts, wb, vs, rd, asn]) => {
        if (cancelled) return
        if (!acc) {
          setError('학생을 찾을 수 없습니다.')
          return
        }
        setAccount(acc)
        setAttempts(atts)
        setWordbook(wb)
        setVocabSets(vs)
        setReadings(rd)
        setAssignments(asn)
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

  const progress = useMemo(() => {
    const vocabDone = new Set(
      attempts.filter((a) => a.type === 'vocab' && a.refId).map((a) => a.refId),
    )
    const readingDone = new Set(
      attempts.filter((a) => a.type === 'reading' && a.refId).map((a) => a.refId),
    )
    return {
      vocabDone: vocabDone.size,
      vocabTotal: vocabSets.length,
      readingDone: readingDone.size,
      readingTotal: readings.length,
    }
  }, [attempts, vocabSets, readings])

  const completedRefIds = useMemo(() => {
    const map: Record<AssignmentType, Set<string>> = {
      vocab: new Set(
        attempts.filter((a) => a.type === 'vocab' && a.refId).map((a) => a.refId),
      ),
      reading: new Set(
        attempts.filter((a) => a.type === 'reading' && a.refId).map((a) => a.refId),
      ),
    }
    return map
  }, [attempts])

  const [bundleMode, setBundleMode] = useState(false)
  const [bundleCategory, setBundleCategory] = useState('')

  const readingCategories = useMemo(() => {
    const TITLE_RE = /^(.+?)\s+(\d+)\s*(?:번|문제)?\s*$/
    const map = new Map<string, Reading[]>()
    for (const r of readings) {
      const m = TITLE_RE.exec(r.title.trim())
      if (!m) continue
      const cat = m[1].trim()
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(r)
    }
    return [...map.entries()]
      .map(([category, list]) => ({ category, list }))
      .sort((a, b) =>
        a.category.localeCompare(b.category, 'ko', { numeric: true }),
      )
  }, [readings])

  const assignOptions = assignType === 'vocab' ? vocabSets : readings

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault()
    setAssignError(null)
    if (!id || !account || !profile) return
    const dueDate = assignDue ? new Date(assignDue) : null
    if (dueDate && Number.isNaN(dueDate.getTime())) {
      setAssignError('마감일이 올바르지 않습니다.')
      return
    }

    if (bundleMode && assignType === 'reading') {
      const group = readingCategories.find((g) => g.category === bundleCategory)
      if (!group || group.list.length === 0) {
        setAssignError('묶음 과제로 부여할 시험명을 선택하세요.')
        return
      }
      setAssigning(true)
      try {
        for (const r of group.list) {
          await createAssignment({
            studentUid: id,
            studentName: account.displayName,
            assignedBy: profile.id,
            assignedByName: profile.displayName,
            type: 'reading',
            refId: r.id,
            refTitle: r.title,
            note: assignNote,
            dueAt: dueDate,
          })
        }
        setBundleCategory('')
        setAssignDue('')
        setAssignNote('')
        await reloadAssignments()
      } catch (err) {
        setAssignError(err instanceof Error ? err.message : '과제 부여에 실패했습니다.')
      } finally {
        setAssigning(false)
      }
      return
    }

    if (!assignRefId) {
      setAssignError('과제로 부여할 항목을 선택하세요.')
      return
    }
    const source = assignType === 'vocab' ? vocabSets : readings
    const target = source.find((s) => s.id === assignRefId)
    if (!target) {
      setAssignError('선택한 항목을 찾을 수 없습니다.')
      return
    }
    setAssigning(true)
    try {
      await createAssignment({
        studentUid: id,
        studentName: account.displayName,
        assignedBy: profile.id,
        assignedByName: profile.displayName,
        type: assignType,
        refId: assignRefId,
        refTitle: target.title,
        note: assignNote,
        dueAt: dueDate,
      })
      setAssignRefId('')
      setAssignDue('')
      setAssignNote('')
      await reloadAssignments()
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : '과제 부여에 실패했습니다.')
    } finally {
      setAssigning(false)
    }
  }

  async function handleDeleteAssignment(asn: Assignment) {
    if (!window.confirm(`"${asn.refTitle}" 과제를 삭제하시겠습니까?`)) return
    await deleteAssignment(asn.id)
    await reloadAssignments()
  }

  async function handleDeleteAttempt(att: Attempt) {
    if (!window.confirm(`"${att.refTitle}" 시험 기록을 삭제하시겠습니까?`)) return
    try {
      await deleteAttempt(att.id)
      setAttempts((prev) => prev.filter((a) => a.id !== att.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패')
    }
  }

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
        <h2 className="text-base font-semibold text-slate-900">학습 진행도</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ProgressCard
            label="단어 시험지"
            done={progress.vocabDone}
            total={progress.vocabTotal}
          />
          <ProgressCard
            label="지문 문제풀이"
            done={progress.readingDone}
            total={progress.readingTotal}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">과제</h2>
          <span className="text-xs text-slate-500">총 {assignments.length}건</span>
        </div>

        <form
          onSubmit={handleAssign}
          className="rounded-lg border border-brand-200 bg-brand-50/40 p-4 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">유형</label>
              <select
                value={assignType}
                onChange={(e) => {
                  setAssignType(e.target.value as AssignmentType)
                  setAssignRefId('')
                }}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="reading">지문 문제풀이</option>
                <option value="vocab">단어 시험지</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {assignType === 'vocab'
                  ? '단어 시험지'
                  : bundleMode
                    ? '시험명 묶음'
                    : '지문'}{' '}
                선택
              </label>
              {assignType === 'reading' && bundleMode ? (
                <select
                  value={bundleCategory}
                  onChange={(e) => setBundleCategory(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">— 선택 —</option>
                  {readingCategories.map((g) => (
                    <option key={g.category} value={g.category}>
                      {g.category} ({g.list.length}개)
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={assignRefId}
                  onChange={(e) => setAssignRefId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">— 선택 —</option>
                  {assignOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                    </option>
                  ))}
                </select>
              )}
              {assignType === 'reading' && readingCategories.length > 0 && (
                <label className="mt-1.5 flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bundleMode}
                    onChange={(e) => setBundleMode(e.target.checked)}
                    className="accent-brand-600"
                  />
                  시험명 묶음(풀세트)으로 부여
                </label>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                마감일 <span className="text-slate-400 font-normal">(선택)</span>
              </label>
              <input
                type="date"
                value={assignDue}
                onChange={(e) => setAssignDue(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                메모 <span className="text-slate-400 font-normal">(선택)</span>
              </label>
              <input
                type="text"
                value={assignNote}
                onChange={(e) => setAssignNote(e.target.value)}
                placeholder="예: 시간 재고 풀어보기"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          {assignError && <p className="text-sm text-red-600">{assignError}</p>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={assigning}
              className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-50"
            >
              {assigning ? '부여 중...' : '과제 부여'}
            </button>
          </div>
        </form>

        {assignments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            아직 부여한 과제가 없습니다.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {assignments.map((a) => {
              const done = completedRefIds[a.type].has(a.refId)
              return (
                <li key={a.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                          done ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {done ? '완료' : '미완료'}
                      </span>
                      <span className="text-xs text-slate-500">
                        {a.type === 'vocab' ? '단어 시험지' : '지문'}
                      </span>
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {a.refTitle}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-1">
                      {a.dueAt && <span>마감: {fmtDate(a.dueAt)}</span>}
                      <span>부여: {fmtDate(a.createdAt)}</span>
                      {a.note && <span className="text-slate-600">· {a.note}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteAssignment(a)}
                    className="text-xs text-slate-400 hover:text-red-600 shrink-0"
                  >
                    삭제
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

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
                  <th className="px-4 py-3 text-left font-semibold w-12"></th>
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
                              ? 'text-brand-700'
                              : ratio >= 50
                                ? 'text-brand-700'
                                : 'text-red-700'
                          }`}
                        >
                          {ratio}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                        {fmtDate(a.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleDeleteAttempt(a)}
                          className="text-xs text-slate-400 hover:text-red-600"
                          aria-label="삭제"
                        >
                          삭제
                        </button>
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
                  <span className="inline-block rounded-full bg-brand-50 text-brand-700 text-xs font-medium px-2 py-0.5 whitespace-nowrap">
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

function ProgressCard({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-xs text-slate-500">{pct}%</p>
      </div>
      <p className="text-2xl font-semibold text-slate-900">
        {done}
        <span className="text-base text-slate-400 font-medium"> / {total}</span>
      </p>
      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full bg-brand-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
