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
  const isOrder = question.type === 'order'
  const hasParts =
    isOrder &&
    (!!question.partA?.trim() ||
      !!question.partB?.trim() ||
      !!question.partC?.trim())
  const body = hasParts
    ? null
    : explicitBody ?? (question.image ? null : fallbackPassage)
  const showBody = !!body && body.trim().length > 0
  const orderParts: { tag: string; text?: string }[] = isOrder
    ? [
        { tag: 'A', text: question.partA },
        { tag: 'B', text: question.partB },
        { tag: 'C', text: question.partC },
        { tag: 'D', text: question.partD },
      ].filter((p) => !!p.text?.trim())
    : []

  const bodyTextCls =
    'text-base sm:text-lg leading-8 sm:leading-9 text-slate-900 break-words whitespace-pre-wrap text-justify font-myeongjo'

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6 space-y-5">
      <p className="text-base font-bold text-slate-900 whitespace-pre-wrap font-gothic">
        {index + 1}. {renderUnderlines(question.q)}
        {question.points && question.points >= 3 && (
          <span className="ml-2 text-sm font-normal text-slate-600">
            [{question.points}점]
          </span>
        )}
      </p>

      {question.intro && question.intro.trim() && (
        <div className="border border-slate-700 px-4 sm:px-5 py-3 sm:py-4 bg-white">
          <GlossedPassage
            passage={question.intro}
            glossary={passageGlossary}
            viewedWords={viewedWords}
            onWordLookup={onWordLookup}
            className={bodyTextCls}
          />
        </div>
      )}

      {question.image && (
        <img
          src={question.image}
          alt="도표"
          className="w-full max-h-[600px] object-contain"
        />
      )}

      {showBody && (
        <GlossedPassage
          passage={body!}
          glossary={passageGlossary}
          viewedWords={viewedWords}
          onWordLookup={onWordLookup}
          className={bodyTextCls}
        />
      )}

      {orderParts.length > 0 && (
        <div className="space-y-4">
          {orderParts.map((p) => (
            <div key={p.tag} className="flex gap-2">
              <span className={`shrink-0 font-bold ${bodyTextCls.replace('text-justify', '')}`}>
                ({p.tag})
              </span>
              <GlossedPassage
                passage={p.text!}
                glossary={passageGlossary}
                viewedWords={viewedWords}
                onWordLookup={onWordLookup}
                className={bodyTextCls}
              />
            </div>
          ))}
        </div>
      )}

      {question.summaryBox && question.summaryBox.trim() && (
        <div className="border border-slate-700 px-4 sm:px-5 py-3 sm:py-4 bg-white">
          <GlossedPassage
            passage={question.summaryBox}
            glossary={passageGlossary}
            viewedWords={viewedWords}
            onWordLookup={onWordLookup}
            className={bodyTextCls}
          />
        </div>
      )}

      <div className="space-y-2 pt-1">
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
              className="mt-1.5 accent-brand-600"
            />
            <span className="text-slate-800 w-5 mt-0.5 font-myeongjo">{CHOICE_MARKS[ci]}</span>
            <span className="flex-1">
              <GlossedPassage
                passage={c}
                glossary={choicesGlossary}
                viewedWords={viewedWords}
                onWordLookup={onWordLookup}
                className="text-base leading-7 text-slate-800 break-words whitespace-pre-wrap font-myeongjo"
              />
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
