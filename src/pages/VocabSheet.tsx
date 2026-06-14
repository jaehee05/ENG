import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getVocabSet } from '../lib/firestore'
import { highlightHead } from '../lib/highlightWord'
import type { VocabSet, WordEntry } from '../lib/types'

const renderExampleWithBoldWord = highlightHead

interface Hints {
  pos?: string
  definitionEn?: string
  synonyms?: string[]
  example?: string
}

function firstSenseHints(w: WordEntry): Hints {
  const first = w.senses?.[0]
  if (first) {
    return {
      pos: first.pos ?? w.pos,
      definitionEn: first.definitionEn ?? w.definitionEn,
      synonyms: first.synonyms?.length ? first.synonyms : w.synonyms,
      example: first.examples?.[0]?.en ?? w.example,
    }
  }
  return {
    pos: w.pos,
    definitionEn: w.definitionEn,
    synonyms: w.synonyms,
    example: w.example,
  }
}

export function VocabSheet() {
  const { id } = useParams<{ id: string }>()
  const [search, setSearch] = useSearchParams()
  const [set, setSet] = useState<VocabSet | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const showHints = search.get('hints') !== '0'
  const withAnswers = search.get('answers') === '1'

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

  function toggle(key: 'hints' | 'answers', on: boolean) {
    const next = new URLSearchParams(search)
    if (key === 'hints') {
      if (on) next.delete('hints')
      else next.set('hints', '0')
    } else {
      if (on) next.set('answers', '1')
      else next.delete('answers')
    }
    setSearch(next, { replace: true })
  }

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!set) return null

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <Link
            to={`/vocab/${set.id}`}
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            ← 돌아가기
          </Link>
          <h1 className="text-xl font-semibold text-slate-900 mt-1">
            {set.title} · 시험지
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showHints}
              onChange={(e) => toggle('hints', e.target.checked)}
              className="accent-brand-600"
            />
            예문·영영 힌트
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={withAnswers}
              onChange={(e) => toggle('answers', e.target.checked)}
              className="accent-brand-600"
            />
            정답표 (답안 표시)
          </label>
          <button
            onClick={() => window.print()}
            className="rounded-md bg-slate-900 text-white text-sm font-medium px-3 py-1.5 hover:bg-slate-800"
          >
            인쇄 / PDF 저장
          </button>
        </div>
      </div>

      <div className="-mx-4 px-4 overflow-x-auto print:mx-0 print:px-0 print:overflow-visible">
        <div className="sheet bg-white mx-auto max-w-[210mm] print:max-w-none px-6 print:p-0 print:bg-white">
          <div className="print-header flex items-baseline justify-between mb-6 pb-3 border-b border-slate-300">
            <h2 className="text-lg font-bold text-slate-900">{set.title}</h2>
            <div className="text-xs text-slate-500">
              총 {set.words.length}단어
            </div>
          </div>

          <ul className="space-y-3 print:space-y-2">
            {set.words.map((w, i) => {
              const hints = firstSenseHints(w)
              return (
                <li
                  key={i}
                  className="rounded-lg border border-slate-200 bg-white overflow-hidden break-inside-avoid"
                >
                  <div className="grid grid-cols-12 gap-3 px-4 py-3 items-baseline">
                    <div className="col-span-1 text-[10pt] font-mono text-slate-400">
                      {String(i + 1).padStart(4, '0')}
                    </div>
                    <div className="col-span-3">
                      <p className="text-[14pt] font-bold text-slate-900 leading-tight">
                        {w.en}
                      </p>
                      {w.ipa && (
                        <p className="text-[10pt] text-slate-500 mt-0.5">[{w.ipa}]</p>
                      )}
                    </div>
                    <div className="col-span-8 space-y-1.5">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        {hints.pos && (
                          <span className="text-[10pt] font-medium text-slate-700">
                            {hints.pos}
                          </span>
                        )}
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-slate-900 text-white text-[8pt] font-bold align-middle">
                          1
                        </span>
                        {withAnswers ? (
                          <span className="text-[11pt] font-semibold text-slate-900">
                            {w.ko}
                          </span>
                        ) : (
                          <span className="flex-1 min-w-[120px] border-b border-slate-400 h-5" />
                        )}
                      </div>
                      {showHints &&
                        (hints.definitionEn ||
                          (hints.synonyms && hints.synonyms.length > 0)) && (
                          <p className="text-[10pt] text-slate-700 leading-snug">
                            {hints.definitionEn && (
                              <span>[{hints.definitionEn}]</span>
                            )}
                            {hints.synonyms && hints.synonyms.length > 0 && (
                              <span className="text-slate-500">
                                {hints.definitionEn ? ' ' : ''}={' '}
                                {hints.synonyms.join(', ')}
                              </span>
                            )}
                          </p>
                        )}
                      {showHints && hints.example && (
                        <div className="rounded bg-slate-100 px-3 py-2">
                          <p className="text-[10pt] text-slate-800 leading-snug">
                            {renderExampleWithBoldWord(hints.example, w.en)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 14mm;
          }
          body { background: white !important; }
          .no-print { display: none !important; }
          header, nav { display: none !important; }
          main, main > div {
            padding: 0 !important;
            max-width: none !important;
          }
          li { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  )
}
