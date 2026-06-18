import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  deleteVocabSet,
  formatDate,
  listVocabSets,
  updateVocabSetWords,
} from '../lib/firestore'
import type { VocabSense, VocabSet, WordEntry } from '../lib/types'
import { parseSenseBody } from '../lib/parseTextbookVocab'

export function VocabList() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [sets, setSets] = useState<VocabSet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    listVocabSets()
      .then((all) => {
        const sorted = [...all].sort((a, b) =>
          a.title.localeCompare(b.title, 'ko', { numeric: true, sensitivity: 'base' }),
        )
        setSets(sorted)
      })
      .catch((e) => setError(e.message ?? '목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  function reprocessWord(w: WordEntry): WordEntry {
    if (!w.senses || w.senses.length === 0) return w
    const newSenses: VocabSense[] = w.senses.map((s) => {
      const parts: string[] = []
      if (s.ko) parts.push(s.ko)
      if (s.definitionEn) parts.push(`[${s.definitionEn}]`)
      if (s.synonyms && s.synonyms.length > 0)
        parts.push(`= ${s.synonyms.join(', ')}`)
      const body = parts.join(' ')
      const parsed = parseSenseBody(body)
      const cs: VocabSense = { ko: parsed.ko || s.ko }
      if (s.pos) cs.pos = s.pos
      if (parsed.definitionEn) cs.definitionEn = parsed.definitionEn
      if (parsed.synonyms && parsed.synonyms.length > 0) cs.synonyms = parsed.synonyms
      if (s.examples && s.examples.length > 0) cs.examples = s.examples
      return cs
    })
    const first = newSenses[0]
    const next: WordEntry = { ...w, ko: first.ko, senses: newSenses }
    if (first.pos) next.pos = first.pos
    if (first.definitionEn) next.definitionEn = first.definitionEn
    else delete next.definitionEn
    if (first.synonyms && first.synonyms.length > 0) next.synonyms = first.synonyms
    else delete next.synonyms
    return next
  }

  const [reprocessing, setReprocessing] = useState(false)
  const [reprocessNotice, setReprocessNotice] = useState<string | null>(null)

  async function handleReprocessAll() {
    if (!isAdmin) return
    if (
      !window.confirm(
        `${sets.length}개 시험지의 단어를 새 파서로 다시 정리합니다. 시험 결과는 그대로 둡니다. 계속하시겠습니까?`,
      )
    )
      return
    setReprocessing(true)
    setReprocessNotice(null)
    let touched = 0
    try {
      for (const s of sets) {
        if (!s.words || s.words.length === 0) continue
        const updated = s.words.map(reprocessWord)
        await updateVocabSetWords(s.id, updated)
        touched++
      }
      setReprocessNotice(`${touched}개 시험지의 단어 재분석 완료.`)
    } catch (err) {
      setReprocessNotice(err instanceof Error ? err.message : '재분석 실패')
    } finally {
      setReprocessing(false)
    }
  }

  async function handleDelete(e: React.MouseEvent, s: VocabSet) {
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm(`"${s.title}" 시험지를 삭제하시겠습니까?`)) return
    setDeletingId(s.id)
    try {
      await deleteVocabSet(s.id)
      setSets((prev) => prev.filter((x) => x.id !== s.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-semibold text-slate-900">단어 시험지</h1>
        {profile?.role === 'admin' && (
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleReprocessAll}
              disabled={reprocessing}
              className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-100 disabled:opacity-50"
              title="옛 파서로 잘못 갈라진 단어를 새 파서로 일괄 정리"
            >
              {reprocessing ? '재분석 중...' : '전체 단어 재분석'}
            </button>
            <Link
              to="/vocab/corpora"
              className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-100"
            >
              교재 관리
            </Link>
            <Link
              to="/vocab/new"
              className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800"
            >
              새 시험지
            </Link>
          </div>
        )}
      </div>

      {reprocessNotice && (
        <p className="text-sm text-brand-700">{reprocessNotice}</p>
      )}
      {loading && <p className="text-slate-500 text-sm">불러오는 중...</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {!loading && sets.length === 0 && (
        <p className="text-slate-500 text-sm">등록된 시험지가 없습니다.</p>
      )}

      <div className="space-y-3">
        {sets.map((s) => (
          <Link
            key={s.id}
            to={`/vocab/${s.id}`}
            className="relative block rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-300 hover:shadow-md transition"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900 truncate">{s.title}</h2>
              <span className="text-xs text-slate-500 whitespace-nowrap">
                {formatDate(s.createdAt)}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {s.words.length}단어 · {s.createdByName}
            </p>
            {isAdmin && (
              <button
                type="button"
                onClick={(e) => handleDelete(e, s)}
                disabled={deletingId === s.id}
                className="absolute top-2 right-2 text-xs text-slate-400 hover:text-red-600 px-2 py-1 rounded disabled:opacity-50"
                aria-label="삭제"
              >
                {deletingId === s.id ? '삭제 중...' : '삭제'}
              </button>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
