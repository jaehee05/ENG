import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  createKoreanMockAttempt,
  getKoreanMock,
} from '../lib/firestore'
import {
  getMockSubject,
  MOCK_SUBJECT_LABEL,
  type KoreanMock,
  type KoreanMockResult,
  type MockSubject,
} from '../lib/types'

const SUBJECT_BADGE_CLASS: Record<MockSubject, string> = {
  korean: 'bg-rose-50 text-rose-700 border-rose-200',
  english: 'bg-sky-50 text-sky-700 border-sky-200',
}

export function KoreanMockTake() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [mock, setMock] = useState<KoreanMock | null>(null)
  const [answers, setAnswers] = useState<number[]>([]) // 0 = unanswered
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!id) return
    getKoreanMock(id)
      .then((m) => {
        if (!m) {
          setError('모의고사를 찾을 수 없습니다.')
          return
        }
        setMock(m)
        setAnswers(new Array(m.questions.length).fill(0))
      })
      .catch((e) => setError(e.message ?? '불러오기 실패'))
      .finally(() => setLoading(false))
  }, [id])

  function pick(idx: number, choice: number) {
    setAnswers((prev) => {
      const next = [...prev]
      // 같은 답 다시 누르면 해제
      next[idx] = next[idx] === choice ? 0 : choice
      return next
    })
  }

  async function handleSubmit() {
    if (!mock || !profile) return
    const unanswered = answers.filter((a) => a === 0).length
    if (unanswered > 0) {
      if (
        !window.confirm(
          `${unanswered}문항이 미응답입니다. 제출할까요? (미응답은 오답 처리)`,
        )
      )
        return
    } else if (!window.confirm('제출하시겠습니까?')) {
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const results: KoreanMockResult[] = mock.questions.map((q, i) => {
        const userAnswer = answers[i] ?? 0
        return {
          number: q.number,
          userAnswer,
          correctAnswer: q.answer,
          correct: userAnswer > 0 && userAnswer === q.answer,
        }
      })
      const attemptId = await createKoreanMockAttempt({
        studentUid: profile.id,
        studentName: profile.displayName,
        refId: mock.id,
        refTitle: mock.title,
        koreanMockResults: results,
        mockSubject: getMockSubject(mock),
      })
      navigate(`/korean-mocks/${mock.id}/result/${attemptId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '제출 실패')
      setSubmitting(false)
    }
  }

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중…</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!mock) return null

  const answeredCount = answers.filter((a) => a > 0).length
  const subj = getMockSubject(mock)

  return (
    <div className="space-y-5 max-w-3xl">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          OMR 답안 입력
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-block rounded-full text-[11px] font-medium px-2 py-0.5 border ${SUBJECT_BADGE_CLASS[subj]}`}
          >
            {MOCK_SUBJECT_LABEL[subj]}
          </span>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
            {mock.title}
          </h1>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          총 {mock.questions.length}문항. 같은 답을 다시 누르면 해제됩니다.
        </p>
      </header>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {mock.questions.map((q, i) => {
            const sel = answers[i] ?? 0
            return (
              <div
                key={i}
                className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50/40 px-3 py-2"
              >
                <span className="text-sm font-semibold text-slate-700 w-10 shrink-0">
                  {q.number}.
                </span>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => pick(i, n)}
                      className={`w-9 h-9 rounded-full text-sm font-semibold border transition ${
                        sel === n
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="sticky bottom-0 -mx-4 sm:mx-0 px-4 sm:px-0 pb-3 pt-2 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent">
        <div className="flex items-center justify-between rounded-lg bg-slate-900 text-white px-4 py-2.5 shadow-lg">
          <span className="text-xs text-slate-300">
            응답 {answeredCount} / {mock.questions.length}
          </span>
          <div className="flex items-center gap-2">
            <Link
              to={`/korean-mocks/${mock.id}`}
              className="text-xs text-slate-300 hover:text-white"
            >
              취소
            </Link>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-md bg-white text-slate-900 text-sm font-medium px-4 py-1.5 hover:bg-slate-100 disabled:opacity-60"
            >
              {submitting ? '채점 중…' : '제출'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
