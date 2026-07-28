import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BackLink } from '../components/BackLink'
import {
  applyReadingOrder,
  getReading,
  getReadingOrder,
  listAttemptsForUser,
  listReadings,
  regradeReadingAttempts,
  updateReadingGlossaries,
  updateReadingQuestions,
} from '../lib/firestore'
import { useAuth } from '../contexts/useAuth'
import { GlossaryEditor } from '../components/GlossaryEditor'
import { MyAttemptsBox } from '../components/MyAttemptsBox'
import { QuestionView } from '../components/QuestionView'
import { useGlossQueue, type GlossEntry } from '../components/useGlossQueue'
import { SharedPassageBlock } from '../components/SharedPassageBlock'
import { renderUnderlines } from '../lib/renderUnderlines'
import {
  getSharedPassageBlock,
  inferQuestionNumbers,
  passageFallbackPerQuestion,
  questionsWithoutShared,
  type Attempt,
  type Reading,
  type WordEntry,
} from '../lib/types'

function mergeEntries(base: WordEntry[], adds: { en: string; ko: string }[]): WordEntry[] {
  const next = [...base]
  for (const { en, ko } of adds) {
    const idx = next.findIndex((g) => g.en.toLowerCase() === en.toLowerCase())
    if (idx >= 0) next[idx] = { en: next[idx].en, ko }
    else next.push({ en, ko })
  }
  return next
}

export function ReadingDetail() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [r, setR] = useState<Reading | null>(null)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState<string | null>(null)
  const [siblings, setSiblings] = useState<{ id: string; title: string }[]>([])
  const [explDraft, setExplDraft] = useState<Record<number, string>>({})
  const [explSavingIdx, setExplSavingIdx] = useState<number | null>(null)

  function explValue(qi: number): string {
    if (!r) return ''
    if (explDraft[qi] !== undefined) return explDraft[qi]
    return r.questions[qi]?.explanation ?? ''
  }
  function explDirty(qi: number): boolean {
    if (!r) return false
    if (explDraft[qi] === undefined) return false
    return explDraft[qi] !== (r.questions[qi]?.explanation ?? '')
  }

  async function saveExplanation(qi: number) {
    if (!r) return
    const value = (explDraft[qi] ?? '').trim()
    setExplSavingIdx(qi)
    try {
      const nextQs = r.questions.map((q, i) =>
        i === qi
          ? { ...q, explanation: value || undefined }
          : q,
      )
      await updateReadingQuestions(r.id, nextQs)
      setR({ ...r, questions: nextQs })
      setExplDraft((prev) => {
        const copy = { ...prev }
        delete copy[qi]
        return copy
      })
      const num = r.questions[qi]?.number ?? qi + 1
      setSavedNote(`${num}번 해설 저장됨`)
      window.setTimeout(() => setSavedNote(null), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : '해설 저장 실패')
    } finally {
      setExplSavingIdx(null)
    }
  }

  useEffect(() => {
    if (!isAdmin) return
    Promise.all([listReadings(), getReadingOrder()])
      .then(([list, order]) => {
        const ordered = order.length > 0 ? applyReadingOrder(list, order) : list
        setSiblings(ordered.map((x) => ({ id: x.id, title: x.title })))
      })
      .catch(() => {
        // 형제 목록 실패는 미리보기에 치명적이지 않음
      })
  }, [isAdmin])

  const navIndex = useMemo(
    () => (r ? siblings.findIndex((x) => x.id === r.id) : -1),
    [siblings, r],
  )
  const prevReading =
    navIndex > 0 ? siblings[navIndex - 1] : null
  const nextReading =
    navIndex >= 0 && navIndex < siblings.length - 1
      ? siblings[navIndex + 1]
      : null

  useEffect(() => {
    if (!id || !profile) return
    Promise.all([getReading(id), listAttemptsForUser(profile.id)])
      .then(([x, atts]) => {
        if (!x) setError('지문을 찾을 수 없습니다.')
        else {
          setR(x)
          setAttempts(atts)
        }
      })
      .catch((e) => setError(e.message ?? '불러오기 실패'))
      .finally(() => setLoading(false))
  }, [id, profile])

  const myAttempts = useMemo(
    () => attempts.filter((a) => a.type === 'reading' && a.refId === id),
    [attempts, id],
  )

  async function handleSave(entries: GlossEntry[]) {
    if (!r) return
    const nextGlossary = mergeEntries(
      r.glossary,
      entries.filter((e) => e.target === 'glossary'),
    )
    const nextChoices = mergeEntries(
      r.choicesGlossary ?? [],
      entries.filter((e) => e.target === 'choices'),
    )
    await updateReadingGlossaries(r.id, nextGlossary, nextChoices)
    setR({ ...r, glossary: nextGlossary, choicesGlossary: nextChoices })
    setSavedNote(`단어 ${entries.length}개를 단어장에 반영했습니다.`)
    window.setTimeout(() => setSavedNote(null), 2500)
  }

  const { addWord, panel } = useGlossQueue({
    aiContext: r?.passage ?? '',
    showTargets: true,
    onSave: handleSave,
  })

  async function handleReplaceGlossary(next: WordEntry[]) {
    if (!r) return
    await updateReadingGlossaries(r.id, next, r.choicesGlossary ?? [])
    setR({ ...r, glossary: next })
  }

  async function handleReplaceChoicesGlossary(next: WordEntry[]) {
    if (!r) return
    await updateReadingGlossaries(r.id, r.glossary, next)
    setR({ ...r, choicesGlossary: next })
  }

  async function handleSetAnswer(qi: number, ci: number) {
    if (!r || !isAdmin) return
    const prev = r.questions[qi]?.answer ?? -1
    if (prev === ci) return
    const nextQuestions = r.questions.map((q, idx) =>
      idx === qi ? { ...q, answer: ci } : q,
    )
    setR({ ...r, questions: nextQuestions })
    try {
      await updateReadingQuestions(r.id, nextQuestions)
      const touched = await regradeReadingAttempts(r.id, qi, ci)
      const marker = '①②③④⑤'[ci] ?? `${ci + 1}`
      const num = r.questions[qi]?.number ?? qi + 1
      setSavedNote(
        touched > 0
          ? `${num}번 정답을 ${marker}로 저장 · 학생 기록 ${touched}건 재채점`
          : `${num}번 정답을 ${marker}로 저장했어요.`,
      )
      window.setTimeout(() => setSavedNote(null), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : '정답 저장 실패')
    }
  }

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!r) return null

  const choicesGlossary = r.choicesGlossary ?? []

  return (
    <div className="space-y-6 max-w-3xl mx-auto relative">
      <BackLink to="/reading" label="지문 목록" />
      {isAdmin && prevReading && (
        <Link
          to={`/reading/${prevReading.id}`}
          title={`이전: ${prevReading.title}`}
          className="hidden xl:flex fixed left-6 top-1/2 -translate-y-1/2 z-20 h-12 w-12 items-center justify-center rounded-full bg-white border border-slate-300 text-slate-700 shadow-md hover:bg-slate-100 hover:text-slate-900 transition"
          aria-label="이전 지문"
        >
          ◀
        </Link>
      )}
      {isAdmin && nextReading && (
        <Link
          to={`/reading/${nextReading.id}`}
          title={`다음: ${nextReading.title}`}
          className="hidden xl:flex fixed right-6 top-1/2 -translate-y-1/2 z-20 h-12 w-12 items-center justify-center rounded-full bg-white border border-slate-300 text-slate-700 shadow-md hover:bg-slate-100 hover:text-slate-900 transition"
          aria-label="다음 지문"
        >
          ▶
        </Link>
      )}
      {isAdmin && (prevReading || nextReading) && (
        <div className="xl:hidden flex items-center justify-between gap-2 text-xs">
          {prevReading ? (
            <Link
              to={`/reading/${prevReading.id}`}
              className="flex items-center gap-1 rounded-md border border-slate-300 bg-white text-slate-700 px-3 py-1.5 hover:bg-slate-100 max-w-[45%] truncate"
            >
              <span>◀</span>
              <span className="truncate">{prevReading.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {nextReading ? (
            <Link
              to={`/reading/${nextReading.id}`}
              className="flex items-center gap-1 rounded-md border border-slate-300 bg-white text-slate-700 px-3 py-1.5 hover:bg-slate-100 max-w-[45%] truncate"
            >
              <span className="truncate">{nextReading.title}</span>
              <span>▶</span>
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            지문
          </p>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">{r.title}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {r.questions.length}문항 · 지문 단어 {r.glossary.length}개 · 선지 단어 {choicesGlossary.length}개
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAdmin && (
            <Link
              to={`/reading/${r.id}/edit`}
              className="flex-1 sm:flex-none text-center rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-100"
            >
              지문 수정
            </Link>
          )}
          <Link
            to={`/reading/${r.id}/sheet`}
            className="flex-1 sm:flex-none text-center rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-100"
          >
            시험지로 보기
          </Link>
          <Link
            to={`/reading/${r.id}/take`}
            className="flex-1 sm:flex-none text-center rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 transition"
          >
            풀이 시작
          </Link>
        </div>
      </div>

      {savedNote && (
        <p className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-700">{savedNote}</p>
      )}

      {myAttempts.length > 0 && (
        <MyAttemptsBox
          attempts={myAttempts}
          buildResultPath={(a) => `/reading/${r.id}/result/${a.id}`}
        />
      )}

      {isAdmin && (
        <p className="text-xs text-slate-500">
          학생이 보는 화면 그대로의 미리보기입니다. 본문/선지에서 단어를 드래그하면
          단어장에 추가되고, 선지를 누르면 그 선지가 정답으로 저장됩니다.
        </p>
      )}

      <div className="space-y-4">
        {(() => {
          const numbered = inferQuestionNumbers(r.title, r.questions)
          const shared = getSharedPassageBlock({ ...r, questions: numbered })
          const questions = questionsWithoutShared(numbered, shared)
          const fbList = shared
            ? questions.map(() => undefined)
            : passageFallbackPerQuestion(r.passage, questions)
          return (
            <>
              {shared && (
                <SharedPassageBlock
                  block={shared}
                  passageGlossary={r.glossary}
                  onSelectPassageWord={
                    isAdmin ? (w) => addWord(w, 'glossary') : undefined
                  }
                />
              )}
              {questions.map((q, qi) => (
                <div key={qi} className="space-y-2">
                  <QuestionView
                    index={qi}
                    question={q}
                    fallbackPassage={fbList[qi]}
                    passageGlossary={r.glossary}
                    choicesGlossary={choicesGlossary}
                    selected={isAdmin ? q.answer : -1}
                    onSelect={isAdmin ? (ci) => handleSetAnswer(qi, ci) : () => {}}
                    onSelectPassageWord={
                      isAdmin ? (w) => addWord(w, 'glossary') : undefined
                    }
                    onSelectChoiceWord={
                      isAdmin ? (w) => addWord(w, 'choices') : undefined
                    }
                  />
                  {isAdmin && (
                    <div className="rounded-md border border-amber-200 bg-amber-50/40 px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                          📖 문제 해설 (관리자 전용)
                        </p>
                        {explDirty(qi) && (
                          <button
                            type="button"
                            onClick={() => saveExplanation(qi)}
                            disabled={explSavingIdx === qi}
                            className="rounded-md bg-brand-600 text-white text-xs font-medium px-3 py-1 hover:bg-brand-700 disabled:opacity-50"
                          >
                            {explSavingIdx === qi ? '저장 중...' : '저장'}
                          </button>
                        )}
                      </div>
                      <textarea
                        value={explValue(qi)}
                        onChange={(e) =>
                          setExplDraft((prev) => ({ ...prev, [qi]: e.target.value }))
                        }
                        rows={4}
                        placeholder="문제 해설 (학생이 틀리고 재도전 정답 후 표시)"
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-myeongjo leading-relaxed"
                      />
                      {!explDirty(qi) && explValue(qi).trim() && (
                        <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed font-myeongjo border-t border-amber-200/70 pt-2">
                          {renderUnderlines(explValue(qi))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </>
          )
        })()}
      </div>

      {isAdmin && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">단어장 수정</h2>
          <GlossaryEditor
            title="지문 단어장"
            words={r.glossary}
            onSave={handleReplaceGlossary}
          />
          <GlossaryEditor
            title="선지 단어장"
            words={choicesGlossary}
            onSave={handleReplaceChoicesGlossary}
          />
        </div>
      )}

      {isAdmin && panel}
    </div>
  )
}
