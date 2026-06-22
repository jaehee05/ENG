import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { createKoreanMock } from '../lib/firestore'
import type { KoreanMockQuestion } from '../lib/types'

/**
 * 답안 일괄 입력 텍스트 파싱.
 * 허용 포맷:
 *   - "3 5 1 2 4 ..." (공백/줄바꿈 구분, 1번부터 순서대로)
 *   - "1:3, 2:5, 3:1" 또는 "1.3 2.5" 등 (번호 명시)
 *   - 1~5 외의 문자는 무시
 */
function parseAnswerKey(raw: string): KoreanMockQuestion[] {
  const lines = raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  // 번호 명시형 (예: "12: 3")
  const explicit: KoreanMockQuestion[] = []
  let allExplicit = true
  for (const line of lines) {
    const m = line.match(/^(\d+)\s*[:.\-]\s*([1-5])\b/)
    if (m) {
      explicit.push({ number: Number.parseInt(m[1], 10), answer: Number.parseInt(m[2], 10) })
    } else {
      allExplicit = false
      break
    }
  }
  if (allExplicit && explicit.length > 0) {
    explicit.sort((a, b) => a.number - b.number)
    return explicit
  }
  // 순서형: 1~5 숫자만 추출
  const digits = raw.match(/[1-5]/g) ?? []
  return digits.map((d, i) => ({ number: i + 1, answer: Number.parseInt(d, 10) }))
}

export function KoreanMockNew() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [rawAnswers, setRawAnswers] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed = parseAnswerKey(rawAnswers)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setError(null)
    if (!title.trim()) {
      setError('제목을 입력하세요.')
      return
    }
    if (parsed.length === 0) {
      setError('답안을 1개 이상 입력하세요.')
      return
    }
    setSubmitting(true)
    try {
      const id = await createKoreanMock({
        title: title.trim(),
        questions: parsed,
        createdBy: profile.id,
        createdByName: profile.displayName,
      })
      navigate(`/admin/korean-mocks/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록 실패')
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          관리
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
          국어 모의고사 등록
        </h1>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            제목
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 2026 6월 모의평가 국어"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            답안 일괄 입력
          </label>
          <textarea
            value={rawAnswers}
            onChange={(e) => setRawAnswers(e.target.value)}
            rows={6}
            placeholder={'예시 1 (순서대로 입력)\n3 5 1 2 4 3 5 1 ...\n\n예시 2 (번호 명시)\n1:3, 2:5, 3:1\n또는\n1. 3\n2. 5\n3. 1'}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            공백·줄바꿈·쉼표로 구분된 1~5 숫자만 답으로 인식합니다. 등록 후 상세에서 개별 수정 가능.
          </p>
        </div>

        {parsed.length > 0 && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-600">
              파싱 결과: 총 {parsed.length}문항
            </p>
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1 text-[11px]">
              {parsed.map((q) => (
                <div
                  key={q.number}
                  className="rounded bg-white border border-slate-200 px-1.5 py-1 text-center"
                >
                  <span className="text-slate-400">{q.number}.</span>{' '}
                  <span className="font-semibold text-slate-900">{q.answer}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          <Link
            to="/admin/korean-mocks"
            className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-50"
          >
            취소
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-slate-900 text-white text-sm font-semibold px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? '등록 중…' : '등록'}
          </button>
        </div>
      </form>
    </div>
  )
}
