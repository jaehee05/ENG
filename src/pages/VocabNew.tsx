import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { createVocabSet } from '../lib/firestore'
import { parseWordList } from '../lib/types'

const PLACEHOLDER = `abandon - 버리다, 포기하다
brilliant - 훌륭한, 빛나는
emerge - 나타나다, 부각되다`

export function VocabNew() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [raw, setRaw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const words = useMemo(() => parseWordList(raw), [raw])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!profile) return
    if (!title.trim()) return setError('제목을 입력하세요.')
    if (words.length === 0) return setError('단어를 1개 이상 입력하세요.')
    setSubmitting(true)
    try {
      const id = await createVocabSet({
        title: title.trim(),
        words,
        createdBy: profile.id,
        createdByName: profile.displayName,
      })
      navigate(`/vocab/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold text-slate-900">새 단어 시험지</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">제목</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 수능 어휘 Day 1"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            단어 목록 <span className="font-normal text-slate-500">(한 줄에 한 단어, <code className="bg-slate-100 px-1 rounded">영어 - 한국어</code> 형식)</span>
          </label>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={14}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="text-xs text-slate-500 mt-1">현재 인식된 단어: {words.length}개</p>
        </div>

        {words.length > 0 && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">미리보기</h3>
            <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">
              {words.map((w, i) => (
                <li key={i} className="flex gap-3">
                  <span className="text-slate-900 font-medium min-w-[120px]">{w.en}</span>
                  <span className="text-slate-600">{w.ko}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-slate-900 text-white text-sm font-medium px-5 py-2 hover:bg-slate-800 disabled:opacity-60"
          >
            {submitting ? '저장 중...' : '저장'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/vocab')}
            className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-5 py-2 hover:bg-slate-100"
          >
            취소
          </button>
        </div>
      </form>
    </div>
  )
}
