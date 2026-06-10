import { useMemo } from 'react'
import type { WordEntry } from '../lib/types'

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface Props {
  passage: string
  glossary: WordEntry[]
}

export function GlossedPassage({ passage, glossary }: Props) {
  const html = useMemo(() => {
    if (glossary.length === 0) return passage
    const sorted = [...glossary].sort((a, b) => b.en.length - a.en.length)
    const lookup = new Map(sorted.map((g) => [g.en.toLowerCase(), g.ko]))
    const pattern = new RegExp(
      '\\b(' + sorted.map((g) => escapeRegex(g.en)).join('|') + ')\\b',
      'gi',
    )
    return passage
      .split(/(\n)/)
      .map((part) => {
        if (part === '\n') return '<br/>'
        return part.replace(pattern, (match) => {
          const ko = lookup.get(match.toLowerCase()) ?? ''
          const safeKo = ko.replace(/"/g, '&quot;')
          return `<span class="underline decoration-dotted decoration-slate-400 underline-offset-2 cursor-help" title="${safeKo}">${match}</span>`
        })
      })
      .join('')
  }, [passage, glossary])

  return (
    <div
      className="text-base leading-8 text-slate-900 whitespace-pre-wrap"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
