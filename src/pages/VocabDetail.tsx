import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BackLink } from '../components/BackLink'
import { useAuth } from '../contexts/useAuth'
import { listAccounts } from '../lib/account'
import {
  deleteVocabSet,
  getVocabSet,
  listAttemptsForUser,
  updateVocabSetOwner,
  updateVocabSetTitle,
} from '../lib/firestore'
import { MyAttemptsBox } from '../components/MyAttemptsBox'
import { highlightHead } from '../lib/highlightWord'
import type { Attempt, UserAccount, VocabSet } from '../lib/types'

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
  const [assigningOwner, setAssigningOwner] = useState(false)
  const [students, setStudents] = useState<UserAccount[]>([])
  const [ownerDraft, setOwnerDraft] = useState('')
  const [savingOwner, setSavingOwner] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    listAccounts()
      .then((all) =>
        setStudents(
          all.filter((a) => a.role === 'student' && a.status === 'active'),
        ),
      )
      .catch(() => {})
  }, [isAdmin])

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

  async function saveOwner() {
    if (!set) return
    if (!ownerDraft) {
      setAssigningOwner(false)
      return
    }
    const picked = students.find((s) => s.id === ownerDraft)
    if (!picked) return
    setSavingOwner(true)
    try {
      await updateVocabSetOwner(set.id, picked.id, picked.displayName)
      setSet({
        ...set,
        studentUid: picked.id,
        studentName: picked.displayName,
      })
      setAssigningOwner(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '학생 지정 실패')
    } finally {
      setSavingOwner(false)
    }
  }

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
          {isAdmin && (
            <div className="mt-2">
              {assigningOwner ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={ownerDraft}
                    onChange={(e) => setOwnerDraft(e.target.value)}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">— 학생 선택 —</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.displayName}
                        {s.school ? ` (${s.school})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={saveOwner}
                    disabled={savingOwner || !ownerDraft}
                    className="rounded-md bg-slate-900 text-white text-xs font-medium px-2.5 py-1 hover:bg-slate-800 disabled:opacity-50"
                  >
                    {savingOwner ? '저장 중…' : '저장'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssigningOwner(false)}
                    disabled={savingOwner}
                    className="text-xs text-slate-500 hover:text-slate-900 px-1"
                  >
                    취소
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-slate-500">소유 학생:</span>
                  {set.studentName ? (
                    <span className="text-brand-700 font-medium">
                      {set.studentName}
                    </span>
                  ) : (
                    <span className="text-amber-600 font-medium">
                      공용(legacy)
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setOwnerDraft(set.studentUid ?? '')
                      setAssigningOwner(true)
                    }}
                    className="text-slate-500 hover:text-slate-900 px-1"
                  >
                    {set.studentUid ? '변경' : '지정'}
                  </button>
                </div>
              )}
            </div>
          )}
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
