import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getVocabSet } from '../lib/firestore'
import type { VocabSet } from '../lib/types'

export function VocabDetail() {
  const { id } = useParams<{ id: string }>()
  const [set, setSet] = useState<VocabSet | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getVocabSet(id)
      .then((s) => {
        if (!s) setError('시험지를 찾을 수 없습니다.')
        else setSet(s)
      })
      .catch((e) => setError(e.message ?? '불러오기 실패'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!set) return null

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{set.title}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {set.words.length}단어 · {set.createdByName}
          </p>
        </div>
        <Link
          to={`/vocab/${set.id}/take`}
          className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 transition"
        >
          시험 시작
        </Link>
      </div>

      <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
        {set.words.map((w, i) => (
          <li key={i} className="px-4 py-3 space-y-1.5">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-xs text-slate-400 w-6">{i + 1}.</span>
              <span className="font-semibold text-slate-900">{w.en}</span>
              <span className="text-slate-600">{w.ko}</span>
            </div>
            {w.definitionEn && (
              <p className="pl-9 text-sm text-slate-700">
                <span className="text-xs text-slate-400 mr-1">[영영]</span>
                {w.definitionEn}
              </p>
            )}
            {w.example && (
              <p className="pl-9 text-sm text-slate-700 italic">
                <span className="text-xs text-slate-400 not-italic mr-1">[예문]</span>
                {w.example}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
