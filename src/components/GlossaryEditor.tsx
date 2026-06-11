import { useEffect, useState } from 'react'
import type { WordEntry } from '../lib/types'

interface Props {
  title: string
  words: WordEntry[]
  onSave: (next: WordEntry[]) => Promise<void>
}

export function GlossaryEditor({ title, words, onSave }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<WordEntry[]>(words)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(words)
  }, [words])

  const dirty =
    draft.length !== words.length ||
    draft.some((w, i) => words[i]?.en !== w.en || words[i]?.ko !== w.ko)

  function updateRow(i: number, key: 'en' | 'ko', value: string) {
    setDraft((prev) => prev.map((w, idx) => (idx === i ? { ...w, [key]: value } : w)))
  }

  function removeRow(i: number) {
    setDraft((prev) => prev.filter((_, idx) => idx !== i))
  }

  function revert() {
    setDraft(words)
    setError(null)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const cleaned = draft
        .map((w) => ({ en: w.en.trim(), ko: w.ko.trim() }))
        .filter((w) => w.en && w.ko)
      await onSave(cleaned)
      setSavedNote('저장했습니다.')
      window.setTimeout(() => setSavedNote(null), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-slate-700"
      >
        <span>
          {title} 편집 <span className="text-slate-400 font-normal">({words.length})</span>
          {dirty && (
            <span className="ml-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800 font-medium align-middle">
              미저장
            </span>
          )}
        </span>
        <span className="text-slate-400 text-xs">{open ? '접기' : '펼치기'}</span>
      </button>

      {open && (
        <>
          {draft.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-500">등록된 단어가 없습니다.</p>
          ) : (
            <ul className="border-t border-slate-200 divide-y divide-slate-100">
              {draft.map((w, i) => (
                <li key={i} className="px-3 sm:px-5 py-2 grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    value={w.en}
                    onChange={(e) => updateRow(i, 'en', e.target.value)}
                    className="col-span-4 rounded border border-slate-300 px-2 py-1 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    type="text"
                    value={w.ko}
                    onChange={(e) => updateRow(i, 'ko', e.target.value)}
                    className="col-span-7 rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    aria-label="삭제"
                    className="col-span-1 text-slate-400 hover:text-red-600 text-lg"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          {(dirty || error || savedNote) && (
            <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-end gap-2">
              {error && <p className="text-sm text-red-600 mr-auto">{error}</p>}
              {savedNote && !dirty && (
                <p className="text-sm text-emerald-700 mr-auto">{savedNote}</p>
              )}
              {dirty && (
                <button
                  type="button"
                  onClick={revert}
                  disabled={saving}
                  className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-3 py-1.5 hover:bg-slate-100 disabled:opacity-60"
                >
                  되돌리기
                </button>
              )}
              {dirty && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-md bg-indigo-600 text-white text-sm font-medium px-3 py-1.5 hover:bg-indigo-700 transition disabled:opacity-60"
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
