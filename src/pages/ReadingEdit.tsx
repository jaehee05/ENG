import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  deleteReading,
  getReading,
  updateReadingContent,
  updateReadingGlossaries,
} from '../lib/firestore'
import { parseWordList, type Reading, type ReadingQuestion } from '../lib/types'
import { extractGlossary, wordsToText } from '../lib/api'
import { handleUnderlineHotkey } from '../lib/textareaHotkeys'
import { QuestionEditor } from '../components/QuestionEditor'
import { emptyDraftQuestion, type DraftQuestion } from '../components/draftQuestion'

function fromQuestion(q: ReadingQuestion): DraftQuestion {
  const choices = [...q.choices]
  while (choices.length < 5) choices.push('')
  return {
    type: q.type ?? 'standard',
    q: q.q,
    body: q.body ?? '',
    intro: q.intro ?? '',
    summaryBox: q.summaryBox ?? '',
    choices: choices.slice(0, 5),
    answer: q.answer,
    points: q.points,
    image: q.image,
    partA: q.partA ?? '',
    partB: q.partB ?? '',
    partC: q.partC ?? '',
    partD: q.partD ?? '',
  }
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
    image?: string
    partA?: string
    partB?: string
    partC?: string
    partD?: string
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
  if (q.image) out.image = q.image
  if (q.partA.trim()) out.partA = q.partA.trim()
  if (q.partB.trim()) out.partB = q.partB.trim()
  if (q.partC.trim()) out.partC = q.partC.trim()
  if (q.partD.trim()) out.partD = q.partD.trim()
  return out
}

export function ReadingEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [original, setOriginal] = useState<Reading | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [passage, setPassage] = useState('')
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyDraftQuestion()])
  const [glossaryRaw, setGlossaryRaw] = useState('')
  const [choicesGlossaryRaw, setChoicesGlossaryRaw] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const glossary = useMemo(() => parseWordList(glossaryRaw), [glossaryRaw])
  const choicesGlossary = useMemo(
    () => parseWordList(choicesGlossaryRaw),
    [choicesGlossaryRaw],
  )

  useEffect(() => {
    if (!id) return
    let cancelled = false
    getReading(id)
      .then((r) => {
        if (cancelled) return
        if (!r) {
          setError('지문을 찾을 수 없습니다.')
          return
        }
        setOriginal(r)
        setTitle(r.title)
        setPassage(r.passage)
        setQuestions(
          r.questions.length > 0 ? r.questions.map(fromQuestion) : [emptyDraftQuestion()],
        )
        setGlossaryRaw(wordsToText(r.glossary ?? []))
        setChoicesGlossaryRaw(wordsToText(r.choicesGlossary ?? []))
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '불러오기에 실패했습니다.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  async function handleExtract() {
    setError(null)
    if (!passage.trim() && !questions.some((q) => q.body.trim())) {
      setError('지문 또는 문제 본문이 비어 있습니다.')
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
    if (!original) return
    if (!title.trim()) return setError('제목을 입력하세요.')
    if (questions.length === 0) return setError('문제를 1개 이상 입력하세요.')
    for (const [i, q] of questions.entries()) {
      if (!q.q.trim()) return setError(`${i + 1}번 문제의 발문을 입력하세요.`)
    }
    if (
      !passage.trim() &&
      questions.some(
        (q) => !q.body.trim() && !q.image && q.type === 'standard',
      )
    ) {
      return setError(
        '일반 유형 문제가 있으면 지문/문제 본문/도표 중 하나는 채워야 합니다.',
      )
    }

    setSubmitting(true)
    try {
      await updateReadingContent(original.id, {
        title: title.trim(),
        passage: passage.trim(),
        questions: questions.map(trimDraft),
      })
      await updateReadingGlossaries(original.id, glossary, choicesGlossary)
      navigate(`/reading/${original.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!original) return
    if (!window.confirm(`"${original.title}" 지문을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) {
      return
    }
    setDeleting(true)
    try {
      await deleteReading(original.id)
      navigate('/reading')
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제에 실패했습니다.')
      setDeleting(false)
    }
  }

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error && !original) return <p className="text-red-600 text-sm">{error}</p>
  if (!original) return null

  const inputCls =
    'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">지문 수정</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">제목</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            지문{' '}
            <span className="font-normal text-slate-500">
              (일반 유형 문제의 공용 본문)
            </span>
          </label>
          <textarea
            value={passage}
            onChange={(e) => setPassage(e.target.value)}
            onKeyDown={(e) => handleUnderlineHotkey(e, setPassage)}
            rows={12}
            className={inputCls}
          />
          <p className="text-xs text-slate-400 mt-1">
            드래그 후 ⌘U(Ctrl+U)로 선택 부분에 밑줄
          </p>
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
              {extracting ? '추출 중...' : 'AI로 단어 추출 (덮어쓰기)'}
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
              placeholder="abandon : 버리다, 포기하다"
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
              placeholder="paradigm : 패러다임, 인식 틀"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting || submitting}
            className="rounded-md text-red-600 text-sm font-medium px-3 py-2 hover:bg-red-50 disabled:opacity-60"
          >
            {deleting ? '삭제 중...' : '지문 삭제'}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate(`/reading/${original.id}`)}
              className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-5 py-2 hover:bg-slate-100"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting || deleting}
              className="rounded-md bg-brand-600 text-white text-sm font-medium px-5 py-2 hover:bg-brand-700 transition disabled:opacity-60"
            >
              {submitting ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
