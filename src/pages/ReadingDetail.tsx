import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getReading, updateReadingGlossaries } from '../lib/firestore'
import { useAuth } from '../contexts/useAuth'
import { GlossedPassage } from '../components/GlossedPassage'
import { GlossaryEditor } from '../components/GlossaryEditor'
import { useGlossQueue, type GlossEntry } from '../components/useGlossQueue'
import type { Reading, WordEntry } from '../lib/types'

const CHOICE_MARKS = ['①', '②', '③', '④', '⑤']

function mergeEntries(base: WordEntry[], adds: { en: string; ko: string }[]): WordEntry[] {
  const next = [...base]
  for (const { en, ko } of adds) {
    const idx = next.findIndex((g) => g.en.toLowerCase() === en.toLowerCase())
    if (idx >= 0) next[idx] = { en: next[idx].en, ko }
    else next.push({ en, ko })
  }
  return next
}

export function ReadingDetail() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [r, setR] = useState<Reading | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getReading(id)
      .then((x) => {
        if (!x) setError('지문을 찾을 수 없습니다.')
        else setR(x)
      })
      .catch((e) => setError(e.message ?? '불러오기 실패'))
      .finally(() => setLoading(false))
  }, [id])

  async function handleSave(entries: GlossEntry[]) {
    if (!r) return
    const nextGlossary = mergeEntries(
      r.glossary,
      entries.filter((e) => e.target === 'glossary'),
    )
    const nextChoices = mergeEntries(
      r.choicesGlossary ?? [],
      entries.filter((e) => e.target === 'choices'),
    )
    await updateReadingGlossaries(r.id, nextGlossary, nextChoices)
    setR({ ...r, glossary: nextGlossary, choicesGlossary: nextChoices })
    setSavedNote(`단어 ${entries.length}개를 단어장에 반영했습니다.`)
    window.setTimeout(() => setSavedNote(null), 2500)
  }

  const { addWord, panel } = useGlossQueue({
    aiContext: r?.passage ?? '',
    showTargets: true,
    onSave: handleSave,
  })

  async function handleReplaceGlossary(next: WordEntry[]) {
    if (!r) return
    await updateReadingGlossaries(r.id, next, r.choicesGlossary ?? [])
    setR({ ...r, glossary: next })
  }

  async function handleReplaceChoicesGlossary(next: WordEntry[]) {
    if (!r) return
    await updateReadingGlossaries(r.id, r.glossary, next)
    setR({ ...r, choicesGlossary: next })
  }

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!r) return null

  const choicesGlossary = r.choicesGlossary ?? []

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{r.title}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {r.questions.length}문항 · 지문 단어 {r.glossary.length}개 · 선지 단어 {choicesGlossary.length}개
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAdmin && (
            <Link
              to={`/reading/${r.id}/edit`}
              className="flex-1 sm:flex-none text-center rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-100"
            >
              지문 수정
            </Link>
          )}
          <Link
            to={`/reading/${r.id}/sheet`}
            className="flex-1 sm:flex-none text-center rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-100"
          >
            시험지로 보기
          </Link>
          <Link
            to={`/reading/${r.id}/take`}
            className="flex-1 sm:flex-none text-center rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 transition"
          >
            풀이 시작
          </Link>
        </div>
      </div>

      {savedNote && (
        <p className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-700">{savedNote}</p>
      )}

      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">지문</h2>
        <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
          <GlossedPassage
            passage={r.passage}
            glossary={r.glossary}
            onSelectWord={isAdmin ? (w) => addWord(w, 'glossary') : undefined}
          />
        </div>
      </div>

      {isAdmin && (
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-2">
            선지 · 단어를 드래그하면 선지 단어장에 추가됩니다
          </h2>
          <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
            {r.questions.map((q, qi) => (
              <div key={qi} className="space-y-1">
                <p className="text-sm font-medium text-slate-800 whitespace-pre-wrap">
                  {qi + 1}. {q.q}
                </p>
                <GlossedPassage
                  passage={q.choices.map((c, ci) => `${CHOICE_MARKS[ci]} ${c}`).join('\n')}
                  glossary={choicesGlossary}
                  onSelectWord={(w) => addWord(w, 'choices')}
                  className="text-sm sm:text-base leading-7 text-slate-700 break-words whitespace-pre-wrap"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">단어장 수정</h2>
          <GlossaryEditor
            title="지문 단어장"
            words={r.glossary}
            onSave={handleReplaceGlossary}
          />
          <GlossaryEditor
            title="선지 단어장"
            words={choicesGlossary}
            onSave={handleReplaceChoicesGlossary}
          />
        </div>
      )}

      {isAdmin && panel}
    </div>
  )
}
