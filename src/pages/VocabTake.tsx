import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { createVocabAttempt, getVocabSet } from '../lib/firestore'
import { isCorrectKo } from '../lib/types'
import type { VocabSet } from '../lib/types'

export function VocabTake() {
  const { id } = useParams<{ id: string }>()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [set, setSet] = useState<VocabSet | null>(null)
  const [order, setOrder] = useState<number[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getVocabSet(id)
      .then((s) => {
        if (!s) {
          setError('시험지를 찾을 수 없습니다.')
          return
        }
        setSet(s)
        const idx = s.words.map((_, i) => i)
        for (let i = idx.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[idx[i], idx[j]] = [idx[j], idx[i]]
        }
        setOrder(idx)
        setAnswers(new Array(s.words.length).fill(''))
      })
      .catch((e) => setError(e.message ?? '불러오기 실패'))
      .finally(() => setLoading(false))
  }, [id])

  const answered = useMemo(() => answers.filter((a) => a.trim()).length, [answers])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!set || !user || !profile) return
    setSubmitting(true)
    try {
      const results = order.map((wordIdx, slotIdx) => {
        const w = set.words[wordIdx]
        const ua = answers[slotIdx] ?? ''
        return {
          en: w.en,
          ko: w.ko,
          userAnswer: ua,
          correct: isCorrectKo(ua, w.ko),
        }
      })
      const attemptId = await createVocabAttempt({
        studentUid: user.uid,
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

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{set.title}</h1>
        <p className="text-sm text-slate-500 mt-1">
          영단어의 뜻을 한국어로 입력하세요. 총 {set.words.length}문항
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
          <div className="grid grid-cols-12 px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-50 border-b border-slate-200">
            <div className="col-span-1">#</div>
            <div className="col-span-5">영단어</div>
            <div className="col-span-6">뜻</div>
          </div>
          {order.map((wordIdx, slotIdx) => {
            const w = set.words[wordIdx]
            return (
              <div
                key={slotIdx}
                className="grid grid-cols-12 px-4 py-2 items-center border-b border-slate-100 last:border-b-0"
              >
                <div className="col-span-1 text-sm text-slate-500">{slotIdx + 1}</div>
                <div className="col-span-5 text-sm font-medium text-slate-900">{w.en}</div>
                <div className="col-span-6">
                  <input
                    type="text"
                    value={answers[slotIdx] ?? ''}
                    onChange={(e) => {
                      const next = [...answers]
                      next[slotIdx] = e.target.value
                      setAnswers(next)
                    }}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>
            )
          })}
        </div>

        <div className="sticky bottom-0 bg-slate-50 -mx-4 px-4 py-3 border-t border-slate-200 flex items-center justify-between">
          <p className="text-sm text-slate-600">
            작성 {answered} / {set.words.length}
          </p>
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
