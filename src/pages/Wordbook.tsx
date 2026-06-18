import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  addWordbookEntry,
  deleteWordbookEntry,
  listMyWordbook,
} from '../lib/wordbook'
import type { WordLookup } from '../lib/types'

export function Wordbook() {
  const { profile } = useAuth()
  const [words, setWords] = useState<WordLookup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<'recent' | 'count' | 'alpha'>('recent')
  const [newEn, setNewEn] = useState('')
  const [newKo, setNewKo] = useState('')
  const [adding, setAdding] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  async function reload() {
    if (!profile) return
    const list = await listMyWordbook(profile.id)
    setWords(list)
  }

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

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    const en = newEn.trim()
    const ko = newKo.trim()
    if (!en || !ko) {
      setError('영단어와 뜻을 모두 입력하세요.')
      return
    }
    setError(null)
    setAdding(true)
    try {
      await addWordbookEntry({ uid: profile.id, en, ko })
      setNewEn('')
      setNewKo('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : '추가에 실패했습니다.')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(en: string) {
    if (!profile) return
    if (!window.confirm(`"${en}"을(를) 단어장에서 삭제하시겠습니까?`)) return
    try {
      await deleteWordbookEntry(profile.id, en)
      setWords((prev) => prev.filter((w) => w.en !== en))
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제에 실패했습니다.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">내 단어장</h1>
          {!loading && words.length > 0 && (
            <p className="text-xs text-slate-500 mt-1">총 {words.length}개</p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-100"
          >
            {showAdd ? '닫기' : '+ 단어 추가'}
          </button>
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
      </div>

      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="rounded-lg border border-brand-200 bg-brand-50/40 p-4 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end"
        >
          <div>
            <label className="block text-xs text-slate-600 mb-1">영단어</label>
            <input
              type="text"
              value={newEn}
              onChange={(e) => setNewEn(e.target.value)}
              placeholder="abandon"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">한국어 뜻</label>
            <input
              type="text"
              value={newKo}
              onChange={(e) => setNewKo(e.target.value)}
              placeholder="버리다, 포기하다"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <button
            type="submit"
            disabled={adding}
            className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-50"
          >
            {adding ? '추가 중...' : '추가'}
          </button>
        </form>
      )}

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
            className="relative rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-300 hover:shadow-md transition"
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-semibold text-slate-900 truncate">{w.en}</p>
                <p className="text-sm text-slate-600 mt-0.5 truncate">{w.ko}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium px-2 py-1 whitespace-nowrap">
                  {w.count}회
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(w.en)}
                  className="text-xs text-slate-400 hover:text-red-600 px-1.5 py-0.5"
                  aria-label="삭제"
                >
                  ×
                </button>
              </div>
            </div>
            {w.readings.length > 0 && (
              <p
                className="text-xs text-slate-500 mt-2 truncate"
                title={w.readings.map((r) => r.title).join(', ')}
              >
                출처: {w.readings.map((r) => r.title).join(', ')}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
