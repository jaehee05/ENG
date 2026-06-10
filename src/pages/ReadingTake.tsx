import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { createReadingAttempt, getReading, updateReadingGlossary } from '../lib/firestore'
import { GlossedPassage } from '../components/GlossedPassage'
import type { Reading } from '../lib/types'

export function ReadingTake() {
  const { id } = useParams<{ id: string }>()
  const { user, profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const navigate = useNavigate()
  const [r, setR] = useState<Reading | null>(null)
  const [answers, setAnswers] = useState<number[]>([])
  const [glossaryOpen, setGlossaryOpen] = useState(true)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getReading(id)
      .then((x) => {
        if (!x) {
          setError('지문을 찾을 수 없습니다.')
          return
        }
        setR(x)
        setAnswers(new Array(x.questions.length).fill(-1))
      })
      .catch((e) => setError(e.message ?? '불러오기 실패'))
      .finally(() => setLoading(false))
  }, [id])

  async function handleAddWord(en: string, ko: string) {
    if (!r) return
    const exists = r.glossary.some((g) => g.en.toLowerCase() === en.toLowerCase())
    const nextGlossary = exists
      ? r.glossary.map((g) => (g.en.toLowerCase() === en.toLowerCase() ? { en: g.en, ko } : g))
      : [...r.glossary, { en, ko }]
    await updateReadingGlossary(r.id, nextGlossary)
    setR({ ...r, glossary: nextGlossary })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!r || !user || !profile) return
    if (answers.some((a) => a < 0)) {
      setError('모든 문제에 답하세요.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const results = r.questions.map((q, i) => ({
        q: q.q,
        choices: q.choices,
        userAnswer: answers[i],
        correctAnswer: q.answer,
        correct: answers[i] === q.answer,
      }))
      const attemptId = await createReadingAttempt({
        studentUid: user.uid,
        studentName: profile.displayName,
        refId: r.id,
        refTitle: r.title,
        readingResults: results,
      })
      navigate(`/reading/${r.id}/result/${attemptId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '제출에 실패했습니다.')
      setSubmitting(false)
    }
  }

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error && !r) return <p className="text-red-600 text-sm">{error}</p>
  if (!r) return null

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{r.title}</h1>
        <p className="text-sm text-slate-500 mt-1">
          지문 안 밑줄 단어를 누르면(또는 마우스를 올리면) 뜻이 표시됩니다.
          {isAdmin && ' 관리자는 단어를 드래그해 뜻을 추가할 수 있습니다.'}
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setGlossaryOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 border-b border-slate-200 text-sm font-semibold text-slate-700"
        >
          단어장 ({r.glossary.length}개)
          <span className="text-slate-400">{glossaryOpen ? '접기' : '펼치기'}</span>
        </button>
        {glossaryOpen && (
          <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            {r.glossary.map((g, i) => (
              <div key={i} className="flex gap-2">
                <span className="font-medium text-slate-900 min-w-[120px]">{g.en}</span>
                <span className="text-slate-600">{g.ko}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
        <GlossedPassage
          passage={r.passage}
          glossary={r.glossary}
          editable={isAdmin}
          onAddWord={handleAddWord}
        />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {r.questions.map((q, i) => (
          <div key={i} className="rounded-md border border-slate-200 bg-white p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-900 whitespace-pre-wrap">
              {i + 1}. {q.q}
            </p>
            <div className="space-y-2">
              {q.choices.map((c, ci) => (
                <label
                  key={ci}
                  className={`flex items-start gap-3 rounded border px-3 py-2 cursor-pointer transition ${
                    answers[i] === ci
                      ? 'border-slate-900 bg-slate-50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${i}`}
                    checked={answers[i] === ci}
                    onChange={() => {
                      const next = [...answers]
                      next[i] = ci
                      setAnswers(next)
                    }}
                    className="mt-1"
                  />
                  <span className="text-sm text-slate-700 w-5">{['①', '②', '③', '④', '⑤'][ci]}</span>
                  <span className="text-sm text-slate-700 flex-1">{c}</span>
                </label>
              ))}
            </div>
          </div>
        ))}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-slate-900 text-white text-sm font-medium px-5 py-2 hover:bg-slate-800 disabled:opacity-60"
          >
            {submitting ? '채점 중...' : '제출하기'}
          </button>
        </div>
      </form>
    </div>
  )
}
