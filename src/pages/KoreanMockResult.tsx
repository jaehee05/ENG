import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { GlossedPassage } from '../components/GlossedPassage'
import {
  getAttempt,
  updateKoreanMockAttemptAnswers,
  watchKoreanMock,
} from '../lib/firestore'
import {
  choiceMark,
  gradeFromScore,
  hasMockExplanation,
  isBlankHtml,
  hasMockPassage,
  mockLinkLabels,
  mockWrongChoiceEntries,
  MOCK_SUBJECT_LABEL,
  questionPoints,
  type Attempt,
  type KoreanMock,
  type KoreanMockQuestion,
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
          stroke="#87b987"
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

/**
 * 오답 리뷰 지문. 영어는 어휘를 탭하면 뜻이 뜨는 GlossedPassage로,
 * 국어는 지문이 그 자체로 읽을 대상이라 그대로 보여준다.
 * 해석은 기본으로 접어 둔다 — 먼저 원문을 다시 읽어보게 하려는 의도.
 */
function MockPassageReview({
  question,
  subject,
}: {
  question: KoreanMockQuestion
  subject: MockSubject
}) {
  const [showKo, setShowKo] = useState(false)
  const glossary = question.glossary ?? []
  const passage = question.passage ?? ''

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-500">지문</p>
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
        {subject === 'english' && glossary.length > 0 ? (
          <GlossedPassage
            passage={passage}
            glossary={glossary}
            className="text-[15px] leading-8 text-slate-900 break-words whitespace-pre-wrap text-justify"
          />
        ) : (
          <p className="text-[15px] leading-8 text-slate-900 whitespace-pre-wrap break-words text-justify">
            {passage}
          </p>
        )}
      </div>

      {subject === 'english' && glossary.length > 0 && (
        <p className="text-[11px] text-slate-400">
          회색으로 표시된 단어를 누르면 뜻이 나옵니다.
        </p>
      )}

      {question.passageKo && (
        <div>
          <button
            type="button"
            onClick={() => setShowKo((v) => !v)}
            className="text-xs font-medium text-brand-700 hover:underline py-1"
          >
            {showKo ? '해석 접기' : '해석 보기'}
          </button>
          {showKo && (
            <p className="mt-1 rounded-lg border border-slate-200 bg-white p-3 text-sm leading-7 text-slate-700 whitespace-pre-wrap break-words">
              {question.passageKo}
            </p>
          )}
        </div>
      )}
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
  const [explNumber, setExplNumber] = useState<number | null>(null)
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

  // 한 번 읽고 끝내지 않고 계속 듣는다. 관리자가 해설을 저장하면 이 화면이
  // 바로 따라온다 — 못 누르던 번호가 눌리고, 열어 둔 해설도 그 자리에서 바뀐다.
  useEffect(() => {
    if (!id) return
    return watchKoreanMock(id, setMock)
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
  // 문항 번호 → 문항. 공통 + 응시한 선택과목 문항.
  // 해설(정답/오답)과 오답 리뷰 지문을 모두 여기서 꺼내 쓴다.
  const explByNumber = new Map<number, KoreanMockQuestion>()
  const passageByNumber = new Map<number, KoreanMockQuestion>()
  /** 문항 번호 → 연계 교재 출처. 해설이 없어도 이것만으로 열어볼 값어치가 있다. */
  const linkByNumber = new Map<number, string>()
  if (mock) {
    const collect = (q: KoreanMockQuestion) => {
      if (hasMockExplanation(q)) explByNumber.set(q.number, q)
      if (hasMockPassage(q)) passageByNumber.set(q.number, q)
      if (q.linkedSource?.trim()) linkByNumber.set(q.number, q.linkedSource)
    }
    for (const q of mock.questions) collect(q)
    const el = attempt.mockElectiveName
      ? mock.electives?.find((e) => e.name === attempt.mockElectiveName)
      : undefined
    for (const q of el?.questions ?? []) collect(q)
  }
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
          <p className="mt-3 text-base font-bold text-slate-900 font-maruburi">
            출제자의 한마디
          </p>
          <p className="mt-1.5 text-sm text-slate-500 leading-loose whitespace-pre-wrap font-maruburi">
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
              const hasExpl = explByNumber.has(r.number)
              // 지문은 틀린 문항에서만. 관리자는 검수용으로 항상 볼 수 있다.
              const showPassage =
                passageByNumber.has(r.number) && (!r.correct || canEdit)
              const hasLink = linkByNumber.has(r.number)
              const tappable = !editing && (hasExpl || showPassage || hasLink)
              return (
                <tr
                  key={i}
                  onClick={tappable ? () => setExplNumber(r.number) : undefined}
                  className={`${r.correct ? '' : 'bg-red-50/40'} ${
                    tappable ? 'cursor-pointer hover:bg-slate-50' : ''
                  }`}
                >
                  <td className="px-3 py-2.5 font-semibold text-slate-800">
                    {r.number}번
                    {/* 눌러서 볼 수 있는 줄임을 표시한다. 해설이 나중에 올라오면
                        새로고침 없이 이 표시가 붙고 그때부터 눌린다. */}
                    {hasExpl && (
                      <span className="ml-1.5 inline-block rounded bg-slate-100 text-slate-600 px-1.5 py-0.5 text-[10px] font-medium align-middle">
                        해설
                      </span>
                    )}
                    {showPassage && (
                      <span className="ml-1.5 inline-block rounded bg-brand-50 text-brand-700 px-1.5 py-0.5 text-[10px] font-medium align-middle">
                        지문
                      </span>
                    )}
                    {/* 해설이 없어도 연계만으로 열리는 줄이 있다. 눌리는 줄임을
                        표시해 두지 않으면 눌러볼 이유를 모른다. */}
                    {hasLink && (
                      <span className="ml-1.5 inline-block rounded bg-amber-50 text-amber-800 px-1.5 py-0.5 text-[10px] font-medium align-middle">
                        연계
                      </span>
                    )}
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

      {/* 문항 해설 모달 */}
      {explNumber != null &&
        (() => {
          const r = results.find((x) => x.number === explNumber)
          const explQ = explByNumber.get(explNumber)
          const wrongEntries = explQ ? mockWrongChoiceEntries(explQ) : []
          // 지문은 틀렸을 때만 (관리자는 검수용으로 항상)
          const pq = passageByNumber.get(explNumber)
          const passageQ = pq && (!r?.correct || canEdit) ? pq : undefined
          const linkLabels = mockLinkLabels(linkByNumber.get(explNumber))
          return (
            <div
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setExplNumber(null)}
            >
              <div
                className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900">
                    {explNumber}번 {r && !r.correct ? '오답 리뷰' : '해설'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setExplNumber(null)}
                    className="text-slate-400 hover:text-slate-900 text-lg leading-none px-1"
                    aria-label="닫기"
                  >
                    ✕
                  </button>
                </div>
                <div className="p-5 space-y-3">
                  {r && (
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-slate-500">
                        정답{' '}
                        <span className="font-bold text-slate-900">
                          {r.correctAnswer}
                        </span>
                      </span>
                      <span className="text-slate-500">
                        내 답{' '}
                        <span
                          className={`font-bold ${
                            r.correct ? 'text-brand-700' : 'text-red-600'
                          }`}
                        >
                          {r.userAnswer === 0 ? '미응답' : r.userAnswer}
                        </span>
                      </span>
                    </div>
                  )}
                  {/* 연계 교재 칩. 해설보다 먼저 온다 — 이 문항이 어디서 왔는지
                      먼저 알고 해설을 읽게 하려는 것. */}
                  {linkLabels.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* '연계'는 이름표가 한 번만 달고 간다 — 칩마다 되풀이할 말이 아니다. */}
                      <span className="text-xs text-slate-500">연계</span>
                      {linkLabels.map((label) => (
                        <span
                          key={label}
                          className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  )}

                  {passageQ && (
                    <MockPassageReview question={passageQ} subject={subj} />
                  )}

                  {/* 문항별 출제자 한마디. 해설보다 먼저 온다 — 어떻게 봐야
                      하는 문제인지 짚어주고 해설로 들어가는 순서다. 따옴표로
                      감싸는 건 결과 화면 위쪽의 시험 전체 한마디와 같은 모양 —
                      같은 사람의 말이라는 걸 생김새로 알아보게. */}
                  {!isBlankHtml(explQ?.examinerNote) && explQ?.examinerNote && (
                    <div className="rounded-xl bg-slate-50 p-4">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-400 overflow-hidden">
                        <span className="font-serif text-3xl leading-none translate-y-[0.18em]">
                          &ldquo;
                        </span>
                      </span>
                      <p className="mt-2 text-sm font-bold text-slate-900 font-maruburi">
                        출제자의 한마디
                      </p>
                      <div
                        className="rte-view mt-1 text-sm text-slate-600 leading-loose font-maruburi"
                        dangerouslySetInnerHTML={{ __html: explQ.examinerNote }}
                      />
                      <div className="flex justify-end mt-1">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-400 overflow-hidden">
                          <span className="font-serif text-3xl leading-none translate-y-[0.18em]">
                            &rdquo;
                          </span>
                        </span>
                      </div>
                    </div>
                  )}

                  {!isBlankHtml(explQ?.explanation) && explQ?.explanation && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1.5">
                        정답 해설{' '}
                        {r && (
                          <span className="text-brand-700">
                            {choiceMark(r.correctAnswer)}
                          </span>
                        )}
                      </p>
                      <div
                        className="rte-view text-sm text-slate-800"
                        dangerouslySetInnerHTML={{ __html: explQ.explanation }}
                      />
                    </div>
                  )}

                  {explQ && wrongEntries.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1.5">
                        오답 해설
                      </p>
                      <div className="space-y-3">
                        {wrongEntries.map((e) => (
                          <div key={e.choice} className="flex gap-2">
                            {/* 선지 번호는 저장하지 않고 표시할 때 붙인다 */}
                            <span className="shrink-0 text-sm font-semibold text-slate-500 leading-7">
                              {e.mark}
                            </span>
                            <div
                              className="rte-view text-sm text-slate-800 min-w-0 flex-1"
                              dangerouslySetInnerHTML={{ __html: e.html }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 선지별로 나누기 전 형식으로 입력된 오답 해설 (그대로 표시) */}
                  {!isBlankHtml(explQ?.explanationWrong) &&
                    explQ?.explanationWrong &&
                    wrongEntries.length === 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1.5">
                        오답 해설
                      </p>
                      <div
                        className="rte-view text-sm text-slate-800"
                        dangerouslySetInnerHTML={{ __html: explQ.explanationWrong }}
                      />
                    </div>
                  )}

                  {!explQ && !passageQ && (
                    <p className="text-sm text-slate-400 py-6 text-center">
                      아직 해설이 없어요.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
    </div>
  )
}
