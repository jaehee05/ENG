import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { deleteVocabSet, getVocabSet, listAttemptsForUser } from '../lib/firestore'
import { MyAttemptsBox } from '../components/MyAttemptsBox'
import { highlightHead } from '../lib/highlightWord'
import type { Attempt, VocabSet } from '../lib/types'

const renderExampleWithBoldWord = highlightHead

function StartBox({
  total,
  testUsed,
  testLimit,
  buildHref,
}: {
  total: number
  testUsed: number
  testLimit: number | null
  buildHref: (params: {
    mode: 'practice' | 'test'
    from?: number
    to?: number
  }) => string
}) {
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(total)

  const clampedFrom = Math.min(Math.max(1, from), total)
  const clampedTo = Math.min(Math.max(clampedFrom, to), total)
  const practiceCount = clampedTo - clampedFrom + 1

  const testBlocked = testLimit !== null && testUsed >= testLimit

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-700">연습하기 (무제한)</p>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              시작 번호
            </label>
            <input
              type="number"
              min={1}
              max={total}
              value={from}
              onChange={(e) => setFrom(Number.parseInt(e.target.value, 10) || 1)}
              className="w-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <span className="pb-2 text-slate-400">~</span>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              끝 번호
            </label>
            <input
              type="number"
              min={1}
              max={total}
              value={to}
              onChange={(e) => setTo(Number.parseInt(e.target.value, 10) || total)}
              className="w-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <Link
            to={buildHref({ mode: 'practice', from: clampedFrom, to: clampedTo })}
            className="rounded-md border border-brand-600 text-brand-700 text-sm font-semibold px-5 py-2.5 hover:bg-brand-50 transition"
          >
            연습 시작 ({practiceCount}개)
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-slate-700">시험 보기 ({total}개 전체)</p>
          <p className="text-xs text-slate-500 mt-0.5">
            전 범위로 한 번에 응시합니다.
          </p>
        </div>
        {testBlocked ? (
          <span
            className="rounded-md bg-slate-200 text-slate-500 text-sm font-medium px-5 py-2.5 cursor-not-allowed text-center"
            title="응시 횟수를 모두 사용했습니다."
          >
            응시 횟수 초과 ({testUsed}/{testLimit}회)
          </span>
        ) : (
          <Link
            to={buildHref({ mode: 'test' })}
            className="rounded-md bg-brand-600 text-white text-sm font-semibold px-5 py-2.5 hover:bg-brand-700 transition"
          >
            시험 보기
            {testLimit !== null && (
              <span className="ml-1 font-normal">
                ({testUsed}/{testLimit}회)
              </span>
            )}
          </Link>
        )}
      </div>
    </div>
  )
}

export function VocabDetail() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isAdmin = profile?.role === 'admin'
  const [set, setSet] = useState<VocabSet | null>(null)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!id || !profile) return
    Promise.all([getVocabSet(id), listAttemptsForUser(profile.id)])
      .then(([s, atts]) => {
        if (!s) setError('시험지를 찾을 수 없습니다.')
        else {
          setSet(s)
          setAttempts(atts)
        }
      })
      .catch((e) => setError(e.message ?? '불러오기 실패'))
      .finally(() => setLoading(false))
  }, [id, profile])

  const myAttempts = useMemo(
    () => attempts.filter((a) => a.type === 'vocab' && a.refId === id),
    [attempts, id],
  )

  async function handleDelete() {
    if (!set) return
    if (!window.confirm(`"${set.title}" 시험지를 삭제하시겠습니까?\n이 시험지의 학생 응시 기록은 그대로 남습니다.`))
      return
    setDeleting(true)
    try {
      await deleteVocabSet(set.id)
      navigate('/vocab')
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패')
      setDeleting(false)
    }
  }

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!set) return null

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{set.title}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {set.words.length}단어 · {set.createdByName}
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-md border border-red-200 text-red-600 text-sm font-medium px-4 py-2 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? '삭제 중...' : '삭제'}
          </button>
        )}
      </div>

      <StartBox
        total={set.words.length}
        testUsed={myAttempts.filter((a) => !a.practice).length}
        testLimit={isAdmin ? null : (set.maxAttempts ?? null)}
        buildHref={({ mode, from, to }) => {
          const params = new URLSearchParams()
          params.set('mode', mode)
          if (from !== undefined) params.set('from', String(from))
          if (to !== undefined) params.set('to', String(to))
          return `/vocab/${set.id}/take?${params.toString()}`
        }}
      />

      <div className="flex justify-end">
        <Link
          to={`/vocab/${set.id}/sheet`}
          className="text-sm text-slate-500 hover:text-slate-900 underline"
        >
          시험지로 보기 / 인쇄
        </Link>
      </div>

      {myAttempts.length > 0 && (
        <MyAttemptsBox
          attempts={myAttempts}
          buildResultPath={(a) => `/vocab/${set.id}/result/${a.id}`}
        />
      )}

      <ul className="space-y-4">
        {set.words.map((w, i) => {
          const senses =
            w.senses && w.senses.length > 0
              ? w.senses
              : [
                  {
                    pos: w.pos,
                    ko: w.ko,
                    definitionEn: w.definitionEn,
                    synonyms: w.synonyms,
                    examples:
                      w.example || w.exampleKo
                        ? [{ en: w.example ?? '', ko: w.exampleKo }]
                        : [],
                  },
                ]
          return (
            <li
              key={i}
              className="rounded-lg border border-slate-200 bg-white overflow-hidden"
            >
              <div className="px-5 pt-4 pb-2 border-b border-slate-100">
                <p className="text-xs font-mono text-slate-400 tracking-wider">
                  {String(i + 1).padStart(4, '0')}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 px-5 py-4">
                <div className="sm:col-span-3">
                  <p className="text-2xl font-bold text-slate-900 leading-tight">{w.en}</p>
                  {w.ipa && (
                    <p className="text-sm text-slate-500 mt-1">[{w.ipa}]</p>
                  )}
                </div>
                <div className="sm:col-span-9 space-y-3">
                  {senses.map((s, si) => (
                    <div key={si} className="space-y-1.5">
                      <p className="text-sm leading-relaxed text-slate-800">
                        {s.pos && (
                          <span className="font-medium text-slate-700 mr-2">{s.pos}</span>
                        )}
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-900 text-white text-[10px] font-bold mr-1.5 align-middle">
                          {si + 1}
                        </span>
                        <span className="font-semibold text-slate-900">{s.ko}</span>
                        {s.definitionEn && (
                          <span className="text-slate-600"> [{s.definitionEn}]</span>
                        )}
                        {s.synonyms && s.synonyms.length > 0 && (
                          <span className="text-slate-500">
                            {' '}= {s.synonyms.join(', ')}
                          </span>
                        )}
                      </p>
                      {s.examples && s.examples.length > 0 && (
                        <div className="rounded-md bg-slate-100 px-4 py-3 space-y-2">
                          {s.examples.map((ex, ei) => (
                            <div key={ei} className="space-y-0.5">
                              {ex.en && (
                                <p className="text-sm leading-relaxed text-slate-800">
                                  {renderExampleWithBoldWord(ex.en, w.en)}
                                </p>
                              )}
                              {ex.ko && (
                                <p className="text-sm text-slate-600">{ex.ko}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
