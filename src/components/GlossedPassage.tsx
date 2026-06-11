import { useEffect, useMemo, useRef, useState } from 'react'
import type { WordEntry } from '../lib/types'

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
  /** When set, admin can drag-select a word and it is reported here. */
  onSelectWord?: (word: string) => void
  className?: string
}

export function GlossedPassage({ passage, glossary, onSelectWord, className }: Props) {
  // index of the currently open tooltip ("lineIdx-tokenIdx"), null = none
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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

  // report a drag-selection within this block (admin only)
  function handleSelection() {
    if (!onSelectWord || !containerRef.current) return
    const selection = window.getSelection()
    const text = selection?.toString().trim() ?? ''
    if (!text || !selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (!containerRef.current.contains(range.commonAncestorContainer)) return
    // strip surrounding punctuation, keep inner word(s)
    const word = text.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').trim()
    if (!word) return
    selection.removeAllRanges()
    onSelectWord(word)
  }

  return (
    <div
      ref={containerRef}
      onMouseUp={onSelectWord ? handleSelection : undefined}
      onTouchEnd={onSelectWord ? handleSelection : undefined}
      className={
        className ??
        'text-base sm:text-lg leading-8 sm:leading-9 text-slate-900 break-words whitespace-pre-wrap text-justify'
      }
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
  )
}
