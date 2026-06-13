import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { listMyWordbook } from '../lib/wordbook'
import type { WordLookup } from '../lib/types'

export function Wordbook() {
  const { profile } = useAuth()
  const [words, setWords] = useState<WordLookup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<'recent' | 'count' | 'alpha'>('recent')

  useEffect(() => {
    if (!profile) return
    listMyWordbook(profile.id)
      .then(setWords)
      .catch((e) => setError(e.message ?? '단어장을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [profile])

  const sorted = [...words].sort((a, b) => {
    if (sortKey === 'count') return b.count - a.count
    if (sortKey === 'alpha') return a.en.localeCompare(b.en)
    const at = a.lastSeenAt?.toMillis() ?? 0
    const bt = b.lastSeenAt?.toMillis() ?? 0
    return bt - at
  })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">내 단어장</h1>
          {!loading && words.length > 0 && (
            <p className="text-xs text-slate-500 mt-1">총 {words.length}개</p>
          )}
        </div>
        <Link
          to="/wordbook/take"
          className={`rounded-md text-sm font-medium px-4 py-2 transition ${
            words.length >= 1
              ? 'bg-brand-600 text-white hover:bg-brand-700'
              : 'bg-slate-200 text-slate-400 pointer-events-none'
          }`}
        >
          단어장으로 시험 보기
        </Link>
      </div>

      {!loading && words.length > 0 && (
        <div className="flex items-center gap-1 text-xs">
          <span className="text-slate-500 mr-1">정렬</span>
          {(['recent', 'count', 'alpha'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setSortKey(k)}
              className={`px-3 py-1.5 rounded-full transition ${
                sortKey === k
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {k === 'recent' ? '최근 본 순' : k === 'count' ? '많이 본 순' : '알파벳'}
            </button>
          ))}
        </div>
      )}

      {loading && <p className="text-slate-500 text-sm">불러오는 중...</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {!loading && words.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-600 font-medium">아직 단어가 없습니다.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sorted.map((w) => (
          <div
            key={w.en}
            className="rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-300 hover:shadow-md transition"
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-semibold text-slate-900 truncate">{w.en}</p>
                <p className="text-sm text-slate-600 mt-0.5 truncate">{w.ko}</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium px-2 py-1 whitespace-nowrap">
                {w.count}회
              </span>
            </div>
            {w.readings.length > 0 && (
              <p className="text-xs text-slate-500 mt-2 truncate" title={w.readings.map((r) => r.title).join(', ')}>
                출처: {w.readings.map((r) => r.title).join(', ')}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
