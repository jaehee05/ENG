import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { createReadingAttempt, getReading } from '../lib/firestore'
import { listMyWordbookKeys, lookupWord } from '../lib/wordbook'
import { QuestionView } from '../components/QuestionView'
import { SharedPassageBlock } from '../components/SharedPassageBlock'
import {
  getSharedPassageBlock,
  inferQuestionNumbers,
  passageFallbackPerQuestion,
  questionsWithoutShared,
  type Reading,
} from '../lib/types'

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
    <div className="space-y-5 max-w-3xl">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          지문 문제풀이
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
          {r.title}
        </h1>
      </header>

      <details
        className="rounded-lg border border-slate-200 bg-white"
        open={glossaryOpen}
        onToggle={(e) => setGlossaryOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer list-none flex items-center justify-between px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <span>
            단어장{' '}
            <span className="text-slate-400 font-normal">
              {r.glossary.length + choicesGlossary.length}
            </span>
          </span>
          <span className="text-slate-400 text-xs">
            {glossaryOpen ? '접기 −' : '펼치기 +'}
          </span>
        </summary>
        <div className="border-t border-slate-100 px-4 py-3 space-y-4">
          {r.glossary.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                지문
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1 text-sm">
                {r.glossary.map((g, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="font-medium text-slate-900 min-w-[110px]">
                      {g.en}
                    </span>
                    <span className="text-slate-600">{g.ko}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {choicesGlossary.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                선지
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1 text-sm">
                {choicesGlossary.map((g, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="font-medium text-slate-900 min-w-[110px]">
                      {g.en}
                    </span>
                    <span className="text-slate-600">{g.ko}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </details>

      <form onSubmit={handleSubmit} className="space-y-4">
        {(() => {
          const numbered = inferQuestionNumbers(r.title, r.questions)
          const shared = getSharedPassageBlock({ ...r, questions: numbered })
          const questions = questionsWithoutShared(numbered, shared)
          const fbList = shared
            ? questions.map(() => undefined)
            : passageFallbackPerQuestion(r.passage, questions)
          return (
            <>
              {shared && (
                <SharedPassageBlock
                  block={shared}
                  passageGlossary={r.glossary}
                  viewedWords={viewedWords}
                  onWordLookup={handleWordLookup}
                />
              )}
              {questions.map((q, i) => (
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
              ))}
            </>
          )
        })()}

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <div className="sticky bottom-16 md:bottom-14 z-10 -mx-4 sm:mx-0 px-4 sm:px-0 pb-3">
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-slate-900 text-white text-[15px] font-medium py-3 hover:bg-slate-800 active:bg-slate-950 disabled:opacity-60 shadow-md transition"
          >
            {submitting ? '채점 중…' : '답안 제출'}
          </button>
        </div>
      </form>
    </div>
  )
}
