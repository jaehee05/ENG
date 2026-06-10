import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getReading } from '../lib/firestore'
import { GlossedPassage } from '../components/GlossedPassage'
import type { Reading } from '../lib/types'

export function ReadingDetail() {
  const { id } = useParams<{ id: string }>()
  const [r, setR] = useState<Reading | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!r) return null

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{r.title}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {r.questions.length}문항 · 단어 {r.glossary.length}개
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to={`/reading/${r.id}/sheet`}
            className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-100"
          >
            시험지로 보기
          </Link>
          <Link
            to={`/reading/${r.id}/take`}
            className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800"
          >
            풀이 시작
          </Link>
        </div>
      </div>

      <p className="text-sm text-slate-500">
        풀이 화면에서는 지문 안 단어에 밑줄이 그어지고 마우스를 올리면 뜻이 표시됩니다.
        아래는 미리보기입니다.
      </p>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <GlossedPassage passage={r.passage} glossary={r.glossary} />
      </div>
    </div>
  )
}
