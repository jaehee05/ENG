import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { listVocabSeries } from '../lib/firestore'
import type { VocabSeries } from '../lib/types'

export function CorporaList() {
  const [items, setItems] = useState<VocabSeries[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search] = useSearchParams()
  const student = search.get('student') ?? ''
  const studentQuery = student ? `?student=${encodeURIComponent(student)}` : ''

  useEffect(() => {
    listVocabSeries()
      .then((all) => {
        const sorted = [...all].sort((a, b) =>
          a.title.localeCompare(b.title, 'ko', { numeric: true, sensitivity: 'base' }),
        )
        setItems(sorted)
      })
      .catch((e) => setError(e.message ?? '불러오기 실패'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            관리자
          </p>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">교재 관리</h1>
          <p className="text-xs text-slate-500 mt-1">
            교재에 단어를 모아두고 DAY 시험지를 자동 생성합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/vocab"
            className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-100"
          >
            ← 시험지 목록
          </Link>
          <Link
            to="/vocab/corpora/new"
            className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800"
          >
            새 교재
          </Link>
        </div>
      </div>

      {loading && <p className="text-slate-500 text-sm">불러오는 중...</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {!loading && items.length === 0 && (
        <p className="text-slate-500 text-sm">등록된 교재가 없습니다.</p>
      )}

      <div className="space-y-3">
        {items.map((s) => {
          // 목록은 단어 본문을 읽지 않는다 — 개수는 비정규화된 wordCount 사용
          const total = s.wordCount ?? s.words?.length ?? 0
          const used = s.usedCount ?? 0
          const remaining = Math.max(0, total - used)
          return (
            <Link
              key={s.id}
              // 학생 상세에서 넘어온 경우 그 학생을 그대로 물고 간다
              to={`/vocab/corpora/${s.id}${studentQuery}`}
              className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-brand-300 hover:shadow-md transition"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-900 truncate">
                  {s.title}
                </h2>
                <span className="text-xs text-slate-500 whitespace-nowrap">
                  DAY {s.lastDayNumber}까지 생성
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                전체 {total}단어 · 사용 {used} · 남은 {remaining}
                {s.perDay ? ` · DAY당 ${s.perDay}` : ''}
              </p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
