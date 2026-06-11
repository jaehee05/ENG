import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { createReading } from '../lib/firestore'
import { extractGlossary, wordsToText } from '../lib/api'
import { parseWordList } from '../lib/types'

interface DraftQuestion {
  q: string
  choices: string[]
  answer: number
}

function emptyQuestion(): DraftQuestion {
  return { q: '', choices: ['', '', '', '', ''], answer: 0 }
}

export function ReadingNew() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [passage, setPassage] = useState('')
  const [glossaryRaw, setGlossaryRaw] = useState('')
  const [choicesGlossaryRaw, setChoicesGlossaryRaw] = useState('')
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion()])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [extracting, setExtracting] = useState(false)

  const glossary = useMemo(() => parseWordList(glossaryRaw), [glossaryRaw])
  const choicesGlossary = useMemo(() => parseWordList(choicesGlossaryRaw), [choicesGlossaryRaw])

  function updateQuestion(i: number, patch: Partial<DraftQuestion>) {
    setQuestions((prev) => prev.map((q, idx) => (idx === i ? { ...q, ...patch } : q)))
  }
  function updateChoice(i: number, ci: number, value: string) {
    setQuestions((prev) =>
      prev.map((q, idx) =>
        idx === i ? { ...q, choices: q.choices.map((c, cidx) => (cidx === ci ? value : c)) } : q,
      ),
    )
  }
  function removeQuestion(i: number) {
    setQuestions((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleExtract() {
    setError(null)
    if (!passage.trim()) {
      setError('지문을 먼저 입력하세요.')
      return
    }
    setExtracting(true)
    try {
      const allChoices = questions.flatMap((q) => q.choices).filter((c) => c.trim())
      const result = await extractGlossary({
        passage: passage.trim(),
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
    if (!user || !profile) return
    if (!title.trim()) return setError('제목을 입력하세요.')
    if (!passage.trim()) return setError('지문을 입력하세요.')
    if (questions.length === 0) return setError('문제를 1개 이상 입력하세요.')
    for (const [i, q] of questions.entries()) {
      if (!q.q.trim()) return setError(`${i + 1}번 문제의 질문을 입력하세요.`)
      if (q.choices.some((c) => !c.trim())) return setError(`${i + 1}번 문제의 보기를 모두 채우세요.`)
    }

    setSubmitting(true)
    try {
      const id = await createReading({
        title: title.trim(),
        passage: passage.trim(),
        glossary,
        choicesGlossary,
        questions: questions.map((q) => ({
          q: q.q.trim(),
          choices: q.choices.map((c) => c.trim()),
          answer: q.answer,
        })),
        createdBy: user.uid,
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
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">지문</label>
          <textarea
            value={passage}
            onChange={(e) => setPassage(e.target.value)}
            rows={10}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-700">문제</label>
            <button
              type="button"
              onClick={() => setQuestions((prev) => [...prev, emptyQuestion()])}
              className="text-sm text-slate-700 hover:text-slate-900 underline"
            >
              + 문제 추가
            </button>
          </div>

          {questions.map((q, i) => (
            <div key={i} className="rounded-md border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-700">{i + 1}번 문제</span>
                {questions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeQuestion(i)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    삭제
                  </button>
                )}
              </div>
              <textarea
                value={q.q}
                onChange={(e) => updateQuestion(i, { q: e.target.value })}
                placeholder="질문 (예: 윗글의 주제로 가장 적절한 것은?)"
                rows={2}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <div className="space-y-2">
                {q.choices.map((c, ci) => (
                  <label key={ci} className="flex items-start gap-2">
                    <input
                      type="radio"
                      name={`answer-${i}`}
                      checked={q.answer === ci}
                      onChange={() => updateQuestion(i, { answer: ci })}
                      className="mt-1.5"
                    />
                    <span className="text-sm text-slate-600 w-5 mt-1">{['①', '②', '③', '④', '⑤'][ci]}</span>
                    <input
                      type="text"
                      value={c}
                      onChange={(e) => updateChoice(i, ci, e.target.value)}
                      className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-500">정답: {['①', '②', '③', '④', '⑤'][q.answer]}</p>
            </div>
          ))}
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-700">단어 풀이</h3>
            <button
              type="button"
              onClick={handleExtract}
              disabled={extracting || !passage.trim()}
              className="rounded-md bg-indigo-600 text-white text-sm font-medium px-4 py-2 hover:bg-indigo-700 disabled:opacity-50"
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
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              보기 단어풀이 ({choicesGlossary.length}개)
            </label>
            <textarea
              value={choicesGlossaryRaw}
              onChange={(e) => setChoicesGlossaryRaw(e.target.value)}
              rows={6}
              placeholder="paradigm - 패러다임, 인식 틀"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-slate-900 text-white text-sm font-medium px-5 py-2 hover:bg-slate-800 disabled:opacity-60"
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
