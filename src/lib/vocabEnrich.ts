import { enrichVocabBatch, type EnrichedWord } from './api'
import type { VocabExample, VocabSense, WordEntry } from './types'

/**
 * 한 번에 AI 에 보내는 단어 수. 서버(api/enrich-vocab.ts)는 Vercel 의
 * 60초 제한 안에서 돌아야 하고, 단어 하나마다 예문·번역·영영정의까지
 * 만들어야 해서 오답 생성(25개)보다 작게 잡는다.
 */
const BATCH_SIZE = 12

function trimmed(v: string | undefined | null): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** 앞의 값이 비어 있을 때만 뒤의 값을 쓴다. 둘 다 비면 undefined. */
function fill(current: string | undefined, incoming: string): string | undefined {
  return trimmed(current) || trimmed(incoming) || undefined
}

function cleanList(list: string[] | undefined): string[] {
  return (list ?? []).map((s) => trimmed(s)).filter(Boolean)
}

/**
 * AI 가 채워 주는 칸이 하나라도 비어 있는가.
 *
 * 뜻이 여러 개인 교재 단어는 화면이 senses 를 보고 그리므로, 평평한 필드가
 * 아니라 첫 번째 뜻 기준으로 판단한다.
 */
export function needsEnrich(w: WordEntry): boolean {
  const first = w.senses?.[0]
  if (!trimmed(w.ipa)) return true
  if (!trimmed(first?.pos ?? w.pos)) return true
  if (!trimmed(first?.definitionEn ?? w.definitionEn)) return true
  const syns = first?.synonyms?.length ? first.synonyms : w.synonyms
  if (cleanList(syns).length === 0) return true
  const ex = first?.examples?.[0]
  if (!trimmed(ex?.en ?? w.example)) return true
  if (!trimmed(ex?.ko ?? w.exampleKo)) return true
  return false
}

function mergeSense(s: VocabSense, e: EnrichedWord): VocabSense {
  const next: VocabSense = { ...s }
  const pos = fill(s.pos, e.pos)
  if (pos) next.pos = pos
  const definitionEn = fill(s.definitionEn, e.definitionEn)
  if (definitionEn) next.definitionEn = definitionEn
  const synonyms = cleanList(s.synonyms).length ? cleanList(s.synonyms) : cleanList(e.synonyms)
  if (synonyms.length > 0) next.synonyms = synonyms

  const ex0 = s.examples?.[0]
  const en = fill(ex0?.en, e.example)
  const ko = fill(ex0?.ko, e.exampleKo)
  if (en || ko) {
    const merged: VocabExample = { en: en ?? '' }
    if (ko) merged.ko = ko
    next.examples = [merged, ...(s.examples?.slice(1) ?? [])]
  }
  return next
}

/**
 * AI 가 채워 온 값으로 빈 칸만 메운다. 선생님이 직접 넣었거나 교재에서
 * 파싱된 값은 절대 덮어쓰지 않는다 — 교재의 뜻이 정답 기준이기 때문이다.
 */
export function mergeEnriched(w: WordEntry, e: EnrichedWord): WordEntry {
  const next: WordEntry = { ...w }
  const ipa = fill(w.ipa, e.ipa)
  if (ipa) next.ipa = ipa
  const pos = fill(w.pos, e.pos)
  if (pos) next.pos = pos
  const definitionEn = fill(w.definitionEn, e.definitionEn)
  if (definitionEn) next.definitionEn = definitionEn
  const synonyms = cleanList(w.synonyms).length ? cleanList(w.synonyms) : cleanList(e.synonyms)
  if (synonyms.length > 0) next.synonyms = synonyms
  const example = fill(w.example, e.example)
  if (example) next.example = example
  const exampleKo = fill(w.exampleKo, e.exampleKo)
  if (exampleKo) next.exampleKo = exampleKo

  // 단어 카드(VocabDetail)는 senses 가 있으면 그것만 보고 그린다.
  // 첫 번째 뜻에도 같이 채워야 화면에 나타난다.
  if (w.senses && w.senses.length > 0) {
    next.senses = w.senses.map((s, i) => (i === 0 ? mergeSense(s, e) : s))
  }
  return next
}

export interface EnrichOutcome {
  words: WordEntry[]
  /** 보강이 필요해 AI 에 보낸 단어 수. */
  attempted: number
  /** 실제로 값이 채워진 단어 수. */
  filled: number
  /** 배치 하나라도 실패했는지. 나머지 단어는 정상적으로 채워진다. */
  failed: boolean
}

/**
 * 목록에서 빈 칸이 있는 단어만 골라 AI 로 채운다.
 *
 * 배치 하나가 실패해도 나머지는 계속 채운다 — 30단어 중 한 묶음이 실패했다고
 * 단어 추가 자체가 막히면 안 된다. 못 채운 단어는 그대로 저장되고, 교재
 * 화면의 "빠진 정보 채우기" 로 다시 시도할 수 있다.
 */
export async function enrichWordList(
  words: WordEntry[],
  onProgress?: (done: number, total: number) => void,
): Promise<EnrichOutcome> {
  const targets: number[] = []
  words.forEach((w, i) => {
    if (trimmed(w.en) && trimmed(w.ko) && needsEnrich(w)) targets.push(i)
  })
  if (targets.length === 0) {
    return { words, attempted: 0, filled: 0, failed: false }
  }

  const byWord = new Map<string, EnrichedWord>()
  let failed = false
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const slice = targets.slice(i, i + BATCH_SIZE)
    try {
      const res = await enrichVocabBatch(
        slice.map((idx) => ({ en: words[idx].en.trim(), ko: words[idx].ko.trim() })),
      )
      for (const r of res) {
        const key = trimmed(r.en).toLowerCase()
        if (key) byWord.set(key, r)
      }
    } catch {
      failed = true
    }
    onProgress?.(Math.min(i + BATCH_SIZE, targets.length), targets.length)
  }

  let filled = 0
  const out = [...words]
  for (const idx of targets) {
    const e = byWord.get(words[idx].en.trim().toLowerCase())
    if (!e) continue
    out[idx] = mergeEnriched(words[idx], e)
    filled++
  }

  return { words: out, attempted: targets.length, filled, failed }
}
