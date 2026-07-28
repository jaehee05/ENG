import { makeVocabDistractors } from './api'
import type { VocabChoice, WordEntry } from './types'

const CHOICE_COUNT = 5
const DISTRACTOR_COUNT = CHOICE_COUNT - 1
/** 한 번에 AI에 보내는 단어 수. enrich-vocab 과 같은 크기. */
const BATCH_SIZE = 25

/** 뜻이 사실상 같은지 — 공백·구두점만 다른 경우를 걸러낸다. */
function meaningKey(ko: string): string {
  return ko.replace(/[\s,·.()~]/g, '').toLowerCase()
}

/**
 * 결정적 셔플. 같은 시험지를 다시 만들어도 같은 배치가 나오도록 단어를 시드로 쓴다.
 * Math.random 을 쓰면 재생성할 때마다 정답 위치가 달라진다.
 */
function seededShuffle<T>(arr: T[], seed: string): T[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    const j = Math.abs(h) % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * 5지선다 선지를 만든다.
 *
 * AI로 반대뜻·유사스펠링 오답을 받되, 실패하거나 4개에 못 미치면
 * 같은 시험지(교재)의 다른 단어 뜻으로 채운다. AI 호출이 통째로 실패해도
 * 시험지 생성 자체는 성공한다 — 품질만 떨어질 뿐 막히지는 않는다.
 *
 * @param pool 오답을 빌려올 단어 풀. 보통 교재(시리즈) 전체 단어.
 */
export async function buildVocabChoices(
  words: WordEntry[],
  pool: WordEntry[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ choiceSets: VocabChoice[]; aiFailed: boolean }> {
  const targets = words.filter((w) => w.en?.trim() && w.ko?.trim())
  if (targets.length === 0) return { choiceSets: [], aiFailed: false }

  // 1) AI 오답 — 배치로 나눠 호출. 실패한 배치는 건너뛰고 폴백에 맡긴다.
  const byWord = new Map<string, string[]>()
  let aiFailed = false
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const slice = targets.slice(i, i + BATCH_SIZE)
    try {
      const res = await makeVocabDistractors(
        slice.map((w) => ({ en: w.en, ko: w.ko })),
      )
      for (const r of res) byWord.set(r.en, r.distractors)
    } catch {
      aiFailed = true
    }
    onProgress?.(Math.min(i + BATCH_SIZE, targets.length), targets.length)
  }

  // 2) 폴백용 뜻 풀 — 교재 전체에서 모은다.
  const poolMeanings = pool
    .map((w) => w.ko?.trim())
    .filter((ko): ko is string => Boolean(ko))

  const choiceSets: VocabChoice[] = []
  for (const w of targets) {
    const answer = w.ko.trim()
    const used = new Set<string>([meaningKey(answer)])
    const distractors: string[] = []

    const take = (ko: string) => {
      const s = ko.trim()
      if (!s || distractors.length >= DISTRACTOR_COUNT) return
      const key = meaningKey(s)
      if (used.has(key)) return
      used.add(key)
      distractors.push(s)
    }

    for (const d of byWord.get(w.en) ?? []) take(d)

    // 부족분은 교재 내 다른 단어의 뜻으로. 단어마다 다른 지점에서 시작해
    // 여러 문항에 같은 오답이 몰리지 않게 한다.
    if (distractors.length < DISTRACTOR_COUNT && poolMeanings.length > 0) {
      const rotated = seededShuffle(poolMeanings, w.en)
      for (const ko of rotated) {
        if (distractors.length >= DISTRACTOR_COUNT) break
        take(ko)
      }
    }

    // 그래도 못 채우면(교재가 아주 작을 때) 선지 수를 줄여서라도 낸다.
    const all = seededShuffle([answer, ...distractors], `${w.en}:choices`)
    choiceSets.push({
      en: w.en,
      choices: all,
      answer: all.indexOf(answer),
    })
  }

  return { choiceSets, aiFailed }
}
