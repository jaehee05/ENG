import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { createReading } from '../lib/firestore'
import { extractGlossary, parseReadingText, wordsToText } from '../lib/api'
import { parseWordList, type ReadingQuestionType } from '../lib/types'
import { QuestionEditor } from '../components/QuestionEditor'
import { emptyDraftQuestion, type DraftQuestion } from '../components/draftQuestion'

const ALLOWED_TYPES: ReadingQuestionType[] = [
  'standard',
  'cloze',
  'order',
  'insert',
  'summary',
  'irrelevant',
  'underline-grammar',
  'underline-vocab',
]

function toReadingType(t: string): ReadingQuestionType {
  return (ALLOWED_TYPES as string[]).includes(t) ? (t as ReadingQuestionType) : 'standard'
}

function trimDraft(q: DraftQuestion) {
  const out: {
    type: DraftQuestion['type']
    q: string
    choices: string[]
    answer: number
    body?: string
    intro?: string
    summaryBox?: string
    points?: number
  } = {
    type: q.type,
    q: q.q.trim(),
    choices: q.choices.map((c) => c.trim()),
    answer: q.answer,
  }
  if (q.body.trim()) out.body = q.body.trim()
  if (q.intro.trim()) out.intro = q.intro.trim()
  if (q.summaryBox.trim()) out.summaryBox = q.summaryBox.trim()
  if (q.points && q.points !== 2) out.points = q.points
  return out
}

export function ReadingNew() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [passage, setPassage] = useState('')
  const [glossaryRaw, setGlossaryRaw] = useState('')
  const [choicesGlossaryRaw, setChoicesGlossaryRaw] = useState('')
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyDraftQuestion()])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [rawText, setRawText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseNotice, setParseNotice] = useState<string | null>(null)

  const glossary = useMemo(() => parseWordList(glossaryRaw), [glossaryRaw])
  const choicesGlossary = useMemo(() => parseWordList(choicesGlossaryRaw), [choicesGlossaryRaw])

  async function handleParse() {
    setError(null)
    setParseNotice(null)
    if (!rawText.trim()) {
      setError('붙여넣은 텍스트가 없습니다.')
      return
    }
    setParsing(true)
    try {
      const result = await parseReadingText(rawText)
      if (result.questions.length === 0) {
        setError('문항을 찾지 못했습니다. 원문을 다시 확인하세요.')
        return
      }
      if (result.title && !title.trim()) setTitle(result.title)
      if (result.passage) setPassage(result.passage)
      const drafts: DraftQuestion[] = result.questions.map((q) => {
        const choices = q.choices.slice(0, 5)
        while (choices.length < 5) choices.push('')
        return {
          type: toReadingType(q.type),
          q: q.q,
          body: q.body,
          intro: q.intro,
          summaryBox: q.summaryBox,
          choices,
          answer: Math.min(4, Math.max(0, q.answer ?? 0)),
          points: q.points && q.points >= 1 && q.points <= 5 ? q.points : undefined,
        }
      })
      setQuestions(drafts)
      setParseNotice(
        `${drafts.length}개 문항을 자동 입력했습니다. 정답·본문을 확인 후 저장하세요.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '자동 분류에 실패했습니다.')
    } finally {
      setParsing(false)
    }
  }

  async function handleExtract() {
    setError(null)
    if (!passage.trim() && !questions.some((q) => q.body.trim())) {
      setError('지문 또는 문제 본문을 먼저 입력하세요.')
      return
    }
    setExtracting(true)
    try {
      const bodyParts = questions.map((q) => q.body.trim()).filter(Boolean)
      const combined = [passage.trim(), ...bodyParts].filter(Boolean).join('\n\n')
      const allChoices = questions.flatMap((q) => q.choices).filter((c) => c.trim())
      const result = await extractGlossary({
        passage: combined,
        choices: allChoices,
      })
      setGlossaryRaw(wordsToText(result.glossary))
      setChoicesGlossaryRaw(wordsToText(result.choicesGlossary))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 추출에 실패했습니다.')
    } finally {
      setExtracting(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!profile) return
    if (!title.trim()) return setError('제목을 입력하세요.')
    if (questions.length === 0) return setError('문제를 1개 이상 입력하세요.')
    for (const [i, q] of questions.entries()) {
      if (!q.q.trim()) return setError(`${i + 1}번 문제의 발문을 입력하세요.`)
      if (q.choices.some((c) => !c.trim())) return setError(`${i + 1}번 문제의 선지를 모두 채우세요.`)
    }
    if (!passage.trim() && questions.some((q) => !q.body.trim() && q.type === 'standard')) {
      return setError('일반 유형 문제가 있으면 지문을 입력하거나 문제별 본문을 채워주세요.')
    }

    setSubmitting(true)
    try {
      const id = await createReading({
        title: title.trim(),
        passage: passage.trim(),
        glossary,
        choicesGlossary,
        questions: questions.map(trimDraft),
        createdBy: profile.id,
        createdByName: profile.displayName,
      })
      navigate(`/reading/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold text-slate-900">새 지문</h1>

      <div className="rounded-md border border-brand-200 bg-brand-50/40 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-brand-700">원문 붙여넣어 자동 입력</h2>
            <p className="text-xs text-slate-600 mt-0.5">
              지문·발문·①~⑤ 선지·정답이 섞인 원문을 통째로 붙여넣으면 AI가 분류해 폼을 채워줍니다.
            </p>
          </div>
          <button
            type="button"
            onClick={handleParse}
            disabled={parsing}
            className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-50 shrink-0"
          >
            {parsing ? '분석 중...' : '자동 분류'}
          </button>
        </div>
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={8}
          placeholder={
            '예) 31. 다음 빈칸에 들어갈 말로 가장 적절한 것은? [3점]\n  Recent studies suggest that ...\n  ① ... ② ... ③ ... ④ ... ⑤ ...\n  정답: ③'
          }
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {parseNotice && <p className="text-xs text-brand-700">{parseNotice}</p>}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">제목</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 2024학년도 6월 모평 31번"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            지문{' '}
            <span className="font-normal text-slate-500">
              (일반 유형 문제의 공용 본문, 필요 없으면 비워도 됨)
            </span>
          </label>
          <textarea
            value={passage}
            onChange={(e) => setPassage(e.target.value)}
            rows={10}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-700">문제</label>
            <button
              type="button"
              onClick={() => setQuestions((prev) => [...prev, emptyDraftQuestion()])}
              className="text-sm text-slate-700 hover:text-slate-900 underline"
            >
              + 문제 추가
            </button>
          </div>

          {questions.map((q, i) => (
            <QuestionEditor
              key={i}
              index={i}
              question={q}
              canRemove={questions.length > 1}
              onChange={(next) =>
                setQuestions((prev) => prev.map((x, idx) => (idx === i ? next : x)))
              }
              onRemove={() => setQuestions((prev) => prev.filter((_, idx) => idx !== i))}
            />
          ))}
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-700">단어 풀이</h3>
            <button
              type="button"
              onClick={handleExtract}
              disabled={extracting}
              className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-50"
            >
              {extracting ? '추출 중...' : 'AI로 단어 추출'}
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              지문 단어풀이 ({glossary.length}개)
            </label>
            <textarea
              value={glossaryRaw}
              onChange={(e) => setGlossaryRaw(e.target.value)}
              rows={10}
              placeholder="abandon - 버리다, 포기하다"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              선지 단어풀이 ({choicesGlossary.length}개)
            </label>
            <textarea
              value={choicesGlossaryRaw}
              onChange={(e) => setChoicesGlossaryRaw(e.target.value)}
              rows={6}
              placeholder="paradigm - 패러다임, 인식 틀"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand-600 text-white text-sm font-medium px-5 py-2 hover:bg-brand-700 transition disabled:opacity-60"
          >
            {submitting ? '저장 중...' : '저장'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/reading')}
            className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-5 py-2 hover:bg-slate-100"
          >
            취소
          </button>
        </div>
      </form>
    </div>
  )
}
