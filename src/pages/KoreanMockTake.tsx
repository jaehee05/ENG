import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import { useAuth } from '../contexts/useAuth'
import { useBackNav } from '../contexts/useBackNav'
import { readOmr } from '../lib/api'
import { isVersionAtLeast, OMR_MIN_NATIVE_VERSION, OMR_PHOTO_ENABLED } from '../lib/features'
import { createKoreanMockAttempt, getKoreanMock } from '../lib/firestore'
import { resizeImageForUpload } from '../lib/imageResize'
import { mergeReads, readByGrid, readElective, refineGrid } from '../lib/omrGrid'
import { BottomCTA, Button, Card, PageHeader, SkeletonList, confirm, cx } from '../components/ui'
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
        className="flex justify-center gap-[3px] px-[2px] py-1 w-full min-w-0"
      >
        {/* 칸 폭은 고정하지 않고 줄어들게 둔다 — 16px 고정이면 문번 칸과 합쳐 열 최소 폭
            (7rem)을 넘어서, 좁은 폰에서 열이 최소 폭까지 줄면 5번 칸이 잘렸다. */}
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={`flex-1 min-w-0 max-w-[16px] h-[22px] inline-flex items-center justify-center rounded-full text-[9px] font-semibold border ${
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
  // 앱은 카메라 권한 문구가 든 네이티브 빌드에서만 — 그 전 빌드에서 카메라를 열면
  // 앱이 죽는다(features.ts). 버전을 알기 전까지는 감춰 둔다.
  const [nativeSupportsOmr, setNativeSupportsOmr] = useState(
    () => !Capacitor.isNativePlatform(),
  )
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    CapacitorUpdater.current()
      .then((r) => setNativeSupportsOmr(isVersionAtLeast(r.native, OMR_MIN_NATIVE_VERSION)))
      .catch(() => setNativeSupportsOmr(false))
  }, [])
  // 개발 서버에서는 스위치와 상관없이 보여, 가짜 응답(?omrMock=)으로 흐름을 볼 수 있게 한다.
  const omrEnabled = (OMR_PHOTO_ENABLED && nativeSupportsOmr) || import.meta.env.DEV

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
    // 파일 선택 창은 iOS 가 ‘사용자가 누른 그 순간’에만 열어 준다. 확인창 답을
    // await 한 뒤 click() 하면 조용히 막히므로, 확인 버튼을 누르는 클릭 안에서 연다.
    const marked = answers.filter((a) => a > 0).length
    const open = () => omrInputRef.current?.click()
    if (marked === 0) {
      open()
      return
    }
    void confirm(`이미 표시한 ${marked}문항의 답이 사진에서 읽은 답으로 바뀌어요. 계속할까요?`, {
      confirmText: '사진 고르기',
      onConfirm: open,
    })
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
      let img = await resizeImageForUpload(file, OMR_MAX_DIMENSION, OMR_MAX_PIXELS, undefined, true)
      if (img.base64.length > OMR_MAX_BASE64) {
        img = await resizeImageForUpload(file, OMR_MAX_DIMENSION, OMR_MAX_PIXELS, 0.7, true)
      }
      if (img.base64.length > OMR_MAX_BASE64) {
        throw new Error('사진 용량이 너무 커요. 답안지만 나오게 다시 찍어 주세요.')
      }
      const numbers = items.map((q) => q.number)
      const result = await readOmr({
        image: img.base64,
        mediaType: img.mediaType,
        numbers,
        subject: getMockSubject(mock),
      })
      // 모델은 칸 위치만 믿고, 칠했는지는 사진 픽셀로 다시 잰다(omrGrid.ts).
      let byGrid: ReturnType<typeof readByGrid> | null = null
      let pixelElective: 1 | 2 | undefined
      if (result.grid && img.pixels) {
        const refined = refineGrid(img.pixels, result.grid, result.answers)
        byGrid = readByGrid(img.pixels, refined.grid, numbers)
        pixelElective = readElective(img.pixels, result.grid)
      }
      const merged = mergeReads(numbers, result.answers, byGrid)
      const byNumber = new Map(merged.map((a) => [a.number, a]))
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
      const electiveMark = pixelElective ?? result.electiveMark
      if (electiveMark && chosenMark && electiveMark !== chosenMark) {
        setOmrWarning(
          `답안지의 선택 과목은 ‘${ELECTIVE_MARK_LABEL[electiveMark]}’로 칠해져 있는데, 지금 ‘${chosenElective!.name}’로 응시하고 있어요. 맞는지 확인해 주세요.`,
        )
      }
    } catch (err) {
      setOmrError(
        `${err instanceof Error ? err.message : '판독하지 못했어요.'} 직접 입력은 그대로 할 수 있어요.`,
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
    // 사진으로 불러온 답이면 한 번 더 못 박는다. 채점 뒤엔 고칠 길이 없다.
    if (
      usedOmr &&
      !(await confirm(
        '사진에서 읽은 답을 종이 답안지와 모두 대조했나요?\n채점 후에는 판독 오류가 있어도 답을 고칠 수 없어요.',
        { title: '답안 대조', confirmText: '모두 대조했어요' },
      ))
    )
      return
    const unanswered = answers.filter((a) => a === 0).length
    if (unanswered > 0) {
      if (
        !(await confirm(`${unanswered}문항이 비어 있어요. 제출할까요?\n비운 문항은 오답으로 채점돼요.`, {
          confirmText: '제출',
        }))
      )
        return
    } else if (!(await confirm('제출할까요?', { confirmText: '제출' }))) {
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

  if (loading) return <SkeletonList rows={2} className="max-w-lg mx-auto" />
  if (error) return <p className="text-[15px] text-red-500 px-1">{error}</p>
  if (!mock) return null

  const subj = getMockSubject(mock)

  // ── 1단계: 응시하기 인트로 ──
  if (!started) {
    const canStart = !hasElectives || electiveIdx != null
    const total = mock.questions.length + (chosenElective?.questions.length ?? 0)
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <PageHeader title="응시하기" />

        <Card className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold text-slate-900">{mock.title}</h2>
            <p className="text-[13px] text-slate-500 mt-1 tabular-nums">
              {MOCK_SUBJECT_LABEL[subj]} · 총 {total}문항
            </p>
          </div>
          <span className="shrink-0 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 2h6l2 2h3v18H4V4h3l2-2Z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </span>
        </Card>

        {hasElectives && (
          <Card>
            <h3 className="text-[17px] font-bold text-slate-900">선택과목을 골라 주세요</h3>
            <p className="text-[13px] text-slate-500 mt-1">답안지에 칠한 과목과 같아야 해요.</p>
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1" role="radiogroup" aria-label="선택과목">
              {mock.electives!.map((el, i) => {
                const on = electiveIdx === i
                return (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setElectiveIdx(i)}
                    className={cx(
                      'pressable h-11 rounded-xl text-[15px] font-semibold',
                      on ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
                    )}
                  >
                    {el.name}
                  </button>
                )
              })}
            </div>
          </Card>
        )}

        <BottomCTA width="max-w-lg">
          <Button size="lg" block onClick={beginTake} disabled={!canStart}>
            {canStart ? '응시하기' : '선택과목을 먼저 골라 주세요'}
          </Button>
        </BottomCTA>
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
    <div className="max-w-2xl mx-auto pb-40 lg:pb-52">
      <header className="flex items-center justify-between gap-3 mb-3">
        <button
          type="button"
          onClick={() => setStarted(false)}
          className="pressable shrink-0 whitespace-nowrap h-9 px-2 -ml-2 rounded-xl text-[15px] font-medium text-slate-500 hover:bg-slate-200/60 active:bg-slate-200/60"
        >
          ‹ 이전
        </button>
        {/* min-w-0 이 없으면 제목이 줄지 않아 양옆 버튼이 눌리고,
            버튼 안 글자가 '제/출' 로 세로로 접힌다. */}
        <h1 className="min-w-0 flex-1 text-center text-[15px] font-bold text-slate-900 truncate">
          {mock.title}
        </h1>
        <Button
          size="sm"
          variant={answeredCount > 0 ? 'primary' : 'secondary'}
          onClick={handleSubmit}
          loading={submitting}
          className="shrink-0 rounded-full px-4"
        >
          제출
        </Button>
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
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="secondary" onClick={openOmrPicker} disabled={omrReading || submitting} className="bg-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 7h3l2-3h6l2 3h3v13H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              OMR 사진으로 불러오기
            </Button>
            {needsCheck.size > 0 && (
              <button
                type="button"
                onClick={focusNextFlagged}
                className="pressable h-9 inline-flex items-center rounded-xl bg-orange-100 px-3.5 text-[13px] font-bold text-orange-700 hover:bg-orange-200 active:bg-orange-200"
              >
                확인 필요 {needsCheck.size}문항 ›
              </button>
            )}
          </div>
          {usedOmr && (
            // 판독 오류의 책임이 학생에게 있다는 것을 제출 전에 분명히 한다 —
            // 채점 뒤에는 답을 고칠 수 없다.
            <div className="rounded-2xl bg-orange-50 px-4 py-3 text-[13px] text-orange-800 space-y-0.5">
              <p className="font-bold">사진에서 읽은 답이에요. 종이 답안지와 한 문항씩 직접 대조하세요.</p>
              <p>
                판독이 틀릴 수 있어요. 주황색 문항은 꼭 확인하고, 나머지도 대조한 뒤 제출하세요.
                채점 후에는 판독 오류가 있어도 답을 고칠 수 없어요.
              </p>
            </div>
          )}
          {omrWarning && (
            <p className="rounded-2xl bg-amber-50 px-4 py-3 text-[13px] text-amber-800">{omrWarning}</p>
          )}
          {omrError && (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{omrError}</p>
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

      {error && <p className="text-[13px] text-red-500 mt-3">{error}</p>}

      {/* 판독 중엔 화면 전체를 막는다 — 그 사이 답을 고치면 결과가 덮어써 버린다. */}
      {omrReading && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-surface/90 backdrop-blur-sm anim-dim-in"
          role="status"
          aria-live="polite"
        >
          <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600" />
          <p className="text-[17px] font-bold text-slate-900">답안지를 읽고 있어요</p>
          <p className="text-[13px] text-slate-500">30초쯤 걸릴 수 있어요.</p>
        </div>
      )}

      {/* 하단: 문제 네비 + 답 선택. 시험 중이라 탭바를 덮는다(PC는 하단 네비 위로). */}
      <div className="fixed bottom-0 lg:bottom-12 inset-x-0 z-30 safe-bottom bg-white shadow-bar">
        <div className="max-w-lg mx-auto px-4 pt-3 pb-3">
          <div className="flex items-center justify-between mb-2.5">
            <button
              type="button"
              onClick={() => setFocused(Math.max(0, focused - 1))}
              disabled={focused <= 0}
              aria-label="이전 문제"
              className="pressable h-10 w-10 inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-600 disabled:opacity-40"
            >
              ‹
            </button>
            <span className="text-[16px] font-bold text-slate-900">
              {focusedNumber}번
              <span className="ml-2 text-[13px] font-medium text-slate-400 tabular-nums">
                {answeredCount}/{items.length}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setFocused(Math.min(items.length - 1, focused + 1))}
              disabled={focused >= items.length - 1}
              aria-label="다음 문제"
              className="pressable h-10 w-10 inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-600 disabled:opacity-40"
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
                  aria-pressed={on}
                  onClick={() => pick(focused, n)}
                  className={cx(
                    'pressable flex-1 h-14 rounded-2xl text-[18px] font-bold tabular-nums',
                    on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 active:bg-slate-200',
                  )}
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
