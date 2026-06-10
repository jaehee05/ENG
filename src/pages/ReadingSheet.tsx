import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getReading } from '../lib/firestore'
import type { Reading } from '../lib/types'

const CHOICE_MARKS = ['①', '②', '③', '④', '⑤']

function GlossaryColumn({ items, label }: { items: { en: string; ko: string }[]; label?: string }) {
  if (items.length === 0) return null
  return (
    <div className="glossary-col text-[10pt] leading-[1.5] text-slate-700">
      {label && (
        <p className="text-[9pt] uppercase tracking-wider text-slate-400 mb-1">{label}</p>
      )}
      <ul className="space-y-0.5">
        {items.map((g, i) => (
          <li key={i}>
            <span className="text-slate-500">*</span> <span className="font-medium">{g.en}</span>
            <span className="text-slate-500">:</span> <span>{g.ko}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ReadingSheet() {
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

  const choicesGlossary = r.choicesGlossary ?? []

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">{r.title} · 시험지</h1>
        <div className="flex gap-2">
          <Link
            to={`/reading/${r.id}`}
            className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-3 py-1.5 hover:bg-slate-100"
          >
            돌아가기
          </Link>
          <button
            onClick={() => window.print()}
            className="rounded-md bg-slate-900 text-white text-sm font-medium px-3 py-1.5 hover:bg-slate-800"
          >
            인쇄 / PDF 저장
          </button>
        </div>
      </div>

      <div className="-mx-4 px-4 overflow-x-auto print:mx-0 print:px-0 print:overflow-visible">
      <div className="sheet bg-white border border-slate-200 print:border-0 mx-auto min-w-[680px] max-w-[210mm] p-8 print:p-0 font-serif text-slate-900">
        {r.questions.map((q, qi) => (
          <section key={qi} className={qi > 0 ? 'mt-10 print:break-before-page' : ''}>
            <p className="text-[12pt] font-semibold mb-2">
              {qi + 1}. {q.q}
            </p>

            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 text-[11.5pt] leading-[1.7] whitespace-pre-wrap text-justify">
                {r.passage}
              </div>
              <GlossaryColumn items={r.glossary} />
            </div>

            <div className="grid grid-cols-3 gap-6 mt-4">
              <ol className="col-span-2 space-y-1 text-[11pt] leading-[1.6]">
                {q.choices.map((c, ci) => (
                  <li key={ci}>
                    {CHOICE_MARKS[ci]} {c}
                  </li>
                ))}
              </ol>
              <GlossaryColumn items={choicesGlossary} />
            </div>
          </section>
        ))}
      </div>
      </div>

      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 14mm;
          }
          body {
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
          header, nav {
            display: none !important;
          }
          main, main > div {
            padding: 0 !important;
            max-width: none !important;
          }
        }
      `}</style>
    </div>
  )
}
