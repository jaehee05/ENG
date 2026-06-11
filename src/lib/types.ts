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
}

export interface VocabSet {
  id: string
  title: string
  words: WordEntry[]
  createdBy: string
  createdByName: string
  createdAt: Timestamp | null
}

export interface ReadingQuestion {
  q: string
  choices: string[]
  answer: number
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
