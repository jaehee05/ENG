import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { deleteReading, getReading, updateReadingContent } from '../lib/firestore'
import type { Reading, ReadingQuestion } from '../lib/types'

interface DraftQuestion {
  q: string
  choices: string[]
  answer: number
}

function fromQuestion(q: ReadingQuestion): DraftQuestion {
  const choices = [...q.choices]
  while (choices.length < 5) choices.push('')
  return { q: q.q, choices: choices.slice(0, 5), answer: q.answer }
}

function emptyQuestion(): DraftQuestion {
  return { q: '', choices: ['', '', '', '', ''], answer: 0 }
}

export function ReadingEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [original, setOriginal] = useState<Reading | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [passage, setPassage] = useState('')
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion()])
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)

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
        setQuestions(r.questions.length > 0 ? r.questions.map(fromQuestion) : [emptyQuestion()])
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!original) return
    if (!title.trim()) return setError('제목을 입력하세요.')
    if (!passage.trim()) return setError('지문을 입력하세요.')
    if (questions.length === 0) return setError('문제를 1개 이상 입력하세요.')
    for (const [i, q] of questions.entries()) {
      if (!q.q.trim()) return setError(`${i + 1}번 문제의 질문을 입력하세요.`)
      if (q.choices.some((c) => !c.trim()))
        return setError(`${i + 1}번 문제의 보기를 모두 채우세요.`)
    }

    setSubmitting(true)
    try {
      await updateReadingContent(original.id, {
        title: title.trim(),
        passage: passage.trim(),
        questions: questions.map((q) => ({
          q: q.q.trim(),
          choices: q.choices.map((c) => c.trim()),
          answer: q.answer,
        })),
      })
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
        <p className="text-sm text-slate-500 mt-1">단어장 항목은 상세 페이지의 "단어장 수정"에서 관리합니다.</p>
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
          <label className="block text-sm font-medium text-slate-700 mb-1">지문</label>
          <textarea
            value={passage}
            onChange={(e) => setPassage(e.target.value)}
            rows={12}
            className={inputCls}
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
                rows={2}
                className={`${inputCls} rounded`}
              />
              <div className="space-y-2">
                {q.choices.map((c, ci) => (
                  <label key={ci} className="flex items-start gap-2">
                    <input
                      type="radio"
                      name={`answer-${i}`}
                      checked={q.answer === ci}
                      onChange={() => updateQuestion(i, { answer: ci })}
                      className="mt-1.5 accent-brand-600"
                    />
                    <span className="text-sm text-slate-600 w-5 mt-1">
                      {['①', '②', '③', '④', '⑤'][ci]}
                    </span>
                    <input
                      type="text"
                      value={c}
                      onChange={(e) => updateChoice(i, ci, e.target.value)}
                      className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                정답: {['①', '②', '③', '④', '⑤'][q.answer]}
              </p>
            </div>
          ))}
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
