import {
  READING_TYPE_LABEL,
  READING_TYPE_PROMPT,
  type ReadingQuestionType,
} from '../lib/types'
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

  function patch(p: Partial<DraftQuestion>) {
    onChange({ ...question, ...p })
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
            rows={3}
            className={inputCls}
          />
        </div>
      )}

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
          rows={6}
          className={inputCls}
        />
      </div>

      {needSummary && (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            요약문 (박스로 표시)
          </label>
          <textarea
            value={question.summaryBox}
            onChange={(e) => patch({ summaryBox: e.target.value })}
            placeholder="예: ... led to the (A) of less profitable diseases, ... include (B) populations."
            rows={3}
            className={inputCls}
          />
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">선지 (정답을 선택하세요)</label>
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
                className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-1">
          정답: {CHOICE_MARKS[question.answer]}
        </p>
      </div>
    </div>
  )
}
