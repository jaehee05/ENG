import { useEffect, useState, type FormEvent } from 'react'
import { Clover } from '../components/Clover'
import { BackLink } from '../components/BackLink'
import {
  createCategory,
  deleteCategory,
  ensureDefaultCategories,
  updateCategory,
} from '../lib/firestore'
import type { CategoryConfig } from '../lib/types'

const COLOR_PRESETS = [
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#ec4899', // pink
  '#f43f5e', // rose
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#10b981', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#64748b', // slate
]

function slugify(s: string): string {
  const base = s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || `cat-${Math.random().toString(36).slice(2, 7)}`
}

export function AdminCategories() {
  const [items, setItems] = useState<CategoryConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState(COLOR_PRESETS[0])
  const [adding, setAdding] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editColor, setEditColor] = useState('#000000')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const list = await ensureDefaultCategories()
      setItems(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : '카테고리 불러오기 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    const label = newLabel.trim()
    if (!label) return
    setAdding(true)
    setError(null)
    try {
      const existingKeys = new Set(items.map((c) => c.key))
      let key = slugify(label)
      let n = 2
      while (existingKeys.has(key)) {
        key = `${slugify(label)}-${n++}`
      }
      const maxOrder = items.reduce((m, c) => Math.max(m, c.order ?? 0), -1)
      await createCategory({
        key,
        label,
        color: newColor,
        order: maxOrder + 1,
      })
      setNewLabel('')
      setNewColor(COLOR_PRESETS[0])
      setNotice('카테고리 추가됨')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '추가 실패')
    } finally {
      setAdding(false)
    }
  }

  function startEdit(c: CategoryConfig) {
    setEditingId(c.id)
    setEditLabel(c.label)
    setEditColor(c.color)
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function saveEdit(c: CategoryConfig) {
    const label = editLabel.trim()
    if (!label) return
    setError(null)
    try {
      await updateCategory(c.id, { label, color: editColor })
      setEditingId(null)
      setNotice('수정됨')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '수정 실패')
    }
  }

  async function handleDelete(c: CategoryConfig) {
    if (c.builtin) return
    if (!window.confirm(`"${c.label}" 카테고리를 삭제할까요?\n이 카테고리에 속한 과제는 "기타"로 표시됩니다.`)) return
    setError(null)
    try {
      await deleteCategory(c.id)
      setNotice('삭제됨')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  async function move(c: CategoryConfig, dir: -1 | 1) {
    const sorted = [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const idx = sorted.findIndex((x) => x.id === c.id)
    const swap = sorted[idx + dir]
    if (!swap) return
    try {
      await Promise.all([
        updateCategory(c.id, { order: swap.order ?? 0 }),
        updateCategory(swap.id, { order: c.order ?? 0 }),
      ])
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '순서 변경 실패')
    }
  }

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <BackLink to="/admin" label="관리" />
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          관리
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
          과제 카테고리
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          학생 과제 페이지의 분류 이름과 색상을 관리합니다. 기본 4종(문제 풀이/단어 시험/모의고사/기타)은 이름·색상은 바꿀 수 있지만 삭제할 수 없어요.
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && !error && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      {loading && <p className="text-sm text-slate-500">불러오는 중…</p>}

      {!loading && (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
          {items.map((c, i) => {
            const isEditing = editingId === c.id
            return (
              <div key={c.id} className="px-4 py-3 flex items-center gap-3">
                <Clover filled={4} color={isEditing ? editColor : c.color} size={28} />
                {isEditing ? (
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="카테고리 이름"
                    />
                    <ColorPalette value={editColor} onChange={setEditColor} />
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {c.label}
                      {c.builtin && (
                        <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          기본
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      key: <code>{c.key}</code>
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-1 shrink-0">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => saveEdit(c)}
                        className="rounded-md bg-slate-900 text-white text-xs font-medium px-2.5 py-1.5 hover:bg-slate-800"
                      >
                        저장
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="rounded-md border border-slate-300 text-xs font-medium px-2.5 py-1.5 hover:bg-slate-50"
                      >
                        취소
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => move(c, -1)}
                        disabled={i === 0}
                        className="text-slate-400 hover:text-slate-700 disabled:opacity-30 px-1 text-sm"
                        aria-label="위로"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(c, 1)}
                        disabled={i === items.length - 1}
                        className="text-slate-400 hover:text-slate-700 disabled:opacity-30 px-1 text-sm"
                        aria-label="아래로"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        className="rounded-md border border-slate-300 text-xs font-medium px-2.5 py-1.5 hover:bg-slate-50"
                      >
                        수정
                      </button>
                      {!c.builtin && (
                        <button
                          type="button"
                          onClick={() => handleDelete(c)}
                          className="rounded-md text-red-500 text-xs font-medium px-2 py-1.5 hover:bg-red-50"
                        >
                          삭제
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && (
        <form
          onSubmit={handleAdd}
          className="rounded-xl border border-brand-200 bg-brand-50/40 p-4 space-y-3"
        >
          <p className="text-sm font-semibold text-slate-800">새 카테고리</p>
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="예: 숙제, 영문법, 작문 등"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <ColorPalette value={newColor} onChange={setNewColor} />
          <button
            type="submit"
            disabled={adding || !newLabel.trim()}
            className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
          >
            {adding ? '추가 중…' : '추가'}
          </button>
        </form>
      )}
    </div>
  )
}

function ColorPalette({
  value,
  onChange,
}: {
  value: string
  onChange: (c: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLOR_PRESETS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`h-7 w-7 rounded-full border-2 transition ${
            value.toLowerCase() === c.toLowerCase()
              ? 'border-slate-900 scale-110'
              : 'border-white hover:scale-105'
          }`}
          style={{ backgroundColor: c }}
          aria-label={c}
        />
      ))}
      <label className="h-7 w-7 rounded-full border-2 border-slate-300 cursor-pointer flex items-center justify-center text-slate-500 text-xs hover:bg-slate-50">
        +
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="sr-only"
        />
      </label>
    </div>
  )
}
