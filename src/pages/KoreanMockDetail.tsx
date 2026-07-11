import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import {
  deleteKoreanMock,
  formatDate,
  getKoreanMock,
  listAttemptsForUser,
  listKoreanMockAttempts,
  updateKoreanMock,
} from '../lib/firestore'
import {
  deleteMockExplanationPdf,
  uploadMockExplanationPdf,
} from '../lib/mockStorage'
import { MyAttemptsBox } from '../components/MyAttemptsBox'
import { PdfViewer } from '../components/PdfViewer'
import {
  getMockSubject,
  MOCK_SUBJECT_LABEL,
  type Attempt,
  type KoreanMock,
  type KoreanMockQuestion,
  type MockSubject,
} from '../lib/types'

const SUBJECT_BADGE_CLASS: Record<MockSubject, string> = {
  korean: 'bg-rose-50 text-rose-700 border-rose-200',
  english: 'bg-sky-50 text-sky-700 border-sky-200',
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
  const [saving, setSaving] = useState(false)

  // 해설 PDF (관리자)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false)

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
    setEditing(true)
  }

  async function saveEdit() {
    if (!mock) return
    if (!eTitle.trim()) return
    setSaving(true)
    try {
      await updateKoreanMock(mock.id, {
        title: eTitle.trim(),
        subject: eSubject,
        questions: eQuestions,
      })
      setMock({
        ...mock,
        title: eTitle.trim(),
        subject: eSubject,
        questions: eQuestions,
      })
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
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

  if (loading) return <p className="text-slate-500 text-sm">불러오는 중…</p>
  if (error) return <p className="text-red-600 text-sm">{error}</p>
  if (!mock) return null

  return (
    <div className="space-y-5 max-w-3xl">
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
          <button
            type="button"
            onClick={handleDelete}
            className="text-xs text-slate-400 hover:text-red-600 px-1"
          >
            삭제
          </button>
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
                <button
                  type="button"
                  onClick={() => setPdfViewerOpen(true)}
                  className="min-w-0 flex items-center gap-2 text-sm text-brand-700 hover:underline"
                >
                  <span aria-hidden>📄</span>
                  <span className="truncate">
                    {mock.explanationPdfName ?? '해설 PDF'}
                  </span>
                </button>
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
                  <li key={a.id}>
                    <Link
                      to={`/korean-mocks/${mock.id}/result/${a.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {a.studentName}
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
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {pdfViewerOpen && mock.explanationPdfUrl && (
        <PdfViewer
          url={mock.explanationPdfUrl}
          title={mock.explanationPdfName ?? '해설 PDF'}
          onClose={() => setPdfViewerOpen(false)}
        />
      )}
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
}: {
  title: string
  setTitle: (s: string) => void
  subject: MockSubject
  setSubject: (s: MockSubject) => void
  questions: KoreanMockQuestion[]
  setQuestions: (q: KoreanMockQuestion[]) => void
}) {
  function setAnswer(idx: number, answer: number) {
    const next = questions.map((q, i) => (i === idx ? { ...q, answer } : q))
    setQuestions(next)
  }
  function addOne() {
    const last = questions[questions.length - 1]
    const nextNumber = last ? last.number + 1 : 1
    setQuestions([...questions, { number: nextNumber, answer: 1 }])
  }
  function removeLast() {
    setQuestions(questions.slice(0, -1))
  }
  return (
    <div className="space-y-3">
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
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-slate-600">
          정답 ({questions.length}문항)
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {questions.map((q, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5"
            >
              <span className="text-xs text-slate-500 w-7">{q.number}.</span>
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
            </div>
          ))}
        </div>
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
