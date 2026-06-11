import { useEffect, useMemo, useRef, useState } from 'react'
import type { WordEntry } from '../lib/types'
import { defineWords } from '../lib/api'

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface Token {
  text: string
  ko: string | null
}

interface Line {
  tokens: Token[]
}

interface Props {
  passage: string
  glossary: WordEntry[]
  /** When true, admin can drag-select words to queue them for AI definition. */
  editable?: boolean
  /** Called with the finalized entries to merge into the glossary (one write). */
  onAddWords?: (entries: WordEntry[]) => Promise<void> | void
}

export function GlossedPassage({ passage, glossary, editable = false, onAddWords }: Props) {
  // index of the currently open tooltip ("lineIdx-tokenIdx"), null = none
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // words the admin has queued for batch definition
  const [pending, setPending] = useState<WordEntry[]>([])
  const [fetching, setFetching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [panelError, setPanelError] = useState<string | null>(null)

  const lines = useMemo<Line[]>(() => {
    if (glossary.length === 0) {
      return passage.split('\n').map((text) => ({ tokens: [{ text, ko: null }] }))
    }
    const sorted = [...glossary].sort((a, b) => b.en.length - a.en.length)
    const lookup = new Map(sorted.map((g) => [g.en.toLowerCase(), g.ko]))
    const pattern = new RegExp(
      '\\b(' + sorted.map((g) => escapeRegex(g.en)).join('|') + ')\\b',
      'gi',
    )
    return passage.split('\n').map((lineText) => {
      const tokens: Token[] = []
      let last = 0
      for (const m of lineText.matchAll(pattern)) {
        const start = m.index ?? 0
        if (start > last) tokens.push({ text: lineText.slice(last, start), ko: null })
        tokens.push({ text: m[0], ko: lookup.get(m[0].toLowerCase()) ?? '' })
        last = start + m[0].length
      }
      if (last < lineText.length) tokens.push({ text: lineText.slice(last), ko: null })
      if (tokens.length === 0) tokens.push({ text: '', ko: null })
      return { tokens }
    })
  }, [passage, glossary])

  // close tooltip when tapping/clicking anywhere outside a glossed word
  useEffect(() => {
    if (!activeKey) return
    function onDocPointer(e: Event) {
      const target = e.target as HTMLElement
      if (!target.closest('[data-gloss-word]')) setActiveKey(null)
    }
    document.addEventListener('pointerdown', onDocPointer)
    return () => document.removeEventListener('pointerdown', onDocPointer)
  }, [activeKey])

  // drag-select inside the passage queues the word (admin only)
  function handleSelection() {
    if (!editable || !containerRef.current) return
    const selection = window.getSelection()
    const text = selection?.toString().trim() ?? ''
    if (!text || !selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (!containerRef.current.contains(range.commonAncestorContainer)) return
    // strip surrounding punctuation, keep inner word(s)
    const word = text.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').trim()
    if (!word) return
    selection.removeAllRanges()
    setPanelError(null)
    setPending((prev) =>
      prev.some((p) => p.en.toLowerCase() === word.toLowerCase())
        ? prev
        : [...prev, { en: word, ko: '' }],
    )
  }

  function updatePending(i: number, ko: string) {
    setPending((prev) => prev.map((p, idx) => (idx === i ? { ...p, ko } : p)))
  }
  function removePending(i: number) {
    setPending((prev) => prev.filter((_, idx) => idx !== i))
  }

  // one AI call for every queued word, using the passage as context
  async function fetchAll() {
    if (pending.length === 0) return
    setFetching(true)
    setPanelError(null)
    try {
      const entries = await defineWords({ words: pending.map((p) => p.en), passage })
      const byEn = new Map(entries.map((e) => [e.en.toLowerCase(), e.ko]))
      setPending((prev) =>
        prev.map((p) => ({ ...p, ko: byEn.get(p.en.toLowerCase()) ?? p.ko })),
      )
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'AI 뜻 찾기 실패')
    } finally {
      setFetching(false)
    }
  }

  async function saveAll() {
    if (!onAddWords) return
    const entries = pending
      .map((p) => ({ en: p.en.trim(), ko: p.ko.trim() }))
      .filter((p) => p.en && p.ko)
    if (entries.length === 0) {
      setPanelError('뜻이 채워진 단어가 없습니다.')
      return
    }
    setSaving(true)
    setPanelError(null)
    try {
      await onAddWords(entries)
      setPending([])
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        onMouseUp={editable ? handleSelection : undefined}
        onTouchEnd={editable ? handleSelection : undefined}
        className="text-base sm:text-lg leading-8 sm:leading-9 text-slate-900 break-words whitespace-pre-wrap text-justify"
      >
        {lines.map((line, li) => (
          <span key={li}>
            {li > 0 && <br />}
            {line.tokens.map((tok, ti) => {
              if (tok.ko === null) return <span key={ti}>{tok.text}</span>
              const key = `${li}-${ti}`
              const open = activeKey === key
              return (
                <span key={ti} className="relative inline-block">
                  <span
                    data-gloss-word
                    title={tok.ko}
                    onClick={() => setActiveKey(open ? null : key)}
                    className="underline decoration-dotted decoration-slate-400 underline-offset-2 cursor-pointer touch-manipulation"
                  >
                    {tok.text}
                  </span>
                  {open && (
                    <span
                      role="tooltip"
                      className="absolute left-1/2 bottom-full z-20 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-sm font-medium text-white shadow-lg"
                    >
                      {tok.ko || '뜻 없음'}
                      <span className="absolute left-1/2 top-full -translate-x-1/2 -mt-px border-4 border-transparent border-t-slate-900" />
                    </span>
                  )}
                </span>
              )
            })}
          </span>
        ))}
      </div>

      {editable && pending.length > 0 && (
        <div className="fixed z-40 bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-800">
              추가할 단어 {pending.length}개
            </span>
            <button
              type="button"
              onClick={() => {
                setPending([])
                setPanelError(null)
              }}
              className="text-xs text-slate-400 hover:text-slate-700"
            >
              비우기
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto px-3 py-2 space-y-1.5">
            {pending.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="min-w-[88px] max-w-[112px] truncate text-sm font-medium text-slate-900" title={p.en}>
                  {p.en}
                </span>
                <input
                  value={p.ko}
                  onChange={(e) => updatePending(i, e.target.value)}
                  placeholder={fetching ? '불러오는 중…' : '뜻 (AI 추천 또는 직접 입력)'}
                  className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
                <button
                  type="button"
                  onClick={() => removePending(i)}
                  className="text-slate-400 hover:text-red-600 text-sm px-1"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {panelError && (
            <p className="px-4 pb-1 text-xs text-red-600">{panelError}</p>
          )}

          <div className="flex gap-2 border-t border-slate-200 px-3 py-2.5">
            <button
              type="button"
              onClick={() => void fetchAll()}
              disabled={fetching || saving}
              className="flex-1 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {fetching ? 'AI 찾는 중…' : `AI로 뜻 찾기 (${pending.length})`}
            </button>
            <button
              type="button"
              onClick={() => void saveAll()}
              disabled={saving || fetching || !pending.some((p) => p.ko.trim())}
              className="flex-1 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? '저장 중…' : '모두 추가'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
