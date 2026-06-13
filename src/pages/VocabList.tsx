import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { deleteVocabSet, formatDate, listVocabSets } from '../lib/firestore'
import type { VocabSet } from '../lib/types'

export function VocabList() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [sets, setSets] = useState<VocabSet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    listVocabSets()
      .then(setSets)
      .catch((e) => setError(e.message ?? '목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  async function handleDelete(e: React.MouseEvent, s: VocabSet) {
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm(`"${s.title}" 시험지를 삭제하시겠습니까?`)) return
    setDeletingId(s.id)
    try {
      await deleteVocabSet(s.id)
      setSets((prev) => prev.filter((x) => x.id !== s.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">단어 시험지</h1>
        {profile?.role === 'admin' && (
          <Link
            to="/vocab/new"
            className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800"
          >
            새 시험지
          </Link>
        )}
      </div>

      {loading && <p className="text-slate-500 text-sm">불러오는 중...</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {!loading && sets.length === 0 && (
        <p className="text-slate-500 text-sm">등록된 시험지가 없습니다.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sets.map((s) => (
          <Link
            key={s.id}
            to={`/vocab/${s.id}`}
            className="relative block rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-300 hover:shadow-md transition"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900 truncate">{s.title}</h2>
              <span className="text-xs text-slate-500 whitespace-nowrap">
                {formatDate(s.createdAt)}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {s.words.length}단어 · {s.createdByName}
            </p>
            {isAdmin && (
              <button
                type="button"
                onClick={(e) => handleDelete(e, s)}
                disabled={deletingId === s.id}
                className="absolute top-2 right-2 text-xs text-slate-400 hover:text-red-600 px-2 py-1 rounded disabled:opacity-50"
                aria-label="삭제"
              >
                {deletingId === s.id ? '삭제 중...' : '삭제'}
              </button>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
