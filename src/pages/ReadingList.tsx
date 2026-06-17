import { useEffect, useMemo, useState } from 'react'
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
import { translatePassage } from '../lib/api'
import { updateReadingPassageKo } from '../lib/firestore'
import { extractTextFromHtml } from '../lib/htmlText'

const TITLE_RE = /^(.+?)\s+(\d+)(?:-(\d+))?\s*(?:번|문제)?\s*$/

interface GroupedItem {
  reading: Reading
  number: number | null
  /** 칩에 표시할 라벨: "8" 또는 "41-42". 카테고리에 못 끼면 null. */
  label: string | null
}

interface Group {
  category: string
  items: GroupedItem[]
}

function buildGroups(readings: Reading[]): Group[] {
  const map = new Map<string, GroupedItem[]>()
  for (const r of readings) {
    const m = TITLE_RE.exec(r.title.trim())
    const category = m ? m[1].trim() : '기타'
    const number = m ? Number.parseInt(m[2], 10) : null
    const label = m ? (m[3] ? `${m[2]}-${m[3]}` : m[2]) : null
    if (!map.has(category)) map.set(category, [])
    map.get(category)!.push({ reading: r, number, label })
  }
  const groups: Group[] = []
  for (const [category, items] of map) {
    items.sort((a, b) => {
      if (a.number !== null && b.number !== null) return a.number - b.number
      if (a.number === null) return 1
      if (b.number === null) return -1
      return a.reading.title.localeCompare(b.reading.title, 'ko', {
        numeric: true,
        sensitivity: 'base',
      })
    })
    groups.push({ category, items })
  }
  groups.sort((a, b) => {
    if (a.category === '기타') return 1
    if (b.category === '기타') return -1
    return a.category.localeCompare(b.category, 'ko', {
      numeric: true,
      sensitivity: 'base',
    })
  })
  return groups
}

export function ReadingList() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [items, setItems] = useState<Reading[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reorderMode, setReorderMode] = useState(false)
  const [savingOrder, setSavingOrder] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([listReadings(), getReadingOrder()])
      .then(([readings, order]) => {
        if (order.length > 0) {
          setItems(applyReadingOrder(readings, order))
        } else {
          setItems(readings)
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  const groups = useMemo(() => buildGroups(items), [items])

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

  function toggle(category: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  const [bulkTranslating, setBulkTranslating] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{
    done: number
    total: number
    failed: number
    note: string
  } | null>(null)

  function buildTranslationSource(r: Reading): string {
    const htmlTexts = (r.questions ?? [])
      .map((q) => (q.imageHtml ? extractTextFromHtml(q.imageHtml) : ''))
      .filter((t) => t.trim())
    const parts: string[] = []
    if ((r.passage ?? '').trim()) parts.push(r.passage.trim())
    for (const t of htmlTexts) parts.push(t)
    return parts.join('\n\n---\n\n')
  }

  async function handleBulkTranslate() {
    const pending = items.filter((r) => {
      if ((r.passageKo ?? '').trim()) return false
      return buildTranslationSource(r).trim().length > 0
    })
    if (pending.length === 0) {
      setBulkProgress({
        done: 0,
        total: 0,
        failed: 0,
        note: '한글 해석이 없는 지문이 없습니다.',
      })
      return
    }
    if (
      !window.confirm(
        `한글 해석이 없는 지문 ${pending.length}개를 AI로 번역해 채웁니다 (지문 + 안내문 HTML 텍스트 포함). 진행할까요?`,
      )
    )
      return
    setBulkTranslating(true)
    let done = 0
    let failed = 0
    setBulkProgress({ done, total: pending.length, failed, note: '' })
    for (const r of pending) {
      setBulkProgress({
        done,
        total: pending.length,
        failed,
        note: `처리 중: ${r.title}`,
      })
      try {
        const source = buildTranslationSource(r)
        const ko = await translatePassage(source)
        if (ko) {
          await updateReadingPassageKo(r.id, ko)
          setItems((prev) =>
            prev.map((x) => (x.id === r.id ? { ...x, passageKo: ko } : x)),
          )
        }
        done++
      } catch (e) {
        console.error(`[bulk translate] ${r.title} 실패`, e)
        failed++
      }
    }
    setBulkProgress({
      done,
      total: pending.length,
      failed,
      note: `완료: 성공 ${done} · 실패 ${failed}`,
    })
    setBulkTranslating(false)
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

      {isAdmin && items.length > 0 && !reorderMode && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-slate-900">한글 해석 일괄 생성</p>
            <p className="text-xs text-slate-500 mt-0.5">
              passageKo가 비어 있는 지문만 AI로 번역해 저장합니다 (기존 해석은 유지).
            </p>
            {bulkProgress && (
              <p className="text-xs text-brand-700 mt-1">
                {bulkProgress.note}
                {bulkProgress.total > 0 && (
                  <span className="ml-2 text-slate-500">
                    ({bulkProgress.done + bulkProgress.failed}/{bulkProgress.total})
                  </span>
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleBulkTranslate}
            disabled={bulkTranslating}
            className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-100 disabled:opacity-50"
          >
            {bulkTranslating ? '번역 중...' : '비어있는 지문 일괄 번역'}
          </button>
        </div>
      )}

      {loading && <p className="text-slate-500 text-sm">불러오는 중...</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {!loading && items.length === 0 && (
        <p className="text-slate-500 text-sm">등록된 지문이 없습니다.</p>
      )}

      {reorderMode && isAdmin ? (
        <div className="space-y-3">
          {items.map((r, i) => (
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
                  <h2 className="text-base font-semibold text-slate-900 truncate">
                    {r.title}
                  </h2>
                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    {formatDate(r.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  {r.questions.length}문항 · 단어 {r.glossary.length}개 ·{' '}
                  {r.createdByName}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const isOpen = !collapsed.has(g.category)
            return (
              <section
                key={g.category}
                className="rounded-lg border border-slate-200 bg-white overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggle(g.category)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                >
                  <div className="flex items-baseline gap-2 min-w-0">
                    <h2 className="text-base font-semibold text-slate-900 truncate">
                      {g.category}
                    </h2>
                    <span className="text-xs text-slate-500">
                      {g.items.length}개
                    </span>
                  </div>
                  <span className="text-slate-400 text-sm">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && (
                  <ul className="divide-y divide-slate-100 border-t border-slate-100">
                    {g.items.map(({ reading: r, label }) => (
                      <li key={r.id}>
                        <Link
                          to={isAdmin ? `/reading/${r.id}` : `/reading/${r.id}/take`}
                          className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                        >
                          <div className="flex items-baseline gap-3 min-w-0">
                            {label !== null && (
                              <span className="inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded bg-brand-100 text-brand-700 text-sm font-semibold">
                                {label}
                              </span>
                            )}
                            <span className="text-sm text-slate-700 truncate">
                              {label !== null
                                ? `${r.questions.length}문항 · 단어 ${r.glossary.length}개`
                                : r.title}
                            </span>
                          </div>
                          <span className="text-xs text-slate-400 whitespace-nowrap">
                            {formatDate(r.createdAt)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
