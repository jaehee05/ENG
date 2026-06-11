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
  return words.map((w) => `${w.en} - ${w.ko}`).join('\n')
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
