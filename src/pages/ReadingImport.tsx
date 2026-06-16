import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { createReading, listReadings } from '../lib/firestore'
import { fileToBase64, importReadingsFromPdf, type ImportedReadingItem } from '../lib/api'
import {
  READING_TYPE_LABEL,
  type ReadingQuestionType,
} from '../lib/types'

const ALLOWED_TYPES: ReadingQuestionType[] = [
  'standard',
  'cloze',
  'order',
  'insert',
  'summary',
  'irrelevant',
  'underline-grammar',
  'underline-vocab',
]

function coerceType(type: string): ReadingQuestionType {
  return (ALLOWED_TYPES as string[]).includes(type)
    ? (type as ReadingQuestionType)
    : 'standard'
}

const CHOICE_MARKS = ['①', '②', '③', '④', '⑤']

function parseRange(s: string): number[] {
  const out: number[] = []
  for (const raw of s.split(',')) {
    const t = raw.trim()
    const m = t.match(/^(\d+)\s*[-~–—]\s*(\d+)$/)
    if (m) {
      const a = Number.parseInt(m[1], 10)
      const b = Number.parseInt(m[2], 10)
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      for (let i = lo; i <= hi; i++) out.push(i)
    } else if (/^\d+$/.test(t)) {
      out.push(Number.parseInt(t, 10))
    }
  }
  return Array.from(new Set(out)).sort((a, b) => a - b)
}

function chunkNums(nums: number[], size: number): number[][] {
  const chunks: number[][] = []
  for (let i = 0; i < nums.length; i += size) {
    chunks.push(nums.slice(i, i + size))
  }
  return chunks
}

const CHUNK_SIZE = 1

export function ReadingImport() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [categoryMode, setCategoryMode] = useState<'pick' | 'new'>('pick')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [knownCategories, setKnownCategories] = useState<string[]>([])
  const [range, setRange] = useState('')
  const [answerKey, setAnswerKey] = useState('')
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<ImportedReadingItem[] | null>(null)

  useEffect(() => {
    listReadings()
      .then((all) => {
        const TITLE_RE = /^(.+?)\s+(\d+)\s*(?:번|문제)?\s*$/
        const set = new Set<string>()
        for (const r of all) {
          const m = TITLE_RE.exec(r.title.trim())
          if (m) set.add(m[1].trim())
        }
        setKnownCategories(
          [...set].sort((a, b) =>
            a.localeCompare(b, 'ko', { numeric: true, sensitivity: 'base' }),
          ),
        )
      })
      .catch(() => {})
  }, [])

  const activeCategory =
    categoryMode === 'new' ? newCategory.trim() : selectedCategory.trim()

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    setFile(f ?? null)
  }

  function patchItem(i: number, p: Partial<ImportedReadingItem>) {
    setItems((prev) => (prev ? prev.map((x, idx) => (idx === i ? { ...x, ...p } : x)) : prev))
  }

  function removeItem(i: number) {
    setItems((prev) => (prev ? prev.filter((_, idx) => idx !== i) : prev))
  }

  async function handleAnalyze(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!file) return setError('PDF 파일을 선택하세요.')
    const nums = parseRange(range)
    if (nums.length === 0)
      return setError('문항 범위를 입력하세요. 예) 29-40, 31-35')
    const chunks = chunkNums(nums, CHUNK_SIZE)
    setImporting(true)
    setImportProgress(`0 / ${chunks.length}`)
    try {
      const base64 = await fileToBase64(file)
      const merged = new Map<number, ImportedReadingItem>()
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i]
        setImportProgress(`${i + 1} / ${chunks.length} 묶음 처리 중...`)
        const list = await importReadingsFromPdf({
          pdfBase64: base64,
          range: c.join(','),
          answerKey: answerKey.trim() || undefined,
        })
        for (const it of list) {
          if (!merged.has(it.number)) merged.set(it.number, it)
        }
      }
      const all = [...merged.values()].sort((a, b) => a.number - b.number)
      if (all.length === 0) {
        setError('추출된 문항이 없습니다. 범위 또는 PDF를 확인하세요.')
        setItems(null)
      } else {
        setItems(all)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '분석에 실패했습니다.')
    } finally {
      setImporting(false)
      setImportProgress(null)
    }
  }

  async function handleSaveAll() {
    if (!items || !profile) return
    setSaving(true)
    setError(null)
    setSavedCount(0)
    try {
      for (const it of items) {
        const t = coerceType(it.type)
        const title = `${activeCategory ? `${activeCategory} ` : ''}${it.number}번`
        const q: Record<string, unknown> = {
          type: t,
          q: it.q,
          choices: it.choices,
          answer: it.answer,
        }
        if (it.body?.trim()) q.body = it.body.trim()
        if (it.intro?.trim()) q.intro = it.intro.trim()
        if (it.summaryBox?.trim()) q.summaryBox = it.summaryBox.trim()
        await createReading({
          title,
          passage: '',
          glossary: [],
          choicesGlossary: [],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          questions: [q as any],
          createdBy: profile.id,
          createdByName: profile.displayName,
        })
        setSavedCount((c) => c + 1)
      }
      navigate('/reading')
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">PDF에서 지문 가져오기</h1>
        <p className="text-sm text-slate-500 mt-1">
          PDF와 문항 번호 범위를 입력하면 AI가 자동으로 문제 본문·선지·유형을 추출합니다. 추출된 문항 하나당
          새 지문이 생성됩니다.
        </p>
      </div>

      <form onSubmit={handleAnalyze} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">PDF 파일</label>
          <input
            type="file"
            accept="application/pdf"
            onChange={onFileChange}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
          />
          {file && (
            <p className="text-xs text-slate-500 mt-1">
              {file.name} · {(file.size / 1024).toFixed(0)} KB
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            시험명
          </label>
          {categoryMode === 'pick' ? (
            <select
              value={selectedCategory}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  setCategoryMode('new')
                  setSelectedCategory('')
                } else {
                  setSelectedCategory(e.target.value)
                }
              }}
              className={inputCls}
            >
              <option value="">— 선택 —</option>
              {knownCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="__new__">+ 새 시험명 추가...</option>
            </select>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="예: 2027학년도 6월 모의평가"
                autoFocus
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => {
                  setCategoryMode('pick')
                  setNewCategory('')
                }}
                className="text-xs text-slate-500 hover:text-slate-900 px-2"
              >
                취소
              </button>
            </div>
          )}
          <p className="text-xs text-slate-500 mt-1">
            저장 시 각 지문 제목은 "{activeCategory || '(시험명)'} 31번" 형식이 됩니다.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">문항 번호 범위</label>
          <input
            type="text"
            value={range}
            onChange={(e) => setRange(e.target.value)}
            placeholder="예: 29-40, 31-35, 18, 22"
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            정답표 (선택)
          </label>
          <textarea
            value={answerKey}
            onChange={(e) => setAnswerKey(e.target.value)}
            rows={3}
            placeholder={'예: 29번 ④, 30번 ⑤, 31번 ②, 32번 ②, ...\n또는 31:2 32:5 33:1'}
            className={`${inputCls} font-mono`}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={importing}
            className="rounded-md bg-brand-600 text-white text-sm font-medium px-5 py-2 hover:bg-brand-700 transition disabled:opacity-60"
          >
            {importing
              ? `분석 중... ${importProgress ?? ''}`
              : 'PDF 분석'}
          </button>
        </div>
      </form>

      {items && (
        <section className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-base font-semibold text-slate-900">
              미리보기 ({items.length}개)
            </h2>
            <div className="flex items-center gap-2">
              {saving && (
                <span className="text-xs text-slate-500">
                  저장 중 {savedCount}/{items.length}...
                </span>
              )}
              <button
                onClick={handleSaveAll}
                disabled={saving}
                className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 transition disabled:opacity-60"
              >
                {saving ? '저장 중...' : '전체 저장'}
              </button>
            </div>
          </div>

          {items.map((it, i) => (
            <div key={i} className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-700">
                  {it.number}번 · {READING_TYPE_LABEL[coerceType(it.type)]}
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  className="text-xs text-red-600 hover:underline"
                >
                  제외
                </button>
              </div>

              <p className="text-sm font-medium text-slate-900 whitespace-pre-wrap">{it.q}</p>

              {it.intro?.trim() && (
                <div className="rounded border border-slate-300 bg-slate-50 p-3 text-xs whitespace-pre-wrap text-slate-700">
                  {it.intro}
                </div>
              )}

              {it.body?.trim() && (
                <p className="text-xs text-slate-600 whitespace-pre-wrap line-clamp-6 leading-5">
                  {it.body}
                </p>
              )}

              {it.summaryBox?.trim() && (
                <div className="rounded border border-slate-300 bg-slate-50 p-3 text-xs whitespace-pre-wrap text-slate-700">
                  {it.summaryBox}
                </div>
              )}

              <div className="space-y-1">
                {it.choices.map((c, ci) => (
                  <label key={ci} className="flex items-start gap-2 text-xs">
                    <input
                      type="radio"
                      name={`ans-${i}`}
                      checked={it.answer === ci}
                      onChange={() => patchItem(i, { answer: ci })}
                      className="mt-0.5 accent-brand-600"
                    />
                    <span className="text-slate-500 w-5">{CHOICE_MARKS[ci]}</span>
                    <span className="text-slate-700 flex-1">{c}</span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-slate-500">
                정답: {CHOICE_MARKS[it.answer]}
              </p>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
