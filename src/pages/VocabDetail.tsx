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
          className="rounded-md bg-indigo-600 text-white text-sm font-medium px-4 py-2 hover:bg-indigo-700 transition"
        >
          시험 시작
        </Link>
      </div>

      <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-50 border-b border-slate-200">
          <div className="col-span-1">#</div>
          <div className="col-span-5">영단어</div>
          <div className="col-span-6">뜻</div>
        </div>
        {set.words.map((w, i) => (
          <div
            key={i}
            className="grid grid-cols-12 px-4 py-2 text-sm items-center border-b border-slate-100 last:border-b-0"
          >
            <div className="col-span-1 text-slate-500">{i + 1}</div>
            <div className="col-span-5 font-medium text-slate-900">{w.en}</div>
            <div className="col-span-6 text-slate-600">{w.ko}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
