import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { formatDate, listVocabSets } from '../lib/firestore'
import type { VocabSet } from '../lib/types'

export function VocabList() {
  const { profile } = useAuth()
  const [sets, setSets] = useState<VocabSet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listVocabSets()
      .then(setSets)
      .catch((e) => setError(e.message ?? '목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">단어 시험지</h1>
          <p className="text-sm text-slate-500 mt-1">단어셋을 골라 시험을 시작하세요.</p>
        </div>
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
            className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400 transition"
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
          </Link>
        ))}
      </div>
    </div>
  )
}
