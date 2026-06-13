import type { Timestamp } from 'firebase/firestore'

export type UserRole = 'admin' | 'student'
export type UserStatus = 'pending' | 'active' | 'rejected'

export interface UserAccount {
  id: string
  email: string
  password?: string
  displayName: string
  role: UserRole
  status: UserStatus
  school?: string
  phone?: string
  parentPhone?: string
  createdAt: Timestamp | null
}

export interface WordEntry {
  en: string
  ko: string
  example?: string
  definitionEn?: string
}

export interface VocabSet {
  id: string
  title: string
  words: WordEntry[]
  createdBy: string
  createdByName: string
  createdAt: Timestamp | null
}

export type ReadingQuestionType =
  | 'standard'
  | 'cloze'
  | 'order'
  | 'insert'
  | 'summary'
  | 'irrelevant'
  | 'underline-grammar'
  | 'underline-vocab'

export interface ReadingQuestion {
  type?: ReadingQuestionType
  q: string
  /** Question-specific body text. Falls back to reading.passage if omitted. */
  body?: string
  /** Boxed "given" content shown above the body (order/insert types). */
  intro?: string
  /** Summary panel shown below the body (summary type, with (A)/(B) blanks). */
  summaryBox?: string
  choices: string[]
  answer: number
  /** Configuration score: 3 for 3점 문항. Absent/2 = default. */
  points?: number
}

export const READING_TYPE_LABEL: Record<ReadingQuestionType, string> = {
  standard: '일반 (제목·주제·주장 등)',
  cloze: '빈칸 추론',
  order: '글의 순서',
  insert: '문장 위치',
  summary: '요약문 빈칸',
  irrelevant: '흐름 무관 문장',
  'underline-grammar': '어법상 틀린 것',
  'underline-vocab': '문맥상 낱말 쓰임',
}

export const READING_TYPE_PROMPT: Record<ReadingQuestionType, string> = {
  standard: '윗글의 주제로 가장 적절한 것은?',
  cloze: '다음 빈칸에 들어갈 말로 가장 적절한 것은?',
  order: '주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?',
  insert: '글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳은?',
  summary: '다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?',
  irrelevant: '다음 글에서 전체 흐름과 관계 없는 문장은?',
  'underline-grammar': '다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?',
  'underline-vocab': '다음 글의 밑줄 친 부분 중, 문맥상 낱말의 쓰임이 적절하지 않은 것은?',
}

export interface Reading {
  id: string
  title: string
  passage: string
  glossary: WordEntry[]
  choicesGlossary: WordEntry[]
  questions: ReadingQuestion[]
  createdBy: string
  createdByName: string
  createdAt: Timestamp | null
}

export interface VocabResult {
  en: string
  ko: string
  userAnswer: string
  correct: boolean
}

export interface ReadingResult {
  q: string
  choices: string[]
  userAnswer: number
  correctAnswer: number
  correct: boolean
}

export interface Attempt {
  id: string
  studentUid: string
  studentName: string
  type: 'vocab' | 'reading' | 'wordbook'
  refId: string
  refTitle: string
  total: number
  correct: number
  vocabResults?: VocabResult[]
  readingResults?: ReadingResult[]
  createdAt: Timestamp | null
}

export interface ReadingRef {
  id: string
  title: string
}

export type AssignmentType = 'vocab' | 'reading'

export interface Assignment {
  id: string
  studentUid: string
  studentName: string
  assignedBy: string
  assignedByName: string
  type: AssignmentType
  refId: string
  refTitle: string
  note?: string
  dueAt: Timestamp | null
  createdAt: Timestamp | null
}

export interface WordLookup {
  en: string
  ko: string
  count: number
  readings: ReadingRef[]
  lastSeenAt: Timestamp | null
}

export function parseWordList(text: string): WordEntry[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.+?)\s*[-–—:\t]\s*(.+)$/)
      if (m) return { en: m[1].trim(), ko: m[2].trim() }
      return { en: line, ko: '' }
    })
    .filter((w) => w.en && w.ko)
}

export function isCorrectKo(userAnswer: string, expected: string): boolean {
  const norm = (s: string) =>
    s.trim().replace(/\s+/g, '').replace(/[.,/·•~∙]/g, '').toLowerCase()
  const user = norm(userAnswer)
  if (!user) return false
  const candidates = expected
    .split(/[,/·•∙、]/)
    .map((s) => norm(s))
    .filter(Boolean)
  return candidates.some((c) => c === user || c.includes(user) || user.includes(c))
}
