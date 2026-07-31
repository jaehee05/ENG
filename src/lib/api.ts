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

/**
 * 단어 하나하나에 발음기호·품사·유의어·예문·영영정의를 채워 받는다.
 * 한 번의 호출 = 한 번의 요청. 배치로 나눠 부르는 쪽은 vocabEnrich.ts.
 */
export async function enrichVocabBatch(
  words: { en: string; ko: string }[],
): Promise<EnrichedWord[]> {
  if (words.length === 0) return []
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
  const data = (await res.json()) as { words?: EnrichedWord[] }
  return data.words ?? []
}

export interface WordDistractors {
  en: string
  distractors: string[]
}

/** 5지선다 오답 선지 생성. 반대뜻 / 유사스펠링 단어의 뜻을 섞어 받는다. */
export async function makeVocabDistractors(
  words: { en: string; ko: string }[],
): Promise<WordDistractors[]> {
  if (words.length === 0) return []
  const res = await fetch('/api/vocab-distractors', {
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
  const data = (await res.json()) as { words?: WordDistractors[] }
  return data.words ?? []
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

export interface MockCutoffInput {
  subject?: 'korean' | 'english'
  title?: string
  totalQuestions?: number
  totalPoints: number
  practice?: boolean
  /** 시험지에서 추출한 텍스트 (있으면 AI가 실제 난이도를 보고 판단). */
  examText?: string
}

/** AI 등급컷 추정. { grade, minScore } 배열 반환. */
export async function estimateMockCutoffs(
  input: MockCutoffInput,
): Promise<{ grade: number; minScore: number }[]> {
  const res = await fetch('/api/mock-cutoffs', {
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
  const data = (await res.json()) as {
    cutoffs: { grade: number; minScore: number }[]
  }
  return data.cutoffs ?? []
}

