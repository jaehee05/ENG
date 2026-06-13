import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { createVocabSet } from '../lib/firestore'
import { parseWordList, type WordEntry } from '../lib/types'
import { enrichVocab } from '../lib/api'

const PLACEHOLDER = `abandon - 버리다, 포기하다
brilliant - 훌륭한, 빛나는
emerge - 나타나다, 부각되다`

interface Extra {
  ipa?: string
  pos?: string
  synonyms?: string[]
  example?: string
  exampleKo?: string
  definitionEn?: string
}

export function VocabNew() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [maxAttemptsRaw, setMaxAttemptsRaw] = useState('')
  const [raw, setRaw] = useState('')
  const [extras, setExtras] = useState<Map<string, Extra>>(new Map())
  const [enriching, setEnriching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const words: WordEntry[] = useMemo(() => {
    const parsed = parseWordList(raw)
    return parsed.map((p) => {
      const extra = extras.get(p.en.toLowerCase())
      return extra ? { ...p, ...extra } : p
    })
  }, [raw, extras])

  function patchExtra(en: string, p: Extra) {
    setExtras((prev) => {
      const next = new Map(prev)
      const key = en.toLowerCase()
      const cur = next.get(key) ?? {}
      next.set(key, { ...cur, ...p })
      return next
    })
  }

  async function handleEnrich() {
    setError(null)
    if (words.length === 0) {
      setError('단어를 먼저 입력하세요.')
      return
    }
    setEnriching(true)
    try {
      const enriched = await enrichVocab(words.map((w) => ({ en: w.en, ko: w.ko })))
      setExtras((prev) => {
        const next = new Map(prev)
        for (const e of enriched) {
          const key = e.en.toLowerCase()
          const cur = next.get(key) ?? {}
          next.set(key, {
            ipa: e.ipa || cur.ipa,
            pos: e.pos || cur.pos,
            synonyms: e.synonyms?.length ? e.synonyms : cur.synonyms,
            example: e.example || cur.example,
            exampleKo: e.exampleKo || cur.exampleKo,
            definitionEn: e.definitionEn || cur.definitionEn,
          })
        }
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 보강에 실패했습니다.')
    } finally {
      setEnriching(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!profile) return
    if (!title.trim()) return setError('제목을 입력하세요.')
    if (words.length === 0) return setError('단어를 1개 이상 입력하세요.')
    let maxAttempts: number | undefined
    if (maxAttemptsRaw.trim()) {
      const n = Number.parseInt(maxAttemptsRaw, 10)
      if (!Number.isFinite(n) || n <= 0) {
        return setError('응시 횟수 제한은 양의 정수여야 합니다.')
      }
      maxAttempts = n
    }
    setSubmitting(true)
    try {
      const id = await createVocabSet({
        title: title.trim(),
        words: words.map((w) => {
          const out: WordEntry = { en: w.en, ko: w.ko }
          if (w.ipa?.trim()) out.ipa = w.ipa.trim()
          if (w.pos?.trim()) out.pos = w.pos.trim()
          if (w.synonyms && w.synonyms.length > 0) {
            const cleaned = w.synonyms.map((s) => s.trim()).filter(Boolean)
            if (cleaned.length > 0) out.synonyms = cleaned
          }
          if (w.example?.trim()) out.example = w.example.trim()
          if (w.exampleKo?.trim()) out.exampleKo = w.exampleKo.trim()
          if (w.definitionEn?.trim()) out.definitionEn = w.definitionEn.trim()
          return out
        }),
        maxAttempts,
        createdBy: profile.id,
        createdByName: profile.displayName,
      })
      navigate(`/vocab/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls =
    'w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold text-slate-900">새 단어 시험지</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">제목</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 수능 어휘 Day 1"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="max-w-xs">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            응시 횟수 제한{' '}
            <span className="font-normal text-slate-500">(비워두면 무제한)</span>
          </label>
          <input
            type="number"
            min={1}
            value={maxAttemptsRaw}
            onChange={(e) => setMaxAttemptsRaw(e.target.value)}
            placeholder="예: 3"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            단어 목록{' '}
            <span className="font-normal text-slate-500">
              (한 줄에 한 단어,{' '}
              <code className="bg-slate-100 px-1 rounded">영어 - 한국어</code> 형식)
            </span>
          </label>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={10}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="text-xs text-slate-500 mt-1">인식된 단어: {words.length}개</p>
        </div>

        {words.length > 0 && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-700">예문 · 영영 정의</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  비워두거나, AI에 일괄로 채우게 한 뒤 직접 다듬을 수 있습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={handleEnrich}
                disabled={enriching}
                className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-50"
              >
                {enriching ? '추가 중...' : 'AI로 예문·영영 추가'}
              </button>
            </div>

            <ul className="space-y-3 max-h-[36rem] overflow-y-auto pr-1">
              {words.map((w, i) => (
                <li
                  key={i}
                  className="rounded-md border border-slate-200 bg-white p-3 space-y-2"
                >
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900 min-w-[120px]">
                      {w.en}
                    </span>
                    <span className="text-sm text-slate-600">{w.ko}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
                    <label className="sm:col-span-2 text-xs text-slate-500 sm:pt-1.5">
                      발음
                    </label>
                    <input
                      type="text"
                      value={w.ipa ?? ''}
                      onChange={(e) => patchExtra(w.en, { ipa: e.target.value })}
                      placeholder="ǽdvent"
                      className={`${inputCls} sm:col-span-4`}
                    />
                    <label className="sm:col-span-2 text-xs text-slate-500 sm:pt-1.5 sm:text-right sm:pr-2">
                      품사
                    </label>
                    <input
                      type="text"
                      value={w.pos ?? ''}
                      onChange={(e) => patchExtra(w.en, { pos: e.target.value })}
                      placeholder="n."
                      className={`${inputCls} sm:col-span-4`}
                    />
                    <label className="sm:col-span-2 text-xs text-slate-500 sm:pt-1.5">
                      유의어
                    </label>
                    <input
                      type="text"
                      value={(w.synonyms ?? []).join(', ')}
                      onChange={(e) =>
                        patchExtra(w.en, {
                          synonyms: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="arrival, appearance, emergence"
                      className={`${inputCls} sm:col-span-10`}
                    />
                    <label className="sm:col-span-2 text-xs text-slate-500 sm:pt-1.5">
                      영영
                    </label>
                    <input
                      type="text"
                      value={w.definitionEn ?? ''}
                      onChange={(e) =>
                        patchExtra(w.en, { definitionEn: e.target.value })
                      }
                      placeholder="쉬운 영어 정의"
                      className={`${inputCls} sm:col-span-10`}
                    />
                    <label className="sm:col-span-2 text-xs text-slate-500 sm:pt-1.5">
                      예문
                    </label>
                    <input
                      type="text"
                      value={w.example ?? ''}
                      onChange={(e) => patchExtra(w.en, { example: e.target.value })}
                      placeholder="자연스러운 영어 예문"
                      className={`${inputCls} sm:col-span-10`}
                    />
                    <label className="sm:col-span-2 text-xs text-slate-500 sm:pt-1.5">
                      해석
                    </label>
                    <input
                      type="text"
                      value={w.exampleKo ?? ''}
                      onChange={(e) =>
                        patchExtra(w.en, { exampleKo: e.target.value })
                      }
                      placeholder="예문의 한국어 번역"
                      className={`${inputCls} sm:col-span-10`}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand-600 text-white text-sm font-medium px-5 py-2 hover:bg-brand-700 transition disabled:opacity-60"
          >
            {submitting ? '저장 중...' : '저장'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/vocab')}
            className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-5 py-2 hover:bg-slate-100"
          >
            취소
          </button>
        </div>
      </form>
    </div>
  )
}
