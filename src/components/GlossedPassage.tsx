import { useEffect, useMemo, useRef, useState } from 'react'
import type { WordEntry } from '../lib/types'

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface Token {
  text: string
  ko: string | null
}

interface Segment {
  tokens: Token[]
  underlined: boolean
  marker?: string
}

interface Line {
  segments: Segment[]
}

interface Props {
  passage: string
  glossary: WordEntry[]
  /** When set, admin can drag-select a word and it is reported here. */
  onSelectWord?: (word: string) => void
  /** When set, called whenever a student opens a glossed word (en, ko). */
  onWordLookup?: (en: string, ko: string) => void
  /** Lowercase set of words the student has previously looked up — get highlighted. */
  viewedWords?: Set<string>
  className?: string
}

const UNDERLINE_RE = /([①②③④⑤])\s*\{([^}]+)\}|\{\{([^}]+)\}\}/g

interface RawSegment {
  text: string
  underlined: boolean
  marker?: string
}

function splitUnderlines(line: string): RawSegment[] {
  const out: RawSegment[] = []
  let last = 0
  for (const m of line.matchAll(UNDERLINE_RE)) {
    const start = m.index ?? 0
    if (start > last) out.push({ text: line.slice(last, start), underlined: false })
    if (m[1]) {
      out.push({ text: m[2], underlined: true, marker: m[1] })
    } else {
      out.push({ text: m[3], underlined: true })
    }
    last = start + m[0].length
  }
  if (last < line.length) out.push({ text: line.slice(last), underlined: false })
  if (out.length === 0) out.push({ text: '', underlined: false })
  return out
}

export function GlossedPassage({
  passage,
  glossary,
  onSelectWord,
  onWordLookup,
  viewedWords,
  className,
}: Props) {
  // index of the currently open tooltip ("lineIdx-segIdx-tokenIdx"), null = none
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const lines = useMemo<Line[]>(() => {
    const sorted = [...glossary].sort((a, b) => b.en.length - a.en.length)
    const lookup = new Map(sorted.map((g) => [g.en.toLowerCase(), g.ko]))
    const pattern =
      sorted.length > 0
        ? new RegExp(
            '\\b(' + sorted.map((g) => escapeRegex(g.en)).join('|') + ')\\b',
            'gi',
          )
        : null

    function tokenize(text: string): Token[] {
      if (!pattern) return [{ text, ko: null }]
      const tokens: Token[] = []
      let last = 0
      for (const m of text.matchAll(pattern)) {
        const start = m.index ?? 0
        if (start > last) tokens.push({ text: text.slice(last, start), ko: null })
        tokens.push({ text: m[0], ko: lookup.get(m[0].toLowerCase()) ?? '' })
        last = start + m[0].length
      }
      if (last < text.length) tokens.push({ text: text.slice(last), ko: null })
      if (tokens.length === 0) tokens.push({ text: '', ko: null })
      return tokens
    }

    return passage.split('\n').map((lineText) => {
      const raws = splitUnderlines(lineText)
      const segments: Segment[] = raws.map((s) => ({
        underlined: s.underlined,
        marker: s.marker,
        tokens: tokenize(s.text),
      }))
      return { segments }
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
          {line.segments.map((seg, si) => {
            const inner = seg.tokens.map((tok, ti) => {
              if (tok.ko === null) return <span key={ti}>{tok.text}</span>
              const key = `${li}-${si}-${ti}`
              const open = activeKey === key
              const lower = tok.text.toLowerCase()
              const viewed = viewedWords?.has(lower) ?? false
              return (
                <span key={ti} className="relative inline-block">
                  <span
                    data-gloss-word
                    title={tok.ko}
                    onClick={() => {
                      const willOpen = !open
                      setActiveKey(willOpen ? key : null)
                      if (willOpen && tok.ko && onWordLookup) {
                        onWordLookup(tok.text, tok.ko)
                      }
                    }}
                    className={
                      viewed
                        ? 'bg-brand-100 rounded-sm px-0.5 cursor-pointer touch-manipulation transition-colors hover:bg-brand-200'
                        : 'underline decoration-dotted decoration-brand-500 underline-offset-[3px] cursor-pointer touch-manipulation transition-colors hover:bg-brand-50 rounded-sm'
                    }
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
            })
            if (!seg.underlined) return <span key={si}>{inner}</span>
            return (
              <span key={si}>
                {seg.marker && <sup className="text-slate-600 mr-0.5">{seg.marker}</sup>}
                <span className="underline decoration-slate-900 decoration-2 underline-offset-4">
                  {inner}
                </span>
              </span>
            )
          })}
        </span>
      ))}
    </div>
  )
}
