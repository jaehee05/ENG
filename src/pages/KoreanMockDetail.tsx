import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { downloadMarkdown, mockToMarkdown } from '../lib/explanationMarkdown'
import {
  deleteAttempt,
  deleteKoreanMock,
  formatDate,
  getExplChars,
  getExplStyles,
  getKoreanMock,
  listAttemptsForUser,
  listKoreanMockAttempts,
  regradeKoreanMockAttempts,
  setExplChars,
  setExplStyles,
  updateKoreanMock,
} from '../lib/firestore'
import {
  deleteMockExplanationPdf,
  uploadMockExplanationPdf,
} from '../lib/mockStorage'
import { MyAttemptsBox } from '../components/MyAttemptsBox'
import { estimateMockCutoffs, extractGlossary, translatePassage } from '../lib/api'
import { MockCutoffEditor } from '../components/MockCutoffEditor'
import { ExamFilePicker } from '../components/ExamFilePicker'
import { RichTextEditor } from '../components/RichTextEditor'
import { useBackdropDismiss } from '../lib/useBackdropDismiss'
import {
  choiceMark,
  getMockSubject,
  hasMockExplanation,
  isBlankHtml,
  hasMockPassage,
  MOCK_SUBJECT_LABEL,
  mockLinkLabels,
  questionPoints,
  wrongChoiceNumbers,
  type Attempt,
  type ExplStyle,
  type KoreanMock,
  type KoreanMockElective,
  type KoreanMockQuestion,
  type MockGradeCut,
  type MockSubject,
  type WordEntry,
} from '../lib/types'

const SUBJECT_BADGE_CLASS: Record<MockSubject, string> = {
  korean: 'bg-rose-50 text-rose-700 border-rose-200',
  english: 'bg-sky-50 text-sky-700 border-sky-200',
}

/** 지금 시각 'HH:MM:SS' — 저장됐는지 눈으로 확인하는 용도. */
function nowClock(): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date())
}

/**
 * 저장할 선지 해설만 남긴다. 빈 값과 정답 번호는 넣지 않는다
 * (Firestore 는 undefined 를 거부하고, 정답에는 오답 해설이 없다).
 */
function normalizeChoiceDraft(
  draft: Record<string, string>,
  answer: number,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, html] of Object.entries(draft)) {
    if (Number(k) === answer) continue
    // 다 지운 칸에는 <br> 만 남는다 — 그대로 저장하면 학생 화면에 빈 칸이 뜬다
    if (!isBlankHtml(html)) out[k] = html.trim()
  }
  return out
}

/** 비교용 — 보이는 게 없는 HTML 은 빈 문자열과 같게 친다. */
function blankToEmpty(html: string | undefined): string {
  return isBlankHtml(html) ? '' : (html ?? '').trim()
}

/** 키 순서에 흔들리지 않게 비교용 문자열로 만든다. */
function choiceCompareKey(m: Record<string, string> | undefined): string {
  return JSON.stringify(
    Object.entries(m ?? {}).sort(([a], [b]) => a.localeCompare(b)),
  )
}

export function KoreanMockDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [mock, setMock] = useState<KoreanMock | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 학생 본인의 응시 기록
  const [myAttempts, setMyAttempts] = useState<Attempt[]>([])
  // 관리자의 전체 학생 응시 기록
  const [allAttempts, setAllAttempts] = useState<Attempt[]>([])

  // 편집 상태 (관리자)
  const [editing, setEditing] = useState(false)
  const [eTitle, setETitle] = useState('')
  const [eSubject, setESubject] = useState<MockSubject>('korean')
  const [eQuestions, setEQuestions] = useState<KoreanMockQuestion[]>([])
  const [eElectives, setEElectives] = useState<KoreanMockElective[]>([])
  const [eComment, setEComment] = useState('')
  const [eCutoffs, setECutoffs] = useState<MockGradeCut[] | null>(null)
  const [examText, setExamText] = useState('')
  // 문항 해설 편집 (정답 편집과 분리 — 오클릭 방지, 즉시 저장)
  const [explTarget, setExplTarget] = useState<{
    group: 'common' | number
    qIdx: number
  } | null>(null)
  const [explDraft, setExplDraft] = useState('')
  // 선지별 오답 해설 초안. 키는 선택지 번호('1'~'5').
  const [explChoiceDraft, setExplChoiceDraft] = useState<Record<string, string>>({})
  // 문항별 출제자 한마디 초안.
  const [explNoteDraft, setExplNoteDraft] = useState('')
  // 연계 교재 출처 초안 ('수능완성 p.134').
  const [explLinkDraft, setExplLinkDraft] = useState('')
  const [explSaving, setExplSaving] = useState(false)
  /** Ctrl+S 로 창을 닫지 않고 저장했을 때 그 시각. 저장됐는지 눈으로 확인용. */
  const [explSavedAt, setExplSavedAt] = useState<string | null>(null)
  const [explStyles, setExplStylesState] = useState<ExplStyle[]>([])
  // 미리 등록해 둔 문자표 (전체 공통). 스타일과 같은 자리에서 관리한다.
  const [explChars, setExplCharsState] = useState<string[]>([])
  // 같은 모달 안에서 해설 / 오답 리뷰 지문을 탭으로 전환
  const [explTab, setExplTab] = useState<'expl' | 'passage'>('expl')
  const [passageDraft, setPassageDraft] = useState('')
  const [passageKoDraft, setPassageKoDraft] = useState('')
  const [glossDraft, setGlossDraft] = useState<WordEntry[]>([])
  const [aiBusy, setAiBusy] = useState<'ko' | 'gloss' | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [cutoffBusy, setCutoffBusy] = useState(false)
  const [cutoffError, setCutoffError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // 해설 PDF (관리자)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getKoreanMock(id)
      .then((m) => {
        if (!m) setError('모의고사를 찾을 수 없습니다.')
        else setMock(m)
      })
      .catch((e) => setError(e.message ?? '불러오기 실패'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!profile || !id) return
    listAttemptsForUser(profile.id)
      .then((all) =>
        setMyAttempts(all.filter((a) => a.type === 'korean_mock' && a.refId === id)),
      )
      .catch(() => {})
  }, [profile, id])

  useEffect(() => {
    if (!isAdmin || !id) return
    listKoreanMockAttempts(id).then(setAllAttempts).catch(() => {})
  }, [isAdmin, id])

  useEffect(() => {
    if (!isAdmin) return
    getExplStyles().then(setExplStylesState).catch(() => {})
    getExplChars().then(setExplCharsState).catch(() => {})
  }, [isAdmin])

  async function saveExplStyles(list: ExplStyle[]) {
    setExplStylesState(list)
    try {
      await setExplStyles(list)
    } catch {
      // 실패 시 다음 열람 때 서버 값으로 복원됨
    }
  }

  async function saveExplChars(list: string[]) {
    setExplCharsState(list)
    try {
      await setExplChars(list)
    } catch {
      // 스타일과 같다 — 실패해도 다음 열람 때 서버 값으로 복원된다
    }
  }

  const grouped = useMemo(() => {
    // 학생별로 최신 응시만 표시
    const byUid = new Map<string, Attempt>()
    for (const a of allAttempts) {
      const prev = byUid.get(a.studentUid)
      const cur = a.createdAt?.toMillis?.() ?? 0
      const prevMs = prev?.createdAt?.toMillis?.() ?? 0
      if (!prev || cur > prevMs) byUid.set(a.studentUid, a)
    }
    return [...byUid.values()].sort((a, b) =>
      a.studentName.localeCompare(b.studentName, 'ko'),
    )
  }, [allAttempts])

  function startEdit() {
    if (!mock) return
    setETitle(mock.title)
    setESubject(getMockSubject(mock))
    setEQuestions(mock.questions.map((q) => ({ ...q })))
    setEElectives(
      (mock.electives ?? []).map((el) => ({
        ...el,
        questions: el.questions.map((q) => ({ ...q })),
      })),
    )
    setEComment(mock.examinerComment ?? '')
    setECutoffs(mock.gradeCutoffs ?? null)
    setCutoffError(null)
    setEditing(true)
  }

  async function handleGenerateCutoffs() {
    setCutoffError(null)
    const commonPts = eQuestions.reduce((s, q) => s + questionPoints(q), 0)
    const elPts = eElectives[0]
      ? eElectives[0].questions.reduce((s, q) => s + questionPoints(q), 0)
      : 0
    const totalPoints = commonPts + elPts
    if (totalPoints <= 0) {
      setCutoffError('먼저 정답을 입력하세요.')
      return
    }
    setCutoffBusy(true)
    try {
      const cuts = await estimateMockCutoffs({
        subject: eSubject,
        title: eTitle.trim() || undefined,
        totalQuestions: eQuestions.length + (eElectives[0]?.questions.length ?? 0),
        totalPoints,
        practice: true,
        examText: examText || undefined,
      })
      setECutoffs(cuts)
    } catch (err) {
      setCutoffError(err instanceof Error ? err.message : 'AI 등급컷 생성 실패')
    } finally {
      setCutoffBusy(false)
    }
  }

  async function saveEdit() {
    if (!mock) return
    if (!eTitle.trim()) return
    setSaving(true)
    try {
      const patch = {
        title: eTitle.trim(),
        subject: eSubject,
        questions: eQuestions,
        electives: eElectives,
        examinerComment: eComment,
        gradeCutoffs: eCutoffs ?? [],
      }
      await updateKoreanMock(mock.id, patch)
      const updatedMock = {
        ...mock,
        title: eTitle.trim(),
        subject: eSubject,
        questions: eQuestions,
        electives: eElectives.length ? eElectives : undefined,
        examinerComment: eComment.trim() || undefined,
        gradeCutoffs: eCutoffs && eCutoffs.length ? eCutoffs : undefined,
      }
      setMock(updatedMock)
      // 정답이 바뀌었을 수 있으니 기존 학생 응시 기록을 새 정답으로 재채점.
      try {
        await regradeKoreanMockAttempts(updatedMock)
        if (isAdmin) setAllAttempts(await listKoreanMockAttempts(mock.id))
      } catch {
        // 재채점 실패해도 편집 저장은 유지
      }
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  function openExpl(group: 'common' | number, qIdx: number) {
    if (!mock) return
    const q =
      group === 'common'
        ? mock.questions[qIdx]
        : mock.electives?.[group]?.questions[qIdx]
    setExplDraft(q?.explanation ?? '')
    setExplChoiceDraft({ ...(q?.explanationChoices ?? {}) })
    setExplNoteDraft(q?.examinerNote ?? '')
    setExplLinkDraft(q?.linkedSource ?? '')
    setPassageDraft(q?.passage ?? '')
    setPassageKoDraft(q?.passageKo ?? '')
    setGlossDraft(q?.glossary ?? [])
    setExplTab('expl')
    setAiError(null)
    setExplSavedAt(null)
    setExplTarget({ group, qIdx })
  }

  /**
   * 대상 문항 하나를 변환해 저장한다. 공통/선택과목 어느 쪽이든 동일하게 처리.
   * 해설·지문 편집이 모두 이 경로를 쓴다.
   */
  async function saveQuestionPatch(
    transform: (q: KoreanMockQuestion) => KoreanMockQuestion,
    failMessage: string,
    /** false 면 저장만 하고 모달을 열어 둔다 (Ctrl+S). */
    close = true,
  ) {
    if (!mock || !explTarget) return
    setExplSaving(true)
    try {
      if (explTarget.group === 'common') {
        const nq = mock.questions.map((q, i) =>
          i === explTarget.qIdx ? transform(q) : q,
        )
        await updateKoreanMock(mock.id, { questions: nq })
        setMock({ ...mock, questions: nq })
      } else {
        const ei = explTarget.group
        const ne = (mock.electives ?? []).map((el, i) =>
          i === ei
            ? {
                ...el,
                questions: el.questions.map((q, j) =>
                  j === explTarget.qIdx ? transform(q) : q,
                ),
              }
            : el,
        )
        await updateKoreanMock(mock.id, { electives: ne })
        setMock({ ...mock, electives: ne })
      }
      if (close) setExplTarget(null)
      else setExplSavedAt(nowClock())
    } catch (e) {
      setError(e instanceof Error ? e.message : failMessage)
    } finally {
      setExplSaving(false)
    }
  }

  /** 정답 해설 + 선지별 오답 해설 + 한마디를 함께 저장. clear=true 면 모두 삭제. */
  async function applyExpl(clear = false, close = true) {
    const correct = clear || isBlankHtml(explDraft) ? '' : explDraft.trim()
    const note = clear || isBlankHtml(explNoteDraft) ? '' : explNoteDraft.trim()
    const link = clear ? '' : explLinkDraft.trim()
    await saveQuestionPatch((q) => {
      const next = { ...q }
      if (correct) next.explanation = correct
      else delete next.explanation

      if (link) next.linkedSource = link
      else delete next.linkedSource

      const choices = clear ? {} : normalizeChoiceDraft(explChoiceDraft, q.answer)
      if (Object.keys(choices).length) next.explanationChoices = choices
      else delete next.explanationChoices

      if (note) next.examinerNote = note
      else delete next.examinerNote

      // 구버전 통짜 오답 해설은 선지별로 갈아탄 시점에 정리한다
      if (clear || Object.keys(choices).length) delete next.explanationWrong
      return next
    }, '해설 저장 실패', close)
  }

  /** 지문·해석·어휘를 한 번에 저장. 빈 값은 키를 지워 Firestore undefined 오류를 피한다. */
  async function applyPassage(clear = false, close = true) {
    const passage = clear ? '' : passageDraft.trim()
    const passageKo = clear ? '' : passageKoDraft.trim()
    const glossary = clear ? [] : glossDraft.filter((w) => w.en.trim() && w.ko.trim())
    await saveQuestionPatch((q) => {
      const next = { ...q }
      if (passage) next.passage = passage
      else delete next.passage
      if (passage && passageKo) next.passageKo = passageKo
      else delete next.passageKo
      if (passage && glossary.length) next.glossary = glossary
      else delete next.glossary
      return next
    }, '지문 저장 실패', close)
  }

  async function runTranslate() {
    const text = passageDraft.trim()
    if (!text) {
      setAiError('먼저 지문을 입력하세요.')
      return
    }
    setAiBusy('ko')
    setAiError(null)
    try {
      setPassageKoDraft(await translatePassage(text))
    } catch (e) {
      setAiError(e instanceof Error ? e.message : '해석 생성 실패')
    } finally {
      setAiBusy(null)
    }
  }

  async function runGlossary() {
    const text = passageDraft.trim()
    if (!text) {
      setAiError('먼저 지문을 입력하세요.')
      return
    }
    setAiBusy('gloss')
    setAiError(null)
    try {
      const res = await extractGlossary({ passage: text, choices: [] })
      setGlossDraft(res.glossary)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : '어휘 추출 실패')
    } finally {
      setAiBusy(null)
    }
  }

  async function handleDeleteAttempt(a: Attempt) {
    if (!window.confirm(`${a.studentName} 님의 응시 기록을 삭제할까요? (되돌릴 수 없음)`))
      return
    const prev = allAttempts
    setAllAttempts((cur) => cur.filter((x) => x.id !== a.id))
    try {
      await deleteAttempt(a.id)
    } catch {
      setAllAttempts(prev)
    }
  }

  async function handleDelete() {
    if (!mock) return
    if (!window.confirm(`"${mock.title}" 모의고사를 삭제하시겠습니까?`)) return
    try {
      await deleteKoreanMock(mock.id)
      navigate('/admin/korean-mocks')
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패')
    }
  }

  async function handlePdfPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // 같은 파일 재선택도 인식되도록 input 값 초기화.
    e.target.value = ''
    if (!file || !mock) return
    setPdfError(null)
    setPdfBusy(true)
    try {
      const prevPath = mock.explanationPdfPath
      const info = await uploadMockExplanationPdf(mock.id, file)
      await updateKoreanMock(mock.id, { explanationPdf: info })
      // 교체 시 이전 파일 정리(실패해도 무시).
      if (prevPath && prevPath !== info.path) {
        deleteMockExplanationPdf(prevPath).catch(() => {})
      }
      setMock({
        ...mock,
        explanationPdfUrl: info.url,
        explanationPdfName: info.name,
        explanationPdfPath: info.path,
      })
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : '해설 PDF 업로드 실패')
    } finally {
      setPdfBusy(false)
    }
  }

  async function handleRemovePdf() {
    if (!mock || !mock.explanationPdfUrl) return
    if (!window.confirm('해설 PDF를 삭제하시겠습니까?')) return
    setPdfError(null)
    setPdfBusy(true)
    try {
      if (mock.explanationPdfPath) {
        await deleteMockExplanationPdf(mock.explanationPdfPath)
      }
      await updateKoreanMock(mock.id, { explanationPdf: null })
      setMock({
        ...mock,
        explanationPdfUrl: undefined,
        explanationPdfName: undefined,
        explanationPdfPath: undefined,
      })
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : '해설 PDF 삭제 실패')
    } finally {
      setPdfBusy(false)
    }
  }

  // 편집 모달 초안이 저장된 값과 다른지 — 배경을 스쳤을 때 확인을 띄우는 기준.
  // (훅은 조건부 호출이 안 되므로 early return 위에서 계산한다)
  const explTargetQuestion =
    mock && explTarget
      ? explTarget.group === 'common'
        ? mock.questions[explTarget.qIdx]
        : mock.electives?.[explTarget.group]?.questions[explTarget.qIdx]
      : undefined
  const explDirty = explTargetQuestion
    ? blankToEmpty(explDraft) !== blankToEmpty(explTargetQuestion.explanation) ||
      // 저장되는 형태로 맞춰 비교한다. 비운 칸이 초안에 ''로 남아 있으면
      // 방금 저장했는데도 "저장되지 않습니다" 가 뜬다.
      choiceCompareKey(
        normalizeChoiceDraft(explChoiceDraft, explTargetQuestion.answer),
      ) !== choiceCompareKey(explTargetQuestion.explanationChoices) ||
      blankToEmpty(explNoteDraft) !== blankToEmpty(explTargetQuestion.examinerNote) ||
      explLinkDraft.trim() !== (explTargetQuestion.linkedSource ?? '').trim() ||
      passageDraft.trim() !== (explTargetQuestion.passage ?? '').trim() ||
      passageKoDraft.trim() !== (explTargetQuestion.passageKo ?? '').trim() ||
      JSON.stringify(glossDraft) !==
        JSON.stringify(explTargetQuestion.glossary ?? [])
    : false
  /**
   * Ctrl/Cmd+S — 창을 닫지 않고 지금 탭을 저장한다. 선지 하나 쓸 때마다
   * 저장하고 이어서 쓰는 흐름이라, 저장하면서 닫으면 매번 다시 열어야 한다.
   *
   * window 에 거는 이유: 본문 에디터가 contentEditable 이고 포커스가 모달 밖에
   * 있을 수도 있어, 패널에만 걸면 브라우저 기본 "페이지 저장" 이 뜬다.
   * 렌더마다 최신 핸들러를 ref 에 담아 리스너는 한 번만 붙인다.
   */
  const explHotkeyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    explHotkeyRef.current = (e) => {
      if (e.key.toLowerCase() !== 's' || !(e.metaKey || e.ctrlKey) || e.altKey) return
      e.preventDefault()
      if (explSaving || aiBusy !== null) return
      void (explTab === 'expl' ? applyExpl(false, false) : applyPassage(false, false))
    }
  })
  useEffect(() => {
    if (explTarget == null) return
    const onKey = (e: KeyboardEvent) => explHotkeyRef.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [explTarget])

  const explBackdrop = useBackdropDismiss({
    open: explTarget != null,
    onDismiss: () => setExplTarget(null),
    dirty: explDirty,
    disabled: explSaving || aiBusy !== null,
    confirmMessage: '입력 중인 해설/지문이 저장되지 않습니다. 닫을까요?',
  })

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중…</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!mock) return null

  const mockSubject = getMockSubject(mock)

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            모의고사
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-block rounded-full text-[11px] font-medium px-2 py-0.5 border ${SUBJECT_BADGE_CLASS[getMockSubject(mock)]}`}
            >
              {MOCK_SUBJECT_LABEL[getMockSubject(mock)]}
            </span>
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
              {mock.title}
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            문항 {mock.questions.length}개 · 등록 {formatDate(mock.createdAt)} ·{' '}
            {mock.createdByName}
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 shrink-0">
            {/* 입력해 둔 해설을 원고 형식 .md 로 내보낸다. 저장된 값에는 선지
                번호가 없으므로(화면이 붙인다) 파일에는 여기서 붙여 적는다. */}
            <button
              type="button"
              onClick={() =>
                downloadMarkdown(`${mock.title} 해설.md`, mockToMarkdown(mock))
              }
              className="rounded-md border border-slate-300 text-slate-600 text-xs font-medium px-2.5 py-1.5 hover:bg-slate-100"
            >
              해설 .md
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="text-xs text-slate-400 hover:text-red-600 px-1"
            >
              삭제
            </button>
          </div>
        )}
      </header>

      {!isAdmin && (
        <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-4">
          <p className="text-sm text-slate-700 mb-3">
            본인이 푼 답안을 OMR 방식으로 입력하면 자동으로 채점됩니다.
          </p>
          <Link
            to={`/korean-mocks/${mock.id}/take`}
            className="inline-block rounded-md bg-brand-600 text-white text-sm font-semibold px-5 py-2.5 hover:bg-brand-700 transition"
          >
            답안 입력하기
          </Link>
        </div>
      )}

      {myAttempts.length > 0 && (
        <MyAttemptsBox
          attempts={myAttempts}
          buildResultPath={(a) => `/korean-mocks/${mock.id}/result/${a.id}`}
        />
      )}

      {/* 관리자: 답안 편집 */}
      {isAdmin && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">정답</h2>
            <div className="flex items-center gap-2">
              {!editing && (
                <Link
                  to={`/korean-mocks/${mock.id}/take`}
                  className="text-xs text-slate-500 hover:text-slate-900 px-1"
                  title="관리자도 직접 풀어볼 수 있습니다"
                >
                  내가 풀어보기
                </Link>
              )}
              <button
                type="button"
                onClick={() => (editing ? setEditing(false) : startEdit())}
                className="text-xs text-slate-500 hover:text-slate-900 px-1"
              >
                {editing ? '취소' : '편집'}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={saving}
                  className="rounded-md bg-slate-900 text-white text-xs font-medium px-3 py-1 hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? '저장 중…' : '저장'}
                </button>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-3">
            {editing ? (
              <EditAnswerGrid
                title={eTitle}
                setTitle={setETitle}
                subject={eSubject}
                setSubject={setESubject}
                questions={eQuestions}
                setQuestions={setEQuestions}
                electives={eElectives}
                setElectives={setEElectives}
                comment={eComment}
                setComment={setEComment}
                cutoffs={eCutoffs}
                setCutoffs={setECutoffs}
                onGenerateCutoffs={handleGenerateCutoffs}
                cutoffBusy={cutoffBusy}
                cutoffError={cutoffError}
                examText={examText}
                onExamText={setExamText}
              />
            ) : (
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 text-[12px]">
                {mock.questions.map((q) => (
                  <div
                    key={q.number}
                    className="rounded bg-slate-50 border border-slate-200 px-1.5 py-1 text-center"
                  >
                    <span className="text-slate-400">{q.number}.</span>{' '}
                    <span className="font-semibold text-slate-900">{q.answer}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* 관리자: 문항 해설 (정답 편집과 분리) */}
      {isAdmin && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              문항 해설 · 오답 리뷰 지문
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              문항 번호를 눌러 해설과 지문을 입력하세요. 해설은 학생 결과
              정오표에서 해당 문항을 누르면 표시되고, 지문은 그중 <b>틀린 문항</b>
              에서만 펼쳐집니다.
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              <span className="text-brand-700 font-semibold">✓</span> 해설 있음 ·{' '}
              <span className="text-brand-700 font-semibold">¶</span> 지문 있음
            </p>
          </div>
          {(
            [
              { label: '공통 과목', group: 'common' as const, qs: mock.questions },
              ...(mock.electives ?? []).map((el, i) => ({
                label: `선택 · ${el.name}`,
                group: i as number,
                qs: el.questions,
              })),
            ] as { label: string; group: 'common' | number; qs: KoreanMockQuestion[] }[]
          ).map((sec) => (
            <div key={String(sec.group)} className="space-y-1.5">
              <p className="text-xs font-medium text-slate-600">{sec.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {sec.qs.map((q, j) => (
                  <button
                    key={j}
                    type="button"
                    onClick={() => openExpl(sec.group, j)}
                    className={`rounded-md px-2 py-1.5 text-xs font-semibold border transition ${
                      hasMockExplanation(q) || hasMockPassage(q)
                        ? 'bg-brand-100 text-brand-700 border-brand-300'
                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {q.number}
                    {hasMockExplanation(q) ? ' ✓' : ''}
                    {hasMockPassage(q) ? ' ¶' : ''}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* 문항 해설 편집 모달 */}
      {explTarget != null && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm"
          {...explBackdrop}
        >
          {/* 해설 편집은 정답 1개 + 선지별 4개까지 에디터가 쌓이고 본문도 길다.
              폰은 그대로 두고, 화면이 넓으면 넓게 쓴다. */}
          <div
            className="w-full sm:max-w-lg lg:max-w-3xl 2xl:max-w-5xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-4 lg:p-5 space-y-3 max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const q =
                explTarget.group === 'common'
                  ? mock.questions[explTarget.qIdx]
                  : mock.electives?.[explTarget.group]?.questions[explTarget.qIdx]
              return (
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    {q?.number}번 문항
                  </h3>
                  {/* 빠른 정답으로 입력해 둔 답을 원문자로 자동 표시 */}
                  {q && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                      정답 {choiceMark(q.answer)}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400">
                    {q ? `${questionPoints(q)}점` : ''}
                  </span>
                </div>
              )
            })()}

            <div className="flex border-b border-slate-200">
              {(
                [
                  { key: 'expl', label: '해설' },
                  { key: 'passage', label: '오답 리뷰 지문' },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setExplTab(t.key)}
                  className={`relative px-3 h-10 text-sm font-medium transition ${
                    explTab === t.key
                      ? 'text-slate-900'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {t.label}
                  {explTab === t.key && (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" />
                  )}
                </button>
              ))}
            </div>

            {explTab === 'expl' ? (
              <>
                {(() => {
                  const q =
                    explTarget.group === 'common'
                      ? mock.questions[explTarget.qIdx]
                      : mock.electives?.[explTarget.group]?.questions[
                          explTarget.qIdx
                        ]
                  return (
                    <>
                      {/* 학생 화면에 뜨는 순서대로 놓는다 — 연계, 한마디, 정답, 오답. */}
                      <div>
                        <p className="text-xs font-medium text-slate-600 mb-1">
                          연계 교재{' '}
                          <span className="text-slate-400 font-normal">
                            — 적어두면 해설 맨 위에 칩으로 뜹니다. 두 곳 이상이면
                            쉼표로 나눠 적으세요 (선택)
                          </span>
                        </p>
                        <input
                          value={explLinkDraft}
                          onChange={(e) => setExplLinkDraft(e.target.value)}
                          placeholder="수능완성 p.134, 수능특강 p.88"
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                        {/* 교재 이름 줄임도 '연계' 떼는 것도 화면이 알아서 한다 —
                            적은 대로가 아니라 학생이 볼 모양을 그대로 보여준다. */}
                        {mockLinkLabels(explLinkDraft).length > 0 && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] text-slate-400">학생 화면</span>
                            <span className="text-[11px] text-slate-500">연계</span>
                            {mockLinkLabels(explLinkDraft).map((label) => (
                              <span
                                key={label}
                                className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <p className="text-xs font-medium text-slate-600 mb-1">
                          출제자의 한마디{' '}
                          <span className="text-slate-400 font-normal">
                            — 이 문항에 대해 하고 싶은 말 (선택)
                          </span>
                        </p>
                        <RichTextEditor
                          value={explNoteDraft}
                          onChange={setExplNoteDraft}
                          styles={explStyles}
                          onStylesChange={saveExplStyles}
                          chars={explChars}
                          onCharsChange={saveExplChars}
                        />
                      </div>

                      <div>
                        <p className="text-xs font-medium text-slate-600 mb-1">
                          정답 해설{' '}
                          <span className="text-slate-400 font-normal">
                            — 왜 {q ? choiceMark(q.answer) : ''} 가 답인지
                          </span>
                        </p>
                        <RichTextEditor
                          value={explDraft}
                          onChange={setExplDraft}
                          styles={explStyles}
                          onStylesChange={saveExplStyles}
                          chars={explChars}
                          onCharsChange={saveExplChars}
                        />
                      </div>

                      <div className="space-y-3">
                        <p className="text-xs font-medium text-slate-600">
                          오답 해설{' '}
                          <span className="text-slate-400 font-normal">
                            — 선지별로 입력하면 앞에 번호가 자동으로 붙습니다
                          </span>
                        </p>

                        {q &&
                          wrongChoiceNumbers(q.answer).map((n) => (
                            <div key={n}>
                              <p className="text-xs font-semibold text-slate-500 mb-1">
                                {choiceMark(n)}
                              </p>
                              <RichTextEditor
                                value={explChoiceDraft[String(n)] ?? ''}
                                onChange={(html) =>
                                  setExplChoiceDraft((prev) => ({
                                    ...prev,
                                    [String(n)]: html,
                                  }))
                                }
                                styles={explStyles}
                                onStylesChange={saveExplStyles}
                                chars={explChars}
                                onCharsChange={saveExplChars}
                              />
                            </div>
                          ))}

                        {/* 선지별로 나누기 전에 넣어둔 통짜 오답 해설이 남아 있으면
                            사라진 줄 알까 봐 그대로 보여준다. 위에 선지별로 채워
                            저장하면 이 값은 정리된다. */}
                        {explTargetQuestion?.explanationWrong && (
                          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                            <p className="text-[11px] font-semibold text-amber-800 mb-1">
                              이전 형식으로 입력된 오답 해설
                            </p>
                            <div
                              className="rte-view text-sm text-slate-800"
                              dangerouslySetInnerHTML={{
                                __html: explTargetQuestion.explanationWrong,
                              }}
                            />
                            <p className="text-[11px] text-amber-700 mt-2">
                              위 선지 칸에 옮겨 적고 저장하면 이 블록은 사라집니다.
                              옮기기 전까지는 학생에게 그대로 보입니다.
                            </p>
                          </div>
                        )}
                      </div>
                    </>
                  )
                })()}

                <p className="text-[11px] text-slate-400">
                  셋 중 하나만 입력해도 됩니다. 비워둔 칸은 학생 화면에 나오지
                  않습니다. <b className="font-semibold">Ctrl+S</b> (Mac ⌘S) 로 창을
                  닫지 않고 저장할 수 있습니다.
                </p>

                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => applyExpl(true)}
                    disabled={explSaving}
                    className="text-xs text-slate-400 hover:text-red-600 px-1 disabled:opacity-50"
                  >
                    해설 삭제
                  </button>
                  <div className="flex items-center gap-2">
                    {explSavedAt && (
                      <span className="text-[11px] text-brand-700">
                        저장됨 {explSavedAt}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setExplTarget(null)}
                      disabled={explSaving}
                      className="text-sm text-slate-500 hover:text-slate-900 px-2"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={() => applyExpl()}
                      disabled={explSaving}
                      className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-50"
                    >
                      {explSaving ? '저장 중…' : '저장'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="text-[11px] text-slate-500">
                  학생이 이 문항을 <b className="font-semibold">틀렸을 때만</b> 결과
                  화면에서 펼쳐 보입니다. 맞힌 문항에는 노출되지 않습니다.
                </p>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    지문
                  </label>
                  <textarea
                    value={passageDraft}
                    onChange={(e) => setPassageDraft(e.target.value)}
                    rows={7}
                    placeholder="시험지의 지문을 붙여넣으세요."
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                {/* 해석·어휘는 영어 지문에서만 의미가 있다. */}
                {mockSubject === 'english' && (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={runTranslate}
                        disabled={aiBusy !== null || explSaving}
                        className="rounded-md border border-brand-200 bg-brand-50 text-brand-700 text-xs font-medium px-3 py-1.5 hover:bg-brand-100 disabled:opacity-50"
                      >
                        {aiBusy === 'ko' ? '해석 생성 중…' : '✨ 해석 자동 생성'}
                      </button>
                      <button
                        type="button"
                        onClick={runGlossary}
                        disabled={aiBusy !== null || explSaving}
                        className="rounded-md border border-brand-200 bg-brand-50 text-brand-700 text-xs font-medium px-3 py-1.5 hover:bg-brand-100 disabled:opacity-50"
                      >
                        {aiBusy === 'gloss' ? '어휘 추출 중…' : '✨ 어휘 자동 추출'}
                      </button>
                    </div>
                    {aiError && <p className="text-xs text-red-600">{aiError}</p>}

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        한국어 해석
                      </label>
                      <textarea
                        value={passageKoDraft}
                        onChange={(e) => setPassageKoDraft(e.target.value)}
                        rows={5}
                        placeholder="비워두면 해석은 표시되지 않습니다."
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-slate-600">
                          어휘 ({glossDraft.length})
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setGlossDraft((prev) => [...prev, { en: '', ko: '' }])
                          }
                          className="text-[11px] text-brand-700 hover:underline"
                        >
                          + 단어 추가
                        </button>
                      </div>
                      {glossDraft.length === 0 ? (
                        <p className="text-[11px] text-slate-400 py-2">
                          어휘가 없습니다. 지문을 넣고 자동 추출을 눌러보세요.
                        </p>
                      ) : (
                        <ul className="space-y-1 max-h-48 overflow-y-auto">
                          {glossDraft.map((w, i) => (
                            <li key={i} className="flex items-center gap-1.5">
                              <input
                                value={w.en}
                                onChange={(e) =>
                                  setGlossDraft((prev) =>
                                    prev.map((x, j) =>
                                      j === i ? { ...x, en: e.target.value } : x,
                                    ),
                                  )
                                }
                                placeholder="word"
                                className="flex-1 min-w-0 rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                              />
                              <input
                                value={w.ko}
                                onChange={(e) =>
                                  setGlossDraft((prev) =>
                                    prev.map((x, j) =>
                                      j === i ? { ...x, ko: e.target.value } : x,
                                    ),
                                  )
                                }
                                placeholder="뜻"
                                className="flex-1 min-w-0 rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setGlossDraft((prev) => prev.filter((_, j) => j !== i))
                                }
                                className="text-slate-400 hover:text-red-600 px-1 text-xs"
                                aria-label="삭제"
                              >
                                ✕
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                )}

                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => applyPassage(true)}
                    disabled={explSaving || aiBusy !== null}
                    className="text-xs text-slate-400 hover:text-red-600 px-1 disabled:opacity-50"
                  >
                    지문 삭제
                  </button>
                  <div className="flex items-center gap-2">
                    {explSavedAt && (
                      <span className="text-[11px] text-brand-700">
                        저장됨 {explSavedAt}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setExplTarget(null)}
                      disabled={explSaving}
                      className="text-sm text-slate-500 hover:text-slate-900 px-2"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPassage()}
                      disabled={explSaving || aiBusy !== null}
                      className="rounded-md bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 disabled:opacity-50"
                    >
                      {explSaving ? '저장 중…' : '저장'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 관리자: 해설 PDF */}
      {isAdmin && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900">해설 PDF</h2>
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <p className="text-xs text-slate-500">
              해설 PDF를 등록하면 학생이 채점을 마친 뒤 결과 화면에서 열람할 수
              있습니다. 등록하지 않으면 채점 후 해설은 제공되지 않습니다. (PDF,
              10MB 이하)
            </p>
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf"
              onChange={handlePdfPick}
              className="hidden"
            />
            {mock.explanationPdfUrl ? (
              <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <a
                  href={mock.explanationPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex items-center gap-2 text-sm text-brand-700 hover:underline"
                >
                  <span aria-hidden>📄</span>
                  <span className="truncate">
                    {mock.explanationPdfName ?? '해설 PDF'}
                  </span>
                </a>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => pdfInputRef.current?.click()}
                    disabled={pdfBusy}
                    className="text-xs text-slate-500 hover:text-slate-900 px-1 disabled:opacity-50"
                  >
                    {pdfBusy ? '처리 중…' : '교체'}
                  </button>
                  <button
                    type="button"
                    onClick={handleRemovePdf}
                    disabled={pdfBusy}
                    className="text-xs text-slate-400 hover:text-red-600 px-1 disabled:opacity-50"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => pdfInputRef.current?.click()}
                disabled={pdfBusy}
                className="rounded-md border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 hover:bg-slate-50 disabled:opacity-50"
              >
                {pdfBusy ? '업로드 중…' : '해설 PDF 업로드'}
              </button>
            )}
            {pdfError && <p className="text-sm text-red-600">{pdfError}</p>}
          </div>
        </section>
      )}

      {/* 관리자: 학생 응시 기록 */}
      {isAdmin && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900">
            학생 응시 기록 ({grouped.length}명)
          </h2>
          {grouped.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              아직 응시한 학생이 없습니다.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {grouped.map((a) => {
                const ratio =
                  a.total > 0 ? Math.round((a.correct / a.total) * 100) : 0
                return (
                  <li key={a.id} className="flex items-center">
                    <Link
                      to={`/korean-mocks/${mock.id}/result/${a.id}`}
                      className="flex-1 min-w-0 flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {a.studentName}
                          {a.mockElectiveName && (
                            <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                              {a.mockElectiveName}
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {formatDate(a.createdAt)} · {a.correct}/{a.total}
                        </p>
                      </div>
                      <span
                        className={`text-sm font-semibold ${
                          ratio >= 80
                            ? 'text-brand-700'
                            : ratio >= 50
                              ? 'text-amber-700'
                              : 'text-red-700'
                        }`}
                      >
                        {ratio}%
                      </span>
                    </Link>
                    {/* 이 학생의 이 회차만 담은 인쇄용 성적표. */}
                    <Link
                      to={`/admin/students/${a.studentUid}/report/${a.id}`}
                      className="shrink-0 px-3 py-3 text-[11px] font-medium text-slate-400 hover:text-slate-900"
                    >
                      성적표
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDeleteAttempt(a)}
                      className="shrink-0 px-3 py-3 text-slate-300 hover:text-red-500"
                      aria-label="응시 기록 삭제"
                    >
                      ✕
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

/** 문항별 정답 + 3점 토글 편집기 (공통·선택과목 공용). */
function QuestionsEditor({
  label,
  questions,
  setQuestions,
}: {
  label: string
  questions: KoreanMockQuestion[]
  setQuestions: (q: KoreanMockQuestion[]) => void
}) {
  function setAnswer(idx: number, answer: number) {
    setQuestions(questions.map((q, i) => (i === idx ? { ...q, answer } : q)))
  }
  function togglePoints(idx: number) {
    setQuestions(
      questions.map((q, i) =>
        i === idx ? { ...q, points: questionPoints(q) === 3 ? 2 : 3 } : q,
      ),
    )
  }
  function addOne() {
    const last = questions[questions.length - 1]
    setQuestions([...questions, { number: last ? last.number + 1 : 1, answer: 1 }])
  }
  function removeLast() {
    setQuestions(questions.slice(0, -1))
  }
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-slate-600">
        {label} ({questions.length}문항) · 우측 배점 눌러 2/3점 전환
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {questions.map((q, i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5"
          >
            <span className="text-xs text-slate-500 w-7 shrink-0">{q.number}.</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setAnswer(i, n)}
                  className={`w-6 h-6 rounded-full text-[11px] font-medium border transition ${
                    q.answer === n
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => togglePoints(i)}
              className={`ml-auto shrink-0 rounded px-1.5 py-1 text-[10px] font-semibold border ${
                questionPoints(q) === 3
                  ? 'bg-amber-100 text-amber-700 border-amber-300'
                  : 'bg-white text-slate-400 border-slate-300'
              }`}
            >
              {questionPoints(q)}점
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={addOne}
          className="rounded-md border border-slate-300 text-slate-700 text-xs font-medium px-2.5 py-1 hover:bg-slate-50"
        >
          + 문항 추가
        </button>
        <button
          type="button"
          onClick={removeLast}
          disabled={questions.length === 0}
          className="rounded-md border border-slate-300 text-slate-700 text-xs font-medium px-2.5 py-1 hover:bg-slate-50 disabled:opacity-50"
        >
          − 마지막 삭제
        </button>
      </div>
    </div>
  )
}

function EditAnswerGrid({
  title,
  setTitle,
  subject,
  setSubject,
  questions,
  setQuestions,
  electives,
  setElectives,
  comment,
  setComment,
  cutoffs,
  setCutoffs,
  onGenerateCutoffs,
  cutoffBusy,
  cutoffError,
  examText,
  onExamText,
}: {
  title: string
  setTitle: (s: string) => void
  subject: MockSubject
  setSubject: (s: MockSubject) => void
  questions: KoreanMockQuestion[]
  setQuestions: (q: KoreanMockQuestion[]) => void
  electives: KoreanMockElective[]
  setElectives: (e: KoreanMockElective[]) => void
  comment: string
  setComment: (s: string) => void
  cutoffs: MockGradeCut[] | null
  setCutoffs: (c: MockGradeCut[]) => void
  onGenerateCutoffs: () => void
  cutoffBusy: boolean
  cutoffError: string | null
  examText: string
  onExamText: (t: string) => void
}) {
  const [elBusy, setElBusy] = useState<number | null>(null)
  function updateElective(i: number, patch: Partial<KoreanMockElective>) {
    setElectives(electives.map((el, j) => (j === i ? { ...el, ...patch } : el)))
  }
  async function genElectiveCutoffs(i: number) {
    const el = electives[i]
    if (!el) return
    const total =
      questions.reduce((s, q) => s + questionPoints(q), 0) +
      el.questions.reduce((s, q) => s + questionPoints(q), 0)
    if (total <= 0) return
    setElBusy(i)
    try {
      const cuts = await estimateMockCutoffs({
        subject,
        title: `${title} ${el.name}`.trim() || undefined,
        totalQuestions: questions.length + el.questions.length,
        totalPoints: total,
        practice: true,
        examText: examText || undefined,
      })
      updateElective(i, { gradeCutoffs: cuts })
    } catch {
      // 무시 (수동 입력 가능)
    } finally {
      setElBusy(null)
    }
  }
  function addElective() {
    const nums = [
      ...questions.map((q) => q.number),
      ...electives.flatMap((el) => el.questions.map((q) => q.number)),
    ]
    const next = (nums.length ? Math.max(...nums) : 0) + 1
    setElectives([
      ...electives,
      { name: '선택과목', startNumber: next, questions: [{ number: next, answer: 1 }] },
    ])
  }
  function removeElective(i: number) {
    setElectives(electives.filter((_, j) => j !== i))
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">제목</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">과목</label>
        <div className="flex gap-2">
          {([
            { key: 'korean', label: '국어' },
            { key: 'english', label: '영어' },
          ] as { key: MockSubject; label: string }[]).map((opt) => {
            const active = subject === opt.key
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSubject(opt.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium border transition ${
                  active
                    ? opt.key === 'korean'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-sky-600 text-white border-sky-600'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      <QuestionsEditor
        label="공통 과목 정답"
        questions={questions}
        setQuestions={setQuestions}
      />

      {/* 시험지 첨부 (AI 등급컷용) */}
      <div className="pt-1 border-t border-slate-100">
        <p className="text-xs font-medium text-slate-600 mb-1">
          시험지 <span className="font-normal text-slate-400">(AI 등급컷 판단용)</span>
        </p>
        <ExamFilePicker onText={onExamText} />
      </div>

      {/* 선택과목 */}
      <div className="space-y-2 pt-1 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-slate-600">선택과목 (택1)</p>
          <button
            type="button"
            onClick={addElective}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            + 선택과목 추가
          </button>
        </div>
        {electives.map((el, i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={el.name}
                onChange={(e) => updateElective(i, { name: e.target.value })}
                placeholder="선택과목 이름"
                className="flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={() => removeElective(i)}
                className="text-[11px] text-slate-400 hover:text-red-500 px-1"
              >
                삭제
              </button>
            </div>
            <QuestionsEditor
              label="정답"
              questions={el.questions}
              setQuestions={(qs) => updateElective(i, { questions: qs })}
            />
            <div className="rounded-md border border-slate-200 bg-white p-2.5">
              <MockCutoffEditor
                cutoffs={el.gradeCutoffs ?? []}
                onChange={(next) => updateElective(i, { gradeCutoffs: next })}
                onGenerate={() => genElectiveCutoffs(i)}
                generating={elBusy === i}
                generateLabel="AI 등급컷"
              />
            </div>
          </div>
        ))}
      </div>

      {/* 출제자 한마디 */}
      <div className="pt-1 border-t border-slate-100">
        <label className="block text-xs font-medium text-slate-600 mb-1">
          출제자 한마디 <span className="font-normal text-slate-400">(결과 화면 표시)</span>
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* 공통 등급컷 — 선택과목 없을 때만(있으면 과목별 카드에서) */}
      {electives.length === 0 && (
        <div className="pt-1 border-t border-slate-100">
          <MockCutoffEditor
            cutoffs={cutoffs ?? []}
            onChange={setCutoffs}
            onGenerate={onGenerateCutoffs}
            generating={cutoffBusy}
            generateError={cutoffError}
          />
        </div>
      )}
    </div>
  )
}
