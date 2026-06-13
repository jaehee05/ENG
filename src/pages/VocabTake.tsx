import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  createVocabAttempt,
  getVocabSet,
  listAttemptsForUser,
} from '../lib/firestore'
import { gradeVocabAnswers } from '../lib/grading'
import type { VocabSet } from '../lib/types'

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

  useEffect(() => {
    if (!id || !profile) return
    Promise.all([getVocabSet(id), listAttemptsForUser(profile.id)])
      .then(([s, atts]) => {
        if (!s) {
          setError('시험지를 찾을 수 없습니다.')
          return
        }
        setSet(s)
        setUsedAttempts(atts.filter((a) => a.type === 'vocab' && a.refId === id).length)
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
    !!set?.maxAttempts && !isAdmin && usedAttempts >= (set.maxAttempts ?? 0)

  const answered = useMemo(() => answers.filter((a) => a.trim()).length, [answers])
  const hasHints = useMemo(
    () => set?.words.some((w) => w.example || w.definitionEn) ?? false,
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
          <h1 className="text-2xl font-semibold text-slate-900">{set.title}</h1>
          <p className="text-sm text-slate-500 mt-1">
            영단어의 뜻을 한국어로 입력하세요. 총 {order.length}문항
            {order.length !== set.words.length && (
              <span className="ml-2 text-brand-700">
                (범위: {(order.length > 0 ? Math.min(...order) : 0) + 1}~
                {(order.length > 0 ? Math.max(...order) : 0) + 1}번)
              </span>
            )}
          </p>
        </div>
        {hasHints && (
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

      <form onSubmit={handleSubmit} className="space-y-2">
        <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
          {order.map((wordIdx, slotIdx) => {
            const w = set.words[wordIdx]
            const showHintRow = showHints && (w.example || w.definitionEn)
            return (
              <li key={slotIdx} className="px-4 py-3 space-y-1.5">
                <div className="grid grid-cols-12 items-center gap-2">
                  <div className="col-span-1 text-sm text-slate-500">{slotIdx + 1}</div>
                  <div className="col-span-5 text-sm font-medium text-slate-900 break-words">
                    {w.en}
                  </div>
                  <div className="col-span-6">
                    <input
                      type="text"
                      value={answers[slotIdx] ?? ''}
                      onChange={(e) => {
                        const next = [...answers]
                        next[slotIdx] = e.target.value
                        setAnswers(next)
                      }}
                      placeholder="한국어 뜻"
                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>
                {showHintRow && (
                  <div className="pl-[calc(8.333%+8px)] space-y-0.5">
                    {w.definitionEn && (
                      <p className="text-xs text-slate-600">
                        <span className="text-slate-400 mr-1">[영영]</span>
                        {w.definitionEn}
                      </p>
                    )}
                    {w.example && (
                      <p className="text-xs text-slate-600 italic">
                        <span className="text-slate-400 mr-1 not-italic">[예문]</span>
                        {w.example}
                      </p>
                    )}
                  </div>
                )}
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
            {submitting ? '채점 중...' : '제출하기'}
          </button>
        </div>
      </form>
    </div>
  )
}
