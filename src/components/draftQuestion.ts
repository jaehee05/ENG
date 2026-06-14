import { READING_TYPE_PROMPT, type ReadingQuestionType } from '../lib/types'

export interface DraftQuestion {
  type: ReadingQuestionType
  q: string
  body: string
  intro: string
  summaryBox: string
  choices: string[]
  answer: number
  points?: number
  image?: string
}

export function emptyDraftQuestion(type: ReadingQuestionType = 'standard'): DraftQuestion {
  return {
    type,
    q: READING_TYPE_PROMPT[type],
    body: '',
    intro: '',
    summaryBox: '',
    choices: ['', '', '', '', ''],
    answer: 0,
  }
}
