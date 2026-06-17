import { useRef, useState, type ChangeEvent } from 'react'
import {
  READING_TYPE_LABEL,
  READING_TYPE_PROMPT,
  type ReadingQuestionType,
} from '../lib/types'
import { handleUnderlineHotkey } from '../lib/textareaHotkeys'
import { resizeImageForUpload } from '../lib/imageResize'
import { imageToHtml } from '../lib/api'
import { HtmlPanel } from './HtmlPanel'
import type { DraftQuestion } from './draftQuestion'

const CHOICE_MARKS = ['①', '②', '③', '④', '⑤']
const TYPE_OPTIONS: ReadingQuestionType[] = [
  'standard',
  'cloze',
  'order',
  'insert',
  'summary',
  'irrelevant',
  'underline-grammar',
  'underline-vocab',
]

interface Props {
  index: number
  question: DraftQuestion
  canRemove: boolean
  onChange: (next: DraftQuestion) => void
  onRemove: () => void
}

export function QuestionEditor({ index, question, canRemove, onChange, onRemove }: Props) {
  const needIntro = question.type === 'order' || question.type === 'insert'
  const needSummary = question.type === 'summary'
  const isOrder = question.type === 'order'
  const imageFileRef = useRef<HTMLInputElement>(null)
  const [converting, setConverting] = useState(false)
  const [convertError, setConvertError] = useState<string | null>(null)
  const [htmlOpen, setHtmlOpen] = useState(false)

  function patch(p: Partial<DraftQuestion>) {
    onChange({ ...question, ...p })
  }

  async function onImagePick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 15 * 1024 * 1024) {
      window.alert('이미지는 15MB 이하여야 합니다.')
      return
    }
    try {
      const r = await resizeImageForUpload(file)
      patch({ image: `data:${r.mediaType};base64,${r.base64}` })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '이미지를 처리하지 못했습니다.')
    }
  }

  async function handleConvertHtml() {
    if (!question.image) return
    setConvertError(null)
    setConverting(true)
    try {
      const html = await imageToHtml(question.image)
      patch({ imageHtml: html })
      setHtmlOpen(true)
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : 'HTML 변환 실패')
    } finally {
      setConverting(false)
    }
  }

  function changeType(next: ReadingQuestionType) {
    // overwrite prompt with new type's default only when the current prompt
    // is empty or still matches the previous type's default (i.e. unedited)
    const wasDefault =
      question.q.trim() === '' || question.q.trim() === READING_TYPE_PROMPT[question.type]
    onChange({
      ...question,
      type: next,
      q: wasDefault ? READING_TYPE_PROMPT[next] : question.q,
    })
  }

  function updateChoice(ci: number, value: string) {
    patch({ choices: question.choices.map((c, idx) => (idx === ci ? value : c)) })
  }

  const inputCls =
    'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-700">{index + 1}번 문제</span>
        <div className="flex items-center gap-2">
          <select
            value={question.type}
            onChange={(e) => changeType(e.target.value as ReadingQuestionType)}
            className="rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {READING_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-xs text-red-600 hover:underline"
            >
              삭제
            </button>
          )}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">발문</label>
        <textarea
          value={question.q}
          onChange={(e) => patch({ q: e.target.value })}
          onKeyDown={(e) => handleUnderlineHotkey(e, (next) => patch({ q: next }))}
          placeholder={READING_TYPE_PROMPT[question.type]}
          rows={2}
          className={inputCls}
        />
      </div>

      {needIntro && (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            주어진 글 / 문장 (박스로 표시)
          </label>
          <textarea
            value={question.intro}
            onChange={(e) => patch({ intro: e.target.value })}
            onKeyDown={(e) => handleUnderlineHotkey(e, (next) => patch({ intro: next }))}
            rows={3}
            className={inputCls}
          />
        </div>
      )}

      {isOrder ? (
        <div className="space-y-3">
          {(['A', 'B', 'C', 'D'] as const).map((tag) => {
            const key = (`part${tag}` as const) as 'partA' | 'partB' | 'partC' | 'partD'
            const koKey = (`part${tag}Ko` as const) as
              | 'partAKo'
              | 'partBKo'
              | 'partCKo'
              | 'partDKo'
            const optional = tag === 'D'
            return (
              <div
                key={tag}
                className="rounded-md border border-slate-200 bg-slate-50/40 p-3 space-y-2"
              >
                <label className="block text-xs font-medium text-slate-700">
                  ({tag}) 단락{' '}
                  {optional && (
                    <span className="text-slate-400 font-normal">(선택)</span>
                  )}
                </label>
                <textarea
                  value={question[key]}
                  onChange={(e) => patch({ [key]: e.target.value })}
                  onKeyDown={(e) =>
                    handleUnderlineHotkey(e, (next) => patch({ [key]: next }))
                  }
                  rows={4}
                  className={inputCls}
                  placeholder={`(${tag}) 단락 영어 본문`}
                />
                <label className="block text-[11px] font-medium text-slate-500">
                  ({tag}) 한글 해석{' '}
                  <span className="font-normal text-slate-400">(선택)</span>
                </label>
                <textarea
                  value={question[koKey] ?? ''}
                  onChange={(e) => patch({ [koKey]: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder={`(${tag}) 단락 한국어 해석. 자동 분류 시 단락별 해석이 있으면 자동 채워집니다.`}
                />
              </div>
            )
          })}
        </div>
      ) : (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            본문{' '}
            <span className="text-slate-400 font-normal">
              (비워두면 지문 본문을 사용)
            </span>
          </label>
          <textarea
            value={question.body}
            onChange={(e) => patch({ body: e.target.value })}
            onKeyDown={(e) => handleUnderlineHotkey(e, (next) => patch({ body: next }))}
            rows={6}
            className={inputCls}
          />
        </div>
      )}

      {needSummary && (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            요약문 (박스로 표시)
          </label>
          <textarea
            value={question.summaryBox}
            onChange={(e) => patch({ summaryBox: e.target.value })}
            onKeyDown={(e) =>
              handleUnderlineHotkey(e, (next) => patch({ summaryBox: next }))
            }
            placeholder="예: ... led to the (A) of less profitable diseases, ... include (B) populations."
            rows={3}
            className={inputCls}
          />
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">
          도표 / 그림{' '}
          <span className="text-slate-400 font-normal">
            (도표 문제처럼 그림이 필요한 문항에 첨부)
          </span>
        </label>
        <input
          ref={imageFileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={onImagePick}
          className="hidden"
        />
        {question.image ? (
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <img
                src={question.image}
                alt="도표"
                className="max-h-48 rounded border border-slate-300 bg-white"
              />
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => imageFileRef.current?.click()}
                  className="rounded-md border border-slate-300 text-slate-700 text-xs font-medium px-3 py-1.5 hover:bg-slate-100"
                >
                  교체
                </button>
                <button
                  type="button"
                  onClick={() => patch({ image: undefined, imageHtml: undefined })}
                  className="rounded-md text-red-600 text-xs font-medium px-3 py-1.5 hover:bg-red-50"
                >
                  제거
                </button>
                <button
                  type="button"
                  onClick={handleConvertHtml}
                  disabled={converting}
                  className="rounded-md bg-brand-600 text-white text-xs font-medium px-3 py-1.5 hover:bg-brand-700 disabled:opacity-50"
                  title="이미지를 AI가 HTML로 옮겨 학생 화면에 텍스트로 렌더"
                >
                  {converting ? '변환 중...' : 'AI로 HTML 변환'}
                </button>
              </div>
            </div>
            {convertError && (
              <p className="text-xs text-red-600">{convertError}</p>
            )}
            {question.imageHtml && (
              <div className="rounded-md border border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setHtmlOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  <span>
                    HTML 코드{' '}
                    <span className="text-brand-700">
                      · 학생 화면에 이 HTML이 표시됩니다
                    </span>
                  </span>
                  <span className="text-slate-400">{htmlOpen ? '접기 −' : '펼치기 +'}</span>
                </button>
                {htmlOpen && (
                  <div className="border-t border-slate-200 p-3 space-y-2">
                    <textarea
                      value={question.imageHtml}
                      onChange={(e) => patch({ imageHtml: e.target.value })}
                      rows={8}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => patch({ imageHtml: undefined })}
                        className="text-xs text-red-600 hover:text-red-700 underline"
                      >
                        HTML 제거 (이미지로 되돌리기)
                      </button>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        미리보기
                      </p>
                      <div className="rounded border border-slate-200 bg-white overflow-hidden">
                        <HtmlPanel html={question.imageHtml} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => imageFileRef.current?.click()}
            className="rounded-md border border-slate-300 bg-white text-slate-700 text-xs font-medium px-3 py-1.5 hover:bg-slate-100"
          >
            + 이미지 첨부
          </button>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">
          문제 해설 <span className="text-slate-400 font-normal">(학생이 틀리면 표시)</span>
        </label>
        <textarea
          value={question.explanation ?? ''}
          onChange={(e) => patch({ explanation: e.target.value })}
          rows={3}
          placeholder="정답 근거, 오답 분석, 추론 단서 등. 자동 분류 시 해설 텍스트가 같이 있으면 자동 채워집니다."
          className={inputCls}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">
          선지 <span className="text-slate-400 font-normal">(왼쪽 동그라미를 눌러 정답 선택)</span>
        </label>
        <div className="space-y-2">
          {question.choices.map((c, ci) => (
            <label key={ci} className="flex items-start gap-2">
              <input
                type="radio"
                name={`answer-${index}`}
                checked={question.answer === ci}
                onChange={() => patch({ answer: ci })}
                className="mt-1.5 accent-brand-600"
              />
              <span className="text-sm text-slate-600 w-5 mt-1">{CHOICE_MARKS[ci]}</span>
              <input
                type="text"
                value={c}
                onChange={(e) => updateChoice(ci, e.target.value)}
                onKeyDown={(e) => handleUnderlineHotkey(e, (next) => updateChoice(ci, next))}
                className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
          ))}
        </div>
        <p className="text-xs mt-1">
          {question.answer >= 0 && question.answer <= 4 ? (
            <span className="text-slate-500">
              정답: <span className="font-semibold text-slate-800">{CHOICE_MARKS[question.answer]}</span> · ⌘U(Ctrl+U)로 발문/선지/본문에 밑줄
            </span>
          ) : (
            <span className="text-amber-700 font-medium">
              정답 미선택 — 저장 전 반드시 선택하세요
            </span>
          )}
        </p>
      </div>
    </div>
  )
}
