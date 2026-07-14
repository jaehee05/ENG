import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { createKoreanMock } from '../lib/firestore'
import { estimateMockCutoffs } from '../lib/api'
import { MockCutoffEditor } from '../components/MockCutoffEditor'
import {
  questionPoints,
  type KoreanMockElective,
  type KoreanMockQuestion,
  type MockGradeCut,
  type MockSubject,
} from '../lib/types'

/**
 * 답안 일괄 입력 텍스트 파싱.
 *   - "3 5 1 2 4 ..." (공백/줄바꿈 구분, startNumber부터 순서대로)
 *   - "1:3, 2:5, 3:1" 또는 "1.3 2.5" (번호 명시)
 */
function parseAnswerKey(raw: string, startNumber: number): KoreanMockQuestion[] {
  const lines = raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  const explicit: KoreanMockQuestion[] = []
  let allExplicit = true
  for (const line of lines) {
    const m = line.match(/^(\d+)\s*[:.\-]\s*([1-5])\b/)
    if (m) {
      explicit.push({ number: Number.parseInt(m[1], 10), answer: Number.parseInt(m[2], 10) })
    } else {
      allExplicit = false
      break
    }
  }
  if (allExplicit && explicit.length > 0) {
    explicit.sort((a, b) => a.number - b.number)
    return explicit
  }
  const digits = raw.match(/[1-5]/g) ?? []
  return digits.map((d, i) => ({
    number: startNumber + i,
    answer: Number.parseInt(d, 10),
  }))
}

function parseNumberSet(raw: string): Set<number> {
  return new Set((raw.match(/\d+/g) ?? []).map(Number))
}

function withPoints(
  qs: KoreanMockQuestion[],
  three: Set<number>,
): KoreanMockQuestion[] {
  return qs.map((q) => (three.has(q.number) ? { ...q, points: 3 } : q))
}

function sumPoints(qs: KoreanMockQuestion[]): number {
  return qs.reduce((s, q) => s + questionPoints(q), 0)
}

interface ElectiveDraft {
  name: string
  startNumberRaw: string
  rawAnswers: string
  threePointRaw: string
}

const inputCls =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'

export function KoreanMockNew() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState<MockSubject>('korean')
  const [startNumberRaw, setStartNumberRaw] = useState('1')
  const [rawAnswers, setRawAnswers] = useState('')
  const [threePointRaw, setThreePointRaw] = useState('')
  const [examinerComment, setExaminerComment] = useState('')
  const [electives, setElectives] = useState<ElectiveDraft[]>([])
  const [cutoffs, setCutoffs] = useState<MockGradeCut[] | null>(null)
  const [cutoffBusy, setCutoffBusy] = useState(false)
  const [cutoffError, setCutoffError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setSubjectAndDefaults(s: MockSubject) {
    setSubject(s)
    if (s === 'english' && (startNumberRaw === '1' || startNumberRaw === '')) {
      setStartNumberRaw('18')
    }
    if (s === 'korean' && startNumberRaw === '18') setStartNumberRaw('1')
  }

  const startNumber = useMemo(() => {
    const n = Number.parseInt(startNumberRaw, 10)
    return Number.isFinite(n) && n > 0 ? n : 1
  }, [startNumberRaw])

  const threeSet = useMemo(() => parseNumberSet(threePointRaw), [threePointRaw])

  const commonQuestions = useMemo(
    () => withPoints(parseAnswerKey(rawAnswers, startNumber), threeSet),
    [rawAnswers, startNumber, threeSet],
  )

  // 공통 마지막 번호+1 (선택과목 기본 시작 번호 제안)
  const commonNext = useMemo(
    () =>
      commonQuestions.length
        ? Math.max(...commonQuestions.map((q) => q.number)) + 1
        : startNumber,
    [commonQuestions, startNumber],
  )

  const parsedElectives = useMemo<KoreanMockElective[]>(() => {
    return electives.map((el) => {
      const start = Number.parseInt(el.startNumberRaw, 10)
      const startNum = Number.isFinite(start) && start > 0 ? start : commonNext
      const qs = withPoints(
        parseAnswerKey(el.rawAnswers, startNum),
        parseNumberSet(el.threePointRaw),
      )
      return {
        name: el.name.trim() || '선택과목',
        startNumber: startNum,
        questions: qs,
      }
    })
  }, [electives, commonNext])

  // 등급컷 산출용 총점 = 공통 + (첫 선택과목).
  const totalPoints = useMemo(() => {
    const common = sumPoints(commonQuestions)
    const el = parsedElectives[0] ? sumPoints(parsedElectives[0].questions) : 0
    return common + el
  }, [commonQuestions, parsedElectives])

  const totalQuestions = useMemo(
    () => commonQuestions.length + (parsedElectives[0]?.questions.length ?? 0),
    [commonQuestions, parsedElectives],
  )

  function addElective() {
    setElectives((prev) => [
      ...prev,
      { name: '', startNumberRaw: String(commonNext), rawAnswers: '', threePointRaw: '' },
    ])
  }
  function updateElective(i: number, patch: Partial<ElectiveDraft>) {
    setElectives((prev) => prev.map((el, j) => (j === i ? { ...el, ...patch } : el)))
  }
  function removeElective(i: number) {
    setElectives((prev) => prev.filter((_, j) => j !== i))
  }

  async function handleGenerateCutoffs() {
    setCutoffError(null)
    if (totalPoints <= 0) {
      setCutoffError('먼저 답안을 입력해 총점을 확정하세요.')
      return
    }
    setCutoffBusy(true)
    try {
      const cuts = await estimateMockCutoffs({
        subject,
        title: title.trim() || undefined,
        totalQuestions,
        totalPoints,
        practice: true,
      })
      setCutoffs(cuts)
    } catch (err) {
      setCutoffError(err instanceof Error ? err.message : 'AI 등급컷 생성 실패')
    } finally {
      setCutoffBusy(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setError(null)
    if (!title.trim()) {
      setError('제목을 입력하세요.')
      return
    }
    if (commonQuestions.length === 0) {
      setError('공통 과목 답안을 1개 이상 입력하세요.')
      return
    }
    const badElective = parsedElectives.find((el) => el.questions.length === 0)
    if (badElective) {
      setError(`선택과목 "${badElective.name}"의 답안을 입력하세요.`)
      return
    }
    setSubmitting(true)
    try {
      const id = await createKoreanMock({
        title: title.trim(),
        subject,
        startNumber,
        questions: commonQuestions,
        electives: parsedElectives.length ? parsedElectives : undefined,
        examinerComment: examinerComment.trim() || undefined,
        gradeCutoffs: cutoffs ?? undefined,
        createdBy: profile.id,
        createdByName: profile.displayName,
      })
      navigate(`/admin/korean-mocks/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록 실패')
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          관리
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
          모의고사 등록
        </h1>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="text-sm font-medium text-slate-700 mb-1.5">과목</p>
          <div className="grid grid-cols-2 gap-1 rounded-md border border-slate-200 bg-white p-1 max-w-xs">
            {(
              [
                { key: 'korean', label: '국어' },
                { key: 'english', label: '영어' },
              ] as { key: MockSubject; label: string }[]
            ).map((opt) => {
              const active = subject === opt.key
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSubjectAndDefaults(opt.key)}
                  className={`rounded px-3 py-1.5 text-sm font-medium transition ${
                    active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">제목</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                subject === 'english' ? '예: 2026 6월 모평 영어' : '예: 2026 6월 모평 국어'
              }
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">시작 번호</label>
            <input
              type="number"
              min={1}
              value={startNumberRaw}
              onChange={(e) => setStartNumberRaw(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            공통 과목 답안 일괄 입력
          </label>
          <textarea
            value={rawAnswers}
            onChange={(e) => setRawAnswers(e.target.value)}
            rows={5}
            placeholder={'예: 3 5 1 2 4 ...  또는  1:3, 2:5, 3:1'}
            className={`${inputCls} font-mono`}
          />
          <p className="text-[11px] text-slate-500 mt-1">
            공백·줄바꿈·쉼표로 구분된 1~5 숫자. {commonQuestions.length}문항 인식됨.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            공통 과목 3점 문항 번호{' '}
            <span className="font-normal text-slate-400">(선택, 나머지는 2점)</span>
          </label>
          <input
            type="text"
            value={threePointRaw}
            onChange={(e) => setThreePointRaw(e.target.value)}
            placeholder="예: 5, 9, 13, 21"
            className={inputCls}
          />
        </div>

        {/* 선택과목 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">
              선택과목 <span className="font-normal text-slate-400">(수능형 · 학생이 택1)</span>
            </p>
            <button
              type="button"
              onClick={addElective}
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              + 선택과목 추가
            </button>
          </div>
          {electives.map((el, i) => {
            const p = parsedElectives[i]
            return (
              <div key={i} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-2">
                  <input
                    type="text"
                    value={el.name}
                    onChange={(e) => updateElective(i, { name: e.target.value })}
                    placeholder="선택과목 이름 (예: 화법과 작문)"
                    className={inputCls}
                  />
                  <input
                    type="number"
                    min={1}
                    value={el.startNumberRaw}
                    onChange={(e) => updateElective(i, { startNumberRaw: e.target.value })}
                    placeholder="시작 번호"
                    className={inputCls}
                  />
                </div>
                <textarea
                  value={el.rawAnswers}
                  onChange={(e) => updateElective(i, { rawAnswers: e.target.value })}
                  rows={3}
                  placeholder="선택과목 답안 (예: 1 3 2 5 4 ...)"
                  className={`${inputCls} font-mono`}
                />
                <input
                  type="text"
                  value={el.threePointRaw}
                  onChange={(e) => updateElective(i, { threePointRaw: e.target.value })}
                  placeholder="3점 문항 번호 (예: 37, 42)"
                  className={inputCls}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">
                    {p?.questions.length ?? 0}문항 인식됨
                  </span>
                  <button
                    type="button"
                    onClick={() => removeElective(i)}
                    className="text-[11px] text-slate-400 hover:text-red-500"
                  >
                    삭제
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* 출제자 한마디 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            출제자 한마디 <span className="font-normal text-slate-400">(선택, 결과 화면 표시)</span>
          </label>
          <textarea
            value={examinerComment}
            onChange={(e) => setExaminerComment(e.target.value)}
            rows={2}
            placeholder="예: 이번 시험은 시간 관리가 관건입니다."
            className={inputCls}
          />
        </div>

        {/* 등급컷 (직접 편집 + AI 초안) */}
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <MockCutoffEditor
            cutoffs={cutoffs ?? []}
            onChange={setCutoffs}
            onGenerate={handleGenerateCutoffs}
            generating={cutoffBusy}
            generateError={cutoffError}
            totalPoints={totalPoints}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          <Link
            to="/admin/korean-mocks"
            className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-50"
          >
            취소
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-slate-900 text-white text-sm font-semibold px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? '등록 중…' : '등록'}
          </button>
        </div>
      </form>
    </div>
  )
}
