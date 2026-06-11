import { useState } from 'react'
import { defineWords } from '../lib/api'

export type GlossTarget = 'glossary' | 'choices'

export interface GlossEntry {
  en: string
  ko: string
  target: GlossTarget
}

type QueueItem = GlossEntry

const TARGET_LABEL: Record<GlossTarget, string> = {
  glossary: '지문',
  choices: '보기',
}

/**
 * Shared word-definition queue for the reading editor. Words dragged from the
 * passage or the choices are collected here, defined by the AI in a single
 * batch call, and saved together.
 */
export function useGlossQueue(opts: {
  aiContext: string
  showTargets: boolean
  onSave: (entries: GlossEntry[]) => Promise<void> | void
}) {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [fetching, setFetching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addWord(en: string, target: GlossTarget) {
    const word = en.trim()
    if (!word) return
    setError(null)
    setQueue((prev) =>
      prev.some((q) => q.en.toLowerCase() === word.toLowerCase() && q.target === target)
        ? prev
        : [...prev, { en: word, ko: '', target }],
    )
  }

  function updateKo(i: number, ko: string) {
    setQueue((prev) => prev.map((q, idx) => (idx === i ? { ...q, ko } : q)))
  }

  function remove(i: number) {
    setQueue((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function fetchAll() {
    if (queue.length === 0) return
    setFetching(true)
    setError(null)
    try {
      const words = [...new Set(queue.map((q) => q.en))]
      const entries = await defineWords({ words, passage: opts.aiContext })
      const byEn = new Map(entries.map((e) => [e.en.toLowerCase(), e.ko]))
      setQueue((prev) => prev.map((q) => ({ ...q, ko: byEn.get(q.en.toLowerCase()) ?? q.ko })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 뜻 찾기 실패')
    } finally {
      setFetching(false)
    }
  }

  async function saveAll() {
    const entries = queue
      .map((q) => ({ en: q.en.trim(), ko: q.ko.trim(), target: q.target }))
      .filter((q) => q.en && q.ko)
    if (entries.length === 0) {
      setError('뜻이 채워진 단어가 없습니다.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await opts.onSave(entries)
      setQueue([])
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const panel =
    queue.length > 0 ? (
      <div className="fixed z-40 bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <span className="text-sm font-semibold text-slate-800">추가할 단어 {queue.length}개</span>
          <button
            type="button"
            onClick={() => {
              setQueue([])
              setError(null)
            }}
            className="text-xs text-slate-400 hover:text-slate-700"
          >
            비우기
          </button>
        </div>

        <div className="max-h-60 overflow-y-auto px-3 py-2 space-y-1.5">
          {queue.map((q, i) => (
            <div key={`${q.target}-${q.en}-${i}`} className="flex items-center gap-2">
              {opts.showTargets && (
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    q.target === 'choices'
                      ? 'bg-brand-100 text-brand-800'
                      : 'bg-sky-100 text-sky-700'
                  }`}
                >
                  {TARGET_LABEL[q.target]}
                </span>
              )}
              <span
                className="min-w-[72px] max-w-[104px] truncate text-sm font-medium text-slate-900"
                title={q.en}
              >
                {q.en}
              </span>
              <input
                value={q.ko}
                onChange={(e) => updateKo(i, e.target.value)}
                placeholder={fetching ? '불러오는 중…' : '뜻 (AI 추천/직접 입력)'}
                className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-slate-400 hover:text-red-600 text-sm px-1"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {error && <p className="px-4 pb-1 text-xs text-red-600">{error}</p>}

        <div className="flex gap-2 border-t border-slate-200 px-3 py-2.5">
          <button
            type="button"
            onClick={() => void fetchAll()}
            disabled={fetching || saving}
            className="flex-1 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {fetching ? 'AI 찾는 중…' : `AI로 뜻 찾기 (${queue.length})`}
          </button>
          <button
            type="button"
            onClick={() => void saveAll()}
            disabled={saving || fetching || !queue.some((q) => q.ko.trim())}
            className="flex-1 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? '저장 중…' : '모두 추가'}
          </button>
        </div>
      </div>
    ) : null

  return { addWord, panel }
}
