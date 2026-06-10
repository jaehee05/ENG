import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getReading, updateReadingGlossary } from '../lib/firestore'
import { useAuth } from '../contexts/useAuth'
import { GlossedPassage } from '../components/GlossedPassage'
import type { Reading } from '../lib/types'

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

  async function handleAddWord(en: string, ko: string) {
    if (!r) return
    const exists = r.glossary.some((g) => g.en.toLowerCase() === en.toLowerCase())
    const nextGlossary = exists
      ? r.glossary.map((g) => (g.en.toLowerCase() === en.toLowerCase() ? { en: g.en, ko } : g))
      : [...r.glossary, { en, ko }]
    await updateReadingGlossary(r.id, nextGlossary)
    setR({ ...r, glossary: nextGlossary })
    setSavedNote(`"${en}" 뜻을 ${exists ? '수정' : '추가'}했습니다.`)
    window.setTimeout(() => setSavedNote(null), 2500)
  }

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!r) return null

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{r.title}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {r.questions.length}문항 · 단어 {r.glossary.length}개
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to={`/reading/${r.id}/sheet`}
            className="flex-1 sm:flex-none text-center rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-100"
          >
            시험지로 보기
          </Link>
          <Link
            to={`/reading/${r.id}/take`}
            className="flex-1 sm:flex-none text-center rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800"
          >
            풀이 시작
          </Link>
        </div>
      </div>

      <p className="text-sm text-slate-500">
        지문 안 단어를 누르면(또는 마우스를 올리면) 뜻이 표시됩니다.
        {isAdmin && ' 관리자는 지문에서 단어를 드래그해 뜻을 바로 추가할 수 있습니다.'}
      </p>

      {savedNote && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{savedNote}</p>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
        <GlossedPassage
          passage={r.passage}
          glossary={r.glossary}
          editable={isAdmin}
          onAddWord={handleAddWord}
        />
      </div>
    </div>
  )
}
