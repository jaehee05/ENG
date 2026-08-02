import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { useBackNav } from '../contexts/useBackNav'
import { createWordbookAttempt } from '../lib/firestore'
import { gradeVocabAnswers } from '../lib/grading'
import { listMyWordbook } from '../lib/wordbook'
import type { WordEntry } from '../lib/types'

export function WordbookTake() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [words, setWords] = useState<WordEntry[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    listMyWordbook(profile.id)
      .then((all) => {
        const ws: WordEntry[] = all.map((w) => ({ en: w.en, ko: w.ko }))
        for (let i = ws.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[ws[i], ws[j]] = [ws[j], ws[i]]
        }
        setWords(ws)
        setAnswers(new Array(ws.length).fill(''))
      })
      .catch((e) => setError(e.message ?? '단어장을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [profile])

  const answered = useMemo(() => answers.filter((a) => a.trim()).length, [answers])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSubmitting(true)
    try {
      const inputs = words.map((w, i) => ({
        en: w.en,
        ko: w.ko,
        userAnswer: answers[i] ?? '',
      }))
      const results = await gradeVocabAnswers(inputs)
      const attemptId = await createWordbookAttempt({
        studentUid: profile.id,
        studentName: profile.displayName,
        vocabResults: results,
      })
      // replace — 제출한 시험을 기록에서 지운다 (VocabTake 와 같은 이유).
      navigate(`/wordbook/result/${attemptId}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '제출에 실패했습니다.')
      setSubmitting(false)
    }
  }

  // 단어 시험지 응시와 같은 이유 — 쓴 답이 있으면 나가기 전에 한 번 묻는다.
  useBackNav({
    confirmMessage:
      answered > 0
        ? '지금 나가면 입력한 답이 저장되지 않습니다. 나갈까요?'
        : undefined,
  })

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (words.length === 0) {
    return (
      <div className="space-y-4">
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            단어 시험
          </p>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">내 단어장 시험</h1>
        </header>
        <p className="text-slate-500 text-sm">시험 볼 단어가 없습니다.</p>
      </div>
    )
  }

  return (
    // 단어 시험지와 같은 이유로 글자를 못 집게 한다 (사전 띄우기 방지).
    <div className="space-y-5 max-w-3xl mx-auto exam-noselect">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          단어 시험
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">내 단어장 시험</h1>
        <p className="text-xs text-slate-500 mt-1">{words.length}문항</p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="grid grid-cols-12 px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-50 border-b border-slate-200">
            <div className="col-span-1">#</div>
            <div className="col-span-5">영단어</div>
            <div className="col-span-6">뜻</div>
          </div>
          {words.map((w, i) => (
            <div
              key={i}
              className="grid grid-cols-12 px-4 py-2 items-center border-b border-slate-100 last:border-b-0"
            >
              <div className="col-span-1 text-sm text-slate-500">{i + 1}</div>
              <div className="col-span-5 text-sm font-medium text-slate-900">{w.en}</div>
              <div className="col-span-6">
                <input
                  type="text"
                  value={answers[i] ?? ''}
                  onChange={(e) => {
                    const next = [...answers]
                    next[i] = e.target.value
                    setAnswers(next)
                  }}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 bg-white/90 backdrop-blur-sm rounded-b-lg py-3 px-4 border-t border-slate-200 flex items-center justify-between">
          <p className="text-sm text-slate-600">
            작성 {answered} / {words.length}
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
