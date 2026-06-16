import { Fragment, type ReactNode } from 'react'

const UNDERLINE_RE = /([①②③④⑤])\s*\{([^}]+)\}|\{\{([^}]+)\}\}/g

export function renderUnderlines(text: string): ReactNode {
  if (!text) return text
  const out: ReactNode[] = []
  let last = 0
  let key = 0
  for (const m of text.matchAll(UNDERLINE_RE)) {
    const start = m.index ?? 0
    if (start > last) out.push(<Fragment key={key++}>{text.slice(last, start)}</Fragment>)
    if (m[1]) {
      out.push(
        <Fragment key={key++}>
          <span className="text-slate-600 mr-0.5">{m[1]}</span>
          <span className="underline decoration-slate-900 decoration-[1px] underline-offset-[3px]">
            {m[2]}
          </span>
        </Fragment>,
      )
    } else {
      out.push(
        <span
          key={key++}
          className="underline decoration-slate-900 decoration-[1px] underline-offset-[3px]"
        >
          {m[3]}
        </span>,
      )
    }
    last = start + m[0].length
  }
  if (last < text.length) out.push(<Fragment key={key++}>{text.slice(last)}</Fragment>)
  return out
}
