import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { formatDate, listReadings } from '../lib/firestore'
import type { Reading } from '../lib/types'

export function ReadingList() {
  const { profile } = useAuth()
  const [items, setItems] = useState<Reading[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listReadings()
      .then(setItems)
      .catch((e) => setError(e.message ?? '목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">지문 문제풀이</h1>
        {profile?.role === 'admin' && (
          <div className="flex gap-2 flex-wrap">
            <Link
              to="/reading/import"
              className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-100"
            >
              PDF로 가져오기
            </Link>
            <Link
              to="/reading/new"
              className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800"
            >
              새 지문
            </Link>
          </div>
        )}
      </div>

      {loading && <p className="text-slate-500 text-sm">불러오는 중...</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {!loading && items.length === 0 && (
        <p className="text-slate-500 text-sm">등록된 지문이 없습니다.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map((r) => (
          <Link
            key={r.id}
            to={`/reading/${r.id}`}
            className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-300 hover:shadow-md transition"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900 truncate">{r.title}</h2>
              <span className="text-xs text-slate-500 whitespace-nowrap">
                {formatDate(r.createdAt)}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {r.questions.length}문항 · 단어 {r.glossary.length}개 · {r.createdByName}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
