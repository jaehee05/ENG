import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  createVocabSet,
  deleteVocabSeries,
  getVocabSeries,
  updateVocabSeries,
} from '../lib/firestore'
import { parseWordList, type WordEntry, type VocabSeries } from '../lib/types'
import { looksLikeTextbookVocab, parseTextbookVocab } from '../lib/parseTextbookVocab'

export function CorpusDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [series, setSeries] = useState<VocabSeries | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [perDayRaw, setPerDayRaw] = useState('30')
  const [maxAttemptsRaw, setMaxAttemptsRaw] = useState('')
  const [appendText, setAppendText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [appending, setAppending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editEn, setEditEn] = useState('')
  const [editKo, setEditKo] = useState('')

  useEffect(() => {
    if (!id) return
    getVocabSeries(id)
      .then((s) => {
        if (!s) setError('교재를 찾을 수 없습니다.')
        else {
          setSeries(s)
          if (s.perDay) setPerDayRaw(String(s.perDay))
          if (s.maxAttempts) setMaxAttemptsRaw(String(s.maxAttempts))
        }
      })
      .catch((e) => setError(e.message ?? '불러오기 실패'))
      .finally(() => setLoading(false))
  }, [id])

  const appendIsTextbook = useMemo(
    () => looksLikeTextbookVocab(appendText),
    [appendText],
  )
  const appendWords = useMemo<WordEntry[]>(() => {
    if (!appendText.trim()) return []
    return appendIsTextbook ? parseTextbookVocab(appendText) : parseWordList(appendText)
  }, [appendText, appendIsTextbook])

  const total = series?.words?.length ?? 0
  const used = series?.usedCount ?? 0
  const remaining = Math.max(0, total - used)

  async function handleGenerate() {
    if (!series || !profile) return
    const perDay = Number.parseInt(perDayRaw, 10)
    if (!Number.isFinite(perDay) || perDay <= 0) {
      setNotice('DAY당 단어 수는 양의 정수여야 합니다.')
      return
    }
    const allWords = series.words ?? []
    if (remaining <= 0) {
      setNotice('사용할 단어가 더 이상 없습니다. 단어를 추가하세요.')
      return
    }
    let maxAttempts: number | undefined
    if (maxAttemptsRaw.trim()) {
      const n = Number.parseInt(maxAttemptsRaw, 10)
      if (Number.isFinite(n) && n > 0) maxAttempts = n
    }
    setGenerating(true)
    setNotice(null)
    try {
      const slice = allWords.slice(used, Math.min(used + perDay, allWords.length))
      const nextDay = series.lastDayNumber + 1
      await createVocabSet({
        title: `${series.title} DAY ${nextDay}`,
        words: slice,
        maxAttempts,
        createdBy: profile.id,
        createdByName: profile.displayName,
      })
      await updateVocabSeries(series.id, {
        usedCount: used + slice.length,
        lastDayNumber: nextDay,
        perDay,
        maxAttempts,
      })
      const refreshed = await getVocabSeries(series.id)
      if (refreshed) setSeries(refreshed)
      setNotice(`"${series.title} DAY ${nextDay}" 시험지 ${slice.length}단어 생성 완료.`)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '생성 실패')
    } finally {
      setGenerating(false)
    }
  }

  async function handleAppend() {
    if (!series) return
    if (appendWords.length === 0) {
      setNotice('추가할 단어가 없습니다.')
      return
    }
    setAppending(true)
    setNotice(null)
    try {
      const merged = [...(series.words ?? []), ...appendWords]
      await updateVocabSeries(series.id, { words: merged })
      const refreshed = await getVocabSeries(series.id)
      if (refreshed) setSeries(refreshed)
      setAppendText('')
      setNotice(`${appendWords.length}단어를 교재에 추가했습니다.`)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '추가 실패')
    } finally {
      setAppending(false)
    }
  }

  function startEdit(i: number) {
    if (!series) return
    const w = series.words?.[i]
    if (!w) return
    setEditingIdx(i)
    setEditEn(w.en)
    setEditKo(w.ko)
  }

  function cancelEdit() {
    setEditingIdx(null)
    setEditEn('')
    setEditKo('')
  }

  async function saveEdit(i: number) {
    if (!series) return
    const newEn = editEn.trim()
    const newKo = editKo.trim()
    if (!newEn || !newKo) {
      setNotice('영단어와 한국어 뜻을 모두 입력하세요.')
      return
    }
    const updated = [...(series.words ?? [])]
    updated[i] = { ...updated[i], en: newEn, ko: newKo }
    try {
      await updateVocabSeries(series.id, { words: updated })
      const refreshed = await getVocabSeries(series.id)
      if (refreshed) setSeries(refreshed)
      cancelEdit()
      setNotice('수정되었습니다.')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '저장 실패')
    }
  }

  async function deleteWord(i: number) {
    if (!series) return
    const w = series.words?.[i]
    if (!w) return
    if (!window.confirm(`"${w.en}" 단어를 교재에서 삭제하시겠습니까?`)) return
    const updated = [...(series.words ?? [])]
    updated.splice(i, 1)
    const newUsed = i < used ? Math.max(0, used - 1) : used
    try {
      await updateVocabSeries(series.id, {
        words: updated,
        usedCount: newUsed,
      })
      const refreshed = await getVocabSeries(series.id)
      if (refreshed) setSeries(refreshed)
      setNotice('삭제되었습니다.')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '삭제 실패')
    }
  }

  async function handleDelete() {
    if (!series) return
    if (
      !window.confirm(
        `"${series.title}" 교재를 삭제하시겠습니까?\n이미 생성된 DAY 시험지는 그대로 남습니다.`,
      )
    )
      return
    await deleteVocabSeries(series.id)
    navigate('/vocab/corpora')
  }

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!series) return null

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link
            to="/vocab/corpora"
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            ← 교재 관리
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900 mt-1">{series.title}</h1>
          <p className="text-sm text-slate-500 mt-1">
            전체 {total}단어 · 사용 {used} · 남은 {remaining} · 현재 DAY{' '}
            {series.lastDayNumber}까지 생성
          </p>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          className="rounded-md border border-red-200 text-red-600 text-sm font-medium px-3 py-1.5 hover:bg-red-50"
        >
          교재 삭제
        </button>
      </div>

      {notice && (
        <p className="rounded-md bg-brand-50 text-brand-700 text-sm px-3 py-2">
          {notice}
        </p>
      )}

      <section className="rounded-lg border border-brand-200 bg-brand-50/40 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-brand-700">
          다음 DAY 시험지 만들기
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              이번 DAY 단어 수
            </label>
            <input
              type="number"
              min={1}
              value={perDayRaw}
              onChange={(e) => setPerDayRaw(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              응시 횟수 제한{' '}
              <span className="font-normal text-slate-400">(선택)</span>
            </label>
            <input
              type="number"
              min={1}
              value={maxAttemptsRaw}
              onChange={(e) => setMaxAttemptsRaw(e.target.value)}
              placeholder="예: 3"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
        <p className="text-xs text-slate-600">
          다음 시험지 제목: <strong>{series.title} DAY {series.lastDayNumber + 1}</strong>
          {remaining < Number.parseInt(perDayRaw || '0', 10) && remaining > 0 && (
            <span className="ml-2 text-amber-700">
              (남은 단어 {remaining}개만 사용)
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || remaining <= 0}
          className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-50"
        >
          {generating ? '생성 중...' : `DAY ${series.lastDayNumber + 1} 시험지 생성`}
        </button>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">단어 추가</h2>
        <p className="text-xs text-slate-500">
          교재 끝에 단어를 더 붙입니다. 이미 생성된 DAY 시험지는 영향 없음.
        </p>
        <textarea
          value={appendText}
          onChange={(e) => setAppendText(e.target.value)}
          rows={8}
          placeholder="새로 붙일 단어들"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <p className="text-xs text-slate-500">
          추가할 단어: {appendWords.length}개
          {appendIsTextbook && (
            <span className="ml-2 inline-block rounded bg-brand-100 text-brand-700 text-[10px] font-semibold px-1.5 py-0.5 align-middle">
              교재 형식 인식됨
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={handleAppend}
          disabled={appending || appendWords.length === 0}
          className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
        >
          {appending ? '추가 중...' : `교재에 ${appendWords.length}단어 추가`}
        </button>
      </section>

      {series.words && series.words.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">
            전체 단어 ({series.words.length}개)
          </h2>
          <div className="max-h-[32rem] overflow-y-auto border border-slate-100 rounded">
            <ul className="divide-y divide-slate-100">
              {series.words.map((w, i) => {
                const inUse = i < used
                const editing = editingIdx === i
                return (
                  <li
                    key={i}
                    className={`px-3 py-2 text-sm ${
                      inUse ? 'text-slate-500' : 'text-slate-800'
                    }`}
                  >
                    {editing ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-slate-400 w-12">
                          {String(i + 1).padStart(4, '0')}
                        </span>
                        <input
                          type="text"
                          value={editEn}
                          onChange={(e) => setEditEn(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit(i)
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          autoFocus
                          className="rounded border border-slate-300 px-2 py-1 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                        <input
                          type="text"
                          value={editKo}
                          onChange={(e) => setEditKo(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit(i)
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          className="rounded border border-slate-300 px-2 py-1 text-sm flex-1 min-w-[160px] focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                        <button
                          type="button"
                          onClick={() => saveEdit(i)}
                          className="text-xs text-white bg-brand-600 hover:bg-brand-700 rounded px-2 py-1"
                        >
                          저장
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="text-xs text-slate-500 hover:text-slate-900 px-2 py-1"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-3">
                        <span className="text-xs text-slate-400 w-12">
                          {String(i + 1).padStart(4, '0')}
                        </span>
                        <span className="font-medium">{w.en}</span>
                        <span className="text-slate-500">{w.ko}</span>
                        {inUse && (
                          <span className="text-[10px] text-slate-400">사용됨</span>
                        )}
                        <div className="ml-auto flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(i)}
                            className="text-xs text-slate-500 hover:text-slate-900"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteWord(i)}
                            className="text-xs text-slate-400 hover:text-red-600"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      )}
    </div>
  )
}
