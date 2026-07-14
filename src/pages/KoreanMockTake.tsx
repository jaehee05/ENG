import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { createKoreanMockAttempt, getKoreanMock } from '../lib/firestore'
import {
  getMockSubject,
  MOCK_SUBJECT_LABEL,
  type KoreanMock,
  type KoreanMockQuestion,
  type KoreanMockResult,
} from '../lib/types'

/** 버블시트 한 문항 행 (문번 + 답란 1~5). */
function BubbleRow({
  idx,
  number,
  sel,
  focused,
  onFocus,
  onPick,
}: {
  idx: number
  number: number
  sel: number
  focused: boolean
  onFocus: () => void
  onPick: (n: number) => void
}) {
  return (
    <div
      data-qidx={idx}
      className={`grid grid-cols-[2.4rem_1fr] items-center border-b border-slate-100 last:border-b-0 scroll-mt-24 ${
        focused ? 'bg-brand-50/70' : ''
      }`}
    >
      <button
        type="button"
        onClick={onFocus}
        className={`py-1.5 text-center text-xs font-semibold tabular-nums border-r border-slate-100 ${
          focused ? 'text-brand-700' : 'text-slate-500'
        }`}
      >
        {number}
      </button>
      <div className="flex justify-center gap-1.5 py-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onPick(n)}
            className={`w-6 h-6 rounded-full text-[11px] font-semibold border transition ${
              sel === n
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-400 border-slate-300 active:bg-slate-100'
            }`}
            aria-label={`${number}번 ${n}`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

function SheetSection({
  title,
  accent,
  items,
  answers,
  focused,
  setFocused,
  pick,
}: {
  title: string
  accent: 'brand' | 'rose'
  items: { q: KoreanMockQuestion; idx: number }[]
  answers: number[]
  focused: number
  setFocused: (i: number) => void
  pick: (i: number, n: number) => void
}) {
  const border = accent === 'brand' ? 'border-brand-300' : 'border-rose-300'
  const head = accent === 'brand' ? 'bg-brand-50 text-brand-700' : 'bg-rose-50 text-rose-700'
  const subHead =
    accent === 'brand' ? 'text-brand-600 bg-brand-50/40' : 'text-rose-600 bg-rose-50/40'
  return (
    <div className={`rounded-lg border ${border} overflow-hidden`}>
      <div className={`${head} text-xs font-bold text-center py-1.5`}>{title}</div>
      <div
        className={`grid grid-cols-[2.4rem_1fr] text-[11px] font-semibold text-center ${subHead} border-y ${border}`}
      >
        <div className="py-1 border-r border-slate-200/60">문번</div>
        <div className="py-1">답란</div>
      </div>
      <div>
        {items.map(({ q, idx }) => (
          <BubbleRow
            key={idx}
            idx={idx}
            number={q.number}
            sel={answers[idx] ?? 0}
            focused={focused === idx}
            onFocus={() => setFocused(idx)}
            onPick={(n) => pick(idx, n)}
          />
        ))}
      </div>
    </div>
  )
}

export function KoreanMockTake() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [mock, setMock] = useState<KoreanMock | null>(null)
  const [started, setStarted] = useState(false)
  const [electiveIdx, setElectiveIdx] = useState<number | null>(null)
  const [answers, setAnswers] = useState<number[]>([])
  const [focused, setFocused] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!id) return
    getKoreanMock(id)
      .then((m) => {
        if (!m) setError('모의고사를 찾을 수 없습니다.')
        else setMock(m)
      })
      .catch((e) => setError(e.message ?? '불러오기 실패'))
      .finally(() => setLoading(false))
  }, [id])

  // 답 입력으로 다음 문항으로 넘어갈 때, 해당 문항이 보이도록 스크롤.
  useEffect(() => {
    if (!started) return
    const el = document.querySelector(`[data-qidx="${focused}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focused, started])

  const hasElectives = !!mock?.electives && mock.electives.length > 0
  const chosenElective =
    hasElectives && electiveIdx != null ? mock!.electives![electiveIdx] : null

  const items = useMemo(() => {
    if (!mock) return [] as KoreanMockQuestion[]
    return [...mock.questions, ...(chosenElective?.questions ?? [])]
  }, [mock, chosenElective])

  const commonCount = mock?.questions.length ?? 0

  function beginTake() {
    setAnswers(new Array(items.length).fill(0))
    setFocused(0)
    setStarted(true)
  }

  function pick(idx: number, choice: number) {
    const isToggleOff = answers[idx] === choice
    setAnswers((prev) => {
      const next = [...prev]
      next[idx] = isToggleOff ? 0 : choice
      return next
    })
    setFocused(isToggleOff ? idx : Math.min(items.length - 1, idx + 1))
  }

  async function handleSubmit() {
    if (!mock || !profile) return
    const unanswered = answers.filter((a) => a === 0).length
    if (unanswered > 0) {
      if (
        !window.confirm(
          `${unanswered}문항이 미응답입니다. 제출할까요? (미응답은 오답 처리)`,
        )
      )
        return
    } else if (!window.confirm('제출하시겠습니까?')) {
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const results: KoreanMockResult[] = items.map((q, i) => {
        const userAnswer = answers[i] ?? 0
        return {
          number: q.number,
          userAnswer,
          correctAnswer: q.answer,
          correct: userAnswer > 0 && userAnswer === q.answer,
        }
      })
      const attemptId = await createKoreanMockAttempt({
        studentUid: profile.id,
        studentName: profile.displayName,
        refId: mock.id,
        refTitle: mock.title,
        koreanMockResults: results,
        mockSubject: getMockSubject(mock),
        mockElectiveName: chosenElective?.name,
      })
      navigate(`/korean-mocks/${mock.id}/result/${attemptId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '제출 실패')
      setSubmitting(false)
    }
  }

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중…</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!mock) return null

  const subj = getMockSubject(mock)

  // ── 1단계: 응시하기 인트로 ──
  if (!started) {
    const canStart = !hasElectives || electiveIdx != null
    const total = mock.questions.length + (chosenElective?.questions.length ?? 0)
    return (
      <div className="max-w-lg mx-auto pb-24">
        <header className="flex items-center justify-between mb-5">
          <Link
            to={`/korean-mocks/${mock.id}`}
            className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-600"
            aria-label="뒤로"
          >
            ‹
          </Link>
          <h1 className="text-base font-bold text-slate-900">응시하기</h1>
          <span className="w-9" />
        </header>

        {/* 시험 정보 */}
        <div className="rounded-2xl bg-slate-100/70 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900">{mock.title}</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {MOCK_SUBJECT_LABEL[subj]} · 총 {total}문항
              </p>
            </div>
            <span className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-brand-700">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 2h6l2 2h3v18H4V4h3l2-2Z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </span>
          </div>
        </div>

        {/* 선택과목 선택 */}
        {hasElectives && (
          <div className="rounded-2xl bg-slate-100/70 p-5 mt-3">
            <h3 className="text-base font-bold text-slate-900">응시 정보를 선택해주세요</h3>
            <p className="text-xs text-slate-400 mt-0.5">선택과목</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-sm text-slate-600 shrink-0">선택 과목</span>
              <div className="flex flex-1 max-w-[16rem] rounded-full bg-white border border-slate-200 p-0.5">
                {mock.electives!.map((el, i) => {
                  const on = electiveIdx === i
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setElectiveIdx(i)}
                      className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        on ? 'bg-brand-600 text-white' : 'text-slate-500'
                      }`}
                    >
                      {el.name}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* 응시하기 버튼 */}
        <div className="fixed bottom-0 inset-x-0 safe-bottom bg-gradient-to-t from-white via-white to-transparent px-4 pt-6 pb-4">
          <button
            type="button"
            onClick={beginTake}
            disabled={!canStart}
            className={`block w-full max-w-lg mx-auto text-center rounded-2xl py-4 text-[15px] font-bold transition ${
              canStart
                ? 'bg-brand-600 text-white hover:bg-brand-700'
                : 'bg-slate-200 text-slate-400'
            }`}
          >
            응시하기
          </button>
        </div>
      </div>
    )
  }

  // ── 2단계: OMR 답안 입력 ──
  const answeredCount = answers.filter((a) => a > 0).length
  const focusedNumber = items[focused]?.number ?? 0
  const commonItems = items.slice(0, commonCount).map((q, i) => ({ q, idx: i }))
  const electiveItems = items
    .slice(commonCount)
    .map((q, i) => ({ q, idx: commonCount + i }))

  return (
    <div className="max-w-lg mx-auto pb-40">
      <header className="flex items-center justify-between gap-3 mb-4">
        <button
          type="button"
          onClick={() => setStarted(false)}
          className="text-slate-400 hover:text-slate-700 text-sm"
        >
          ‹ 이전
        </button>
        <h1 className="text-sm font-bold text-slate-900 truncate">{mock.title}</h1>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className={`rounded-full text-sm font-semibold px-4 py-1.5 transition ${
            answeredCount > 0 ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-slate-200 text-slate-400'
          } disabled:opacity-60`}
        >
          {submitting ? '채점 중…' : '제출'}
        </button>
      </header>

      <div className="space-y-3">
        <SheetSection
          title="공통 과목"
          accent="brand"
          items={commonItems}
          answers={answers}
          focused={focused}
          setFocused={setFocused}
          pick={pick}
        />
        {chosenElective && (
          <SheetSection
            title={`선택 과목 · ${chosenElective.name}`}
            accent="rose"
            items={electiveItems}
            answers={answers}
            focused={focused}
            setFocused={setFocused}
            pick={pick}
          />
        )}
      </div>

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

      {/* 하단: 문제 네비 + 답 선택 */}
      <div className="fixed bottom-0 inset-x-0 safe-bottom bg-white border-t border-slate-200 shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.15)]">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setFocused(Math.max(0, focused - 1))}
              disabled={focused <= 0}
              className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-600 disabled:opacity-40"
            >
              ‹
            </button>
            <span className="text-sm font-bold text-slate-900">
              {focusedNumber}번 문제
              <span className="ml-2 text-xs font-normal text-slate-400">
                {answeredCount}/{items.length}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setFocused(Math.min(items.length - 1, focused + 1))}
              disabled={focused >= items.length - 1}
              className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-600 disabled:opacity-40"
            >
              ›
            </button>
          </div>
          <div className="flex justify-between gap-2">
            {[1, 2, 3, 4, 5].map((n) => {
              const on = answers[focused] === n
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => pick(focused, n)}
                  className={`flex-1 h-12 rounded-xl text-base font-bold transition ${
                    on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 active:bg-slate-200'
                  }`}
                >
                  {n}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
