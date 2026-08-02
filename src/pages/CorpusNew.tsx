import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { createVocabSeries } from '../lib/firestore'
import { parseWordList, type WordEntry } from '../lib/types'
import { looksLikeTextbookVocab, parseTextbookVocab } from '../lib/parseTextbookVocab'
import { enrichWordList, needsEnrich } from '../lib/vocabEnrich'

function cleanWords(words: WordEntry[]): WordEntry[] {
  return words.map((w) => {
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
      const senses = w.senses
        .map((s) => {
          const cs: typeof s = { ko: s.ko?.trim() ?? '' }
          if (s.pos?.trim()) cs.pos = s.pos.trim()
          if (s.definitionEn?.trim()) cs.definitionEn = s.definitionEn.trim()
          if (s.synonyms && s.synonyms.length > 0) {
            const syns = s.synonyms.map((x) => x.trim()).filter(Boolean)
            if (syns.length > 0) cs.synonyms = syns
          }
          if (s.examples && s.examples.length > 0) {
            const exs: typeof s.examples = []
            for (const ex of s.examples) {
              const cex: { en: string; ko?: string } = { en: ex.en?.trim() ?? '' }
              if (ex.ko?.trim()) cex.ko = ex.ko.trim()
              if (cex.en || cex.ko) exs.push(cex)
            }
            if (exs.length > 0) cs.examples = exs
          }
          return cs
        })
        .filter((s) => s.ko)
      if (senses.length > 0) out.senses = senses
    }
    return out
  })
}

export function CorpusNew() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [raw, setRaw] = useState('')
  const [perDayRaw, setPerDayRaw] = useState('30')
  const [maxAttemptsRaw, setMaxAttemptsRaw] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [useAi, setUseAi] = useState(true)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isTextbook = useMemo(() => looksLikeTextbookVocab(raw), [raw])
  const words = useMemo(() => {
    return isTextbook ? parseTextbookVocab(raw) : parseWordList(raw)
  }, [raw, isTextbook])
  // 교재 형식으로 붙여넣으면 이미 발음기호·예문이 들어 있는 단어가 많다.
  // 실제로 AI 를 부를 단어만 세어 보여 준다.
  const needAiCount = useMemo(() => words.filter(needsEnrich).length, [words])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!profile) return
    if (!title.trim()) return setError('제목을 입력하세요.')
    if (words.length === 0) return setError('단어를 1개 이상 입력하세요.')
    const perDay = Number.parseInt(perDayRaw, 10)
    if (!Number.isFinite(perDay) || perDay <= 0) {
      return setError('DAY당 단어 수는 양의 정수여야 합니다.')
    }
    let maxAttempts: number | undefined
    if (maxAttemptsRaw.trim()) {
      const n = Number.parseInt(maxAttemptsRaw, 10)
      if (!Number.isFinite(n) || n <= 0) {
        return setError('응시 횟수 제한은 양의 정수여야 합니다.')
      }
      maxAttempts = n
    }
    setSubmitting(true)
    setProgress(null)
    try {
      let finalWords = cleanWords(words)
      if (useAi) {
        const r = await enrichWordList(finalWords, (done, total) =>
          setProgress(`AI 보강 중… ${done}/${total}단어`),
        )
        finalWords = r.words
        // 실패해도 교재는 그대로 저장한다. 못 채운 단어는 교재 화면의
        // "빠진 정보 채우기" 로 다시 시도할 수 있다.
        setProgress(r.failed ? '일부 단어는 채우지 못했습니다. 저장 중…' : '저장 중…')
      }
      const id = await createVocabSeries({
        title: title.trim(),
        words: finalWords,
        perDay,
        maxAttempts,
        createdBy: profile.id,
        createdByName: profile.displayName,
      })
      navigate(`/vocab/corpora/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setSubmitting(false)
      setProgress(null)
    }
  }

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          관리자 · 단어 교재
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">새 교재</h1>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">제목</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 조정식 보카"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              DAY당 단어 수
            </label>
            <input
              type="number"
              min={1}
              value={perDayRaw}
              onChange={(e) => setPerDayRaw(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
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

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            단어 목록
          </label>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={14}
            placeholder={
              'abandon : 버리다, 포기하다\n또는 교재 형식 ("0001 advent [ǽdvent] / n. ❶ 도래, 출현 ...")'
            }
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

        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useAi}
              onChange={(e) => setUseAi(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-slate-700">
              AI 로 예문·발음기호·품사 채우기
              <span className="block text-xs text-slate-500 mt-0.5">
                비어 있는 칸만 채웁니다. 붙여넣은 뜻·예문은 그대로 둡니다.
                {words.length > 0 &&
                  ` 지금 입력한 ${words.length}단어 중 ${needAiCount}개가 대상입니다.`}
              </span>
            </span>
          </label>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {progress && <p className="text-sm text-brand-700">{progress}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand-600 text-white text-sm font-medium px-5 py-2 hover:bg-brand-700 disabled:opacity-60"
          >
            {submitting ? '저장 중...' : '교재 저장'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/vocab/corpora')}
            className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-5 py-2 hover:bg-slate-100"
          >
            취소
          </button>
        </div>
      </form>
    </div>
  )
}
