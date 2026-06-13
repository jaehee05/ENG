import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

export function handleUnderlineHotkey(
  e: ReactKeyboardEvent<HTMLTextAreaElement>,
  setValue: (next: string) => void,
): boolean {
  if (e.key.toLowerCase() !== 'u' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) {
    return false
  }
  const ta = e.currentTarget
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const val = ta.value
  if (start === end) return false
  e.preventDefault()
  const selected = val.slice(start, end)
  const wrap = `{{${selected}}}`
  const next = val.slice(0, start) + wrap + val.slice(end)
  setValue(next)
  requestAnimationFrame(() => {
    ta.focus()
    ta.setSelectionRange(start + 2, end + 2)
  })
  return true
}
