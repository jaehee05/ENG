import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { createReading, listReadings } from '../lib/firestore'
import { extractGlossary, parseReadingText, wordsToText } from '../lib/api'
import { parseWordList, type ReadingQuestionType } from '../lib/types'
import { handleUnderlineHotkey } from '../lib/textareaHotkeys'
import { resizeImageForUpload } from '../lib/imageResize'
import { QuestionEditor } from '../components/QuestionEditor'
import { emptyDraftQuestion, type DraftQuestion } from '../components/draftQuestion'

interface AttachedImage {
  id: string
  name: string
  previewUrl: string
  base64: string
  mediaType: string
}

const MAX_IMAGE_SIZE = 15 * 1024 * 1024
const MAX_IMAGES = 8

const ALLOWED_TYPES: ReadingQuestionType[] = [
  'standard',
  'cloze',
  'order',
  'insert',
  'summary',
  'irrelevant',
  'underline-grammar',
  'underline-vocab',
]

function toReadingType(t: string): ReadingQuestionType {
  return (ALLOWED_TYPES as string[]).includes(t) ? (t as ReadingQuestionType) : 'standard'
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

export function ReadingNew() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [titleAutoFilled, setTitleAutoFilled] = useState(false)
  const [categoryMode, setCategoryMode] = useState<'pick' | 'new'>('pick')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [questionNumber, setQuestionNumber] = useState('')
  const [knownCategories, setKnownCategories] = useState<string[]>([])

  useEffect(() => {
    listReadings()
      .then((all) => {
        const TITLE_RE = /^(.+?)\s+(\d+)\s*(?:번|문제)?\s*$/
        const set = new Set<string>()
        for (const r of all) {
          const m = TITLE_RE.exec(r.title.trim())
          if (m) set.add(m[1].trim())
        }
        setKnownCategories(
          [...set].sort((a, b) =>
            a.localeCompare(b, 'ko', { numeric: true, sensitivity: 'base' }),
          ),
        )
      })
      .catch(() => {})
  }, [])

  const activeCategory =
    categoryMode === 'new' ? newCategory.trim() : selectedCategory.trim()

  useEffect(() => {
    if (!activeCategory) return
    if (title && !titleAutoFilled) return
    const trimmed = questionNumber.trim()
    const next = trimmed ? `${activeCategory} ${trimmed}번` : activeCategory
    setTitle(next)
    setTitleAutoFilled(true)
  }, [activeCategory, questionNumber])

  const [passage, setPassage] = useState('')
  const [passageKo, setPassageKo] = useState('')
  const [glossaryRaw, setGlossaryRaw] = useState('')
  const [choicesGlossaryRaw, setChoicesGlossaryRaw] = useState('')
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyDraftQuestion()])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [rawText, setRawText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseNotice, setParseNotice] = useState<string | null>(null)
  const [images, setImages] = useState<AttachedImage[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const [pdfExtracting, setPdfExtracting] = useState(false)
  const [pdfNote, setPdfNote] = useState<string | null>(null)

  async function onPdfPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    setPdfExtracting(true)
    setPdfNote(null)
    try {
      const { extractTextFromPdfFile } = await import('../lib/pdfText')
      const parts: string[] = []
      for (const f of files) {
        if (f.size > 30 * 1024 * 1024) {
          setPdfNote(`${f.name}: 30MB 초과 — 건너뜀`)
          continue
        }
        const text = await extractTextFromPdfFile(f)
        if (text.trim()) {
          parts.push(`[${f.name}]\n${text.trim()}`)
        }
      }
      if (parts.length === 0) {
        setPdfNote('추출된 텍스트가 없습니다 (스캔 이미지 PDF는 이미지 첨부로 시도하세요).')
        return
      }
      setRawText((prev) => {
        const next = prev.trim() ? prev + '\n\n' + parts.join('\n\n') : parts.join('\n\n')
        return next
      })
      setPdfNote(
        `${parts.length}개 PDF에서 텍스트 추출 완료 · 위 입력란에 추가됨`,
      )
    } catch (err) {
      setPdfNote(err instanceof Error ? err.message : 'PDF 추출 실패')
    } finally {
      setPdfExtracting(false)
    }
  }

  async function addFiles(files: File[]) {
    const accepted = files.filter((f) => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(f.name))
    if (accepted.length === 0) return
    const room = MAX_IMAGES - images.length
    if (room <= 0) {
      setError(`이미지는 ${MAX_IMAGES}장까지 첨부할 수 있습니다.`)
      return
    }
    const picked = accepted.slice(0, room)
    for (const file of picked) {
      if (file.size > MAX_IMAGE_SIZE) {
        setError(`${file.name}: 15MB를 초과합니다.`)
        continue
      }
      try {
        const resized = await resizeImageForUpload(file)
        setImages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: file.name || '캡쳐',
            previewUrl: `data:${resized.mediaType};base64,${resized.base64}`,
            base64: resized.base64,
            mediaType: resized.mediaType,
          },
        ])
      } catch (err) {
        setError(`${file.name}: ${err instanceof Error ? err.message : '읽기 실패'}`)
      }
    }
  }

  function onFilePick(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : []
    void addFiles(files)
    e.target.value = ''
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (const it of items) {
      if (it.kind === 'file') {
        const f = it.getAsFile()
        if (f && f.type.startsWith('image/')) files.push(f)
      }
    }
    if (files.length > 0) {
      e.preventDefault()
      void addFiles(files)
    }
  }

  function removeImage(id: string) {
    setImages((prev) => prev.filter((x) => x.id !== id))
  }

  const glossary = useMemo(() => parseWordList(glossaryRaw), [glossaryRaw])
  const choicesGlossary = useMemo(() => parseWordList(choicesGlossaryRaw), [choicesGlossaryRaw])

  async function handleParse() {
    setError(null)
    setParseNotice(null)
    if (!rawText.trim() && images.length === 0) {
      setError('붙여넣은 텍스트나 첨부 이미지가 없습니다.')
      return
    }
    setParsing(true)
    try {
      const result = await parseReadingText({
        text: rawText.trim() ? rawText : undefined,
        images: images.length > 0 ? images.map((i) => i.previewUrl) : undefined,
      })
      if (result.questions.length === 0) {
        setError('문항을 찾지 못했습니다. 원문을 다시 확인하세요.')
        return
      }
      if (result.title && !title.trim()) setTitle(result.title)
      if (result.passage) setPassage(result.passage)
      if (result.passageKo) setPassageKo(result.passageKo)
      const chartImages = images.length > 0 ? images.map((i) => i.previewUrl) : []
      let chartCursor = 0
      const drafts: DraftQuestion[] = result.questions.map((q) => {
        const choices = q.choices.slice(0, 5)
        while (choices.length < 5) choices.push('')
        let image: string | undefined
        if (q.hasChart && chartImages.length > 0) {
          image = chartImages[Math.min(chartCursor, chartImages.length - 1)]
          chartCursor++
        }
        return {
          type: toReadingType(q.type),
          q: q.q,
          body: q.body,
          intro: q.intro,
          summaryBox: q.summaryBox,
          choices,
          answer: -1,
          points: q.points && q.points >= 1 && q.points <= 5 ? q.points : undefined,
          number: q.number && q.number > 0 ? q.number : undefined,
          image,
          explanation: q.explanation && q.explanation.trim() ? q.explanation.trim() : undefined,
          partA: q.partA ?? '',
          partB: q.partB ?? '',
          partC: q.partC ?? '',
          partD: q.partD ?? '',
          partAKo: q.partAKo ?? '',
          partBKo: q.partBKo ?? '',
          partCKo: q.partCKo ?? '',
          partDKo: q.partDKo ?? '',
        }
      })
      setQuestions(drafts)
      const nums = drafts
        .map((d) => d.number)
        .filter((n): n is number => typeof n === 'number')
      if (nums.length > 0) {
        const lo = Math.min(...nums)
        const hi = Math.max(...nums)
        setQuestionNumber(lo === hi ? String(lo) : `${lo}-${hi}`)
      }
      setParseNotice(
        `${drafts.length}개 문항을 자동 입력했습니다. 정답은 직접 선택하세요.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '자동 분류에 실패했습니다.')
    } finally {
      setParsing(false)
    }
  }

  async function handleExtract() {
    setError(null)
    if (!passage.trim() && !questions.some((q) => q.body.trim())) {
      setError('지문 또는 문제 본문을 먼저 입력하세요.')
      return
    }
    setExtracting(true)
    try {
      const bodyParts = questions.map((q) => q.body.trim()).filter(Boolean)
      const combined = [passage.trim(), ...bodyParts].filter(Boolean).join('\n\n')
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
    if (!profile) return
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
      const id = await createReading({
        title: title.trim(),
        passage: passage.trim(),
        passageKo: passageKo.trim(),
        glossary,
        choicesGlossary,
        questions: questions.map(trimDraft),
        createdBy: profile.id,
        createdByName: profile.displayName,
      })
      navigate(`/reading/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold text-slate-900">새 지문</h1>

      <div className="rounded-md border border-brand-200 bg-brand-50/40 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-brand-700">원문 / 캡쳐로 자동 입력</h2>
            <p className="text-xs text-slate-600 mt-0.5">
              텍스트를 붙여넣거나 시험지·교재 캡쳐 이미지를 첨부하면 AI가 분류해 폼을 채워줍니다.
            </p>
          </div>
          <button
            type="button"
            onClick={handleParse}
            disabled={parsing}
            className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-50 shrink-0"
          >
            {parsing ? '분석 중...' : '자동 분류'}
          </button>
        </div>
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => handleUnderlineHotkey(e, setRawText)}
          rows={8}
          placeholder={
            '예) 31. 다음 빈칸에 들어갈 말로 가장 적절한 것은? [3점]\n  Recent studies suggest that ...\n  ① ... ② ... ③ ... ④ ... ⑤ ...\n  정답: ③\n\n(이 칸에 캡쳐 이미지를 그대로 붙여넣어도 됩니다 · 드래그 후 ⌘U로 밑줄)'
          }
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />

        <div className="flex items-center gap-3 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            onChange={onFilePick}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={images.length >= MAX_IMAGES}
            className="rounded-md border border-brand-300 bg-white text-brand-700 text-xs font-medium px-3 py-1.5 hover:bg-brand-50 disabled:opacity-50"
          >
            + 이미지 첨부
          </button>
          {images.length > 0 && (
            <span className="text-xs text-slate-500">
              {images.length} / {MAX_IMAGES}장
            </span>
          )}
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf"
            multiple
            onChange={onPdfPick}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => pdfInputRef.current?.click()}
            disabled={pdfExtracting}
            className="rounded-md border border-brand-300 bg-white text-brand-700 text-xs font-medium px-3 py-1.5 hover:bg-brand-50 disabled:opacity-50"
          >
            {pdfExtracting ? 'PDF 추출 중...' : '+ PDF 첨부 (텍스트 추출)'}
          </button>
          {pdfNote && (
            <span className="text-xs text-slate-500">{pdfNote}</span>
          )}
        </div>

        {images.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {images.map((img) => (
              <div
                key={img.id}
                className="relative rounded-md border border-slate-300 bg-white overflow-hidden"
              >
                <img
                  src={img.previewUrl}
                  alt={img.name}
                  className="w-full h-32 object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  className="absolute top-1 right-1 rounded-full bg-slate-900/70 text-white text-xs px-2 py-0.5 hover:bg-slate-900"
                  aria-label="삭제"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {parseNotice && <p className="text-xs text-brand-700">{parseNotice}</p>}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">시험명 / 번호</p>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                시험명
              </label>
              {categoryMode === 'pick' ? (
                <select
                  value={selectedCategory}
                  onChange={(e) => {
                    if (e.target.value === '__new__') {
                      setCategoryMode('new')
                      setSelectedCategory('')
                    } else {
                      setSelectedCategory(e.target.value)
                    }
                  }}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">— 선택 —</option>
                  {knownCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="__new__">+ 새 시험명 추가...</option>
                </select>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="예: 2027학년도 6월 모의평가"
                    autoFocus
                    className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryMode('pick')
                      setNewCategory('')
                    }}
                    className="text-xs text-slate-500 hover:text-slate-900 px-2"
                  >
                    취소
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                문항 번호
              </label>
              <input
                type="text"
                value={questionNumber}
                onChange={(e) => setQuestionNumber(e.target.value)}
                placeholder="18 또는 41-42"
                className="w-32 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            제목{' '}
            <span className="font-normal text-slate-500">
              (위 시험명·번호로 자동 생성, 직접 수정도 가능)
            </span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setTitleAutoFilled(false)
            }}
            placeholder="예: 2027학년도 6월 모의평가 18번"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            지문{' '}
            <span className="font-normal text-slate-500">
              (일반 유형 문제의 공용 본문, 필요 없으면 비워도 됨)
            </span>
          </label>
          <textarea
            value={passage}
            onChange={(e) => setPassage(e.target.value)}
            onKeyDown={(e) => handleUnderlineHotkey(e, setPassage)}
            rows={10}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="text-xs text-slate-400 mt-1">
            본문에서 단어/구를 드래그한 뒤 ⌘U(Ctrl+U)로 밑줄 표시
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            지문 한글 해석{' '}
            <span className="font-normal text-slate-500">
              (학생이 틀린 문제에서 표시. 자동 분류 시 한글 해석/문제 해설을 같이 붙여넣으면 한글 해석은 여기에, 문제 해설은 각 문항에 자동 분배)
            </span>
          </label>
          <textarea
            value={passageKo}
            onChange={(e) => setPassageKo(e.target.value)}
            rows={8}
            placeholder="한국어 해석. 비워두면 학생에게 '아직 등록되지 않았습니다'로 안내됩니다."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
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
            <h3 className="text-sm font-semibold text-slate-700">단어 풀이</h3>
            <button
              type="button"
              onClick={handleExtract}
              disabled={extracting}
              className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-50"
            >
              {extracting ? '추출 중...' : 'AI로 단어 추출'}
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

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand-600 text-white text-sm font-medium px-5 py-2 hover:bg-brand-700 transition disabled:opacity-60"
          >
            {submitting ? '저장 중...' : '저장'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/reading')}
            className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-5 py-2 hover:bg-slate-100"
          >
            취소
          </button>
        </div>
      </form>
    </div>
  )
}
