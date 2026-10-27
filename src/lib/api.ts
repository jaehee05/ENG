import { questionPoints, type KoreanMock, type KoreanMockQuestion, type MockNationalStats, type WordEntry } from './types'
import { COMMON_KEY } from './mockStats'
import type { OmrGrid } from './omrGrid'

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


/** 해설 HTML → AI 에 넘길 짧은 글. 정답 해설 + 선지별 오답 해설. */
function questionHint(q: KoreanMockQuestion): string | undefined {
  const strip = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
  const parts = [q.explanation, q.explanationWrong].filter(Boolean).map((h) => strip(h!))
  for (const [n, h] of Object.entries(q.explanationChoices ?? {})) if (h) parts.push(`(${n}번) ${strip(h)}`)
  return parts.join(' ') || undefined
}

async function postNational<T>(body: unknown): Promise<T> {
  const res = await fetch('/api/mock-national', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let message = `요청 실패 (HTTP ${res.status})`
    try {
      const b = (await res.json()) as { error?: string }
      if (b.error) message = b.error
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  return (await res.json()) as T
}

/**
 * 전국단위 통계 AI 추정 — 등급컷·표준점수 한 번, 묶음(공통·선택과목)마다 선택률 한 번씩
 * 나란히 부른다. 하나로 부르면 서버 60초를 넘긴다.
 */
export async function estimateNationalStats(mock: KoreanMock, examText?: string): Promise<MockNationalStats> {
  const toInput = (qs: KoreanMockQuestion[]) =>
    qs.map((q) => ({ number: q.number, answer: q.answer, points: questionPoints(q), hint: questionHint(q) }))
  const electives = mock.electives ?? []
  const groups = [
    { key: COMMON_KEY, label: electives.length ? '공통과목' : '전체 문항', questions: toInput(mock.questions) },
    ...electives.map((el) => ({ key: el.name, label: el.name, questions: toInput(el.questions) })),
  ].filter((g) => g.questions.length > 0)
  const commonPts = mock.questions.reduce((s, q) => s + questionPoints(q), 0)
  const totals: Record<string, number> = electives.length
    ? Object.fromEntries(electives.map((el) => [el.name, commonPts + el.questions.reduce((s, q) => s + questionPoints(q), 0)]))
    : { [COMMON_KEY]: commonPts }
  const shared = { title: mock.title, examText: examText || undefined }

  const [cuts, ...rateParts] = await Promise.all([
    postNational<{ cutoffs: MockNationalStats['cutoffs']; stdCutoffs: MockNationalStats['stdCutoffs'] }>({
      ...shared,
      part: 'cutoffs',
      totals,
      groups: groups.map(({ label, questions }) => ({ label, questions })),
    }),
    ...groups.map((g) =>
      postNational<{ rates: Record<string, number[]> }>({
        ...shared,
        part: 'rates',
        groups: [{ label: g.label, questions: g.questions }],
      }),
    ),
  ])
  const rates: Record<string, Record<string, number[]>> = {}
  groups.forEach((g, i) => {
    if (Object.keys(rateParts[i].rates ?? {}).length) rates[g.key] = rateParts[i].rates
  })
  return { cutoffs: cuts.cutoffs ?? {}, stdCutoffs: cuts.stdCutoffs ?? [], rates }
}

export interface OmrAnswer {
  number: number
  /** 읽은 칸 1~5. 0 = 미마킹이거나 판단 불가. */
  choice: number
  confidence: 'high' | 'low'
  note?: string
}

export interface OmrReadResult {
  answers: OmrAnswer[]
  /** 선택 과목 상자에 칠한 칸. 1=화법과 작문, 2=언어와 매체. */
  electiveMark?: 1 | 2
  /** 모델이 짚은 칸 위치 — 클라이언트가 픽셀로 다시 읽는 데 쓴다(omrGrid.ts). */
  grid?: OmrGrid
}

/**
 * OMR 카드 사진 판독. 결과는 답안 칸을 채우는 데만 쓰고, 사진은 서버에도 남지 않는다.
 * numbers 는 이번 응시에서 답할 실제 문항 번호(공통 + 고른 선택과목).
 */
export async function readOmr(input: {
  image: string
  mediaType: 'image/jpeg' | 'image/png'
  numbers: number[]
  subject: 'korean' | 'english'
}): Promise<OmrReadResult> {
  // 로컬 vite 서버는 /api 를 돌리지 않는다. ?omrMock=ok|fail|slow 로 화면 흐름만
  // 점검할 수 있게 가짜 응답을 준다. 배포 번들에서는 이 분기가 통째로 빠진다.
  if (import.meta.env.DEV) {
    const mock = new URLSearchParams(window.location.search).get('omrMock')
    if (mock) return fakeOmr(mock, input.numbers)
  }
  const res = await fetch('/api/read-omr', {
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
  const data = (await res.json()) as Partial<OmrReadResult>
  return { answers: data.answers ?? [], electiveMark: data.electiveMark, grid: data.grid }
}

/** 개발용 가짜 판독. 확인 필요(low·0)와 선택과목 불일치를 일부러 섞는다. */
async function fakeOmr(mode: string, numbers: number[]): Promise<OmrReadResult> {
  await new Promise((r) => setTimeout(r, mode === 'slow' ? 5000 : 1200))
  if (mode === 'fail') throw new Error('판독 결과를 받지 못했습니다. 다시 시도해 주세요.')
  return {
    answers: numbers.map((number, i) => {
      if (i % 9 === 4) return { number, choice: 0, confidence: 'low', note: '2·4 두 칸 마킹' }
      if (i % 9 === 7) return { number, choice: (i % 5) + 1, confidence: 'low', note: '지운 흔적' }
      if (i % 13 === 12) return { number, choice: 0, confidence: 'high' }
      return { number, choice: ((number * 7) % 5) + 1, confidence: 'high' }
    }),
    electiveMark: numbers.some((n) => n >= 35) ? 2 : undefined,
  }
}
