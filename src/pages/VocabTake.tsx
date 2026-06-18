import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  createVocabAttempt,
  getVocabSet,
  listAttemptsForUser,
} from '../lib/firestore'
import { gradeVocabAnswers } from '../lib/grading'
import { highlightHead } from '../lib/highlightWord'
import type { VocabSet, WordEntry } from '../lib/types'

const renderExampleWithBoldWord = highlightHead

interface Hints {
  pos?: string
  definitionEn?: string
  synonyms?: string[]
  example?: string
}

function firstSenseHints(w: WordEntry): Hints {
  const first = w.senses?.[0]
  if (first) {
    return {
      pos: first.pos ?? w.pos,
      definitionEn: first.definitionEn ?? w.definitionEn,
      synonyms: first.synonyms?.length ? first.synonyms : w.synonyms,
      example: first.examples?.[0]?.en ?? w.example,
    }
  }
  return {
    pos: w.pos,
    definitionEn: w.definitionEn,
    synonyms: w.synonyms,
    example: w.example,
  }
}

export function VocabTake() {
  const { id } = useParams<{ id: string }>()
  const [search] = useSearchParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isAdmin = profile?.role === 'admin'
  const [set, setSet] = useState<VocabSet | null>(null)
  const [usedAttempts, setUsedAttempts] = useState(0)
  const [order, setOrder] = useState<number[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHints, setShowHints] = useState(true)

  const fromRaw = Number.parseInt(search.get('from') ?? '', 10)
  const toRaw = Number.parseInt(search.get('to') ?? '', 10)
  const isPractice = search.get('mode') === 'practice'

  useEffect(() => {
    if (!id || !profile) return
    Promise.all([getVocabSet(id), listAttemptsForUser(profile.id)])
      .then(([s, atts]) => {
        if (!s) {
          setError('시험지를 찾을 수 없습니다.')
          return
        }
        setSet(s)
        setUsedAttempts(
          atts.filter((a) => a.type === 'vocab' && a.refId === id && !a.practice)
            .length,
        )
        const total = s.words.length
        const start =
          Number.isFinite(fromRaw) && fromRaw >= 1 && fromRaw <= total ? fromRaw : 1
        const endCandidate =
          Number.isFinite(toRaw) && toRaw >= start && toRaw <= total ? toRaw : total
        const idx: number[] = []
        for (let i = start - 1; i <= endCandidate - 1; i++) idx.push(i)
        for (let i = idx.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[idx[i], idx[j]] = [idx[j], idx[i]]
        }
        setOrder(idx)
        setAnswers(new Array(idx.length).fill(''))
      })
      .catch((e) => setError(e.message ?? '불러오기 실패'))
      .finally(() => setLoading(false))
  }, [id, profile, fromRaw, toRaw])

  const blocked =
    !isPractice &&
    !!set?.maxAttempts &&
    !isAdmin &&
    usedAttempts >= (set.maxAttempts ?? 0)

  const answered = useMemo(() => answers.filter((a) => a.trim()).length, [answers])
  const hasAnyHint = useMemo(
    () =>
      set?.words.some(
        (w) =>
          w.example ||
          w.definitionEn ||
          (w.synonyms && w.synonyms.length > 0) ||
          (w.senses?.[0] &&
            (w.senses[0].definitionEn ||
              (w.senses[0].synonyms && w.senses[0].synonyms.length > 0) ||
              w.senses[0].examples?.[0]?.en)),
      ) ?? false,
    [set],
  )

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!set || !profile) return
    setSubmitting(true)
    try {
      const inputs = order.map((wordIdx, slotIdx) => {
        const w = set.words[wordIdx]
        return { en: w.en, ko: w.ko, userAnswer: answers[slotIdx] ?? '' }
      })
      const results = await gradeVocabAnswers(inputs)
      const attemptId = await createVocabAttempt({
        studentUid: profile.id,
        studentName: profile.displayName,
        refId: set.id,
        refTitle: set.title,
        vocabResults: results,
        practice: isPractice,
      })
      navigate(`/vocab/${set.id}/result/${attemptId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '제출에 실패했습니다.')
      setSubmitting(false)
    }
  }

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!set) return null

  if (blocked) {
    return (
      <div className="space-y-4 max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          단어 시험
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">{set.title}</h1>
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          이 시험지의 응시 횟수 제한({set.maxAttempts}회)을 모두 사용했습니다.
          현재 응시: {usedAttempts}회.
        </div>
        <Link
          to={`/vocab/${set.id}`}
          className="inline-block rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-100"
        >
          시험지 상세로 돌아가기
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              단어 시험
            </p>
            <span
              className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                isPractice
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-brand-50 text-brand-700 border border-brand-200'
              }`}
            >
              {isPractice ? '연습' : '시험'}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
            {set.title}
          </h1>
          <p className="text-xs text-slate-500 mt-1.5">
            총 {order.length}문항
            {order.length !== set.words.length &&
              ` · ${(order.length > 0 ? Math.min(...order) : 0) + 1}~${(order.length > 0 ? Math.max(...order) : 0) + 1}번`}
            {isPractice && ' · 횟수 미차감'}
          </p>
        </div>
        {hasAnyHint && (
          <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showHints}
              onChange={(e) => setShowHints(e.target.checked)}
              className="accent-brand-600 h-3.5 w-3.5"
            />
            힌트
          </label>
        )}
      </header>

      <form onSubmit={handleSubmit} className="space-y-3">
        <ul className="space-y-2">
          {order.map((wordIdx, slotIdx) => {
            const w = set.words[wordIdx]
            const hints = firstSenseHints(w)
            return (
              <li
                key={slotIdx}
                className="rounded-lg border border-slate-200 bg-white p-4 space-y-2.5"
              >
                <div className="flex items-baseline gap-2.5">
                  <span className="text-[10px] font-mono text-slate-400 mt-0.5 shrink-0">
                    {String(slotIdx + 1).padStart(2, '0')}
                  </span>
                  <p className="text-[20px] font-bold text-slate-900 leading-tight">
                    {w.en}
                  </p>
                  {w.ipa && (
                    <p className="text-xs text-slate-500">[{w.ipa}]</p>
                  )}
                  {hints.pos && (
                    <span className="text-[11px] text-slate-500 italic">
                      {hints.pos}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={answers[slotIdx] ?? ''}
                  onChange={(e) => {
                    const next = [...answers]
                    next[slotIdx] = e.target.value
                    setAnswers(next)
                  }}
                  placeholder="한국어 뜻"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[16px] text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-slate-400 focus:outline-none transition"
                />
                {showHints &&
                  (hints.definitionEn ||
                    (hints.synonyms && hints.synonyms.length > 0) ||
                    hints.example) && (
                    <div className="space-y-1.5 text-[13px] leading-relaxed">
                      {(hints.definitionEn ||
                        (hints.synonyms && hints.synonyms.length > 0)) && (
                        <p className="text-slate-600">
                          {hints.definitionEn && (
                            <span>[{hints.definitionEn}]</span>
                          )}
                          {hints.synonyms && hints.synonyms.length > 0 && (
                            <span className="text-slate-500">
                              {hints.definitionEn ? ' · ' : ''}≈{' '}
                              {hints.synonyms.join(', ')}
                            </span>
                          )}
                        </p>
                      )}
                      {hints.example && (
                        <p className="rounded-md bg-slate-100/70 px-3 py-2 text-slate-700">
                          {renderExampleWithBoldWord(hints.example, w.en)}
                        </p>
                      )}
                    </div>
                  )}
              </li>
            )
          })}
        </ul>

        <div className="sticky bottom-0 z-10 -mx-4 sm:mx-0 px-4 sm:px-0 pb-3 pt-2 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent">
          <div className="flex items-center justify-between rounded-lg bg-slate-900 text-white px-4 py-2.5 shadow-lg">
            <span className="text-xs text-slate-300">
              작성 {answered} / {order.length}
            </span>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-white text-slate-900 text-sm font-medium px-4 py-1.5 hover:bg-slate-100 disabled:opacity-60"
            >
              {submitting
                ? '채점 중…'
                : isPractice
                  ? '연습 제출'
                  : '제출'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
