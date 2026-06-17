import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getReading,
  listAttemptsForUser,
  updateReadingGlossaries,
  updateReadingQuestions,
} from '../lib/firestore'
import { useAuth } from '../contexts/useAuth'
import { GlossaryEditor } from '../components/GlossaryEditor'
import { MyAttemptsBox } from '../components/MyAttemptsBox'
import { QuestionView } from '../components/QuestionView'
import { useGlossQueue, type GlossEntry } from '../components/useGlossQueue'
import type { Attempt, Reading, WordEntry } from '../lib/types'

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
    const nextQuestions = r.questions.map((q, idx) =>
      idx === qi ? { ...q, answer: ci } : q,
    )
    setR({ ...r, questions: nextQuestions })
    try {
      await updateReadingQuestions(r.id, nextQuestions)
      setSavedNote(`${qi + 1}번 정답을 ${'①②③④⑤'[ci]}로 저장했어요.`)
      window.setTimeout(() => setSavedNote(null), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : '정답 저장 실패')
    }
  }

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!r) return null

  const choicesGlossary = r.choicesGlossary ?? []

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{r.title}</h1>
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
        {r.questions.map((q, qi) => (
          <QuestionView
            key={qi}
            index={qi}
            question={q}
            fallbackPassage={r.passage}
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
        ))}
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
