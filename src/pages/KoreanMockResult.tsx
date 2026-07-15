import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  getAttempt,
  getKoreanMock,
  updateKoreanMockAttemptAnswers,
} from '../lib/firestore'
import {
  gradeFromScore,
  MOCK_SUBJECT_LABEL,
  questionPoints,
  type Attempt,
  type KoreanMock,
  type KoreanMockResult,
  type MockSubject,
} from '../lib/types'

const SUBJECT_BADGE_CLASS: Record<MockSubject, string> = {
  korean: 'bg-rose-50 text-rose-700 border-rose-200',
  english: 'bg-sky-50 text-sky-700 border-sky-200',
}

/** 원형 점수 게이지. */
function ScoreRing({ score, total }: { score: number; total: number }) {
  const pct = total > 0 ? Math.max(0, Math.min(1, score / total)) : 0
  const r = 82
  const c = 2 * Math.PI * r
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="200" height="200" viewBox="0 0 200 200" className="-rotate-90">
        <circle
          cx="100"
          cy="100"
          r={r}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="14"
        />
        <circle
          cx="100"
          cy="100"
          r={r}
          fill="none"
          stroke="#72b768"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-bold text-slate-900 tabular-nums">
          {score}
        </span>
        <span className="text-xs text-slate-400 mt-1">{total}점 만점 중</span>
      </div>
    </div>
  )
}

function fmtAttemptDate(ts: Attempt['createdAt']): string {
  if (!ts) return ''
  const d = ts.toDate()
  return `${String(d.getFullYear()).slice(2)}년 ${d.getMonth() + 1}월 ${d.getDate()}일 응시`
}

export function KoreanMockResult() {
  const { id, attemptId } = useParams<{ id: string; attemptId: string }>()
  const { profile } = useAuth()
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [mock, setMock] = useState<KoreanMock | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCutoffs, setShowCutoffs] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editResults, setEditResults] = useState<KoreanMockResult[] | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    if (!attemptId) return
    getAttempt(attemptId)
      .then((a) => {
        if (!a) setError('결과를 찾을 수 없습니다.')
        else setAttempt(a)
      })
      .catch((e) => setError(e.message ?? '불러오기 실패'))
      .finally(() => setLoading(false))
  }, [attemptId])

  useEffect(() => {
    if (!id) return
    getKoreanMock(id).then(setMock).catch(() => {})
  }, [id])

  // 문항 번호 → 배점 (공통 + 선택과목 전체에서 조회, 없으면 2점).
  const pointsByNumber = useMemo(() => {
    const map = new Map<number, number>()
    if (mock) {
      for (const q of mock.questions) map.set(q.number, questionPoints(q))
      for (const el of mock.electives ?? [])
        for (const q of el.questions) map.set(q.number, questionPoints(q))
    }
    return map
  }, [mock])

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중…</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!attempt || !attempt.koreanMockResults) return null

  const results =
    editing && editResults ? editResults : attempt.koreanMockResults
  const canEdit = profile?.role === 'admin'
  const subj: MockSubject = attempt.mockSubject ?? mock?.subject ?? 'korean'

  function startEditAnswers() {
    setEditResults(attempt!.koreanMockResults!.map((r) => ({ ...r })))
    setEditing(true)
  }
  function cycleAnswer(idx: number) {
    setEditResults((prev) => {
      if (!prev) return prev
      const next = [...prev]
      const r = next[idx]
      const ua = r.userAnswer >= 5 ? 0 : r.userAnswer + 1 // 1→2→3→4→5→0(미응답)→1
      next[idx] = {
        ...r,
        userAnswer: ua,
        correct: ua > 0 && ua === r.correctAnswer,
      }
      return next
    })
  }
  async function saveEditAnswers() {
    if (!attemptId || !editResults) return
    setSavingEdit(true)
    try {
      await updateKoreanMockAttemptAnswers(attemptId, editResults)
      const correct = editResults.filter((r) => r.correct).length
      setAttempt((a) =>
        a ? { ...a, koreanMockResults: editResults, correct, total: editResults.length } : a,
      )
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSavingEdit(false)
    }
  }
  const pointsOf = (n: number) => pointsByNumber.get(n) ?? 2
  const totalPoints = results.reduce((s, r) => s + pointsOf(r.number), 0)
  const score = results.reduce((s, r) => s + (r.correct ? pointsOf(r.number) : 0), 0)
  const correctCount = results.filter((r) => r.correct).length
  const wrongCount = results.length - correctCount
  // 선택과목마다 등급컷이 다르다: 응시한 선택과목 등급컷 우선, 없으면 공통.
  const activeCutoffs = (() => {
    if (attempt.mockElectiveName && mock?.electives) {
      const el = mock.electives.find((e) => e.name === attempt.mockElectiveName)
      if (el?.gradeCutoffs && el.gradeCutoffs.length) return el.gradeCutoffs
    }
    return mock?.gradeCutoffs
  })()
  const grade = gradeFromScore(score, activeCutoffs)
  // 6등급부터는 "6등급 이하"로 표기.
  const gradeLabel = (g: number) => (g >= 6 ? '6등급 이하' : `${g}등급`)

  // 등급컷 상세 행: 1~5등급 + 6등급 이하.
  const cutoffRows = (() => {
    if (!activeCutoffs || activeCutoffs.length === 0)
      return [] as { grade: number; label: string; score: number | null; below: boolean }[]
    const under = [...activeCutoffs]
      .filter((c) => c.grade <= 5)
      .sort((a, b) => a.grade - b.grade)
    const rows = under.map((c) => ({
      grade: c.grade,
      label: `${c.grade}등급`,
      score: c.minScore as number | null,
      below: false,
    }))
    rows.push({ grade: 6, label: '6등급 이하', score: null, below: true })
    return rows
  })()

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <header className="text-center">
        <h1 className="text-lg font-bold text-slate-900">시험 결과</h1>
      </header>

      {/* 점수 카드 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        {attempt.createdAt && (
          <p className="text-xs text-slate-400">{fmtAttemptDate(attempt.createdAt)}</p>
        )}
        <h2 className="text-xl font-bold text-slate-900 mt-1">{attempt.refTitle}</h2>
        <span
          className={`inline-block mt-2 rounded-full text-[11px] font-medium px-2.5 py-1 border ${SUBJECT_BADGE_CLASS[subj]}`}
        >
          {MOCK_SUBJECT_LABEL[subj]}
        </span>
        <div className="mt-4 flex justify-center">
          <ScoreRing score={score} total={totalPoints} />
        </div>
      </div>

      {/* 등급 카드 (등급컷 있을 때) — 탭하면 등급컷 상세 */}
      {grade != null && (
        <button
          type="button"
          onClick={() => setShowCutoffs(true)}
          className="w-full text-left rounded-2xl border border-slate-200 bg-white p-5 hover:border-slate-300 transition"
        >
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              🏆
            </span>
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-900">등급</p>
              <p className="text-xs text-slate-400">이번 시험에서 나의 위치는?</p>
            </div>
            <span className="text-slate-300 text-lg">›</span>
          </div>
          <p className="mt-3 text-4xl font-extrabold text-amber-600 tracking-tight">
            {gradeLabel(grade)}
          </p>
          <div className="mt-3 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500"
              style={{ width: `${totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            원점수 {score}점 / {totalPoints}점 · 등급컷 보기
          </p>
        </button>
      )}

      {/* 출제자 한마디 */}
      {mock?.examinerComment && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400 overflow-hidden">
            <span className="font-serif text-4xl leading-none translate-y-[0.18em]">
              &ldquo;
            </span>
          </span>
          <p className="mt-3 text-base font-bold text-slate-900">출제자의 한마디</p>
          <p className="mt-1.5 text-sm text-slate-500 leading-relaxed whitespace-pre-wrap">
            {mock.examinerComment}
          </p>
          <div className="flex justify-end mt-2">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400 overflow-hidden">
              <span className="font-serif text-4xl leading-none translate-y-[0.18em]">
                &rdquo;
              </span>
            </span>
          </div>
        </div>
      )}

      {/* 정답/오답 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 grid grid-cols-2">
        <div className="flex flex-col items-center gap-1 border-r border-slate-100">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-600 text-lg">
            ○
          </span>
          <span className="text-xs text-slate-500">정답</span>
          <span className="text-xl font-bold text-slate-900">{correctCount}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-500 text-lg">
            ✕
          </span>
          <span className="text-xs text-slate-500">오답</span>
          <span className="text-xl font-bold text-slate-900">{wrongCount}</span>
        </div>
      </div>

      {mock?.explanationPdfUrl && (
        <a
          href={mock.explanationPdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center rounded-xl bg-brand-600 text-white text-sm font-semibold px-4 py-3 hover:bg-brand-700 transition"
        >
          📄 해설 보기
        </a>
      )}

      {/* 정오표 */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">정오표</h3>
          {canEdit &&
            (editing ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="text-xs text-slate-400 hover:text-slate-700"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={saveEditAnswers}
                  disabled={savingEdit}
                  className="rounded-md bg-brand-600 text-white text-xs font-semibold px-3 py-1 hover:bg-brand-700 disabled:opacity-50"
                >
                  {savingEdit ? '저장 중…' : '저장'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startEditAnswers}
                className="text-xs font-medium text-brand-700 hover:underline"
              >
                답 수정
              </button>
            ))}
        </div>
        {editing && (
          <p className="px-4 pt-2 text-[11px] text-slate-400">
            학생답을 탭하면 1→2→3→4→5→미응답 순으로 바뀝니다.
          </p>
        )}
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-[11px] text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">문항</th>
              <th className="px-2 py-2 text-center font-semibold">배점</th>
              <th className="px-2 py-2 text-center font-semibold">정답</th>
              <th className="px-2 py-2 text-center font-semibold">학생답</th>
              <th className="px-3 py-2 text-center font-semibold">정오</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {results.map((r, i) => {
              const unanswered = r.userAnswer === 0
              return (
                <tr key={i} className={r.correct ? '' : 'bg-red-50/40'}>
                  <td className="px-3 py-2.5 font-semibold text-slate-800">
                    {r.number}번
                  </td>
                  <td className="px-2 py-2.5 text-center text-slate-500 tabular-nums">
                    {pointsOf(r.number)}
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <span className="inline-block w-6 h-6 leading-6 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                      {r.correctAnswer}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    {editing ? (
                      <button
                        type="button"
                        onClick={() => cycleAnswer(i)}
                        className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-semibold border-2 border-dashed ${
                          unanswered
                            ? 'text-slate-300 border-slate-300'
                            : r.correct
                              ? 'bg-brand-100 text-brand-700 border-brand-300'
                              : 'bg-red-100 text-red-600 border-red-300'
                        }`}
                      >
                        {unanswered ? '—' : r.userAnswer}
                      </button>
                    ) : unanswered ? (
                      <span className="text-slate-300 text-xs">—</span>
                    ) : (
                      <span
                        className={`inline-block w-6 h-6 leading-6 rounded-full text-xs font-semibold ${
                          r.correct
                            ? 'bg-brand-100 text-brand-700'
                            : 'bg-red-100 text-red-600'
                        }`}
                      >
                        {r.userAnswer}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {r.correct ? (
                      <span className="text-brand-600 font-bold">○</span>
                    ) : (
                      <span className="text-red-500 font-bold">✕</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <Link
          to={`/korean-mocks/${id}`}
          className="flex-1 text-center rounded-xl border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2.5 hover:bg-slate-100"
        >
          모의고사로
        </Link>
        <Link
          to="/korean-mocks"
          className="flex-1 text-center rounded-xl border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2.5 hover:bg-slate-100"
        >
          목록으로
        </Link>
      </div>

      {/* 등급컷 상세 오버레이 */}
      {showCutoffs && grade != null && cutoffRows.length > 0 && (
        <div className="fixed inset-0 z-50 bg-slate-50 overflow-y-auto safe-top safe-bottom">
          <div className="max-w-lg mx-auto px-5 py-5">
            <header className="flex items-center gap-2 mb-4">
              <button
                type="button"
                onClick={() => setShowCutoffs(false)}
                className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-600"
                aria-label="닫기"
              >
                ‹
              </button>
              <div className="flex-1 text-center pr-9">
                <h2 className="text-base font-bold text-slate-900">등급컷</h2>
                <p className="text-xs text-slate-400 truncate">{attempt.refTitle}</p>
              </div>
            </header>

            <div className="rounded-2xl bg-white border border-slate-200 p-5">
              {attempt.mockElectiveName && (
                <span className="inline-block rounded-full bg-violet-500 text-white text-xs font-semibold px-3 py-1 mb-2">
                  {attempt.mockElectiveName}
                </span>
              )}
              <h3 className="text-xl font-bold text-slate-900">추정 등급컷</h3>
              <div className="mt-4 space-y-1">
                {cutoffRows.map((r) => {
                  const isMe = r.below ? grade >= 6 : grade === r.grade
                  return (
                    <div
                      key={r.grade}
                      className={`flex items-center gap-3 px-4 py-3.5 rounded-xl ${
                        isMe ? 'bg-gradient-to-r from-amber-300 to-amber-500 shadow-sm' : ''
                      }`}
                    >
                      <span
                        className={`shrink-0 text-sm font-bold ${
                          isMe ? 'text-white' : 'text-slate-500'
                        }`}
                      >
                        {r.label}
                      </span>
                      <span
                        className={`flex-1 border-b border-dotted ${
                          isMe ? 'border-white/50' : 'border-slate-300'
                        }`}
                      />
                      <span
                        className={`shrink-0 text-lg font-bold tabular-nums ${
                          isMe ? 'text-white' : 'text-slate-900'
                        }`}
                      >
                        {r.score != null ? `${r.score} 점` : '- 점'}
                      </span>
                    </div>
                  )
                })}
              </div>
              <p className="mt-4 text-center text-sm text-slate-500">
                내 원점수{' '}
                <span className="font-bold text-slate-900">{score}점</span> ·{' '}
                <span className="font-bold text-amber-600">{gradeLabel(grade)}</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
