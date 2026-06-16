import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  bumpVocabSeries,
  createVocabSeries,
  createVocabSet,
  listVocabSeries,
} from '../lib/firestore'
import {
  parseWordList,
  type VocabSense,
  type VocabSeries,
  type WordEntry,
} from '../lib/types'
import { enrichVocab } from '../lib/api'
import { looksLikeTextbookVocab, parseTextbookVocab } from '../lib/parseTextbookVocab'

const PLACEHOLDER = `abandon : 버리다, 포기하다
brilliant : 훌륭한, 빛나는
emerge : 나타나다, 부각되다

또는 교재 형식 그대로 붙여넣어도 됩니다:
0001 advent [ǽdvent]
n. ❶ 도래, 출현 [The arrival of a notable person or thing] = arrival, appearance
- Since the advent of jet aircraft, travel has been sped-up.
- 제트기의 출현 이후, 여행이 가속화되었다.`

interface Extra {
  ipa?: string
  pos?: string
  synonyms?: string[]
  example?: string
  exampleKo?: string
  definitionEn?: string
  senses?: VocabSense[]
}

export function VocabNew() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [maxAttemptsRaw, setMaxAttemptsRaw] = useState('')
  const [raw, setRaw] = useState('')
  const [extras, setExtras] = useState<Map<string, Extra>>(new Map())
  const [enriching, setEnriching] = useState(false)
  const [enrichProgress, setEnrichProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [splitByDay, setSplitByDay] = useState(false)
  const [perDayRaw, setPerDayRaw] = useState('30')
  const [splitProgress, setSplitProgress] = useState<string | null>(null)
  const [seriesList, setSeriesList] = useState<VocabSeries[]>([])
  const [seriesMode, setSeriesMode] = useState<string>('new') // 'new' or series.id

  useEffect(() => {
    listVocabSeries()
      .then(setSeriesList)
      .catch(() => {})
  }, [])

  const selectedSeries: VocabSeries | null = useMemo(() => {
    if (seriesMode === 'new') return null
    return seriesList.find((s) => s.id === seriesMode) ?? null
  }, [seriesMode, seriesList])

  useEffect(() => {
    if (selectedSeries) {
      setTitle(selectedSeries.title)
      setSplitByDay(true)
      if (selectedSeries.maxAttempts) {
        setMaxAttemptsRaw(String(selectedSeries.maxAttempts))
      }
    }
  }, [selectedSeries])

  const isTextbook = useMemo(() => looksLikeTextbookVocab(raw), [raw])
  const words: WordEntry[] = useMemo(() => {
    const parsed = isTextbook ? parseTextbookVocab(raw) : parseWordList(raw)
    return parsed.map((p) => {
      const extra = extras.get(p.en.toLowerCase())
      return extra ? { ...p, ...extra } : p
    })
  }, [raw, extras, isTextbook])

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
    setEnrichProgress(`0 / ${words.length}`)
    try {
      const enriched = await enrichVocab(
        words.map((w) => ({ en: w.en, ko: w.ko })),
        (done, total) => setEnrichProgress(`${done} / ${total}`),
      )
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
      setEnrichProgress(null)
    }
  }

  function cleanWord(w: WordEntry): WordEntry {
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
    if (w.senses && w.senses.length > 0) {
      const senses: VocabSense[] = []
      for (const s of w.senses) {
        const cs: VocabSense = { ko: s.ko?.trim() ?? '' }
        if (s.pos?.trim()) cs.pos = s.pos.trim()
        if (s.definitionEn?.trim()) cs.definitionEn = s.definitionEn.trim()
        if (s.synonyms && s.synonyms.length > 0) {
          const syns = s.synonyms.map((x) => x.trim()).filter(Boolean)
          if (syns.length > 0) cs.synonyms = syns
        }
        if (s.examples && s.examples.length > 0) {
          const exs = []
          for (const ex of s.examples) {
            const cex: { en: string; ko?: string } = { en: ex.en?.trim() ?? '' }
            if (ex.ko?.trim()) cex.ko = ex.ko.trim()
            if (cex.en || cex.ko) exs.push(cex)
          }
          if (exs.length > 0) cs.examples = exs
        }
        if (cs.ko) senses.push(cs)
      }
      if (senses.length > 0) out.senses = senses
    }
    return out
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSplitProgress(null)
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

    if (splitByDay) {
      const perDay = Number.parseInt(perDayRaw, 10)
      if (!Number.isFinite(perDay) || perDay <= 0) {
        return setError('DAY당 단어 수는 양의 정수여야 합니다.')
      }
      const total = Math.ceil(words.length / perDay)
      const cleaned = words.map(cleanWord)
      const base = title.trim()
      const startDay = selectedSeries ? selectedSeries.lastDayNumber + 1 : 1
      setSubmitting(true)
      try {
        let seriesId = selectedSeries?.id
        if (!seriesId) {
          seriesId = await createVocabSeries({
            title: base,
            maxAttempts,
            createdBy: profile.id,
            createdByName: profile.displayName,
          })
        }
        let lastId: string | null = null
        for (let i = 0; i < total; i++) {
          const dayNumber = startDay + i
          const slice = cleaned.slice(i * perDay, (i + 1) * perDay)
          setSplitProgress(`${i + 1}/${total} DAY ${dayNumber} 저장 중...`)
          lastId = await createVocabSet({
            title: `${base} DAY ${dayNumber}`,
            words: slice,
            maxAttempts,
            createdBy: profile.id,
            createdByName: profile.displayName,
          })
        }
        await bumpVocabSeries(seriesId, startDay + total - 1)
        setSplitProgress(null)
        if (lastId) navigate('/vocab')
      } catch (err) {
        setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
        setSplitProgress(null)
      } finally {
        setSubmitting(false)
      }
      return
    }

    setSubmitting(true)
    try {
      const id = await createVocabSet({
        title: title.trim(),
        words: words.map(cleanWord),
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
        {seriesList.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              단어장 시리즈
            </label>
            <select
              value={seriesMode}
              onChange={(e) => setSeriesMode(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="new">— 새 시리즈로 시작 —</option>
              {seriesList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} (DAY {s.lastDayNumber}까지 생성됨)
                </option>
              ))}
            </select>
            {selectedSeries && (
              <p className="text-xs text-brand-700 mt-1">
                "{selectedSeries.title}" 시리즈에 이어 붙이기 — 이번 저장은 DAY{' '}
                {selectedSeries.lastDayNumber + 1}부터 시작합니다.
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">제목</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 수능 어휘 Day 1"
            disabled={!!selectedSeries}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-100 disabled:text-slate-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
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
        </div>

        <div className="rounded-md border border-brand-200 bg-brand-50/40 p-4 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={splitByDay}
              onChange={(e) => setSplitByDay(e.target.checked)}
              className="accent-brand-600"
            />
            <span className="text-sm font-medium text-slate-700">
              DAY 단위로 분할 저장
            </span>
            <span className="text-xs text-slate-500">
              한 번에 여러 개의 시험지를 만듭니다.
            </span>
          </label>
          {splitByDay && (
            <div className="flex items-end gap-3 flex-wrap pl-6">
              <div>
                <label className="block text-xs text-slate-600 mb-1">
                  DAY당 단어 수
                </label>
                <input
                  type="number"
                  min={1}
                  value={perDayRaw}
                  onChange={(e) => setPerDayRaw(e.target.value)}
                  className="w-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              {(() => {
                const per = Number.parseInt(perDayRaw, 10)
                if (!Number.isFinite(per) || per <= 0 || words.length === 0) return null
                const total = Math.ceil(words.length / per)
                const start = selectedSeries ? selectedSeries.lastDayNumber + 1 : 1
                const end = start + total - 1
                const base = title.trim() || '제목'
                return (
                  <p className="pb-2.5 text-xs text-slate-600">
                    총 {words.length}단어 → <strong>{total}개 DAY</strong>로 분할 (제목: "
                    {base} DAY {start}" ~ "{base} DAY {end}")
                  </p>
                )
              })()}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            단어 목록{' '}
            <span className="font-normal text-slate-500">
              (한 줄에 한 단어,{' '}
              <code className="bg-slate-100 px-1 rounded">영어 : 한국어</code> 형식)
            </span>
          </label>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={10}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="text-xs text-slate-500 mt-1">
            인식된 단어: {words.length}개
            {isTextbook && (
              <span className="ml-2 inline-block rounded bg-brand-100 text-brand-700 text-[10px] font-semibold px-1.5 py-0.5 align-middle">
                교재 형식 인식됨
              </span>
            )}
          </p>
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
                {enriching
                  ? `보강 중... ${enrichProgress ?? ''}`
                  : 'AI로 예문·영영 추가'}
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
        {splitProgress && <p className="text-sm text-brand-700">{splitProgress}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand-600 text-white text-sm font-medium px-5 py-2 hover:bg-brand-700 transition disabled:opacity-60"
          >
            {submitting
              ? '저장 중...'
              : splitByDay
                ? 'DAY 분할 저장'
                : '저장'}
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
