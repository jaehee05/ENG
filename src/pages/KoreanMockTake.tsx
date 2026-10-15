import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { useBackNav } from '../contexts/useBackNav'
import { readOmr } from '../lib/api'
import { OMR_PHOTO_ENABLED } from '../lib/features'
import { createKoreanMockAttempt, getKoreanMock } from '../lib/firestore'
import { resizeImageForUpload } from '../lib/imageResize'
import {
  getMockSubject,
  MOCK_SUBJECT_LABEL,
  type KoreanMock,
  type KoreanMockQuestion,
  type KoreanMockResult,
} from '../lib/types'

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * OMR 사진용 크기. Claude 이미지 한도(긴 변 2576px, 약 3.75MP) 안에서 가장 크게 —
 * 답 칸이 작아서 해상도가 곧 판독 정확도다. 면적 한도를 넘기면 서버에서 한 번 더
 * 줄어드니 조금 안쪽으로 잡는다.
 */
const OMR_MAX_DIMENSION = 2576
const OMR_MAX_PIXELS = 3_700_000
/** Vercel 요청 본문 4.5MB 안에 넉넉히 들어오도록. 넘으면 화질을 낮춰 다시 만든다. */
const OMR_MAX_BASE64 = 3_500_000

/**
 * 선택과목 이름 → OMR 선택 과목 상자의 칸 번호. 이름은 관리자가 자유롭게 적는
 * 값이라('화법과 작문', '화작' …) 순서가 아니라 글자로 맞춘다. 모르면 null.
 */
function electiveMarkOf(name: string): 1 | 2 | null {
  if (/화법|화작/.test(name)) return 1
  if (/언어|언매/.test(name)) return 2
  return null
}

const ELECTIVE_MARK_LABEL = { 1: '화법과 작문', 2: '언어와 매체' } as const

/** 버블시트 한 문항 행 (문번 + 답란 1~5). 컬럼 안에서 컴팩트하게. */
function BubbleRow({
  idx,
  number,
  sel,
  focused,
  flagged,
  onFocus,
}: {
  idx: number
  number: number
  sel: number
  focused: boolean
  /** 사진 판독이 자신 없었거나 비어 있던 문항 — 학생이 직접 확인해야 한다. */
  flagged: boolean
  onFocus: () => void
}) {
  return (
    <div
      data-qidx={idx}
      className={`grid grid-cols-[1.7rem_1fr] items-center border-b border-slate-100 last:border-b-0 scroll-mt-24 ${
        flagged ? 'outline outline-2 -outline-offset-2 outline-orange-400' : ''
      } ${focused ? 'bg-brand-50' : flagged ? 'bg-orange-50' : ''}`}
    >
      <button
        type="button"
        onClick={onFocus}
        className={`py-1 text-center text-[11px] font-semibold tabular-nums border-r border-slate-100 ${
          focused ? 'text-brand-700' : flagged ? 'text-orange-600' : 'text-slate-500'
        }`}
      >
        {number}
      </button>
      {/* 답란은 눌러도 답이 들어가지 않는다 — 그 번호로 이동만 한다.
          실제 마킹은 하단 탭에서. 종이 OMR 을 흉내 내려다 스치기만 해도
          답이 찍히던 것을 막는다. */}
      <button
        type="button"
        onClick={onFocus}
        aria-label={`${number}번 문제로 이동`}
        className="flex justify-center gap-[3px] py-1 w-full"
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={`w-[16px] h-[22px] inline-flex items-center justify-center rounded-full text-[9px] font-semibold border ${
              sel === n
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-400 border-slate-300'
            }`}
          >
            {n}
          </span>
        ))}
      </button>
    </div>
  )
}

function SheetColumn({
  title,
  accent,
  items,
  answers,
  focused,
  flagged,
  setFocused,
}: {
  title: string
  accent: 'brand' | 'rose'
  items: { q: KoreanMockQuestion; idx: number }[]
  answers: number[]
  focused: number
  flagged: Set<number>
  setFocused: (i: number) => void
}) {
  const border = accent === 'brand' ? 'border-brand-300' : 'border-rose-300'
  const head = accent === 'brand' ? 'bg-brand-50 text-brand-700' : 'bg-rose-50 text-rose-700'
  const sub = accent === 'brand' ? 'text-brand-600' : 'text-rose-600'
  return (
    <div className={`flex-1 min-w-[7rem] rounded-lg border ${border} overflow-hidden`}>
      <div className={`${head} text-[11px] font-bold text-center py-1`}>{title}</div>
      <div className={`grid grid-cols-[1.7rem_1fr] text-[10px] font-semibold text-center ${sub} border-y ${border}`}>
        <div className="py-0.5 border-r border-slate-200/60">문번</div>
        <div className="py-0.5">답란</div>
      </div>
      <div>
        {items.map(({ q, idx }) => (
          <BubbleRow
            key={idx}
            idx={idx}
            number={q.number}
            sel={answers[idx] ?? 0}
            focused={focused === idx}
            flagged={flagged.has(idx)}
            onFocus={() => setFocused(idx)}
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
  // ── OMR 사진 불러오기 ──
  const omrInputRef = useRef<HTMLInputElement>(null)
  const [omrReading, setOmrReading] = useState(false)
  const [omrError, setOmrError] = useState<string | null>(null)
  const [omrWarning, setOmrWarning] = useState<string | null>(null)
  /** 판독 결과 중 학생이 확인해야 하는 문항(items 인덱스). 그 문항 답을 고르면 빠진다. */
  const [needsCheck, setNeedsCheck] = useState<Set<number>>(() => new Set())
  /** 이번 응시에서 판독 결과를 한 번이라도 적용했는지 — 응시 기록의 answerSource. */
  const [usedOmr, setUsedOmr] = useState(false)
  // 개발 서버에서는 스위치와 상관없이 보여, 가짜 응답(?omrMock=)으로 흐름을 볼 수 있게 한다.
  const omrEnabled = OMR_PHOTO_ENABLED || import.meta.env.DEV

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

  // 포커스된 문항이 화면 밖이면 보이도록(이미 보이면 그대로).
  useEffect(() => {
    if (!started) return
    document
      .querySelector(`[data-qidx="${focused}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
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
    setNeedsCheck(new Set())
    setUsedOmr(false)
    setOmrError(null)
    setOmrWarning(null)
    setStarted(true)
  }

  function pick(idx: number, choice: number) {
    const isToggleOff = answers[idx] === choice
    // 학생이 직접 손댔으면 확인한 것으로 본다.
    if (needsCheck.has(idx)) {
      setNeedsCheck((prev) => {
        const next = new Set(prev)
        next.delete(idx)
        return next
      })
    }
    setAnswers((prev) => {
      const next = [...prev]
      next[idx] = isToggleOff ? 0 : choice
      return next
    })
    setFocused(isToggleOff ? idx : Math.min(items.length - 1, idx + 1))
  }

  function openOmrPicker() {
    // 덮어쓰기 확인은 사진을 고르기 전에 받는다. 판독이 끝난 뒤 물으면 취소할 때
    // 수십 초 걸린 판독을 버리게 된다. 판독 중엔 화면을 막으니 그 사이 답이 바뀌지 않는다.
    const marked = answers.filter((a) => a > 0).length
    if (
      marked > 0 &&
      !window.confirm(
        `이미 표시한 ${marked}문항의 답이 사진에서 읽은 답으로 바뀝니다. 계속할까요?`,
      )
    )
      return
    omrInputRef.current?.click()
  }

  async function handleOmrFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // 같은 사진을 다시 골라도 change 가 일어나도록 비워 둔다.
    e.target.value = ''
    if (!file || !mock) return
    setOmrReading(true)
    setOmrError(null)
    setOmrWarning(null)
    try {
      let img = await resizeImageForUpload(file, OMR_MAX_DIMENSION, OMR_MAX_PIXELS)
      if (img.base64.length > OMR_MAX_BASE64) {
        img = await resizeImageForUpload(file, OMR_MAX_DIMENSION, OMR_MAX_PIXELS, 0.7)
      }
      if (img.base64.length > OMR_MAX_BASE64) {
        throw new Error('사진 용량이 너무 큽니다. 답안지만 나오게 다시 찍어 주세요.')
      }
      const result = await readOmr({
        image: img.base64,
        mediaType: img.mediaType,
        numbers: items.map((q) => q.number),
        subject: getMockSubject(mock),
      })
      const byNumber = new Map(result.answers.map((a) => [a.number, a]))
      const flagged = new Set<number>()
      const next = items.map((q, i) => {
        const a = byNumber.get(q.number)
        // 서버가 빠진 번호를 채워 주지만, 혹시 없으면 비우고 확인 대상으로 둔다.
        if (!a || a.confidence === 'low' || a.choice === 0) flagged.add(i)
        return a ? a.choice : 0
      })
      setAnswers(next)
      setNeedsCheck(flagged)
      setUsedOmr(true)
      if (flagged.size > 0) setFocused(Math.min(...flagged))
      // 선택과목은 알려만 준다. 사진이 틀렸을 수도, 학생이 잘못 칠했을 수도 있어서
      // 어느 쪽이 맞는지는 학생이 정해야 한다.
      const chosenMark = chosenElective ? electiveMarkOf(chosenElective.name) : null
      if (result.electiveMark && chosenMark && result.electiveMark !== chosenMark) {
        setOmrWarning(
          `답안지의 선택 과목은 ‘${ELECTIVE_MARK_LABEL[result.electiveMark]}’로 칠해져 있는데, 지금 ‘${chosenElective!.name}’로 응시하고 있습니다. 맞는지 확인해 주세요.`,
        )
      }
    } catch (err) {
      setOmrError(
        `${err instanceof Error ? err.message : '판독에 실패했습니다.'} 직접 입력은 그대로 할 수 있습니다.`,
      )
    } finally {
      setOmrReading(false)
    }
  }

  /** ‘확인 필요’ 칩 — 지금 문항 다음의 확인 필요 문항으로, 끝이면 처음으로 돌아간다. */
  function focusNextFlagged() {
    const sorted = [...needsCheck].sort((a, b) => a - b)
    if (sorted.length === 0) return
    setFocused(sorted.find((i) => i > focused) ?? sorted[0])
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
        answerSource: usedOmr ? 'omr' : undefined,
      })
      // replace — 제출한 시험을 기록에서 지운다 (VocabTake 와 같은 이유).
      navigate(`/korean-mocks/${mock.id}/result/${attemptId}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '제출 실패')
      setSubmitting(false)
    }
  }

  // 단어 시험 응시와 같은 규칙 — 답을 골라 둔 게 있으면 나가기 전에 묻는다.
  // 인트로(!started)에서는 잃을 게 없으므로 그냥 나간다.
  useBackNav({
    confirmMessage:
      started && answers.some((a) => a > 0)
        ? '지금 나가면 표시한 답이 저장되지 않습니다. 나갈까요?'
        : undefined,
  })

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중…</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!mock) return null

  const subj = getMockSubject(mock)

  // ── 1단계: 응시하기 인트로 ──
  if (!started) {
    const canStart = !hasElectives || electiveIdx != null
    const total = mock.questions.length + (chosenElective?.questions.length ?? 0)
    return (
      <div className="max-w-lg mx-auto pb-28">
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

        <div className="fixed bottom-0 lg:bottom-12 inset-x-0 safe-bottom bg-gradient-to-t from-white via-white to-transparent px-4 pt-6 pb-4">
          <button
            type="button"
            onClick={beginTake}
            disabled={!canStart}
            className={`block w-full max-w-lg mx-auto text-center rounded-2xl py-4 text-[15px] font-bold transition ${
              canStart ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-slate-200 text-slate-400'
            }`}
          >
            응시하기
          </button>
        </div>
      </div>
    )
  }

  // ── 2단계: OMR (한 화면 다열 레이아웃) ──
  const answeredCount = answers.filter((a) => a > 0).length
  const focusedNumber = items[focused]?.number ?? 0
  const commonItems = items.slice(0, commonCount).map((q, i) => ({ q, idx: i }))
  const electiveItems = items.slice(commonCount).map((q, i) => ({ q, idx: commonCount + i }))
  // 한 화면에 담기도록 열당 최대 17문항으로 분할.
  const commonCols = chunk(commonItems, 17)
  const electiveCols = chunk(electiveItems, 17)

  return (
    <div className="max-w-2xl mx-auto pb-36 lg:pb-48">
      <header className="flex items-center justify-between gap-3 mb-3">
        <button
          type="button"
          onClick={() => setStarted(false)}
          className="shrink-0 whitespace-nowrap text-slate-400 hover:text-slate-700 text-sm"
        >
          ‹ 이전
        </button>
        {/* min-w-0 이 없으면 제목이 줄지 않아 양옆 버튼이 눌리고,
            버튼 안 글자가 '제/출' 로 세로로 접힌다. */}
        <h1 className="min-w-0 flex-1 text-center text-sm font-bold text-slate-900 truncate">
          {mock.title}
        </h1>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className={`shrink-0 whitespace-nowrap rounded-full text-sm font-semibold px-4 py-1.5 transition ${
            answeredCount > 0 ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-slate-200 text-slate-400'
          } disabled:opacity-60`}
        >
          {submitting ? '채점 중…' : '제출'}
        </button>
      </header>

      {omrEnabled && (
        <div className="mb-3 space-y-2">
          <input
            ref={omrInputRef}
            type="file"
            // capture 를 넣지 않는다 — 넣으면 iOS 가 곧장 카메라를 열어, 미리 찍어 둔
            // 사진을 앨범에서 고를 수 없다.
            accept="image/*"
            className="hidden"
            onChange={handleOmrFile}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openOmrPicker}
              disabled={omrReading || submitting}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 7h3l2-3h6l2 3h3v13H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              OMR 사진으로 불러오기
            </button>
            {needsCheck.size > 0 && (
              <button
                type="button"
                onClick={focusNextFlagged}
                className="inline-flex items-center rounded-full bg-orange-100 px-3 py-1.5 text-xs font-bold text-orange-700 hover:bg-orange-200"
              >
                확인 필요 {needsCheck.size}문항 ›
              </button>
            )}
          </div>
          {usedOmr && (
            <p className="text-[11px] text-slate-500">
              사진에서 읽은 답입니다. 틀리게 읽혔을 수 있으니 주황색 문항부터 확인하고 제출하세요.
            </p>
          )}
          {omrWarning && (
            <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              {omrWarning}
            </p>
          )}
          {omrError && (
            <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              {omrError}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {commonCols.map((col, ci) => (
          <SheetColumn
            key={`c${ci}`}
            title="공통 과목"
            accent="brand"
            items={col}
            answers={answers}
            focused={focused}
            flagged={needsCheck}
            setFocused={setFocused}
          />
        ))}
        {electiveCols.map((col, ei) => (
          <SheetColumn
            key={`e${ei}`}
            title={chosenElective ? `선택 · ${chosenElective.name}` : '선택 과목'}
            accent="rose"
            items={col}
            answers={answers}
            focused={focused}
            flagged={needsCheck}
            setFocused={setFocused}
          />
        ))}
      </div>

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

      {/* 판독 중엔 화면 전체를 막는다 — 그 사이 답을 고치면 결과가 덮어써 버린다. */}
      {omrReading && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-white/80 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-200 border-t-brand-600" />
          <p className="text-sm font-semibold text-slate-800">답안지를 읽는 중…</p>
          <p className="text-xs text-slate-500">30초쯤 걸릴 수 있습니다.</p>
        </div>
      )}

      {/* 하단: 문제 네비 + 답 선택 (PC는 하단 탭바 위로) */}
      <div className="fixed bottom-0 lg:bottom-12 inset-x-0 safe-bottom bg-white border-t border-slate-200 shadow-[0_-4px_16px_-8px_rgba(0,0,0,0.15)]">
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
