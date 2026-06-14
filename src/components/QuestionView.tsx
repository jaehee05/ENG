import { GlossedPassage } from './GlossedPassage'
import { renderUnderlines } from '../lib/renderUnderlines'
import type { ReadingQuestion, WordEntry } from '../lib/types'

const CHOICE_MARKS = ['①', '②', '③', '④', '⑤']

interface Props {
  index: number
  question: ReadingQuestion
  fallbackPassage?: string
  passageGlossary: WordEntry[]
  choicesGlossary: WordEntry[]
  viewedWords?: Set<string>
  onWordLookup?: (en: string, ko: string) => void
  selected: number
  onSelect: (i: number) => void
}

export function QuestionView({
  index,
  question,
  fallbackPassage,
  passageGlossary,
  choicesGlossary,
  viewedWords,
  onWordLookup,
  selected,
  onSelect,
}: Props) {
  const explicitBody = question.body?.trim() ? question.body : null
  const body = explicitBody ?? (question.image ? null : fallbackPassage)
  const showBody = !!body && body.trim().length > 0

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
      <p className="text-sm font-semibold text-slate-900 whitespace-pre-wrap">
        {index + 1}. {renderUnderlines(question.q)}
        {question.points && question.points >= 3 && (
          <span className="ml-2 inline-block rounded bg-brand-100 text-brand-700 text-[10px] font-semibold px-1.5 py-0.5 align-middle">
            {question.points}점
          </span>
        )}
      </p>

      {question.intro && question.intro.trim() && (
        <div className="rounded-lg border border-slate-300 bg-slate-50 p-4">
          <GlossedPassage
            passage={question.intro}
            glossary={passageGlossary}
            viewedWords={viewedWords}
            onWordLookup={onWordLookup}
            className="text-sm leading-7 text-slate-800 break-words whitespace-pre-wrap"
          />
        </div>
      )}

      {question.image && (
        <img
          src={question.image}
          alt="도표"
          className="w-full max-h-[600px] object-contain rounded border border-slate-200"
        />
      )}

      {showBody && (
        <div className={question.intro ? '' : ''}>
          <GlossedPassage
            passage={body!}
            glossary={passageGlossary}
            viewedWords={viewedWords}
            onWordLookup={onWordLookup}
          />
        </div>
      )}

      {question.summaryBox && question.summaryBox.trim() && (
        <div className="rounded-lg border border-slate-300 bg-slate-50 p-4">
          <GlossedPassage
            passage={question.summaryBox}
            glossary={passageGlossary}
            viewedWords={viewedWords}
            onWordLookup={onWordLookup}
            className="text-sm leading-7 text-slate-800 break-words whitespace-pre-wrap"
          />
        </div>
      )}

      <div className="space-y-2">
        {question.choices.map((c, ci) => (
          <label
            key={ci}
            className={`flex items-start gap-3 rounded border px-3 py-2 cursor-pointer transition ${
              selected === ci
                ? 'border-brand-500 bg-brand-50/40'
                : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <input
              type="radio"
              name={`q-${index}`}
              checked={selected === ci}
              onChange={() => onSelect(ci)}
              className="mt-1 accent-brand-600"
            />
            <span className="text-sm text-slate-700 w-5 mt-0.5">{CHOICE_MARKS[ci]}</span>
            <span className="text-sm flex-1">
              <GlossedPassage
                passage={c}
                glossary={choicesGlossary}
                viewedWords={viewedWords}
                onWordLookup={onWordLookup}
                className="text-sm leading-6 text-slate-700 break-words whitespace-pre-wrap"
              />
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
