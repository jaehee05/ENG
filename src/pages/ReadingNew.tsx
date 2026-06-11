import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { createReading } from '../lib/firestore'
import { extractGlossary, wordsToText } from '../lib/api'
import { parseWordList } from '../lib/types'
import { QuestionEditor } from '../components/QuestionEditor'
import { emptyDraftQuestion, type DraftQuestion } from '../components/draftQuestion'

function trimDraft(q: DraftQuestion) {
  const out: {
    type: DraftQuestion['type']
    q: string
    choices: string[]
    answer: number
    body?: string
    intro?: string
    summaryBox?: string
  } = {
    type: q.type,
    q: q.q.trim(),
    choices: q.choices.map((c) => c.trim()),
    answer: q.answer,
  }
  if (q.body.trim()) out.body = q.body.trim()
  if (q.intro.trim()) out.intro = q.intro.trim()
  if (q.summaryBox.trim()) out.summaryBox = q.summaryBox.trim()
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

  const glossary = useMemo(() => parseWordList(glossaryRaw), [glossaryRaw])
  const choicesGlossary = useMemo(() => parseWordList(choicesGlossaryRaw), [choicesGlossaryRaw])

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
