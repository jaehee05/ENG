import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BackLink } from '../components/BackLink'
import { useAuth } from '../contexts/useAuth'
import {
  deleteAttempt,
  deleteVocabSet,
  formatDate,
  getVocabSet,
  listAttemptsForUser,
  listVocabAttemptsForSet,
  updateVocabSetTitle,
} from '../lib/firestore'
import { MyAttemptsBox } from '../components/MyAttemptsBox'
import { highlightHead } from '../lib/highlightWord'
import { isVisibleToStudent, type Attempt, type VocabSet } from '../lib/types'

const renderExampleWithBoldWord = highlightHead

function StartBox({
  total,
  testUsed,
  testLimit,
  href,
}: {
  total: number
  testUsed: number
  testLimit: number | null
  href: string
}) {
  const remaining = testLimit !== null ? Math.max(0, testLimit - testUsed) : null
  const testBlocked = remaining !== null && remaining === 0

  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-600">전체 {total}단어</p>
        {testLimit !== null && (
          <p className="text-sm">
            <span className="text-slate-500">응시:</span>{' '}
            <strong className="text-slate-900">{testUsed}회 사용</strong>
            {' · '}
            <strong className={remaining === 0 ? 'text-red-600' : 'text-brand-700'}>
              {remaining}회 남음
            </strong>
            <span className="text-slate-500"> / 총 {testLimit}회</span>
          </p>
        )}
      </div>
      <div className="flex gap-2 flex-wrap">
        {testBlocked ? (
          <span
            className="rounded-md bg-slate-200 text-slate-500 text-sm font-medium px-5 py-2.5 cursor-not-allowed"
            title="응시 횟수를 모두 사용했습니다."
          >
            응시 횟수 초과
          </span>
        ) : (
          <Link
            to={href}
            className="rounded-md bg-brand-600 text-white text-sm font-semibold px-5 py-2.5 hover:bg-brand-700 transition"
          >
            시험 보기
            {remaining !== null && (
              <span className="ml-1 font-normal">(남은 {remaining}회)</span>
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
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [savingTitle, setSavingTitle] = useState(false)
  const [deletingAttemptId, setDeletingAttemptId] = useState<string | null>(null)
  /** 관리자 전용 — 이 시험지의 모든 학생 응시 기록. */
  const [allAttempts, setAllAttempts] = useState<Attempt[]>([])

  useEffect(() => {
    if (!id || !profile) return
    Promise.all([getVocabSet(id), listAttemptsForUser(profile.id)])
      .then(([s, atts]) => {
        if (!s) setError('시험지를 찾을 수 없습니다.')
        // 교재에서 공개 대상을 지정했으면 목록에서 걸러지지만, 링크를 직접
        // 열면 여기까지 온다. 관리자는 언제나 열 수 있다.
        else if (!isAdmin && !isVisibleToStudent(s, profile.id)) {
          setError('이 시험지는 배정되지 않았습니다.')
        } else {
          setSet(s)
          setAttempts(atts)
        }
      })
      .catch((e) => setError(e.message ?? '불러오기 실패'))
      .finally(() => setLoading(false))
  }, [id, profile, isAdmin])

  // 시험지가 학생 공용이라, 관리자는 이 시험지를 푼 모두의 기록을 본다.
  useEffect(() => {
    if (!id || !isAdmin) return
    let cancelled = false
    listVocabAttemptsForSet(id)
      .then((atts) => {
        if (!cancelled) setAllAttempts(atts)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [id, isAdmin])

  const myAttempts = useMemo(
    () => attempts.filter((a) => a.type === 'vocab' && a.refId === id),
    [attempts, id],
  )

  /**
   * 응시 기록 삭제(관리자). 정식 응시를 지우면 응시 횟수 제한이 그만큼
   * 풀리므로, 다시 풀게 해 주려고 지우는 쓰임이 많다.
   */
  async function handleDeleteAttempt(a: Attempt) {
    if (
      !window.confirm(
        `${a.studentName ? `${a.studentName} · ` : ''}${formatDate(a.createdAt) || '날짜 없음'} 응시 기록(${a.correct}/${a.total})을 삭제하시겠습니까?\n` +
          (a.practice
            ? '연습 기록이라 응시 횟수에는 영향이 없습니다.'
            : '응시 횟수 제한이 있으면 한 번 더 풀 수 있게 됩니다.'),
      )
    )
      return
    setDeletingAttemptId(a.id)
    try {
      await deleteAttempt(a.id)
      setAttempts((prev) => prev.filter((x) => x.id !== a.id))
      setAllAttempts((prev) => prev.filter((x) => x.id !== a.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : '기록 삭제 실패')
    } finally {
      setDeletingAttemptId(null)
    }
  }

  function startTitleEdit() {
    if (!set) return
    setTitleDraft(set.title)
    setEditingTitle(true)
  }

  async function saveTitle() {
    if (!set) return
    const next = titleDraft.trim()
    if (!next || next === set.title) {
      setEditingTitle(false)
      return
    }
    setSavingTitle(true)
    try {
      await updateVocabSetTitle(set.id, next)
      setSet({ ...set, title: next })
      setEditingTitle(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '제목 저장 실패')
    } finally {
      setSavingTitle(false)
    }
  }

  async function handleDelete() {
    if (!set) return
    if (
      !window.confirm(
        `"${set.title}" 시험지를 삭제하시겠습니까?\n이 시험지의 학생 응시 기록은 그대로 남습니다.\n교재에서 만든 DAY 시험지면 진행도도 함께 되돌아가, 같은 번호로 다시 만들 수 있습니다.`,
      )
    )
      return
    setDeleting(true)
    try {
      await deleteVocabSet(set)
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
    <div className="space-y-5 max-w-3xl mx-auto">
      <BackLink to="/vocab" label="단어 시험지" />
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            단어 시험지
          </p>
          {editingTitle ? (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle()
                  if (e.key === 'Escape') setEditingTitle(false)
                }}
                autoFocus
                className="flex-1 min-w-[10rem] rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-lg font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={saveTitle}
                disabled={savingTitle || !titleDraft.trim()}
                className="rounded-md bg-slate-900 text-white text-xs font-medium px-3 py-1.5 hover:bg-slate-800 disabled:opacity-50"
              >
                {savingTitle ? '저장 중…' : '저장'}
              </button>
              <button
                type="button"
                onClick={() => setEditingTitle(false)}
                disabled={savingTitle}
                className="text-xs text-slate-500 hover:text-slate-900 px-1"
              >
                취소
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
                {set.title}
              </h1>
              {isAdmin && (
                <button
                  type="button"
                  onClick={startTitleEdit}
                  className="text-xs text-slate-500 hover:text-slate-900 px-1"
                >
                  편집
                </button>
              )}
            </div>
          )}
          <p className="text-xs text-slate-500 mt-1">
            {set.words.length}단어 · {set.createdByName}
          </p>
        </div>
        {isAdmin && !editingTitle && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs text-slate-400 hover:text-red-600 px-1 disabled:opacity-50"
          >
            {deleting ? '삭제 중…' : '삭제'}
          </button>
        )}
      </header>

      <StartBox
        total={set.words.length}
        testUsed={myAttempts.filter((a) => !a.practice).length}
        testLimit={isAdmin ? null : (set.maxAttempts ?? null)}
        href={`/vocab/${set.id}/take`}
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
          onDelete={isAdmin ? handleDeleteAttempt : undefined}
          deletingId={deletingAttemptId}
        />
      )}

      {isAdmin && allAttempts.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-baseline gap-2 flex-wrap">
            <h2 className="text-sm font-medium text-slate-900">학생 응시 기록</h2>
            <span className="text-xs text-slate-500">{allAttempts.length}건</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {allAttempts.map((a) => {
              const ratio = a.total > 0 ? Math.round((a.correct / a.total) * 100) : 0
              return (
                <li
                  key={a.id}
                  className="px-4 py-2.5 flex items-center gap-2.5 text-sm"
                >
                  <Link
                    to={`/vocab/student/${a.studentUid}`}
                    className="min-w-0 truncate font-medium text-slate-800 hover:underline"
                  >
                    {a.studentName || '(이름 없음)'}
                  </Link>
                  {a.practice && (
                    <span className="shrink-0 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      연습
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-[11px] text-slate-500">
                    {formatDate(a.createdAt)}
                  </span>
                  <span className="shrink-0 text-xs text-slate-600">
                    {a.correct}/{a.total}
                  </span>
                  <span
                    className={`shrink-0 text-sm font-semibold ${ratio >= 80 ? 'text-brand-700' : ratio >= 50 ? 'text-slate-700' : 'text-red-600'}`}
                  >
                    {ratio}%
                  </span>
                  <Link
                    to={`/vocab/${set.id}/result/${a.id}`}
                    className="shrink-0 text-xs text-slate-500 hover:text-slate-900 underline underline-offset-2"
                  >
                    보기
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDeleteAttempt(a)}
                    disabled={deletingAttemptId === a.id}
                    className="shrink-0 text-xs text-slate-400 hover:text-red-600 underline underline-offset-2 disabled:opacity-50"
                  >
                    {deletingAttemptId === a.id ? '삭제 중…' : '삭제'}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
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
