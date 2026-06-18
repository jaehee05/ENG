import { GlossedPassage } from './GlossedPassage'
import type { SharedPassageBlock as BlockType, WordEntry } from '../lib/types'

interface Props {
  block: BlockType
  passageGlossary: WordEntry[]
  viewedWords?: Set<string>
  onWordLookup?: (en: string, ko: string) => void
  /** 관리자만: 드래그로 단어장 추가. */
  onSelectPassageWord?: (word: string) => void
}

const bodyTextCls =
  'text-base sm:text-lg leading-8 sm:leading-9 text-slate-900 break-words whitespace-pre-wrap text-justify font-myeongjo'

/** 세트 지문(공유 본문)을 카드 위에 한 번만 표시. order 세트는 (A)(B)(C)(D) 박스. */
export function SharedPassageBlock({
  block,
  passageGlossary,
  viewedWords,
  onWordLookup,
  onSelectPassageWord,
}: Props) {
  if (!block) return null
  if (block.kind === 'passage') {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
        <GlossedPassage
          passage={block.text}
          glossary={passageGlossary}
          viewedWords={viewedWords}
          onWordLookup={onWordLookup}
          onSelectWord={onSelectPassageWord}
          className={bodyTextCls}
        />
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6 space-y-5">
      {block.parts.map((p) => (
        <div key={p.tag}>
          <p className="text-center text-base font-semibold text-slate-800 mb-1.5 font-myeongjo">
            ({p.tag})
          </p>
          <div className="border border-slate-700 px-4 sm:px-5 py-3 sm:py-4 bg-white">
            <GlossedPassage
              passage={p.text}
              glossary={passageGlossary}
              viewedWords={viewedWords}
              onWordLookup={onWordLookup}
              onSelectWord={onSelectPassageWord}
              className={`${bodyTextCls} [text-indent:1.25em]`}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
