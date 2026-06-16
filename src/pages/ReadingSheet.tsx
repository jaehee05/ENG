import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getReading } from '../lib/firestore'
import { renderUnderlines as renderWithUnderlines } from '../lib/renderUnderlines'
import type { Reading, ReadingQuestion } from '../lib/types'

const CHOICE_MARKS = ['①', '②', '③', '④', '⑤']

function GlossaryColumn({ items, label }: { items: { en: string; ko: string }[]; label?: string }) {
  if (items.length === 0) return null
  return (
    <div className="glossary-col text-[9.5pt] leading-[1.55] text-slate-700 font-myeongjo">
      {label && (
        <p className="text-[8.5pt] uppercase tracking-wider text-slate-400 mb-1 font-gothic">
          {label}
        </p>
      )}
      <ul className="space-y-0.5">
        {items.map((g, i) => (
          <li key={i}>
            <span className="text-slate-500">*</span>{' '}
            <span className="font-bold text-slate-900">{g.en}</span>
            <span className="text-slate-500"> : </span>
            <span>{g.ko}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function bodyFor(q: ReadingQuestion, fallbackPassage: string): string {
  if (q.body?.trim()) return q.body
  if (q.image) return ''
  return fallbackPassage
}

export function ReadingSheet() {
  const { id } = useParams<{ id: string }>()
  const [r, setR] = useState<Reading | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function handlePrint() {
    if (!r) return
    const original = document.title
    const d = new Date()
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    document.title = `${r.title} 시험지 ${stamp}`
    setTimeout(() => {
      window.print()
      setTimeout(() => {
        document.title = original
      }, 500)
    }, 50)
  }

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
        <div className="flex gap-2 items-center">
          <Link
            to={`/reading/${r.id}`}
            className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-3 py-1.5 hover:bg-slate-100"
          >
            돌아가기
          </Link>
          <button
            onClick={handlePrint}
            className="rounded-md bg-slate-900 text-white text-sm font-medium px-3 py-1.5 hover:bg-slate-800"
          >
            PDF로 저장
          </button>
        </div>
      </div>

      <div className="-mx-4 px-4 overflow-x-auto print:mx-0 print:px-0 print:overflow-visible">
        <div className="sheet bg-white border border-slate-200 print:border-0 mx-auto min-w-[680px] max-w-[210mm] p-8 print:p-0 text-slate-900">
          <header className="sheet-header pb-3 mb-6 border-b-2 border-slate-900">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-[14pt] font-bold font-gothic text-slate-900">
                {r.title}
              </h2>
              <div className="text-[10pt] text-slate-600 font-gothic flex gap-4">
                <span>이름: ____________________</span>
                <span>점수: ______ / {r.questions.length * 5}점</span>
              </div>
            </div>
          </header>

          {r.questions.map((q, qi) => {
            const isOrder = q.type === 'order'
            const isSummary = q.type === 'summary'
            const orderParts = isOrder
              ? [
                  { tag: 'A', text: q.partA },
                  { tag: 'B', text: q.partB },
                  { tag: 'C', text: q.partC },
                  { tag: 'D', text: q.partD },
                ].filter((p) => !!p.text?.trim())
              : []
            const hasParts = orderParts.length > 0
            const body = hasParts ? '' : bodyFor(q, r.passage)
            const showSummary = !!q.summaryBox && q.summaryBox.trim().length > 0
            return (
              <section key={qi} className={qi > 0 ? 'mt-10 print:break-before-page' : ''}>
                <p className="text-[12pt] font-bold mb-3 font-gothic leading-snug">
                  <span className="text-slate-900">{qi + 1}.</span>{' '}
                  <span className="text-slate-800">{renderWithUnderlines(q.q)}</span>
                  {q.points && q.points >= 3 && (
                    <span className="ml-2 text-[10pt] font-normal text-slate-600">
                      [{q.points}점]
                    </span>
                  )}
                </p>

                {q.intro && q.intro.trim() && (
                  <div className="grid grid-cols-3 gap-6 mb-3">
                    <div className="col-span-2 border border-slate-700 p-4 text-[11pt] leading-[1.7] whitespace-pre-wrap font-myeongjo text-justify">
                      {renderWithUnderlines(q.intro)}
                    </div>
                    <div />
                  </div>
                )}

                {q.image && (
                  <div className="grid grid-cols-3 gap-6 mb-3">
                    <div className="col-span-2">
                      <img
                        src={q.image}
                        alt="도표"
                        className="w-full max-h-[14cm] object-contain border border-slate-300"
                      />
                    </div>
                    <div />
                  </div>
                )}

                {body && body.trim() &&
                  (isSummary ? (
                    <div className="grid grid-cols-3 gap-6">
                      <div className="col-span-2 border border-slate-700 p-4 text-[11.5pt] leading-[1.85] whitespace-pre-wrap text-justify font-myeongjo text-slate-900">
                        {renderWithUnderlines(body)}
                      </div>
                      <GlossaryColumn items={r.glossary} label="지문 단어" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-6">
                      <div className="col-span-2 text-[11.5pt] leading-[1.85] whitespace-pre-wrap text-justify font-myeongjo text-slate-900">
                        {renderWithUnderlines(body)}
                      </div>
                      <GlossaryColumn items={r.glossary} label="지문 단어" />
                    </div>
                  ))}

                {isSummary && body && body.trim() && showSummary && (
                  <div className="grid grid-cols-3 gap-6 my-2">
                    <div className="col-span-2 flex justify-center">
                      <svg
                        width="26"
                        height="30"
                        viewBox="0 0 22 26"
                        fill="currentColor"
                        aria-hidden
                      >
                        <path d="M7 0h8v14h5L11 26 1 14h6z" />
                      </svg>
                    </div>
                    <div />
                  </div>
                )}

                {hasParts && (
                  <div className="grid grid-cols-3 gap-6 space-y-0">
                    <div className="col-span-2 space-y-3 font-myeongjo text-[11.5pt] leading-[1.85] text-slate-900">
                      {orderParts.map((p) => (
                        <div key={p.tag} className="flex gap-2">
                          <span className="shrink-0 font-semibold">({p.tag})</span>
                          <span className="whitespace-pre-wrap text-justify">
                            {renderWithUnderlines(p.text ?? '')}
                          </span>
                        </div>
                      ))}
                    </div>
                    <GlossaryColumn items={r.glossary} label="지문 단어" />
                  </div>
                )}

                {q.summaryBox && q.summaryBox.trim() && (
                  <div className="grid grid-cols-3 gap-6 mt-3">
                    <div className="col-span-2 border border-slate-700 p-4 text-[11pt] leading-[1.7] whitespace-pre-wrap font-myeongjo">
                      {renderWithUnderlines(q.summaryBox)}
                    </div>
                    <div />
                  </div>
                )}

                <div className="grid grid-cols-3 gap-6 mt-4">
                  <ol className="col-span-2 space-y-1.5 text-[11pt] leading-[1.65] font-myeongjo">
                    {q.choices.map((c, ci) => (
                      <li key={ci} className="flex gap-2">
                        <span className="shrink-0 text-slate-900">{CHOICE_MARKS[ci]}</span>
                        <span className="text-slate-800">{renderWithUnderlines(c)}</span>
                      </li>
                    ))}
                  </ol>
                  <GlossaryColumn items={choicesGlossary} label="선지 단어" />
                </div>
              </section>
            )
          })}
        </div>
      </div>

      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 14mm;
          }
          html, body {
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print { display: none !important; }
          header.sheet-header { display: block !important; }
          .no-print, body > header, nav { display: none !important; }
          main, main > div {
            padding: 0 !important;
            max-width: none !important;
          }
          section { page-break-inside: avoid; break-inside: avoid; }
          .sheet { box-shadow: none !important; border: 0 !important; min-width: 0 !important; }
        }
      `}</style>
    </div>
  )
}
