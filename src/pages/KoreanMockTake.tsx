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
import { Button, SkeletonList, confirm, cx } from '../components/ui'
import { OmrCard, OmrColumn, TakeBubble } from '../components/OmrSheet'
import { omrTone } from '../lib/omrTheme'
import {
  getMockSubject,
  MOCK_SUBJECT_LABEL,
  type KoreanMock,
  type KoreanMockQuestion,
  type KoreanMockResult,
} from '../lib/types'

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

/** 두 단으로 나눈다 — 앞 단이 더 길거나 같게(34 → 17·17, 28 → 14·14). */
function halves<T>(arr: T[]): [T[], T[]] {
  const mid = Math.ceil(arr.length / 2)
  return [arr.slice(0, mid), arr.slice(mid)]
}

export function KoreanMockTake() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [mock, setMock] = useState<KoreanMock | null>(null)
  const [electiveIdx, setElectiveIdx] = useState<number | null>(null)
  /**
   * 문항 번호 → 고른 답(1~5). 번호로 두는 이유: 선택과목을 바꿔도 종이 답안지처럼
   * 칠해 둔 칸이 그대로 남아야 한다(화작·언매 모두 35~45번).
   */
  const [answers, setAnswers] = useState<Record<number, number>>({})
  /** 지금 문항 — items 의 인덱스. */
  const [focused, setFocused] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // ── OMR 사진 불러오기 ──
  const omrInputRef = useRef<HTMLInputElement>(null)
  const [omrReading, setOmrReading] = useState(false)
  const [omrError, setOmrError] = useState<string | null>(null)
  const [omrWarning, setOmrWarning] = useState<string | null>(null)
  /** 판독 결과 중 학생이 확인해야 하는 문항 번호. 그 문항 답을 고르면 빠진다. */
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

  const hasElectives = !!mock?.electives && mock.electives.length > 0
  const chosenElective =
    hasElectives && electiveIdx != null ? mock!.electives![electiveIdx] : null
  // 과목을 고르기 전에도 선택과목 답란은 보여 준다 — 종이 답안지도 칸은 처음부터 있다.
  // 번호는 첫 과목 것을 빌린다(과목마다 번호는 같다).
  const shownElective = chosenElective ?? (hasElectives ? mock!.electives![0] : null)

  const items = useMemo(() => {
    if (!mock) return [] as KoreanMockQuestion[]
    return [...mock.questions, ...(shownElective?.questions ?? [])]
  }, [mock, shownElective])

  const commonCount = mock?.questions.length ?? 0
  const focusedNumber = items[focused]?.number ?? 0

  // 포커스된 문항이 화면 밖이면 보이도록(이미 보이면 그대로).
  useEffect(() => {
    if (!focusedNumber) return
    document
      .querySelector(`[data-qnum="${focusedNumber}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focusedNumber])

  function pick(idx: number, choice: number) {
    const num = items[idx]?.number
    if (num == null) return
    const isToggleOff = answers[num] === choice
    // 학생이 직접 손댔으면 확인한 것으로 본다.
    if (needsCheck.has(num)) {
      setNeedsCheck((prev) => {
        const next = new Set(prev)
        next.delete(num)
        return next
      })
    }
    setAnswers((prev) => {
      const next = { ...prev }
      if (isToggleOff) delete next[num]
      else next[num] = choice
      return next
    })
    setFocused(isToggleOff ? idx : Math.min(items.length - 1, idx + 1))
  }

  function focusNumber(num: number) {
    const i = items.findIndex((q) => q.number === num)
    if (i >= 0) setFocused(i)
  }

  function openOmrPicker() {
    // 덮어쓰기 확인은 사진을 고르기 전에 받는다. 판독이 끝난 뒤 물으면 취소할 때
    // 수십 초 걸린 판독을 버리게 된다. 판독 중엔 화면을 막으니 그 사이 답이 바뀌지 않는다.
    // 파일 선택 창은 iOS 가 ‘사용자가 누른 그 순간’에만 열어 준다. 확인창 답을
    // await 한 뒤 click() 하면 조용히 막히므로, 확인 버튼을 누르는 클릭 안에서 연다.
    const marked = items.filter((q) => answers[q.number]).length
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
      const next: Record<number, number> = { ...answers }
      for (const num of numbers) {
        const a = byNumber.get(num)
        // 서버가 빠진 번호를 채워 주지만, 혹시 없으면 비우고 확인 대상으로 둔다.
        if (!a || a.confidence === 'low' || a.choice === 0) flagged.add(num)
        if (a && a.choice > 0) next[num] = a.choice
        else delete next[num]
      }
      setAnswers(next)
      setNeedsCheck(flagged)
      setUsedOmr(true)
      if (flagged.size > 0) focusNumber(Math.min(...flagged))
      const electiveMark = pixelElective ?? result.electiveMark
      const chosenMark = chosenElective ? electiveMarkOf(chosenElective.name) : null
      if (electiveMark && !chosenElective && mock.electives) {
        // 아직 안 골랐으면 답안지에 칠한 과목을 그대로 칠해 준다.
        const i = mock.electives.findIndex((el) => electiveMarkOf(el.name) === electiveMark)
        if (i >= 0) setElectiveIdx(i)
      } else if (electiveMark && chosenMark && electiveMark !== chosenMark) {
        // 이미 골랐으면 알려만 준다. 사진이 틀렸을 수도, 학생이 잘못 칠했을 수도 있어서
        // 어느 쪽이 맞는지는 학생이 정해야 한다.
        setOmrWarning(
          `답안지의 선택 과목은 ‘${ELECTIVE_MARK_LABEL[electiveMark]}’로 칠해져 있는데, 지금 ‘${chosenElective!.name}’로 칠해져 있어요. 맞는지 확인해 주세요.`,
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
    const idxs = items
      .map((q, i) => (needsCheck.has(q.number) ? i : -1))
      .filter((i) => i >= 0)
    if (idxs.length === 0) return
    setFocused(idxs.find((i) => i > focused) ?? idxs[0])
  }

  async function handleSubmit() {
    if (!mock || !profile) return
    if (hasElectives && !chosenElective) return
    // 사진으로 불러온 답이면 한 번 더 못 박는다. 채점 뒤엔 고칠 길이 없다.
    if (
      usedOmr &&
      !(await confirm(
        '사진에서 읽은 답을 종이 답안지와 모두 대조했나요?\n채점 후에는 판독 오류가 있어도 답을 고칠 수 없어요.',
        { title: '답안 대조', confirmText: '모두 대조했어요' },
      ))
    )
      return
    const unanswered = items.filter((q) => !answers[q.number]).length
    const message =
      unanswered > 0
        ? `이 시험에 답안을 제출할까요?\n빈칸 ${unanswered}문항은 오답 처리됩니다.\n제출 후에는 수정할 수 없어요.`
        : '이 시험에 답안을 제출할까요?\n제출 후에는 수정할 수 없어요.'
    if (!(await confirm(message, { title: mock.title, confirmText: '제출하기', cancelText: '계속 풀기' })))
      return
    setSubmitting(true)
    setError(null)
    try {
      const results: KoreanMockResult[] = items.map((q) => {
        const userAnswer = answers[q.number] ?? 0
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
  useBackNav({
    confirmMessage: Object.keys(answers).length > 0
      ? '지금 나가면 표시한 답이 저장되지 않습니다. 나갈까요?'
      : undefined,
  })

  if (loading) return <SkeletonList rows={2} className="max-w-lg mx-auto" />
  if (error && !mock) return <p className="text-[15px] text-red-500 px-1">{error}</p>
  if (!mock) return null

  const tone = omrTone('take')
  const blankCount = items.filter((q) => !answers[q.number]).length
  const commonRows = items.slice(0, commonCount).map((q) => ({ number: q.number, key: q.number }))
  const electiveRows = items.slice(commonCount).map((q) => ({ number: q.number, key: `e${q.number}` }))
  const [commonLeft, commonRight] = halves(commonRows)
  const canSubmit = !hasElectives || !!chosenElective

  const renderTakeAnswers = (num: number) =>
    [1, 2, 3, 4, 5].map((n) => <TakeBubble key={n} n={n} filled={answers[num] === n} />)
  const rowOverlay = (num: number) =>
    num === focusedNumber
      ? 'ring-2 ring-inset ring-[#3b82f6] bg-[#e6e8de] mix-blend-multiply'
      : needsCheck.has(num)
        ? 'ring-2 ring-inset ring-orange-400'
        : null
  const numClass = (num: number) =>
    num === focusedNumber ? '!bg-[#dbeafe] !text-[#2563eb] font-extrabold' : null

  return (
    // 답안지 바탕(크림색)을 화면 끝까지 — 본문 좌우 여백(px-5 sm:px-6)을 걷어낸다.
    <div className="-mx-5 sm:-mx-6 -mt-2 sm:-mt-5 min-h-full bg-[#fbf8e9] px-3.5 pt-3 pb-64">
      <div className="max-w-2xl mx-auto space-y-3">
        <h1 className="px-1 text-[17px] font-extrabold text-slate-900 truncate">{mock.title}</h1>

        {omrEnabled && (
          <div className="space-y-2">
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

        {/* 선택과목 — 답안지 맨 위 칸처럼 칠해서 고른다. */}
        {hasElectives && (
          <OmrCard title="선택과목" tone="take">
            <div className="grid grid-cols-2 gap-3 p-3" role="radiogroup" aria-label="선택과목">
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
                      'pressable h-12 rounded-xl inline-flex items-center justify-center gap-2.5 text-[14px] font-semibold text-slate-800',
                      on ? 'border-[2.5px] border-[#2e9b4f] bg-[#dfefd6]' : 'border-2 border-[#2e9b4f]/80',
                    )}
                  >
                    <span className="truncate">{el.name}</span>
                    <span
                      className={cx(
                        'inline-flex shrink-0 w-[22px] h-[22px] items-center justify-center rounded-full border-[1.5px] text-[11px]',
                        on ? 'w-[24px] h-[24px] bg-[#141414] border-[#141414] text-transparent' : 'border-[#e0507a] text-[#e0507a]',
                      )}
                    >
                      {i + 1}
                    </span>
                  </button>
                )
              })}
            </div>
          </OmrCard>
        )}

        <OmrCard title={hasElectives ? '공통과목' : MOCK_SUBJECT_LABEL[getMockSubject(mock)]} tone="take">
          <div className="grid grid-cols-2">
            <OmrColumn
              items={commonLeft}
              tone="take"
              renderAnswers={renderTakeAnswers}
              onRowClick={focusNumber}
              rowOverlay={rowOverlay}
              numClass={numClass}
            />
            <OmrColumn
              items={commonRight}
              tone="take"
              renderAnswers={renderTakeAnswers}
              onRowClick={focusNumber}
              rowOverlay={rowOverlay}
              numClass={numClass}
              className={cx('border-l-2', tone.line)}
            />
          </div>
        </OmrCard>

        {electiveRows.length > 0 && (
          <OmrCard title="선택과목" tone="take">
            <OmrColumn
              items={electiveRows}
              alignToFive
              tone="take"
              renderAnswers={renderTakeAnswers}
              onRowClick={focusNumber}
              rowOverlay={rowOverlay}
              numClass={numClass}
            />
          </OmrCard>
        )}

        {error && <p className="text-[13px] text-red-500">{error}</p>}
      </div>

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

      {/* 하단: 문제 이동 + 답 고르기 + 제출. 시험 중이라 탭바를 덮는다(PC는 하단 네비 위로). */}
      <div className="fixed bottom-0 lg:bottom-12 inset-x-0 z-30 safe-bottom bg-white shadow-bar">
        <div className="max-w-lg mx-auto px-4 pt-3 pb-3">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setFocused(Math.max(0, focused - 1))}
              disabled={focused <= 0}
              aria-label="이전 문제"
              className="pressable h-11 w-11 inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-700 text-[20px] disabled:opacity-40"
            >
              ‹
            </button>
            <span className="text-[16px] font-bold text-slate-900 tabular-nums">{focusedNumber}번 문제</span>
            <button
              type="button"
              onClick={() => setFocused(Math.min(items.length - 1, focused + 1))}
              disabled={focused >= items.length - 1}
              aria-label="다음 문제"
              className="pressable h-11 w-11 inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-700 text-[20px] disabled:opacity-40"
            >
              ›
            </button>
          </div>
          <div className="flex justify-between gap-2">
            {[1, 2, 3, 4, 5].map((n) => {
              const on = answers[focusedNumber] === n
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pick(focused, n)}
                  className={cx(
                    'pressable h-14 w-14 rounded-full text-[18px] font-bold tabular-nums',
                    on
                      ? 'bg-[#dfefd6] text-[#2e9b4f] ring-[2.5px] ring-inset ring-[#2e9b4f]'
                      : 'bg-slate-100 text-slate-700 active:bg-slate-200',
                  )}
                >
                  {n}
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className={cx(
                'pressable h-12 min-w-[10.5rem] px-7 rounded-full text-[16px] font-bold tabular-nums',
                canSubmit
                  ? 'bg-gradient-to-r from-[#fb923c] to-[#f97316] text-white shadow-[0_8px_20px_-6px_rgba(249,115,22,0.6)] disabled:opacity-60'
                  : 'bg-slate-200 text-slate-400',
              )}
            >
              {!canSubmit
                ? '선택과목을 마킹해 주세요'
                : submitting
                  ? '제출 중…'
                  : `답안 제출${blankCount > 0 ? ` (빈칸 ${blankCount})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
