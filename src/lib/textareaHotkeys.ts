import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

type EditableEl = HTMLTextAreaElement | HTMLInputElement

export function handleUnderlineHotkey<T extends EditableEl>(
  e: ReactKeyboardEvent<T>,
  setValue: (next: string) => void,
): boolean {
  if (e.key.toLowerCase() !== 'u' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) {
    return false
  }
  const el = e.currentTarget
  const start = el.selectionStart ?? 0
  const end = el.selectionEnd ?? 0
  const val = el.value
  if (start === end) return false
  e.preventDefault()
  const selected = val.slice(start, end)
  const wrap = `{{${selected}}}`
  const next = val.slice(0, start) + wrap + val.slice(end)
  setValue(next)
  requestAnimationFrame(() => {
    el.focus()
    try {
      el.setSelectionRange(start + 2, end + 2)
    } catch {
      // ignore: some input types don't support selection APIs
    }
  })
  return true
}
