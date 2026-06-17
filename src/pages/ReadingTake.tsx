import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { createReadingAttempt, getReading } from '../lib/firestore'
import { listMyWordbookKeys, lookupWord } from '../lib/wordbook'
import { QuestionView } from '../components/QuestionView'
import { passageFallbackPerQuestion, type Reading } from '../lib/types'

export function ReadingTake() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [r, setR] = useState<Reading | null>(null)
  const [answers, setAnswers] = useState<number[]>([])
  const [glossaryOpen, setGlossaryOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewedWords, setViewedWords] = useState<Set<string>>(new Set())

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

  useEffect(() => {
    if (!profile) return
    listMyWordbookKeys(profile.id).then(setViewedWords).catch(() => {})
  }, [profile])

  const handleWordLookup = useCallback(
    (en: string, ko: string) => {
      if (!profile || !r) return
      const lower = en.toLowerCase()
      setViewedWords((prev) => {
        if (prev.has(lower)) return prev
        const next = new Set(prev)
        next.add(lower)
        return next
      })
      lookupWord({
        uid: profile.id,
        en,
        ko,
        readingId: r.id,
        readingTitle: r.title,
      }).catch(() => {})
    },
    [profile, r],
  )

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!r || !profile) return
    if (answers.some((a) => a < 0)) {
      setError('모든 문제에 답하세요.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const results = r.questions.map((q, i) => {
        const base: {
          q: string
          choices: string[]
          userAnswer: number
          correctAnswer: number
          correct: boolean
          number?: number
        } = {
          q: q.q,
          choices: q.choices,
          userAnswer: answers[i],
          correctAnswer: q.answer,
          correct: answers[i] === q.answer,
        }
        if (q.number && q.number > 0) base.number = q.number
        return base
      })
      const attemptId = await createReadingAttempt({
        studentUid: profile.id,
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

  const choicesGlossary = r.choicesGlossary ?? []

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold text-slate-900">{r.title}</h1>

      <div className="rounded-lg border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setGlossaryOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-slate-700"
        >
          단어장 ({r.glossary.length + choicesGlossary.length}개)
          <span className="text-slate-400 text-xs">{glossaryOpen ? '접기' : '펼치기'}</span>
        </button>
        {glossaryOpen && (
          <div className="border-t border-slate-200 px-5 py-4 space-y-4">
            {r.glossary.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">지문</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  {r.glossary.map((g, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="font-medium text-slate-900 min-w-[120px]">{g.en}</span>
                      <span className="text-slate-600">{g.ko}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {choicesGlossary.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">선지</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  {choicesGlossary.map((g, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="font-medium text-slate-900 min-w-[120px]">{g.en}</span>
                      <span className="text-slate-600">{g.ko}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {(() => {
          const fbList = passageFallbackPerQuestion(r.passage, r.questions)
          return r.questions.map((q, i) => (
            <QuestionView
              key={i}
              index={i}
              question={q}
              fallbackPassage={fbList[i]}
              passageGlossary={r.glossary}
              choicesGlossary={choicesGlossary}
              viewedWords={viewedWords}
              onWordLookup={handleWordLookup}
              selected={answers[i]}
              onSelect={(v) => {
                const next = [...answers]
                next[i] = v
                setAnswers(next)
              }}
            />
          ))
        })()}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand-600 text-white text-sm font-medium px-5 py-2 hover:bg-brand-700 transition disabled:opacity-60"
          >
            {submitting ? '채점 중...' : '제출하기'}
          </button>
        </div>
      </form>
    </div>
  )
}
