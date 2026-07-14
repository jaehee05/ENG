import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { createKoreanMockAttempt, getKoreanMock } from '../lib/firestore'
import {
  getMockSubject,
  type KoreanMock,
  type KoreanMockQuestion,
  type KoreanMockResult,
} from '../lib/types'

/** 버블시트 한 문항 행. */
function BubbleRow({
  number,
  sel,
  focused,
  onFocus,
  onPick,
}: {
  number: number
  sel: number
  focused: boolean
  onFocus: () => void
  onPick: (n: number) => void
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
        focused ? 'bg-brand-50 ring-1 ring-brand-300' : ''
      }`}
    >
      <button
        type="button"
        onClick={onFocus}
        className={`w-7 shrink-0 text-center text-xs font-semibold tabular-nums ${
          focused ? 'text-brand-700' : 'text-slate-500'
        }`}
      >
        {number}
      </button>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onPick(n)}
            className={`w-7 h-7 rounded-full text-[11px] font-semibold border transition ${
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
  items,
  answers,
  focused,
  setFocused,
  pick,
}: {
  title: string
  items: { q: KoreanMockQuestion; idx: number }[]
  answers: number[]
  focused: number
  setFocused: (i: number) => void
  pick: (i: number, n: number) => void
}) {
  return (
    <div className="rounded-xl border border-brand-200 overflow-hidden">
      <div className="bg-brand-50 text-brand-700 text-xs font-semibold text-center py-1.5 border-b border-brand-200">
        {title}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 p-2">
        {items.map(({ q, idx }) => (
          <BubbleRow
            key={idx}
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
        if (!m) setError('모고를 찾을 수 없습니다.')
        else setMock(m)
      })
      .catch((e) => setError(e.message ?? '불러오기 실패'))
      .finally(() => setLoading(false))
  }, [id])

  const hasElectives = !!mock?.electives && mock.electives.length > 0
  const chosenElective =
    hasElectives && electiveIdx != null ? mock!.electives![electiveIdx] : null

  // 공통 + 선택 문항을 하나의 순서 리스트로.
  const items = useMemo(() => {
    if (!mock) return [] as KoreanMockQuestion[]
    return [...mock.questions, ...(chosenElective?.questions ?? [])]
  }, [mock, chosenElective])

  const commonCount = mock?.questions.length ?? 0

  // 문항 수가 정해지면 답안 배열 초기화.
  useEffect(() => {
    if (!mock) return
    if (hasElectives && electiveIdx == null) return
    setAnswers(new Array(items.length).fill(0))
    setFocused(0)
  }, [mock, hasElectives, electiveIdx, items.length])

  function pick(idx: number, choice: number) {
    setAnswers((prev) => {
      const next = [...prev]
      next[idx] = next[idx] === choice ? 0 : choice
      return next
    })
    setFocused(idx)
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

  // 선택과목 미선택 → 선택 화면
  if (hasElectives && electiveIdx == null) {
    return (
      <div className="space-y-5 max-w-lg mx-auto">
        <header className="text-center">
          <h1 className="text-lg font-bold text-slate-900">{mock.title}</h1>
          <p className="text-sm text-slate-500 mt-1">선택과목을 선택하세요</p>
        </header>
        <div className="space-y-2">
          {mock.electives!.map((el, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setElectiveIdx(i)}
              className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-4 hover:border-brand-300 hover:bg-brand-50/40 transition"
            >
              <span className="text-[15px] font-semibold text-slate-900">
                {el.name}
              </span>
              <span className="text-xs text-slate-400">
                {el.questions.length}문항 ›
              </span>
            </button>
          ))}
        </div>
        <Link
          to={`/korean-mocks/${mock.id}`}
          className="block text-center text-sm text-slate-500 hover:text-slate-900"
        >
          취소
        </Link>
      </div>
    )
  }

  const answeredCount = answers.filter((a) => a > 0).length
  const focusedNumber = items[focused]?.number ?? 0
  const commonItems = items
    .slice(0, commonCount)
    .map((q, i) => ({ q, idx: i }))
  const electiveItems = items
    .slice(commonCount)
    .map((q, i) => ({ q, idx: commonCount + i }))

  return (
    <div className="max-w-lg mx-auto pb-40">
      {/* 상단: 제목 + 제출 */}
      <header className="flex items-center justify-between gap-3 mb-4">
        <Link
          to={`/korean-mocks/${mock.id}`}
          className="text-slate-400 hover:text-slate-700 text-sm"
          aria-label="뒤로"
        >
          ‹ 취소
        </Link>
        <h1 className="text-sm font-bold text-slate-900 truncate">{mock.title}</h1>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className={`rounded-full text-sm font-semibold px-4 py-1.5 transition ${
            answeredCount > 0
              ? 'bg-brand-600 text-white hover:bg-brand-700'
              : 'bg-slate-200 text-slate-400'
          } disabled:opacity-60`}
        >
          {submitting ? '채점 중…' : '제출'}
        </button>
      </header>

      <div className="space-y-3">
        <SheetSection
          title="공통 과목"
          items={commonItems}
          answers={answers}
          focused={focused}
          setFocused={setFocused}
          pick={pick}
        />
        {chosenElective && (
          <SheetSection
            title={`선택 과목 · ${chosenElective.name}`}
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
              onClick={() => setFocused((f) => Math.max(0, f - 1))}
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
              onClick={() => setFocused((f) => Math.min(items.length - 1, f + 1))}
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
                    on
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-500 active:bg-slate-200'
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
