import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  applyReadingOrder,
  formatDate,
  getReadingOrder,
  listReadings,
  setReadingOrder,
} from '../lib/firestore'
import type { Reading } from '../lib/types'

export function ReadingList() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [items, setItems] = useState<Reading[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reorderMode, setReorderMode] = useState(false)
  const [savingOrder, setSavingOrder] = useState(false)

  useEffect(() => {
    Promise.all([listReadings(), getReadingOrder()])
      .then(([readings, order]) => {
        setItems(applyReadingOrder(readings, order))
      })
      .catch((e) => setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  async function persist(next: Reading[]) {
    setItems(next)
    setSavingOrder(true)
    try {
      await setReadingOrder(next.map((x) => x.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : '순서 저장에 실패했습니다.')
    } finally {
      setSavingOrder(false)
    }
  }

  function move(idx: number, delta: number) {
    const target = idx + delta
    if (target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    void persist(next)
  }

  function moveTop(idx: number) {
    if (idx <= 0) return
    const next = [...items]
    const [picked] = next.splice(idx, 1)
    next.unshift(picked)
    void persist(next)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold text-slate-900">지문 문제풀이</h1>
        {isAdmin && (
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setReorderMode((v) => !v)}
              className={`rounded-md text-sm font-medium px-4 py-2 transition ${
                reorderMode
                  ? 'bg-brand-600 text-white hover:bg-brand-700'
                  : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {reorderMode ? '정렬 완료' : '순서 정렬'}
            </button>
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

      {reorderMode && (
        <p className="text-xs text-slate-500">
          위/아래 버튼으로 순서를 바꾸면 자동 저장됩니다.
          {savingOrder && <span className="ml-2 text-brand-700">저장 중...</span>}
        </p>
      )}

      {loading && <p className="text-slate-500 text-sm">불러오는 중...</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {!loading && items.length === 0 && (
        <p className="text-slate-500 text-sm">등록된 지문이 없습니다.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map((r, i) =>
          reorderMode && isAdmin ? (
            <div
              key={r.id}
              className="rounded-lg border border-slate-200 bg-white p-4 flex items-start gap-3"
            >
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="h-7 w-7 rounded border border-slate-300 text-slate-600 text-sm hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white"
                  aria-label="위로"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === items.length - 1}
                  className="h-7 w-7 rounded border border-slate-300 text-slate-600 text-sm hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white"
                  aria-label="아래로"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => moveTop(i)}
                  disabled={i === 0}
                  className="h-7 w-7 rounded border border-slate-300 text-slate-600 text-[10px] hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white"
                  aria-label="맨 위로"
                >
                  TOP
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-base font-semibold text-slate-900 truncate">{r.title}</h2>
                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    {formatDate(r.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  {r.questions.length}문항 · 단어 {r.glossary.length}개 · {r.createdByName}
                </p>
              </div>
            </div>
          ) : (
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
          ),
        )}
      </div>
    </div>
  )
}
