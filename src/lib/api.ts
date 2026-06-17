import type { WordEntry } from './types'

interface ExtractGlossaryResponse {
  glossary: WordEntry[]
  choicesGlossary: WordEntry[]
}

export async function extractGlossary(input: {
  passage: string
  choices: string[]
}): Promise<ExtractGlossaryResponse> {
  const res = await fetch('/api/extract-glossary', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    let message = `요청 실패 (HTTP ${res.status})`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  const data = (await res.json()) as ExtractGlossaryResponse
  return {
    glossary: data.glossary ?? [],
    choicesGlossary: data.choicesGlossary ?? [],
  }
}

export function wordsToText(words: WordEntry[]): string {
  return words.map((w) => `${w.en} : ${w.ko}`).join('\n')
}

export async function imageToHtml(image: string): Promise<string> {
  const res = await fetch('/api/image-to-html', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image }),
  })
  if (!res.ok) {
    let message = `요청 실패 (HTTP ${res.status})`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  const data = (await res.json()) as { html?: string }
  return data.html ?? ''
}

export async function translatePassage(passage: string): Promise<string> {
  const res = await fetch('/api/translate-passage', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passage }),
  })
  if (!res.ok) {
    let message = `요청 실패 (HTTP ${res.status})`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  const data = (await res.json()) as { passageKo?: string }
  return data.passageKo ?? ''
}

export interface ImportedReadingItem {
  number: number
  type: string
  q: string
  body?: string
  intro?: string
  summaryBox?: string
  choices: string[]
  answer: number
}

export async function importReadingsFromPdf(input: {
  pdfBase64: string
  range: string
  answerKey?: string
}): Promise<ImportedReadingItem[]> {
  const res = await fetch('/api/import-readings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    let message = `요청 실패 (HTTP ${res.status})`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  const data = (await res.json()) as { readings: ImportedReadingItem[] }
  return data.readings ?? []
}

export interface EnrichedWord {
  en: string
  ko: string
  ipa: string
  pos: string
  synonyms: string[]
  example: string
  exampleKo: string
  definitionEn: string
}

async function enrichVocabBatch(
  words: { en: string; ko: string }[],
): Promise<EnrichedWord[]> {
  const res = await fetch('/api/enrich-vocab', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ words }),
  })
  if (!res.ok) {
    let message = `요청 실패 (HTTP ${res.status})`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  const data = (await res.json()) as { words: EnrichedWord[] }
  return data.words ?? []
}

const ENRICH_BATCH_SIZE = 25

export async function enrichVocab(
  words: { en: string; ko: string }[],
  onProgress?: (done: number, total: number) => void,
): Promise<EnrichedWord[]> {
  if (words.length === 0) return []
  const all: EnrichedWord[] = []
  for (let i = 0; i < words.length; i += ENRICH_BATCH_SIZE) {
    const slice = words.slice(i, i + ENRICH_BATCH_SIZE)
    const enriched = await enrichVocabBatch(slice)
    all.push(...enriched)
    onProgress?.(Math.min(i + ENRICH_BATCH_SIZE, words.length), words.length)
  }
  return all
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.includes(',') ? result.split(',')[1] : result
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'))
    reader.readAsDataURL(file)
  })
}

export interface ParsedReadingQuestion {
  type: string
  q: string
  body: string
  intro: string
  summaryBox: string
  choices: string[]
  answer: number
  points?: number
  number?: number
  hasChart?: boolean
  partA?: string
  partB?: string
  partC?: string
  partD?: string
}

export interface ParsedReadingResult {
  title: string
  passage: string
  questions: ParsedReadingQuestion[]
}

export async function parseReadingText(input: {
  text?: string
  images?: string[]
}): Promise<ParsedReadingResult> {
  const res = await fetch('/api/parse-reading', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    let message = `요청 실패 (HTTP ${res.status})`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  const data = (await res.json()) as ParsedReadingResult
  return {
    title: data.title ?? '',
    passage: data.passage ?? '',
    questions: data.questions ?? [],
  }
}

export interface GradeVocabItem {
  en: string
  expected: string
  userAnswer: string
}

export async function gradeVocabAI(items: GradeVocabItem[]): Promise<boolean[]> {
  if (items.length === 0) return []
  const res = await fetch('/api/grade-vocab', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  if (!res.ok) {
    let message = `요청 실패 (HTTP ${res.status})`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  const data = (await res.json()) as { results: { correct: boolean }[] }
  return (data.results ?? []).map((r) => Boolean(r.correct))
}

export async function defineWords(input: {
  words: string[]
  passage: string
}): Promise<WordEntry[]> {
  const res = await fetch('/api/define-words', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    let message = `요청 실패 (HTTP ${res.status})`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  const data = (await res.json()) as { entries?: WordEntry[] }
  return data.entries ?? []
}
