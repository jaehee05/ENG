import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getAttempt, getKoreanMock } from '../lib/firestore'
import {
  MOCK_SUBJECT_LABEL,
  type Attempt,
  type KoreanMock,
  type MockSubject,
} from '../lib/types'

const SUBJECT_BADGE_CLASS: Record<MockSubject, string> = {
  korean: 'bg-rose-50 text-rose-700 border-rose-200',
  english: 'bg-sky-50 text-sky-700 border-sky-200',
}

export function KoreanMockResult() {
  const { id, attemptId } = useParams<{ id: string; attemptId: string }>()
  const navigate = useNavigate()
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [mock, setMock] = useState<KoreanMock | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!attemptId) return
    getAttempt(attemptId)
      .then((a) => {
        if (!a) setError('결과를 찾을 수 없습니다.')
        else setAttempt(a)
      })
      .catch((e) => setError(e.message ?? '불러오기 실패'))
      .finally(() => setLoading(false))
  }, [attemptId])

  useEffect(() => {
    if (!id) return
    // 해설 PDF 노출용으로 모의고사 정보를 함께 조회. 실패해도 결과 화면은 유지.
    getKoreanMock(id)
      .then(setMock)
      .catch(() => {})
  }, [id])

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중…</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!attempt || !attempt.koreanMockResults) return null

  const results = attempt.koreanMockResults
  const ratio = attempt.total > 0 ? Math.round((attempt.correct / attempt.total) * 100) : 0
  const subj: MockSubject = attempt.mockSubject ?? 'korean'

  return (
    <div className="space-y-5 max-w-3xl">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          채점 결과
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-block rounded-full text-[11px] font-medium px-2 py-0.5 border ${SUBJECT_BADGE_CLASS[subj]}`}
          >
            {MOCK_SUBJECT_LABEL[subj]}
          </span>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
            {attempt.refTitle}
          </h1>
        </div>
        <p className="text-xs text-slate-500 mt-1">{attempt.studentName}</p>
      </header>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] text-slate-500 mb-0.5">정답률</p>
            <p className="text-3xl font-semibold text-slate-900 tracking-tight">
              {ratio}%
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-slate-500 mb-0.5">맞은 문항</p>
            <p className="text-lg font-semibold text-slate-900">
              {attempt.correct}
              <span className="text-sm text-slate-400 font-normal">
                {' '}/ {attempt.total}
              </span>
            </p>
          </div>
        </div>
        <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-brand-500"
            style={{ width: `${ratio}%` }}
          />
        </div>
        {mock?.explanationPdfUrl && (
          <button
            type="button"
            onClick={() => navigate(`/korean-mocks/${id}/explanation`)}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-brand-600 text-white text-sm font-semibold px-4 py-2 hover:bg-brand-700 transition"
          >
            <span aria-hidden>📄</span> 해설 보기
          </button>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-semibold w-16">번호</th>
              <th className="px-4 py-2 text-center font-semibold">제출 답</th>
              <th className="px-4 py-2 text-center font-semibold">정답</th>
              <th className="px-4 py-2 text-center font-semibold w-16">결과</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {results.map((r, i) => {
              const unanswered = r.userAnswer === 0
              return (
                <tr key={i} className={r.correct ? '' : 'bg-red-50/40'}>
                  <td className="px-4 py-2 font-medium text-slate-700">
                    {r.number}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {unanswered ? (
                      <span className="text-slate-400 text-xs">미응답</span>
                    ) : (
                      <span
                        className={`inline-block w-7 h-7 leading-7 rounded-full text-sm font-semibold ${
                          r.correct
                            ? 'bg-brand-100 text-brand-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {r.userAnswer}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className="inline-block w-7 h-7 leading-7 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
                      {r.correctAnswer}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    {r.correct ? (
                      <span className="text-brand-700 font-semibold">○</span>
                    ) : (
                      <span className="text-red-600 font-semibold">✗</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <Link
          to={`/korean-mocks/${id}`}
          className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-100"
        >
          모의고사로
        </Link>
        <Link
          to="/korean-mocks"
          className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-100"
        >
          목록으로
        </Link>
      </div>
    </div>
  )
}
