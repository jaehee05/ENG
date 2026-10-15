import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { useBackNav } from '../contexts/useBackNav'
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
import {
  Badge,
  BottomCTA,
  Button,
  Card,
  ListRow,
  ScoreValue,
  Section,
  SkeletonList,
  buttonClass,
  confirm,
  cx,
  inputClass,
} from '../components/ui'

const renderExampleWithBoldWord = highlightHead

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
      !(await confirm(
        `${a.studentName ? `${a.studentName} · ` : ''}${formatDate(a.createdAt) || '날짜 없음'} 응시 기록(${a.correct}/${a.total})을 삭제할까요?\n` +
          (a.practice
            ? '연습 기록이라 응시 횟수에는 영향이 없어요.'
            : '응시 횟수 제한이 있으면 한 번 더 풀 수 있게 돼요.'),
        { danger: true, confirmText: '삭제' },
      ))
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
      !(await confirm(
        `‘${set.title}’ 시험지를 삭제할까요?\n학생 응시 기록은 그대로 남아요. 교재에서 만든 DAY 시험지면 진행도도 함께 되돌아가, 같은 번호로 다시 만들 수 있어요.`,
        { danger: true, confirmText: '삭제' },
      ))
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

  // 교재에서 만든 DAY 시험지면 그 교재의 DAY 목록으로 돌아간다. 교재 소속은
  // 문서를 읽어야 알 수 있어 라우트 표로는 정할 수 없다. 아직 읽는 중이면
  // undefined 로 둬서 표의 기본값(단어 시험지 목록)이 쓰이게 한다.
  useBackNav({
    to: set?.seriesId ? `/vocab/series/${set.seriesId}` : undefined,
    label: set?.seriesId ? '교재' : undefined,
  })

  if (loading) return <SkeletonList rows={4} className="max-w-2xl mx-auto" />
  if (error) return <p className="text-[15px] text-red-500 px-1">{error}</p>
  if (!set) return null

  const testUsed = myAttempts.filter((a) => !a.practice).length
  const testLimit = isAdmin ? null : (set.maxAttempts ?? null)
  const remaining = testLimit !== null ? Math.max(0, testLimit - testUsed) : null
  const testBlocked = remaining === 0

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <header className="px-1 space-y-1.5">
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
              aria-label="시험지 제목"
              className={inputClass('flex-1 min-w-[10rem] bg-white text-[18px] font-bold')}
            />
            <Button size="sm" onClick={saveTitle} loading={savingTitle} disabled={!titleDraft.trim()}>
              저장
            </Button>
            <Button size="sm" variant="text" onClick={() => setEditingTitle(false)} disabled={savingTitle}>
              취소
            </Button>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <h1 className="min-w-0 text-[24px] sm:text-[26px] font-bold text-slate-900 tracking-tight leading-tight">
              {set.title}
            </h1>
            {isAdmin && (
              <div className="shrink-0 flex items-center">
                <Button size="sm" variant="text" onClick={startTitleEdit}>
                  제목 편집
                </Button>
                <Button size="sm" variant="text" className="text-red-500" onClick={handleDelete} loading={deleting}>
                  삭제
                </Button>
              </div>
            )}
          </div>
        )}
        <p className="text-[15px] text-slate-500">
          {set.words.length}단어 · {set.createdByName}
        </p>
      </header>

      {/* 응시 횟수 — 제한이 있을 때만 숫자를 크게 */}
      {testLimit !== null && (
        <Card className="grid grid-cols-2">
          <div>
            <p className="text-[13px] text-slate-500">남은 응시</p>
            <p className={cx('text-[28px] font-bold tabular-nums leading-tight mt-1', remaining === 0 ? 'text-red-500' : 'text-slate-900')}>
              {remaining}회
            </p>
          </div>
          <div>
            <p className="text-[13px] text-slate-500">사용 / 전체</p>
            <p className="text-[28px] font-bold tabular-nums leading-tight mt-1 text-slate-900">
              {testUsed}<span className="text-slate-400 text-[20px]"> / {testLimit}</span>
            </p>
          </div>
        </Card>
      )}

      <Card padded={false}>
        <ListRow to={`/vocab/${set.id}/sheet`} title="시험지로 보기·인쇄" />
      </Card>

      {myAttempts.length > 0 && (
        <MyAttemptsBox
          attempts={myAttempts}
          buildResultPath={(a) => `/vocab/${set.id}/result/${a.id}`}
          onDelete={isAdmin ? handleDeleteAttempt : undefined}
          deletingId={deletingAttemptId}
        />
      )}

      {isAdmin && allAttempts.length > 0 && (
        <Section title="학생 응시 기록" action={<span className="tabular-nums">{allAttempts.length}건</span>}>
          <Card padded={false}>
            {allAttempts.map((a) => (
              <div key={a.id} className="flex items-center gap-1 pr-3">
                <ListRow
                  className="flex-1 min-w-0"
                  to={`/vocab/${set.id}/result/${a.id}`}
                  chevron={false}
                  title={
                    <span className="inline-flex items-center gap-1.5 max-w-full">
                      <span className="truncate">{a.studentName || '(이름 없음)'}</span>
                      {a.practice && <Badge tone="amber">연습</Badge>}
                    </span>
                  }
                  description={formatDate(a.createdAt)}
                  trailing={<ScoreValue correct={a.correct} total={a.total} />}
                />
                <Link
                  to={`/vocab/student/${a.studentUid}`}
                  className="pressable shrink-0 h-9 px-2.5 inline-flex items-center rounded-xl text-[13px] font-medium text-slate-500 hover:bg-slate-100 active:bg-slate-100"
                >
                  학생
                </Link>
                <button
                  type="button"
                  onClick={() => handleDeleteAttempt(a)}
                  disabled={deletingAttemptId === a.id}
                  className="pressable shrink-0 h-9 px-2.5 rounded-xl text-[13px] font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 active:bg-red-50 disabled:opacity-50"
                >
                  {deletingAttemptId === a.id ? '삭제 중' : '삭제'}
                </button>
              </div>
            ))}
          </Card>
        </Section>
      )}

      <Section title={`단어 ${set.words.length}개`}>
        <ul className="space-y-3">
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
              <li key={i} className="rounded-card bg-white p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[22px] font-bold text-slate-900 leading-tight break-words">{w.en}</p>
                  <span className="shrink-0 text-[12px] text-slate-300 tabular-nums">{i + 1}</span>
                </div>
                {w.ipa && <p className="text-[14px] text-slate-500 mt-1">[{w.ipa}]</p>}
                <div className="mt-3 space-y-3">
                  {senses.map((s, si) => (
                    <div key={si} className="space-y-2">
                      <p className="text-[15px] leading-relaxed text-slate-800">
                        {senses.length > 1 && (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold mr-1.5 align-[1px]">
                            {si + 1}
                          </span>
                        )}
                        {s.pos && <span className="font-medium text-slate-500 mr-1.5">{s.pos}</span>}
                        <span className="font-semibold text-slate-900">{s.ko}</span>
                        {s.definitionEn && <span className="text-slate-500"> [{s.definitionEn}]</span>}
                        {s.synonyms && s.synonyms.length > 0 && (
                          <span className="text-slate-500"> = {s.synonyms.join(', ')}</span>
                        )}
                      </p>
                      {s.examples && s.examples.length > 0 && (
                        <div className="rounded-2xl bg-slate-50 px-4 py-3 space-y-2">
                          {s.examples.map((ex, ei) => (
                            <div key={ei} className="space-y-0.5">
                              {ex.en && (
                                <p className="text-[14px] leading-relaxed text-slate-800">
                                  {renderExampleWithBoldWord(ex.en, w.en)}
                                </p>
                              )}
                              {ex.ko && <p className="text-[14px] text-slate-500">{ex.ko}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      </Section>

      {/* 주 행동 — 시험 보기 */}
      <BottomCTA>
        {testBlocked ? (
          <Button size="lg" block disabled>
            응시 횟수를 모두 썼어요
          </Button>
        ) : (
          <Link to={`/vocab/${set.id}/take`} className={buttonClass({ size: 'lg', block: true })}>
            시험 보기{remaining !== null && <span className="font-medium opacity-80"> · {remaining}회 남음</span>}
          </Link>
        )}
      </BottomCTA>
    </div>
  )
}
