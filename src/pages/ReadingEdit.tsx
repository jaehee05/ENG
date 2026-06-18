import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  deleteReading,
  getReading,
  regradeReadingAttempts,
  updateReadingContent,
  updateReadingGlossaries,
  updateReadingPassageKo,
} from '../lib/firestore'
import { parseWordList, type Reading, type ReadingQuestion } from '../lib/types'
import {
  extractGlossary,
  parseExplanations,
  translatePassage,
  wordsToText,
} from '../lib/api'
import { extractTextFromHtml } from '../lib/htmlText'
import { handleUnderlineHotkey } from '../lib/textareaHotkeys'
import { QuestionEditor } from '../components/QuestionEditor'
import { emptyDraftQuestion, type DraftQuestion } from '../components/draftQuestion'

function fromQuestion(q: ReadingQuestion): DraftQuestion {
  const choices = [...q.choices]
  while (choices.length < 5) choices.push('')
  return {
    type: q.type ?? 'standard',
    q: q.q,
    body: q.body ?? '',
    intro: q.intro ?? '',
    summaryBox: q.summaryBox ?? '',
    choices: choices.slice(0, 5),
    answer: q.answer,
    points: q.points,
    number: q.number,
    image: q.image,
    imageHtml: q.imageHtml,
    explanation: q.explanation,
    partA: q.partA ?? '',
    partB: q.partB ?? '',
    partC: q.partC ?? '',
    partD: q.partD ?? '',
    partAKo: q.partAKo,
    partBKo: q.partBKo,
    partCKo: q.partCKo,
    partDKo: q.partDKo,
  }
}

function trimDraft(q: DraftQuestion) {
  const out: {
    type: DraftQuestion['type']
    q: string
    choices: string[]
    answer: number
    body?: string
    intro?: string
    summaryBox?: string
    points?: number
    number?: number
    image?: string
    imageHtml?: string
    explanation?: string
    partA?: string
    partB?: string
    partC?: string
    partD?: string
    partAKo?: string
    partBKo?: string
    partCKo?: string
    partDKo?: string
  } = {
    type: q.type,
    q: q.q.trim(),
    choices: q.choices.map((c) => c.trim()),
    answer: q.answer,
  }
  if (q.body.trim()) out.body = q.body.trim()
  if (q.intro.trim()) out.intro = q.intro.trim()
  if (q.summaryBox.trim()) out.summaryBox = q.summaryBox.trim()
  if (q.points && q.points !== 2) out.points = q.points
  if (q.number && q.number > 0) out.number = q.number
  if (q.image) out.image = q.image
  if (q.imageHtml && q.imageHtml.trim()) out.imageHtml = q.imageHtml.trim()
  if (q.explanation && q.explanation.trim()) out.explanation = q.explanation.trim()
  if (q.partA.trim()) out.partA = q.partA.trim()
  if (q.partB.trim()) out.partB = q.partB.trim()
  if (q.partC.trim()) out.partC = q.partC.trim()
  if (q.partD.trim()) out.partD = q.partD.trim()
  if (q.partAKo && q.partAKo.trim()) out.partAKo = q.partAKo.trim()
  if (q.partBKo && q.partBKo.trim()) out.partBKo = q.partBKo.trim()
  if (q.partCKo && q.partCKo.trim()) out.partCKo = q.partCKo.trim()
  if (q.partDKo && q.partDKo.trim()) out.partDKo = q.partDKo.trim()
  return out
}

export function ReadingEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [original, setOriginal] = useState<Reading | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [passage, setPassage] = useState('')
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyDraftQuestion()])
  const [glossaryRaw, setGlossaryRaw] = useState('')
  const [choicesGlossaryRaw, setChoicesGlossaryRaw] = useState('')
  const [passageKo, setPassageKo] = useState('')
  const [translating, setTranslating] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const glossary = useMemo(() => parseWordList(glossaryRaw), [glossaryRaw])
  const choicesGlossary = useMemo(
    () => parseWordList(choicesGlossaryRaw),
    [choicesGlossaryRaw],
  )

  useEffect(() => {
    if (!id) return
    let cancelled = false
    getReading(id)
      .then((r) => {
        if (cancelled) return
        if (!r) {
          setError('지문을 찾을 수 없습니다.')
          return
        }
        setOriginal(r)
        setTitle(r.title)
        setPassage(r.passage)
        setQuestions(
          r.questions.length > 0 ? r.questions.map(fromQuestion) : [emptyDraftQuestion()],
        )
        setGlossaryRaw(wordsToText(r.glossary ?? []))
        setChoicesGlossaryRaw(wordsToText(r.choicesGlossary ?? []))
        setPassageKo(r.passageKo ?? '')
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '불러오기에 실패했습니다.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  async function handleExtract() {
    setError(null)
    const sources: string[] = []
    if (passage.trim()) sources.push(passage.trim())
    for (const q of questions) {
      if (q.body && q.body.trim()) sources.push(q.body.trim())
      if (q.intro && q.intro.trim()) sources.push(q.intro.trim())
      if (q.summaryBox && q.summaryBox.trim()) sources.push(q.summaryBox.trim())
      if (q.partA && q.partA.trim()) sources.push(q.partA.trim())
      if (q.partB && q.partB.trim()) sources.push(q.partB.trim())
      if (q.partC && q.partC.trim()) sources.push(q.partC.trim())
      if (q.partD && q.partD.trim()) sources.push(q.partD.trim())
      if (q.imageHtml && q.imageHtml.trim())
        sources.push(extractTextFromHtml(q.imageHtml))
    }
    if (sources.length === 0) {
      setError('단어를 추출할 영어 텍스트가 없습니다.')
      return
    }
    setExtracting(true)
    try {
      const combined = sources.filter(Boolean).join('\n\n')
      const allChoices = questions.flatMap((q) => q.choices).filter((c) => c.trim())
      const result = await extractGlossary({
        passage: combined,
        choices: allChoices,
      })
      setGlossaryRaw(wordsToText(result.glossary))
      setChoicesGlossaryRaw(wordsToText(result.choicesGlossary))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 추출에 실패했습니다.')
    } finally {
      setExtracting(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!original) return
    if (!title.trim()) return setError('제목을 입력하세요.')
    if (questions.length === 0) return setError('문제를 1개 이상 입력하세요.')
    for (const [i, q] of questions.entries()) {
      if (!q.q.trim()) return setError(`${i + 1}번 문제의 발문을 입력하세요.`)
      if (q.answer < 0 || q.answer > 4)
        return setError(`${i + 1}번 문제의 정답을 선택하세요.`)
    }
    // 본문 검증 완화: 43~45 세트처럼 다른 문항이 공유 지문을 쓰는 경우도 허용

    setSubmitting(true)
    try {
      const trimmedQuestions = questions.map(trimDraft)
      await updateReadingContent(original.id, {
        title: title.trim(),
        passage: passage.trim(),
        questions: trimmedQuestions,
      })
      await updateReadingGlossaries(original.id, glossary, choicesGlossary)
      await updateReadingPassageKo(original.id, passageKo.trim())
      // 답이 바뀐 인덱스가 있으면 해당 문항만 학생 기록 재채점
      for (let i = 0; i < trimmedQuestions.length; i++) {
        const prev = original.questions[i]?.answer
        const next = trimmedQuestions[i].answer
        if (typeof prev === 'number' && prev !== next) {
          await regradeReadingAttempts(original.id, i, next)
        }
      }
      navigate(`/reading/${original.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleTranslate() {
    const firstQ = questions[0]
    const isOrderSet =
      firstQ?.type === 'order' &&
      (firstQ.partA?.trim() ||
        firstQ.partB?.trim() ||
        firstQ.partC?.trim() ||
        firstQ.partD?.trim())

    const htmlTexts = questions
      .map((q) => (q.imageHtml ? extractTextFromHtml(q.imageHtml) : ''))
      .filter((t) => t.trim())
    const parts: string[] = []
    if (passage.trim()) parts.push(`[지문]\n${passage.trim()}`)
    for (const q of questions) {
      if (q.intro && q.intro.trim())
        parts.push(`[주어진 글]\n${q.intro.trim()}`)
      if (q.body && q.body.trim()) parts.push(`[본문]\n${q.body.trim()}`)
      if (q.summaryBox && q.summaryBox.trim())
        parts.push(`[요약문]\n${q.summaryBox.trim()}`)
    }
    for (const t of htmlTexts) parts.push(`[안내문]\n${t}`)

    if (!isOrderSet && parts.length === 0) {
      setError('번역할 영어 텍스트가 없습니다.')
      return
    }
    setError(null)
    setTranslating(true)
    try {
      // 1) order partA~D 단락별 번역
      if (isOrderSet) {
        const tags = ['A', 'B', 'C', 'D'] as const
        const koMap: Record<string, string> = {}
        for (const tag of tags) {
          const enKey =
            tag === 'A'
              ? 'partA'
              : tag === 'B'
                ? 'partB'
                : tag === 'C'
                  ? 'partC'
                  : 'partD'
          const en = firstQ?.[enKey]?.trim() ?? ''
          if (!en) continue
          koMap[tag] = await translatePassage(en)
        }
        setQuestions((prev) =>
          prev.map((q, i) =>
            i === 0
              ? {
                  ...q,
                  partAKo: koMap.A ?? q.partAKo ?? '',
                  partBKo: koMap.B ?? q.partBKo ?? '',
                  partCKo: koMap.C ?? q.partCKo ?? '',
                  partDKo: koMap.D ?? q.partDKo ?? '',
                }
              : q,
          ),
        )
      }
      // 2) 통합 passageKo (passage + imageHtml 텍스트). order 세트라도
      //    passage나 imageHtml에 다른 본문이 있으면 같이 번역.
      if (parts.length > 0) {
        const combined = parts.join('\n\n')
        const ko = await translatePassage(combined)
        setPassageKo(ko)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '번역에 실패했습니다.')
    } finally {
      setTranslating(false)
    }
  }

  const [explanationsText, setExplanationsText] = useState('')
  const [explanationsBusy, setExplanationsBusy] = useState(false)
  const [explanationsNote, setExplanationsNote] = useState<string | null>(null)

  async function handleParseExplanations() {
    if (!explanationsText.trim()) {
      setExplanationsNote('해설 텍스트를 먼저 입력하세요.')
      return
    }
    setExplanationsBusy(true)
    setExplanationsNote(null)
    try {
      // title에서 시작 번호 추출해 number 비어있는 문항에 채움 (18번 / 41-42 / 43-45 등)
      const titleM = /^(.+?)\s+(\d+)(?:-(\d+))?\s*(?:번|문제)?\s*$/.exec(
        title.trim(),
      )
      const startNum = titleM ? Number.parseInt(titleM[2], 10) : NaN
      const refs = questions.map((q, i) => ({
        index: i,
        number:
          q.number && q.number > 0
            ? q.number
            : Number.isFinite(startNum)
              ? startNum + i
              : 0,
        q: q.q,
      }))
      const result = await parseExplanations({
        questions: refs,
        text: explanationsText,
      })
      if (result.length === 0) {
        setExplanationsNote('AI가 해설을 분배하지 못했습니다.')
        return
      }
      let filled = 0
      setQuestions((prev) =>
        prev.map((q, i) => {
          const hit = result.find((r) => r.index === i)
          if (!hit || !hit.explanation.trim()) return q
          filled++
          return { ...q, explanation: hit.explanation.trim() }
        }),
      )
      setExplanationsNote(`${filled}개 문항에 해설을 채웠습니다.`)
    } catch (err) {
      setExplanationsNote(
        err instanceof Error ? err.message : '해설 분배에 실패했습니다.',
      )
    } finally {
      setExplanationsBusy(false)
    }
  }

  const explPdfRef = useRef<HTMLInputElement>(null)
  const [explPdfBusy, setExplPdfBusy] = useState(false)
  async function onExplPdfPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    setExplPdfBusy(true)
    setExplanationsNote(null)
    try {
      const { extractTextFromPdfFile } = await import('../lib/pdfText')
      const parts: string[] = []
      for (const f of files) {
        if (f.size > 30 * 1024 * 1024) {
          setExplanationsNote(`${f.name}: 30MB 초과 — 건너뜀`)
          continue
        }
        const text = await extractTextFromPdfFile(f)
        if (text.trim()) parts.push(`[${f.name}]\n${text.trim()}`)
      }
      if (parts.length === 0) {
        setExplanationsNote('추출된 텍스트가 없습니다 (스캔 PDF는 미지원).')
        return
      }
      setExplanationsText((prev) =>
        prev.trim() ? prev + '\n\n' + parts.join('\n\n') : parts.join('\n\n'),
      )
      setExplanationsNote(`PDF ${parts.length}개에서 텍스트 추출 완료`)
    } catch (err) {
      setExplanationsNote(err instanceof Error ? err.message : 'PDF 추출 실패')
    } finally {
      setExplPdfBusy(false)
    }
  }

  async function handleDelete() {
    if (!original) return
    if (!window.confirm(`"${original.title}" 지문을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) {
      return
    }
    setDeleting(true)
    try {
      await deleteReading(original.id)
      navigate('/reading')
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제에 실패했습니다.')
      setDeleting(false)
    }
  }

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중...</p>
  if (error && !original) return <p className="text-red-600 text-sm">{error}</p>
  if (!original) return null

  const inputCls =
    'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          관리자
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">지문 수정</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">제목</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            지문{' '}
            <span className="font-normal text-slate-500">
              (일반 유형 문제의 공용 본문)
            </span>
          </label>
          <textarea
            value={passage}
            onChange={(e) => setPassage(e.target.value)}
            onKeyDown={(e) => handleUnderlineHotkey(e, setPassage)}
            rows={12}
            className={inputCls}
          />
          <p className="text-xs text-slate-400 mt-1">
            드래그 후 ⌘U(Ctrl+U)로 선택 부분에 밑줄
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-700">문제</label>
            <button
              type="button"
              onClick={() => setQuestions((prev) => [...prev, emptyDraftQuestion()])}
              className="text-sm text-slate-700 hover:text-slate-900 underline"
            >
              + 문제 추가
            </button>
          </div>

          {questions.map((q, i) => (
            <QuestionEditor
              key={i}
              index={i}
              question={q}
              canRemove={questions.length > 1}
              onChange={(next) =>
                setQuestions((prev) => prev.map((x, idx) => (idx === i ? next : x)))
              }
              onRemove={() => setQuestions((prev) => prev.filter((_, idx) => idx !== i))}
            />
          ))}
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-700">
              지문 한글 해석{' '}
              <span className="font-normal text-slate-500">
                (학생이 틀린 문제에서 표시)
              </span>
            </h3>
            <button
              type="button"
              onClick={handleTranslate}
              disabled={translating}
              className="rounded-md bg-brand-600 text-white text-sm font-medium px-3 py-1.5 hover:bg-brand-700 disabled:opacity-50"
            >
              {translating ? '번역 중...' : 'AI로 번역 (덮어쓰기)'}
            </button>
          </div>
          <textarea
            value={passageKo}
            onChange={(e) => setPassageKo(e.target.value)}
            rows={10}
            placeholder="한국어 해석. 비워두면 학생에게 '아직 등록되지 않았습니다'로 안내됩니다."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-700">
              해설 일괄 입력{' '}
              <span className="font-normal text-slate-500">
                (AI가 각 문항에 분배)
              </span>
            </h3>
            <div className="flex items-center gap-2">
              <input
                ref={explPdfRef}
                type="file"
                accept="application/pdf"
                multiple
                onChange={onExplPdfPick}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => explPdfRef.current?.click()}
                disabled={explPdfBusy}
                className="rounded-md border border-slate-300 text-slate-700 text-xs font-medium px-3 py-1.5 hover:bg-slate-100 disabled:opacity-50"
              >
                {explPdfBusy ? 'PDF 추출 중...' : '+ 해설 PDF'}
              </button>
              <button
                type="button"
                onClick={handleParseExplanations}
                disabled={explanationsBusy}
                className="rounded-md bg-brand-600 text-white text-xs font-medium px-3 py-1.5 hover:bg-brand-700 disabled:opacity-50"
              >
                {explanationsBusy ? '분류 중...' : 'AI로 문항에 분배'}
              </button>
            </div>
          </div>
          <textarea
            value={explanationsText}
            onChange={(e) => setExplanationsText(e.target.value)}
            rows={6}
            placeholder="해설 텍스트를 통째 붙여넣거나 PDF 첨부. AI가 41번/42번/... 매칭해 각 문항 해설을 채웁니다."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {explanationsNote && (
            <p className="text-xs text-brand-700">{explanationsNote}</p>
          )}
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-700">단어 풀이</h3>
            <button
              type="button"
              onClick={handleExtract}
              disabled={extracting}
              className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-50"
            >
              {extracting ? '추출 중...' : 'AI로 단어 추출 (덮어쓰기)'}
            </button>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              지문 단어풀이 ({glossary.length}개)
            </label>
            <textarea
              value={glossaryRaw}
              onChange={(e) => setGlossaryRaw(e.target.value)}
              rows={10}
              placeholder="abandon : 버리다, 포기하다"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              선지 단어풀이 ({choicesGlossary.length}개)
            </label>
            <textarea
              value={choicesGlossaryRaw}
              onChange={(e) => setChoicesGlossaryRaw(e.target.value)}
              rows={6}
              placeholder="paradigm : 패러다임, 인식 틀"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting || submitting}
            className="rounded-md text-red-600 text-sm font-medium px-3 py-2 hover:bg-red-50 disabled:opacity-60"
          >
            {deleting ? '삭제 중...' : '지문 삭제'}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate(`/reading/${original.id}`)}
              className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-5 py-2 hover:bg-slate-100"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting || deleting}
              className="rounded-md bg-brand-600 text-white text-sm font-medium px-5 py-2 hover:bg-brand-700 transition disabled:opacity-60"
            >
              {submitting ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
