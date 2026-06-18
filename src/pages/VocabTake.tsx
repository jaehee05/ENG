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
        <h1 className="text-2xl font-semibold text-slate-900">{set.title}</h1>
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
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {set.title}
            <span
              className={`ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold align-middle ${
                isPractice
                  ? 'bg-slate-100 text-slate-600'
                  : 'bg-brand-100 text-brand-700'
              }`}
            >
              {isPractice ? '연습' : '시험'}
            </span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            영단어의 뜻을 한국어로 입력하세요. 총 {order.length}문항
            {order.length !== set.words.length && (
              <span className="ml-2 text-brand-700">
                (범위: {(order.length > 0 ? Math.min(...order) : 0) + 1}~
                {(order.length > 0 ? Math.max(...order) : 0) + 1}번)
              </span>
            )}
            {isPractice && (
              <span className="ml-2 text-slate-500">
                · 연습 응시는 횟수에 포함되지 않습니다.
              </span>
            )}
          </p>
        </div>
        {hasAnyHint && (
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showHints}
              onChange={(e) => setShowHints(e.target.checked)}
              className="accent-brand-600"
            />
            예문·영영 힌트 보기
          </label>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <ul className="space-y-4">
          {order.map((wordIdx, slotIdx) => {
            const w = set.words[wordIdx]
            const hints = firstSenseHints(w)
            return (
              <li
                key={slotIdx}
                className="rounded-lg border border-slate-200 bg-white overflow-hidden"
              >
                <div className="px-5 pt-4 pb-2 border-b border-slate-100">
                  <p className="text-xs font-mono text-slate-400 tracking-wider">
                    {String(slotIdx + 1).padStart(4, '0')}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 px-5 py-4">
                  <div className="sm:col-span-3">
                    <p className="text-2xl font-bold text-slate-900 leading-tight">
                      {w.en}
                    </p>
                    {w.ipa && (
                      <p className="text-sm text-slate-500 mt-1">[{w.ipa}]</p>
                    )}
                  </div>
                  <div className="sm:col-span-9 space-y-2">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      {hints.pos && (
                        <span className="text-sm font-medium text-slate-700">
                          {hints.pos}
                        </span>
                      )}
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-900 text-white text-[10px] font-bold align-middle">
                        1
                      </span>
                      <input
                        type="text"
                        value={answers[slotIdx] ?? ''}
                        onChange={(e) => {
                          const next = [...answers]
                          next[slotIdx] = e.target.value
                          setAnswers(next)
                        }}
                        placeholder="한국어 뜻"
                        className="flex-1 min-w-[160px] rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    {showHints && (
                      <>
                        {(hints.definitionEn ||
                          (hints.synonyms && hints.synonyms.length > 0)) && (
                          <p className="text-sm text-slate-600 leading-relaxed">
                            {hints.definitionEn && (
                              <span>[{hints.definitionEn}]</span>
                            )}
                            {hints.synonyms && hints.synonyms.length > 0 && (
                              <span className="text-slate-500">
                                {hints.definitionEn ? ' ' : ''}={' '}
                                {hints.synonyms.join(', ')}
                              </span>
                            )}
                          </p>
                        )}
                        {hints.example && (
                          <div className="rounded-md bg-slate-100 px-4 py-3">
                            <p className="text-sm leading-relaxed text-slate-800">
                              {renderExampleWithBoldWord(hints.example, w.en)}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>

        <div className="sticky bottom-0 bg-white/90 backdrop-blur-sm rounded-b-lg py-3 px-4 border-t border-slate-200 flex items-center justify-between">
          <p className="text-sm text-slate-600">
            작성 {answered} / {order.length}
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand-600 text-white text-sm font-medium px-5 py-2 hover:bg-brand-700 transition disabled:opacity-60"
          >
            {submitting
              ? '채점 중...'
              : isPractice
                ? '연습 제출'
                : '제출하기'}
          </button>
        </div>
      </form>
    </div>
  )
}
