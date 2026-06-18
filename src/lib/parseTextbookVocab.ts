import type { VocabSense, WordEntry } from './types'

const HEAD_RE = /^(\d{2,5})\s+([^\[]+?)\s+\[([^\]]+)\]\s*$/
const SENSE_HEAD_RE =
  /^(n\.|v\.|adj\.|adv\.|prep\.|conj\.|int\.)\s*([❶❷❸❹❺❻❼❽❾❿])\s*(.+)$/
const DASH_RE = /^[-–—]\s+(.+)$/
const HANGUL_RE = /[ㄱ-힝]/

function splitSynonyms(s: string | undefined): string[] | undefined {
  if (!s) return undefined
  const list = s.split(/[,，]\s*/).map((x) => x.trim()).filter(Boolean)
  return list.length > 0 ? list : undefined
}

// 한 sense 줄의 본문(품사·마커 뒷부분)에서 ko / 영영 정의 / 유의어 분리.
// 우측 끝부터 ` = synonyms` → ` [definition]` 순으로 떼어내야
// ko에 [출간] 같은 내부 대괄호가 있어도 안전하게 분리됨.
export function parseSenseBody(text: string): {
  ko: string
  definitionEn?: string
  synonyms?: string[]
} {
  let rest = text.trim()

  // ' = synonyms' (오른쪽 끝)
  let synonyms: string[] | undefined
  const eqMatch = rest.match(/\s=\s(.+)$/)
  if (eqMatch && eqMatch.index !== undefined) {
    synonyms = splitSynonyms(eqMatch[1])
    rest = rest.slice(0, eqMatch.index).trim()
  }

  // ' [definition]'은 rest가 ']'로 끝나고 그 [...] 내용이 영어(한글 없음)일
  // 때만 떼어냄. ko 안의 [출간]·[매우] 같은 한글 대괄호는 그대로 ko에 둠.
  let definitionEn: string | undefined
  if (rest.endsWith(']')) {
    const lastClose = rest.length - 1
    const lastOpen = rest.lastIndexOf('[', lastClose - 1)
    if (lastOpen >= 0) {
      const candidate = rest.slice(lastOpen + 1, lastClose).trim()
      if (candidate && !HANGUL_RE.test(candidate)) {
        definitionEn = candidate
        rest = rest.slice(0, lastOpen).trim()
      }
    }
  }

  return { ko: rest, definitionEn, synonyms }
}

export function looksLikeTextbookVocab(text: string): boolean {
  const lines = text.split('\n').slice(0, 30)
  for (const line of lines) {
    if (HEAD_RE.test(line.trim())) return true
  }
  return false
}

export function parseTextbookVocab(text: string): WordEntry[] {
  const lines = text.split('\n').map((l) => l.trim())
  const entries: WordEntry[] = []
  let cur: WordEntry | null = null
  let curSense: VocabSense | null = null
  let curExEn = ''

  function pushPendingEn() {
    if (curExEn && curSense) {
      curSense.examples = curSense.examples ?? []
      curSense.examples.push({ en: curExEn })
    }
    curExEn = ''
  }

  for (const line of lines) {
    if (!line) continue
    const head = HEAD_RE.exec(line)
    if (head) {
      pushPendingEn()
      cur = { en: head[2].trim(), ko: '', ipa: head[3].trim(), senses: [] }
      entries.push(cur)
      curSense = null
      continue
    }
    const sense = SENSE_HEAD_RE.exec(line)
    if (sense && cur) {
      pushPendingEn()
      const parsed = parseSenseBody(sense[3])
      curSense = {
        pos: sense[1],
        ko: parsed.ko,
        definitionEn: parsed.definitionEn,
        synonyms: parsed.synonyms,
        examples: [],
      }
      cur.senses = cur.senses ?? []
      cur.senses.push(curSense)
      continue
    }
    const dash = DASH_RE.exec(line)
    if (dash && curSense) {
      const body = dash[1].trim()
      if (HANGUL_RE.test(body)) {
        const examples = (curSense.examples = curSense.examples ?? [])
        if (curExEn) {
          examples.push({ en: curExEn, ko: body })
          curExEn = ''
        } else {
          const last = examples[examples.length - 1]
          if (last && !last.ko) last.ko = body
          else examples.push({ en: '', ko: body })
        }
      } else {
        if (curExEn) {
          curSense.examples = curSense.examples ?? []
          curSense.examples.push({ en: curExEn })
        }
        curExEn = body
      }
      continue
    }
  }
  pushPendingEn()

  for (const e of entries) {
    const first = e.senses?.[0]
    if (first) {
      e.ko = first.ko
      if (first.pos) e.pos = first.pos
      if (first.definitionEn) e.definitionEn = first.definitionEn
      if (first.synonyms?.length) e.synonyms = [...first.synonyms]
      const ex0 = first.examples?.[0]
      if (ex0?.en) e.example = ex0.en
      if (ex0?.ko) e.exampleKo = ex0.ko
    }
  }

  return entries.filter((e) => e.en && e.ko)
}
