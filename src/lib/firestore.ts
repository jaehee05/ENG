import {
  addDoc,
  arrayRemove,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'
import type {
  Announcement,
  Assignment,
  AssignmentType,
  AssignmentCategory,
  Attempt,
  CategoryConfig,
  ClassSession,
  ClassSessionStatus,
  DDaySetting,
  ExplStyle,
  KoreanMock,
  KoreanMockQuestion,
  KoreanMockElective,
  MockGradeCut,
  KoreanMockResult,
  MockSubject,
  NotificationKind,
  Payment,
  PersonalTodo,
  PushSchedule,
  Reading,
  ReadingResult,
  UserNotification,
  VocabResult,
  VocabChoice,
  VocabFormat,
  VocabSeries,
  VocabSet,
  WordEntry,
  ReadingQuestion,
} from './types'
import {
  DEFAULT_CATEGORIES,
  assignmentManualOverride,
  isReadingAttemptComplete,
} from './types'

export async function listVocabSets(): Promise<VocabSet[]> {
  const snap = await getDocs(query(collection(db, 'vocabSets'), orderBy('createdAt', 'desc')))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VocabSet, 'id'>) }))
}

export async function getVocabSet(id: string): Promise<VocabSet | null> {
  const snap = await getDoc(doc(db, 'vocabSets', id))
  if (!snap.exists()) return null
  return { id: snap.id, ...(snap.data() as Omit<VocabSet, 'id'>) }
}

export async function createVocabSet(input: {
  title: string
  words: WordEntry[]
  maxAttempts?: number
  studentUid?: string
  studentName?: string
  /** 이 시험지를 볼 학생들. 비었거나 없으면 전체 공개. */
  studentUids?: string[]
  /** 'choice' 면 5지선다. 미지정이면 기존 주관식. */
  format?: VocabFormat
  /** format==='choice' 일 때 단어별 선지. */
  choiceSets?: VocabChoice[]
  /** 교재에서 DAY 생성으로 만들 때만. 삭제 시 진행도를 되돌리는 데 쓴다. */
  seriesId?: string
  dayNumber?: number
  wordStart?: number
  wordEnd?: number
  createdBy: string
  createdByName: string
}): Promise<string> {
  const payload: Record<string, unknown> = {
    title: input.title,
    words: input.words,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: serverTimestamp(),
  }
  // 주관식은 필드를 아예 넣지 않는다 — 기존 시험지와 같은 모양을 유지.
  if (input.format === 'choice') {
    payload.format = 'choice'
    payload.choiceSets = input.choiceSets ?? []
  }
  if (input.maxAttempts && input.maxAttempts > 0) {
    payload.maxAttempts = Math.trunc(input.maxAttempts)
  }
  if (input.studentUid) {
    payload.studentUid = input.studentUid
    if (input.studentName) payload.studentName = input.studentName
  }
  // 전체 공개는 필드를 아예 넣지 않는다 — 빈 배열과 미설정이 같은 뜻이지만,
  // 기존 시험지와 모양을 맞춰 두면 나중에 읽을 때 헷갈리지 않는다.
  if (input.studentUids && input.studentUids.length > 0) {
    payload.studentUids = [...new Set(input.studentUids)]
  }
  if (input.seriesId) {
    payload.seriesId = input.seriesId
    if (typeof input.dayNumber === 'number') payload.dayNumber = input.dayNumber
    if (typeof input.wordStart === 'number') payload.wordStart = input.wordStart
    if (typeof input.wordEnd === 'number') payload.wordEnd = input.wordEnd
  }
  const ref = await addDoc(collection(db, 'vocabSets'), payload)
  return ref.id
}

/** "{교재명} DAY 12" 에서 12 를 꺼낸다. 형식이 안 맞으면 null. */
function dayNumberFromTitle(title: string, seriesTitle: string): number | null {
  const prefix = `${seriesTitle} DAY `
  if (!seriesTitle || !title.startsWith(prefix)) return null
  const n = Number.parseInt(title.slice(prefix.length).trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * 시험지가 어느 교재에서 나왔는지 찾는다. seriesId 가 붙기 전에 만든 시험지는
 * 제목("{교재명} DAY N")으로 되짚는다. 교재명끼리 접두 관계일 수 있어
 * 가장 긴 쪽을 고른다.
 */
async function findSeriesForSet(
  set: Pick<VocabSet, 'title' | 'seriesId'>,
): Promise<Pick<VocabSeries, 'id' | 'title'> | null> {
  if (set.seriesId) {
    const snap = await getDoc(doc(db, 'vocabSeries', set.seriesId))
    if (!snap.exists()) return null
    const data = snap.data() as Omit<VocabSeries, 'id'>
    return { id: snap.id, title: data.title }
  }
  let best: VocabSeries | null = null
  for (const s of await listVocabSeries()) {
    if (dayNumberFromTitle(set.title, s.title) === null) continue
    if (!best || s.title.length > best.title.length) best = s
  }
  return best ? { id: best.id, title: best.title } : null
}

/**
 * 이 교재에서 만든 시험지를 DAY 번호와 함께 골라낸다.
 *
 * seriesId 가 붙어 있으면 그것만 믿는다 — 다른 교재의 시험지가 우연히 제목이
 * 맞는 일을 막는다. seriesId 가 없는 옛 시험지는 제목으로 되짚는다.
 */
export function setsOfSeries(
  series: Pick<VocabSeries, 'id' | 'title'>,
  all: VocabSet[],
): { day: number; set: VocabSet }[] {
  const out: { day: number; set: VocabSet }[] = []
  for (const s of all) {
    if (s.seriesId && s.seriesId !== series.id) continue
    const day = s.dayNumber ?? dayNumberFromTitle(s.title, series.title)
    if (day !== null) out.push({ day, set: s })
  }
  return out.sort((a, b) => a.day - b.day)
}

export interface SeriesProgress {
  usedCount: number
  lastDayNumber: number
}

/**
 * 남아 있는 시험지만 보고 이 교재의 DAY 진행도를 계산한다. 저장하지 않는다.
 *
 * 진행도를 생성할 때 더하기만 하면 시험지를 지웠을 때 어긋난다. 마지막 DAY 를
 * 지워도 커서가 그대로라 다음 생성이 번호를 이어 붙이고, 지운 DAY 가 쓰던
 * 단어는 영영 건너뛴다. 그래서 남은 시험지를 진실로 삼아 다시 계산한다.
 *
 * 중간 DAY 만 지운 경우(1~5 중 3번)는 커서를 되돌리지 않는다. 뒤쪽 DAY 가
 * 아직 그 뒤 단어를 쓰고 있어, 되돌리면 다음 생성이 같은 단어를 또 낸다.
 */
export function progressFromSets(
  series: Pick<VocabSeries, 'id' | 'title'>,
  all: VocabSet[],
): SeriesProgress {
  const mine = setsOfSeries(series, all)
  if (mine.length === 0) return { usedCount: 0, lastDayNumber: 0 }

  const last = mine[mine.length - 1]
  return {
    lastDayNumber: last.day,
    usedCount:
      last.set.wordEnd ??
      // 구간이 없는 옛 시험지는 그 DAY 까지의 단어 수를 더해 커서를 추정한다
      mine
        .filter((m) => m.day <= last.day)
        .reduce((n, m) => n + (m.set.words?.length ?? 0), 0),
  }
}

/** 저장된 진행도와 실제(남은 시험지 기준)가 다른지. */
export function progressDiffers(
  stored: SeriesProgress | undefined,
  actual: SeriesProgress,
): boolean {
  const s = stored ?? { usedCount: 0, lastDayNumber: 0 }
  return s.usedCount !== actual.usedCount || s.lastDayNumber !== actual.lastDayNumber
}

/** 교재 진행도를 남은 시험지 기준으로 계산한다. 저장하지 않는다. */
export async function computeVocabSeriesProgress(
  series: Pick<VocabSeries, 'id' | 'title'>,
): Promise<SeriesProgress> {
  return progressFromSets(series, await listVocabSets())
}

/** 교재 진행도를 남은 시험지 기준으로 다시 계산해 저장한다. */
export async function syncVocabSeriesProgress(
  series: Pick<VocabSeries, 'id' | 'title'>,
): Promise<SeriesProgress> {
  const prog = await computeVocabSeriesProgress(series)
  await updateVocabSeries(series.id, prog)
  return prog
}

/**
 * 시험지를 지우고, 교재에서 만든 DAY 시험지면 진행도도 다시 맞춘다 — 안 그러면
 * 지운 DAY 가 진행도에 남아 다음 생성이 번호를 이어 붙인다.
 */
export async function deleteVocabSet(
  set: Pick<VocabSet, 'id' | 'title' | 'seriesId'>,
): Promise<void> {
  await deleteDoc(doc(db, 'vocabSets', set.id))
  const series = await findSeriesForSet(set)
  if (series) await syncVocabSeriesProgress(series)
}

/**
 * 어떤 컬렉션의 refId 를 다른 시험지로 옮긴다. 배치 상한(500)을 넘기지 않게
 * 나눠서 커밋한다. 옮긴 문서 수를 반환.
 */
async function remapRefId(
  col: 'attempts' | 'assignments',
  from: string,
  to: string,
): Promise<number> {
  const snap = await getDocs(query(collection(db, col), where('refId', '==', from)))
  const BATCH_LIMIT = 450
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    for (const d of snap.docs.slice(i, i + BATCH_LIMIT)) batch.update(d.ref, { refId: to })
    await batch.commit()
  }
  return snap.docs.length
}

/**
 * 학생마다 따로 만들어 두었던 같은 시험지들을 하나로 합친다.
 *
 * 남길 시험지를 빼고 나머지를 지우되, 지우기 전에 그 시험지를 가리키던 응시
 * 기록과 과제의 refId 를 남는 쪽으로 옮긴다. 안 옮기면 학생 기록이 없는
 * 문서를 가리켜 결과 화면이 깨진다.
 *
 * 남는 시험지에서는 소유 학생을 뗀다 — 이제 모두가 같은 것을 푼다.
 */
export async function mergeVocabSets(
  survivor: Pick<VocabSet, 'id' | 'studentUid'>,
  losers: Pick<VocabSet, 'id'>[],
): Promise<{ attempts: number; assignments: number; deleted: number }> {
  let attempts = 0
  let assignments = 0
  let deleted = 0
  for (const loser of losers) {
    if (loser.id === survivor.id) continue
    attempts += await remapRefId('attempts', loser.id, survivor.id)
    assignments += await remapRefId('assignments', loser.id, survivor.id)
    await deleteDoc(doc(db, 'vocabSets', loser.id))
    deleted++
  }
  if (survivor.studentUid) {
    await updateDoc(doc(db, 'vocabSets', survivor.id), {
      studentUid: deleteField(),
      studentName: deleteField(),
    })
  }
  return { attempts, assignments, deleted }
}

export async function updateVocabSetWords(
  id: string,
  words: WordEntry[],
): Promise<void> {
  await updateDoc(doc(db, 'vocabSets', id), { words })
}

export async function updateVocabSetTitle(
  id: string,
  title: string,
): Promise<void> {
  await updateDoc(doc(db, 'vocabSets', id), { title })
}

/**
 * 교재 단어를 나눠 담는 청크 크기.
 *
 * Firestore 문서 하나는 1 MiB 를 넘을 수 없다. 보강 정보(예문·영영정의·동의어)가
 * 붙은 단어는 하나에 대략 600~700 바이트라, 단어를 통째로 한 배열에 넣으면
 * 1600개 근처에서 저장이 막힌다. 그래서 하위 컬렉션에 나눠 담는다.
 * 250개면 청크 하나가 약 160 KB 로 상한에 넉넉히 못 미친다.
 */
const WORD_CHUNK_SIZE = 250

function wordChunkCol(seriesId: string) {
  return collection(db, 'vocabSeries', seriesId, 'wordChunks')
}

/** 청크에서 단어를 읽어 순서대로 이어붙인다. 청크가 없으면 null. */
async function readWordChunks(seriesId: string): Promise<WordEntry[] | null> {
  const snap = await getDocs(query(wordChunkCol(seriesId), orderBy('seq')))
  if (snap.empty) return null
  const out: WordEntry[] = []
  for (const d of snap.docs) {
    const arr = (d.data() as { words?: WordEntry[] }).words
    if (Array.isArray(arr)) out.push(...arr)
  }
  return out
}

/**
 * 단어를 청크로 다시 쓴다. 남는 청크는 지우고, 문서 본문의 레거시 words 배열도
 * 함께 비운다(옛 교재를 저장하는 순간 자연스럽게 옮겨간다).
 */
async function writeWordChunks(seriesId: string, words: WordEntry[]): Promise<void> {
  const existing = await getDocs(wordChunkCol(seriesId))
  const chunkCount = Math.ceil(words.length / WORD_CHUNK_SIZE)

  // 배치 하나에 500 작업 상한이 있어, 넘칠 것 같으면 나눠서 커밋한다.
  const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = []
  for (let i = 0; i < chunkCount; i++) {
    // 문서 ID를 0 패딩해 문자열 정렬과 seq 정렬이 어긋나지 않게 한다
    const ref = doc(wordChunkCol(seriesId), String(i).padStart(4, '0'))
    const slice = words.slice(i * WORD_CHUNK_SIZE, (i + 1) * WORD_CHUNK_SIZE)
    ops.push((b) => b.set(ref, { seq: i, words: slice }))
  }
  for (const d of existing.docs) {
    const seq = (d.data() as { seq?: number }).seq
    if (typeof seq !== 'number' || seq >= chunkCount) ops.push((b) => b.delete(d.ref))
  }

  const BATCH_LIMIT = 450
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch)
    await batch.commit()
  }

  // 청크를 다 쓴 뒤에 개수를 갱신한다. 중간에 실패하면 개수가 안 맞느니
  // 예전 값으로 남는 편이 낫다.
  await updateDoc(doc(db, 'vocabSeries', seriesId), {
    wordCount: words.length,
    words: deleteField(),
    updatedAt: serverTimestamp(),
  })
}

/**
 * 목록용. 단어 본문은 읽지 않는다 — 교재가 많으면 청크를 전부 읽는 건 낭비다.
 * 개수는 문서에 비정규화해 둔 wordCount 를 쓰고, 아직 옮기지 않은 옛 교재는
 * 인라인 words 길이로 채운다.
 */
export async function listVocabSeries(): Promise<VocabSeries[]> {
  const snap = await getDocs(
    query(collection(db, 'vocabSeries'), orderBy('createdAt', 'desc')),
  )
  return snap.docs.map((d) => {
    const data = d.data() as Omit<VocabSeries, 'id'>
    return {
      id: d.id,
      ...data,
      wordCount: data.wordCount ?? data.words?.length ?? 0,
    }
  })
}

export async function getVocabSeries(id: string): Promise<VocabSeries | null> {
  const snap = await getDoc(doc(db, 'vocabSeries', id))
  if (!snap.exists()) return null
  const data = snap.data() as Omit<VocabSeries, 'id'>
  // 청크가 있으면 그걸 쓰고, 없으면 아직 옮기지 않은 옛 교재의 인라인 배열을 쓴다
  const chunked = await readWordChunks(id)
  const words = chunked ?? data.words ?? []
  return { id: snap.id, ...data, words, wordCount: words.length }
}

export async function createVocabSeries(input: {
  title: string
  maxAttempts?: number
  words?: WordEntry[]
  perDay?: number
  createdBy: string
  createdByName: string
}): Promise<string> {
  const payload: Record<string, unknown> = {
    title: input.title,
    lastDayNumber: 0,
    usedCount: 0,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  if (input.maxAttempts && input.maxAttempts > 0) {
    payload.maxAttempts = Math.trunc(input.maxAttempts)
  }
  if (input.perDay && input.perDay > 0) {
    payload.perDay = Math.trunc(input.perDay)
  }
  payload.wordCount = input.words?.length ?? 0
  const ref = await addDoc(collection(db, 'vocabSeries'), payload)
  // 단어는 문서 본문이 아니라 하위 청크로 (1 MiB 문서 상한 회피)
  if (input.words && input.words.length > 0) {
    await writeWordChunks(ref.id, input.words)
  }
  return ref.id
}

export async function bumpVocabSeries(
  id: string,
  newLastDay: number,
): Promise<void> {
  await updateDoc(doc(db, 'vocabSeries', id), {
    lastDayNumber: newLastDay,
    updatedAt: serverTimestamp(),
  })
}

export async function updateVocabSeries(
  id: string,
  patch: Partial<
    Pick<
      VocabSeries,
      | 'title'
      | 'maxAttempts'
      | 'words'
      | 'perDay'
      | 'usedCount'
      | 'lastDayNumber'
      | 'studentProgress'
      | 'studentUids'
    >
  >,
): Promise<void> {
  const update: Record<string, unknown> = { updatedAt: serverTimestamp() }
  for (const [k, v] of Object.entries(patch)) {
    // words 는 문서에 넣지 않고 청크로 따로 쓴다
    if (k === 'words') continue
    if (v === undefined) continue
    // 공개 대상을 비우면(=전체 공개) 필드를 지운다. 빈 배열로 남겨도 뜻은
    // 같지만, 지정한 적 없는 교재와 모양을 맞춰 둔다.
    if (k === 'studentUids' && Array.isArray(v) && v.length === 0) {
      update[k] = deleteField()
      continue
    }
    update[k] = v
  }
  if (Object.keys(update).length > 1) {
    await updateDoc(doc(db, 'vocabSeries', id), update)
  }
  if (patch.words !== undefined) {
    await writeWordChunks(id, patch.words)
  }
}

export async function deleteVocabSeries(id: string): Promise<void> {
  // 하위 청크를 먼저 지운다 — 문서만 지우면 청크가 고아로 남는다
  const chunks = await getDocs(wordChunkCol(id))
  if (!chunks.empty) {
    const batch = writeBatch(db)
    for (const d of chunks.docs) batch.delete(d.ref)
    await batch.commit()
  }
  await deleteDoc(doc(db, 'vocabSeries', id))
}

/**
 * 교재명 변경 시 이미 생성된 "{oldTitle} DAY N" 시험지 제목도 함께 갱신.
 * 갱신한 시험지 개수를 반환. (교재명 변경은 언제든 가능하며 생성된 시험지와 무관하게 동작)
 */
export async function renameVocabSeriesSheets(
  oldTitle: string,
  newTitle: string,
): Promise<number> {
  if (!oldTitle || oldTitle === newTitle) return 0
  const prefix = `${oldTitle} DAY `
  const snap = await getDocs(collection(db, 'vocabSets'))
  const batch = writeBatch(db)
  let count = 0
  for (const d of snap.docs) {
    const title = (d.data() as { title?: string }).title ?? ''
    if (title.startsWith(prefix)) {
      batch.update(d.ref, { title: `${newTitle} DAY ${title.slice(prefix.length)}` })
      count++
    }
  }
  if (count > 0) await batch.commit()
  return count
}

/**
 * 교재의 공개 대상을 이미 만들어 둔 DAY 시험지에도 반영한다.
 *
 * 학생이 보는 것은 교재가 아니라 DAY 시험지라, 교재 문서만 고치면 이미
 * 나가 있는 시험지는 계속 전체에게 보인다. 교재명 변경
 * (renameVocabSeriesSheets)과 같은 이유로 시험지까지 훑어 고친다.
 *
 * @returns 손댄 시험지 수
 */
export async function updateVocabSeriesSheetsAudience(
  series: Pick<VocabSeries, 'id' | 'title'>,
  studentUids: string[],
): Promise<number> {
  const mine = setsOfSeries(series, await listVocabSets())
  if (mine.length === 0) return 0
  const uids = [...new Set(studentUids)]
  // 전체 공개로 되돌릴 때는 필드를 지운다. 빈 배열로 남겨도 뜻은 같지만
  // 미설정과 모양을 맞춰 둔다.
  const value = uids.length > 0 ? uids : deleteField()
  // writeBatch 는 한 번에 500개까지다. DAY 가 그만큼 쌓인 교재는 드물지만
  // 넘으면 조용히 실패하므로 잘라서 커밋한다.
  for (let i = 0; i < mine.length; i += 400) {
    const batch = writeBatch(db)
    for (const { set } of mine.slice(i, i + 400)) {
      batch.update(doc(db, 'vocabSets', set.id), { studentUids: value })
    }
    await batch.commit()
  }
  return mine.length
}

export async function listReadings(): Promise<Reading[]> {
  const snap = await getDocs(query(collection(db, 'readings'), orderBy('createdAt', 'desc')))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Reading, 'id'>) }))
}

export async function getReading(id: string): Promise<Reading | null> {
  const snap = await getDoc(doc(db, 'readings', id))
  if (!snap.exists()) return null
  return { id: snap.id, ...(snap.data() as Omit<Reading, 'id'>) }
}

export async function createReading(input: {
  title: string
  passage: string
  passageKo?: string
  glossary: WordEntry[]
  choicesGlossary: WordEntry[]
  questions: ReadingQuestion[]
  createdBy: string
  createdByName: string
}): Promise<string> {
  const payload: Record<string, unknown> = {
    title: input.title,
    passage: input.passage,
    glossary: input.glossary,
    choicesGlossary: input.choicesGlossary,
    questions: input.questions,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: serverTimestamp(),
  }
  if (input.passageKo && input.passageKo.trim()) {
    payload.passageKo = input.passageKo.trim()
  }
  const ref = await addDoc(collection(db, 'readings'), payload)
  return ref.id
}

export async function updateReadingGlossary(
  id: string,
  glossary: WordEntry[],
): Promise<void> {
  await updateDoc(doc(db, 'readings', id), { glossary })
}

export async function updateReadingContent(
  id: string,
  input: { title: string; passage: string; questions: ReadingQuestion[] },
): Promise<void> {
  await updateDoc(doc(db, 'readings', id), input)
}

export async function updateReadingQuestions(
  id: string,
  questions: ReadingQuestion[],
): Promise<void> {
  await updateDoc(doc(db, 'readings', id), { questions })
}

export async function updateReadingPassageKo(
  id: string,
  passageKo: string,
): Promise<void> {
  await updateDoc(doc(db, 'readings', id), { passageKo })
}

/** 한 지문의 attempt 전부를 그 지문 questions[].answer 기준으로 재채점. */
export async function regradeAllAttemptsForReading(
  readingId: string,
  questions: ReadingQuestion[],
): Promise<number> {
  const snap = await getDocs(
    query(
      collection(db, 'attempts'),
      where('type', '==', 'reading'),
      where('refId', '==', readingId),
    ),
  )
  let touched = 0
  for (const d of snap.docs) {
    const data = d.data() as Omit<Attempt, 'id'>
    const results = (data.readingResults ?? []) as ReadingResult[]
    if (results.length === 0) continue
    const updated = results.map((r, i) => {
      const q = questions[i]
      if (!q) return r
      const correct = r.userAnswer === q.answer
      return { ...r, correctAnswer: q.answer, correct }
    })
    const totalCorrect = updated.reduce(
      (s, r) => s + (r.correct ? 1 : 0),
      0,
    )
    const sameAnswers = results.every(
      (r, i) => r.correctAnswer === updated[i].correctAnswer,
    )
    if (sameAnswers && totalCorrect === data.correct) continue
    await updateDoc(doc(db, 'attempts', d.id), {
      readingResults: updated,
      correct: totalCorrect,
    })
    touched++
  }
  return touched
}

/** 모든 지문에 대해 일괄 재채점. */
export async function regradeAllReadings(): Promise<{
  readings: number
  updated: number
}> {
  const readings = await listReadings()
  let updated = 0
  for (const r of readings) {
    updated += await regradeAllAttemptsForReading(r.id, r.questions)
  }
  return { readings: readings.length, updated }
}

/**
 * 지문의 정답을 바꾼 뒤, 이미 응시한 학생들의 attempt 기록도 재채점.
 * 각 attempt.readingResults[qi]의 correctAnswer/correct를 갱신하고
 * attempt.correct (총 맞은 수)를 다시 계산해 저장한다.
 */
export async function regradeReadingAttempts(
  readingId: string,
  qi: number,
  newAnswer: number,
): Promise<number> {
  const snap = await getDocs(
    query(
      collection(db, 'attempts'),
      where('type', '==', 'reading'),
      where('refId', '==', readingId),
    ),
  )
  let touched = 0
  for (const d of snap.docs) {
    const data = d.data() as Omit<Attempt, 'id'>
    const results = (data.readingResults ?? []) as ReadingResult[]
    if (!results[qi]) continue
    const updated = results.map((r, i) => {
      if (i !== qi) return r
      const correct = r.userAnswer === newAnswer
      return { ...r, correctAnswer: newAnswer, correct }
    })
    const totalCorrect = updated.reduce((sum, r) => sum + (r.correct ? 1 : 0), 0)
    await updateDoc(doc(db, 'attempts', d.id), {
      readingResults: updated,
      correct: totalCorrect,
    })
    touched++
  }
  return touched
}

export async function deleteReading(id: string): Promise<void> {
  await deleteDoc(doc(db, 'readings', id))
}

export async function getReadingOrder(): Promise<string[]> {
  const snap = await getDoc(doc(db, 'meta', 'readingOrder'))
  if (!snap.exists()) return []
  const data = snap.data() as { order?: unknown }
  return Array.isArray(data.order) ? (data.order.filter((x) => typeof x === 'string') as string[]) : []
}

export async function setReadingOrder(order: string[]): Promise<void> {
  await setDoc(doc(db, 'meta', 'readingOrder'), { order, updatedAt: serverTimestamp() })
}

export function applyReadingOrder<T extends { id: string; createdAt: Timestamp | null }>(
  items: T[],
  order: string[],
): T[] {
  if (order.length === 0) return items
  const byId = new Map(items.map((x) => [x.id, x]))
  const ordered: T[] = []
  for (const id of order) {
    const x = byId.get(id)
    if (x) {
      ordered.push(x)
      byId.delete(id)
    }
  }
  const rest = [...byId.values()].sort(
    (a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
  )
  return [...ordered, ...rest]
}

export async function updateReadingGlossaries(
  id: string,
  glossary: WordEntry[],
  choicesGlossary: WordEntry[],
): Promise<void> {
  await updateDoc(doc(db, 'readings', id), { glossary, choicesGlossary })
}

export async function createVocabAttempt(input: {
  studentUid: string
  studentName: string
  refId: string
  refTitle: string
  vocabResults: VocabResult[]
  practice?: boolean
}): Promise<string> {
  const total = input.vocabResults.length
  const correct = input.vocabResults.filter((r) => r.correct).length
  const payload: Record<string, unknown> = {
    studentUid: input.studentUid,
    studentName: input.studentName,
    type: 'vocab',
    refId: input.refId,
    refTitle: input.refTitle,
    total,
    correct,
    vocabResults: input.vocabResults,
    createdAt: serverTimestamp(),
  }
  if (input.practice) payload.practice = true
  const ref = await addDoc(collection(db, 'attempts'), payload)
  return ref.id
}

export async function createWordbookAttempt(input: {
  studentUid: string
  studentName: string
  vocabResults: VocabResult[]
}): Promise<string> {
  const total = input.vocabResults.length
  const correct = input.vocabResults.filter((r) => r.correct).length
  const ref = await addDoc(collection(db, 'attempts'), {
    studentUid: input.studentUid,
    studentName: input.studentName,
    type: 'wordbook',
    refId: '',
    refTitle: '내 단어장',
    total,
    correct,
    vocabResults: input.vocabResults,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

/* ========== KoreanMock CRUD ========== */

// ───── 홈 D-day (관리자 설정, 전체 공통) ─────
export async function getDDay(): Promise<DDaySetting | null> {
  const snap = await getDoc(doc(db, 'settings', 'dday'))
  return snap.exists() ? (snap.data() as DDaySetting) : null
}
export async function setDDay(s: DDaySetting): Promise<void> {
  await setDoc(doc(db, 'settings', 'dday'), { title: s.title, dateISO: s.dateISO })
}
export async function clearDDay(): Promise<void> {
  await deleteDoc(doc(db, 'settings', 'dday'))
}

// ───── 해설 미리 지정 스타일 (관리자 설정, 전체 공통) ─────
export async function getExplStyles(): Promise<ExplStyle[]> {
  const snap = await getDoc(doc(db, 'settings', 'explStyles'))
  const list = snap.exists() ? (snap.data() as { list?: ExplStyle[] }).list : null
  return Array.isArray(list) ? list : []
}
export async function setExplStyles(list: ExplStyle[]): Promise<void> {
  await setDoc(doc(db, 'settings', 'explStyles'), { list })
}

export async function listKoreanMocks(): Promise<KoreanMock[]> {
  const snap = await getDocs(
    query(collection(db, 'koreanMocks'), orderBy('createdAt', 'desc')),
  )
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<KoreanMock, 'id'>),
  }))
}

export async function getKoreanMock(id: string): Promise<KoreanMock | null> {
  const snap = await getDoc(doc(db, 'koreanMocks', id))
  if (!snap.exists()) return null
  return { id: snap.id, ...(snap.data() as Omit<KoreanMock, 'id'>) }
}

/**
 * 모의고사 문서를 실시간으로 구독한다. 구독을 끊는 함수를 반환.
 *
 * 관리자가 해설을 저장하면 학생 결과 화면이 새로고침 없이 따라온다 — 해설이
 * 없어 못 누르던 번호가 눌리게 되고, 열어 둔 해설도 그 자리에서 갱신된다.
 * 문서 하나만 듣기 때문에 학생 화면에 붙는 연결도 하나다.
 */
export function watchKoreanMock(
  id: string,
  onChange: (mock: KoreanMock | null) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, 'koreanMocks', id),
    (snap) => {
      onChange(
        snap.exists()
          ? { id: snap.id, ...(snap.data() as Omit<KoreanMock, 'id'>) }
          : null,
      )
    },
    (e) => onError?.(e),
  )
}

export async function createKoreanMock(input: {
  title: string
  subject?: 'korean' | 'english'
  startNumber?: number
  questions: KoreanMockQuestion[]
  electives?: KoreanMockElective[]
  examinerComment?: string
  gradeCutoffs?: MockGradeCut[]
  createdBy: string
  createdByName: string
}): Promise<string> {
  const payload: Record<string, unknown> = {
    title: input.title,
    subject: input.subject ?? 'korean',
    startNumber: input.startNumber && input.startNumber > 0 ? input.startNumber : 1,
    questions: input.questions,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: serverTimestamp(),
  }
  if (input.electives && input.electives.length) payload.electives = input.electives
  if (input.examinerComment && input.examinerComment.trim())
    payload.examinerComment = input.examinerComment.trim()
  if (input.gradeCutoffs && input.gradeCutoffs.length)
    payload.gradeCutoffs = input.gradeCutoffs
  const ref = await addDoc(collection(db, 'koreanMocks'), payload)
  return ref.id
}

export async function updateKoreanMock(
  id: string,
  patch: Partial<
    Pick<
      KoreanMock,
      | 'title'
      | 'subject'
      | 'startNumber'
      | 'questions'
      | 'electives'
      | 'examinerComment'
      | 'gradeCutoffs'
    >
  > & {
    /** 해설 PDF 설정 정보. null 이면 해설 PDF 를 제거(필드 삭제). */
    explanationPdf?: {
      url: string
      name: string
      path: string
    } | null
  },
): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = patch.title
  if (patch.subject !== undefined) update.subject = patch.subject
  if (patch.startNumber !== undefined) {
    update.startNumber = patch.startNumber && patch.startNumber > 0 ? patch.startNumber : 1
  }
  if (patch.questions !== undefined) update.questions = patch.questions
  if (patch.electives !== undefined) {
    update.electives = patch.electives.length ? patch.electives : deleteField()
  }
  if (patch.examinerComment !== undefined) {
    update.examinerComment = patch.examinerComment.trim()
      ? patch.examinerComment.trim()
      : deleteField()
  }
  if (patch.gradeCutoffs !== undefined) {
    update.gradeCutoffs = patch.gradeCutoffs.length
      ? patch.gradeCutoffs
      : deleteField()
  }
  if (patch.explanationPdf !== undefined) {
    if (patch.explanationPdf === null) {
      update.explanationPdfUrl = deleteField()
      update.explanationPdfName = deleteField()
      update.explanationPdfPath = deleteField()
    } else {
      update.explanationPdfUrl = patch.explanationPdf.url
      update.explanationPdfName = patch.explanationPdf.name
      update.explanationPdfPath = patch.explanationPdf.path
    }
  }
  if (Object.keys(update).length === 0) return
  await updateDoc(doc(db, 'koreanMocks', id), update)
}

export async function deleteKoreanMock(id: string): Promise<void> {
  await deleteDoc(doc(db, 'koreanMocks', id))
}

export async function createKoreanMockAttempt(input: {
  studentUid: string
  studentName: string
  refId: string
  refTitle: string
  koreanMockResults: KoreanMockResult[]
  mockSubject?: MockSubject
  mockElectiveName?: string
}): Promise<string> {
  const total = input.koreanMockResults.length
  const correct = input.koreanMockResults.filter((r) => r.correct).length
  const payload: Record<string, unknown> = {
    studentUid: input.studentUid,
    studentName: input.studentName,
    type: 'korean_mock',
    refId: input.refId,
    refTitle: input.refTitle,
    total,
    correct,
    koreanMockResults: input.koreanMockResults,
    createdAt: serverTimestamp(),
  }
  if (input.mockSubject) payload.mockSubject = input.mockSubject
  if (input.mockElectiveName) payload.mockElectiveName = input.mockElectiveName
  const ref = await addDoc(collection(db, 'attempts'), payload)
  return ref.id
}

/** 특정 단어 시험지의 모든 학생 응시 기록 (관리자 전용). 최신순. */
export async function listVocabAttemptsForSet(refId: string): Promise<Attempt[]> {
  const snap = await getDocs(
    query(collection(db, 'attempts'), where('refId', '==', refId)),
  )
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Attempt, 'id'>) }))
    .filter((a) => a.type === 'vocab')
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
}

/** 특정 국어 모의고사의 모든 응시 기록을 가져옴 (관리자 전용). */
export async function listKoreanMockAttempts(refId: string): Promise<Attempt[]> {
  const snap = await getDocs(
    query(collection(db, 'attempts'), where('refId', '==', refId)),
  )
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Attempt, 'id'>) }))
    .filter((a) => a.type === 'korean_mock')
}

/**
 * 모의고사 정답을 바꾼 뒤, 이미 응시한 학생들의 기록을 새 정답으로 재채점.
 * 각 attempt.koreanMockResults[].correctAnswer/correct 와 correct 카운트를 갱신.
 * 선택과목 문항은 그 응시의 선택과목(mockElectiveName) 정답으로 채점.
 * 변경된 응시 기록 수를 반환.
 */
export async function regradeKoreanMockAttempts(mock: KoreanMock): Promise<number> {
  const attempts = await listKoreanMockAttempts(mock.id)
  const commonMap = new Map(mock.questions.map((q) => [q.number, q.answer]))
  const electiveMaps = new Map<string, Map<number, number>>()
  for (const el of mock.electives ?? []) {
    electiveMaps.set(el.name, new Map(el.questions.map((q) => [q.number, q.answer])))
  }

  const pending: {
    id: string
    results: KoreanMockResult[]
    correct: number
  }[] = []
  for (const a of attempts) {
    if (!a.koreanMockResults) continue
    const elMap = a.mockElectiveName ? electiveMaps.get(a.mockElectiveName) : undefined
    let changed = false
    const newResults = a.koreanMockResults.map((r) => {
      // 공통 문항은 공통 정답, 선택 문항은 그 선택과목 정답. 못 찾으면 기존 유지.
      const newAnswer = commonMap.get(r.number) ?? elMap?.get(r.number) ?? r.correctAnswer
      const correct = r.userAnswer > 0 && r.userAnswer === newAnswer
      if (newAnswer !== r.correctAnswer || correct !== r.correct) changed = true
      return { ...r, correctAnswer: newAnswer, correct }
    })
    const correct = newResults.filter((r) => r.correct).length
    if (changed || correct !== a.correct) {
      pending.push({ id: a.id, results: newResults, correct })
    }
  }

  // Firestore 배치 한도(500) 대비 청크로 커밋.
  for (let i = 0; i < pending.length; i += 400) {
    const batch = writeBatch(db)
    for (const p of pending.slice(i, i + 400)) {
      batch.update(doc(db, 'attempts', p.id), {
        koreanMockResults: p.results,
        correct: p.correct,
        total: p.results.length,
      })
    }
    await batch.commit()
  }
  return pending.length
}

/** 응시 기록의 학생 답안을 수정하고 정답/점수 재계산. */
export async function updateKoreanMockAttemptAnswers(
  attemptId: string,
  results: KoreanMockResult[],
): Promise<void> {
  const correct = results.filter((r) => r.correct).length
  await updateDoc(doc(db, 'attempts', attemptId), {
    koreanMockResults: results,
    correct,
    total: results.length,
  })
}

/* ========== End KoreanMock CRUD ========== */

export async function createReadingAttempt(input: {
  studentUid: string
  studentName: string
  refId: string
  refTitle: string
  readingResults: ReadingResult[]
}): Promise<string> {
  const total = input.readingResults.length
  const correct = input.readingResults.filter((r) => r.correct).length
  const ref = await addDoc(collection(db, 'attempts'), {
    studentUid: input.studentUid,
    studentName: input.studentName,
    type: 'reading',
    refId: input.refId,
    refTitle: input.refTitle,
    total,
    correct,
    readingResults: input.readingResults,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function getAttempt(id: string): Promise<Attempt | null> {
  const snap = await getDoc(doc(db, 'attempts', id))
  if (!snap.exists()) return null
  return { id: snap.id, ...(snap.data() as Omit<Attempt, 'id'>) }
}

export async function deleteAttempt(id: string): Promise<void> {
  await deleteDoc(doc(db, 'attempts', id))
}

export async function updateVocabResults(
  id: string,
  vocabResults: VocabResult[],
): Promise<void> {
  const correct = vocabResults.filter((r) => r.correct).length
  await updateDoc(doc(db, 'attempts', id), {
    vocabResults,
    correct,
    total: vocabResults.length,
  })
}

export async function listAttemptsForUser(uid: string): Promise<Attempt[]> {
  const snap = await getDocs(
    query(
      collection(db, 'attempts'),
      where('studentUid', '==', uid),
      orderBy('createdAt', 'desc'),
    ),
  )
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Attempt, 'id'>) }))
}

export async function createAssignment(input: {
  studentUid: string
  studentName: string
  assignedBy: string
  assignedByName: string
  type: AssignmentType
  category?: AssignmentCategory
  refId: string
  refTitle: string
  note?: string
  minCorrect?: number
  startAt?: Date | null
  dueAt?: Date | null
}): Promise<string> {
  const payload: Record<string, unknown> = {
    studentUid: input.studentUid,
    studentName: input.studentName,
    assignedBy: input.assignedBy,
    assignedByName: input.assignedByName,
    type: input.type,
    refId: input.refId,
    refTitle: input.refTitle,
    createdAt: serverTimestamp(),
    startAt: input.startAt ? Timestamp.fromDate(input.startAt) : null,
    dueAt: input.dueAt ? Timestamp.fromDate(input.dueAt) : null,
  }
  if (input.category) payload.category = input.category
  if (input.note && input.note.trim()) payload.note = input.note.trim()
  if (input.minCorrect && input.minCorrect > 0) {
    payload.minCorrect = Math.trunc(input.minCorrect)
  }
  const ref = await addDoc(collection(db, 'assignments'), payload)
  return ref.id
}

export function isAssignmentDone(asn: Assignment, atts: Attempt[]): boolean {
  const override = assignmentManualOverride(asn)
  if (override === 'done') return true
  if (override === 'undone') return false
  const matched = atts.filter(
    (a) => a.type === asn.type && a.refId === asn.refId && !a.practice,
  )
  if (matched.length === 0) return false
  if (asn.type === 'reading') {
    // 지문 문제풀이는 만점이거나 오답을 모두 재도전으로 맞혀야 완료.
    return matched.some((a) => isReadingAttemptComplete(a))
  }
  if (asn.minCorrect && asn.minCorrect > 0) {
    return matched.some((a) => (a.correct ?? 0) >= (asn.minCorrect ?? 0))
  }
  return true
}

export async function setAssignmentManualDone(
  id: string,
  value: boolean,
): Promise<void> {
  await updateDoc(doc(db, 'assignments', id), { manualDone: value })
}

/**
 * 관리자 수동 완료 오버라이드 설정.
 * 'done'/'undone' 강제, null이면 오버라이드 제거하고 자동(응시 기록) 판정으로 복귀.
 */
export async function setAssignmentManualStatus(
  id: string,
  status: 'done' | 'undone' | null,
): Promise<void> {
  await updateDoc(doc(db, 'assignments', id), {
    manualStatus: status ?? deleteField(),
    // legacy 필드 제거 — manualStatus로 일원화
    manualDone: deleteField(),
  })
}

/**
 * 부여한 과제의 메타데이터 부분 수정. 전달된 필드만 변경.
 * dueAt: Date면 그 날짜로, null이면 삭제, undefined면 미변경.
 * minCorrect: number면 그 값으로, null이면 삭제, undefined면 미변경.
 * note/category/refTitle: 빈 문자열도 허용 (note만 빈 문자열이면 삭제).
 */
export async function updateAssignment(
  id: string,
  input: {
    startAt?: Date | null
    dueAt?: Date | null
    note?: string
    minCorrect?: number | null
    category?: AssignmentCategory
    refTitle?: string
  },
): Promise<void> {
  const update: Record<string, unknown> = {}
  if (input.startAt !== undefined) {
    update.startAt = input.startAt ? Timestamp.fromDate(input.startAt) : null
  }
  if (input.dueAt !== undefined) {
    update.dueAt = input.dueAt ? Timestamp.fromDate(input.dueAt) : null
  }
  if (input.note !== undefined) {
    const trimmed = input.note.trim()
    update.note = trimmed ? trimmed : deleteField()
  }
  if (input.minCorrect !== undefined) {
    update.minCorrect =
      input.minCorrect && input.minCorrect > 0
        ? Math.trunc(input.minCorrect)
        : deleteField()
  }
  if (input.category !== undefined) update.category = input.category
  if (input.refTitle !== undefined) {
    const trimmed = input.refTitle.trim()
    if (trimmed) update.refTitle = trimmed
  }
  if (Object.keys(update).length === 0) return
  await updateDoc(doc(db, 'assignments', id), update)
}

export async function markAttemptWrongReviewed(
  id: string,
  value: boolean,
): Promise<void> {
  await updateDoc(doc(db, 'attempts', id), {
    wrongReviewedAt: value ? serverTimestamp() : null,
  })
}

/**
 * 여러 계정에 중복으로 붙어 있는 푸시 토큰을 전부 떼어낸다. 관리자 전용.
 *
 * 기기 하나의 토큰이 여러 users 문서에 남아 있으면, A 에게 보낸 푸시가
 * 그 기기를 지금 쓰는 B 에게도 간다. 어느 쪽이 진짜 주인인지 서버에서는
 * 알 수 없으므로 중복된 토큰은 양쪽 모두에서 지운다. 해당 기기가 앱을
 * 한 번 열면 지금 로그인한 계정으로 다시 등록된다.
 *
 * @returns 정리한 토큰 수와 영향받은 계정 수
 */
export async function cleanupDuplicatePushTokens(): Promise<{
  tokens: number
  accounts: number
}> {
  const snap = await getDocs(collection(db, 'users'))
  const owners = new Map<string, string[]>()
  for (const d of snap.docs) {
    const arr = (d.data() as { fcmTokens?: unknown }).fcmTokens
    if (!Array.isArray(arr)) continue
    for (const t of arr) {
      if (typeof t !== 'string' || !t) continue
      const list = owners.get(t) ?? []
      list.push(d.id)
      owners.set(t, list)
    }
  }
  // 두 계정 이상이 들고 있는 토큰만 대상
  const dupes = [...owners.entries()].filter(([, uids]) => uids.length > 1)
  if (dupes.length === 0) return { tokens: 0, accounts: 0 }

  const removeByUid = new Map<string, string[]>()
  for (const [token, uids] of dupes) {
    for (const uid of uids) {
      const list = removeByUid.get(uid) ?? []
      list.push(token)
      removeByUid.set(uid, list)
    }
  }
  const batch = writeBatch(db)
  for (const [uid, tokens] of removeByUid) {
    batch.update(doc(db, 'users', uid), { fcmTokens: arrayRemove(...tokens) })
  }
  await batch.commit()
  return { tokens: dupes.length, accounts: removeByUid.size }
}

/** 모든 vocabSets + vocabSeries의 maxAttempts 필드를 일괄 삭제. 관리자 전용. */
export async function clearAllVocabAttemptLimits(): Promise<{
  vocabSets: number
  vocabSeries: number
}> {
  const [setsSnap, seriesSnap] = await Promise.all([
    getDocs(collection(db, 'vocabSets')),
    getDocs(collection(db, 'vocabSeries')),
  ])
  const batch = writeBatch(db)
  let vocabSets = 0
  let vocabSeries = 0
  setsSnap.forEach((d) => {
    if (d.data().maxAttempts !== undefined) {
      batch.update(d.ref, { maxAttempts: deleteField() })
      vocabSets++
    }
  })
  seriesSnap.forEach((d) => {
    if (d.data().maxAttempts !== undefined) {
      batch.update(d.ref, { maxAttempts: deleteField() })
      vocabSeries++
    }
  })
  if (vocabSets + vocabSeries > 0) await batch.commit()
  return { vocabSets, vocabSeries }
}

/**
 * 지문 문제풀이의 오답 재시도 결과를 저장.
 * - 모든 오답에 대해 재시도가 완료되면 wrongReviewedAt도 함께 설정.
 */
export async function submitReadingRetry(
  attemptId: string,
  questionIndex: number,
  answer: number,
  allWrongRetried: boolean,
): Promise<void> {
  const update: Record<string, unknown> = {
    [`retryAnswers.${questionIndex}`]: answer,
  }
  if (allWrongRetried) {
    update.wrongReviewedAt = serverTimestamp()
  }
  await updateDoc(doc(db, 'attempts', attemptId), update)
}

export async function setAttemptPractice(
  id: string,
  value: boolean,
): Promise<void> {
  await updateDoc(doc(db, 'attempts', id), { practice: value })
}

export async function listAssignmentsForStudent(uid: string): Promise<Assignment[]> {
  const snap = await getDocs(
    query(collection(db, 'assignments'), where('studentUid', '==', uid)),
  )
  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Assignment, 'id'>) }))
  return items.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
}

/** 모든 과제. 학생 관리 대시보드용 — studentUid 별로 클라이언트에서 그룹핑. */
export async function listAllAssignments(): Promise<Assignment[]> {
  const snap = await getDocs(collection(db, 'assignments'))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Assignment, 'id'>) }))
}

/** 모든 응시 기록. 학생 관리 대시보드용. */
export async function listAllAttempts(): Promise<Attempt[]> {
  const snap = await getDocs(collection(db, 'attempts'))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Attempt, 'id'>) }))
}

export async function deleteAssignment(id: string): Promise<void> {
  await deleteDoc(doc(db, 'assignments', id))
}

// ───── 학생 개인 할 일 (기타 카테고리) ─────
export async function listTodosForStudent(uid: string): Promise<PersonalTodo[]> {
  const snap = await getDocs(
    query(collection(db, 'todos'), where('studentUid', '==', uid)),
  )
  const items = snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<PersonalTodo, 'id'>) }),
  )
  return items.sort(
    (a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0),
  )
}

export async function addTodo(input: {
  studentUid: string
  text: string
}): Promise<string> {
  const ref = await addDoc(collection(db, 'todos'), {
    studentUid: input.studentUid,
    text: input.text.trim(),
    done: false,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function setTodoDone(id: string, value: boolean): Promise<void> {
  await updateDoc(doc(db, 'todos', id), { done: value })
}

export async function deleteTodo(id: string): Promise<void> {
  await deleteDoc(doc(db, 'todos', id))
}

// ───── 공지사항 ─────
export async function listAnnouncements(): Promise<Announcement[]> {
  const snap = await getDocs(
    query(collection(db, 'announcements'), orderBy('createdAt', 'desc')),
  )
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Announcement, 'id'>),
  }))
}

export async function createAnnouncement(input: {
  title: string
  body: string
  pinned?: boolean
  createdBy: string
  createdByName: string
}): Promise<string> {
  const payload: Record<string, unknown> = {
    title: input.title.trim(),
    body: input.body.trim(),
    pinned: !!input.pinned,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  const ref = await addDoc(collection(db, 'announcements'), payload)
  return ref.id
}

export async function updateAnnouncement(
  id: string,
  patch: { title?: string; body?: string; pinned?: boolean },
): Promise<void> {
  const update: Record<string, unknown> = { updatedAt: serverTimestamp() }
  if (patch.title !== undefined) update.title = patch.title.trim()
  if (patch.body !== undefined) update.body = patch.body.trim()
  if (patch.pinned !== undefined) update.pinned = patch.pinned
  await updateDoc(doc(db, 'announcements', id), update)
}

export async function deleteAnnouncement(id: string): Promise<void> {
  // 이 공지로부터 생성된 학생 알림함 항목들도 함께 정리
  try {
    const snap = await getDocs(
      query(
        collection(db, 'notifications'),
        where('announcementId', '==', id),
      ),
    )
    for (const d of snap.docs) {
      await deleteDoc(d.ref)
    }
  } catch (e) {
    console.warn('[deleteAnnouncement] 연결된 알림 정리 실패:', e)
  }
  await deleteDoc(doc(db, 'announcements', id))
}

// ───── 정기 푸시 스케줄 ─────
export async function listPushSchedules(): Promise<PushSchedule[]> {
  const snap = await getDocs(collection(db, 'pushSchedules'))
  const items = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<PushSchedule, 'id'>),
  }))
  return items.sort(
    (a, b) =>
      (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0),
  )
}

export async function createPushSchedule(input: {
  title: string
  body: string
  enabled: boolean
  cadence: 'daily' | 'weekly'
  dayOfWeek?: number
  hour: number
  minute: number
}): Promise<string> {
  const payload: Record<string, unknown> = {
    title: input.title.trim(),
    body: input.body.trim(),
    enabled: !!input.enabled,
    cadence: input.cadence,
    hour: input.hour,
    minute: input.minute,
    audience: 'students',
    createdAt: serverTimestamp(),
  }
  if (input.cadence === 'weekly') {
    payload.dayOfWeek = input.dayOfWeek ?? 1
  }
  const ref = await addDoc(collection(db, 'pushSchedules'), payload)
  return ref.id
}

export async function updatePushSchedule(
  id: string,
  patch: Partial<Omit<PushSchedule, 'id' | 'createdAt' | 'audience' | 'lastSentKey'>>,
): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = patch.title.trim()
  if (patch.body !== undefined) update.body = patch.body.trim()
  if (patch.enabled !== undefined) update.enabled = !!patch.enabled
  if (patch.cadence !== undefined) update.cadence = patch.cadence
  if (patch.dayOfWeek !== undefined) update.dayOfWeek = patch.dayOfWeek
  if (patch.hour !== undefined) update.hour = patch.hour
  if (patch.minute !== undefined) update.minute = patch.minute
  await updateDoc(doc(db, 'pushSchedules', id), update)
}

export async function deletePushSchedule(id: string): Promise<void> {
  await deleteDoc(doc(db, 'pushSchedules', id))
}

// ───── 알림함 ─────
export async function listNotificationsForUser(
  uid: string,
): Promise<UserNotification[]> {
  // orderBy 빼고 클라에서 정렬 — composite index 불필요
  const snap = await getDocs(
    query(collection(db, 'notifications'), where('recipientUid', '==', uid)),
  )
  const items = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<UserNotification, 'id'>),
  }))
  return items.sort(
    (a, b) =>
      (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
  )
}

export async function unreadNotificationCount(uid: string): Promise<number> {
  const snap = await getDocs(
    query(
      collection(db, 'notifications'),
      where('recipientUid', '==', uid),
      where('readAt', '==', null),
    ),
  )
  return snap.size
}

export async function createUserNotification(input: {
  recipientUid: string
  title: string
  body: string
  kind?: NotificationKind
  link?: string
  announcementId?: string
}): Promise<string> {
  const payload: Record<string, unknown> = {
    recipientUid: input.recipientUid,
    title: input.title,
    body: input.body,
    kind: input.kind ?? 'system',
    readAt: null,
    createdAt: serverTimestamp(),
  }
  if (input.link) payload.link = input.link
  if (input.announcementId) payload.announcementId = input.announcementId
  const ref = await addDoc(collection(db, 'notifications'), payload)
  return ref.id
}

export async function markNotificationRead(id: string): Promise<void> {
  await updateDoc(doc(db, 'notifications', id), { readAt: serverTimestamp() })
}

export async function markAllNotificationsRead(uid: string): Promise<void> {
  const snap = await getDocs(
    query(
      collection(db, 'notifications'),
      where('recipientUid', '==', uid),
      where('readAt', '==', null),
    ),
  )
  const now = serverTimestamp()
  for (const d of snap.docs) {
    await updateDoc(d.ref, { readAt: now })
  }
}

export async function deleteNotification(id: string): Promise<void> {
  await deleteDoc(doc(db, 'notifications', id))
}

export async function deleteAllNotificationsForUser(
  uid: string,
): Promise<number> {
  const snap = await getDocs(
    query(collection(db, 'notifications'), where('recipientUid', '==', uid)),
  )
  for (const d of snap.docs) {
    await deleteDoc(d.ref)
  }
  return snap.size
}

export function formatDate(ts: Timestamp | null | undefined): string {
  if (!ts) return ''
  const d = ts.toDate()
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

// ───── 과제 카테고리 (관리자 편집 가능) ─────

export async function listCategories(): Promise<CategoryConfig[]> {
  const snap = await getDocs(collection(db, 'categories'))
  const items = snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<CategoryConfig, 'id'>) }),
  )
  return items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

/** categories 컬렉션이 비어있으면 디폴트 4종을 시드. 이미 있으면 no-op. 시드된 목록 반환. */
export async function ensureDefaultCategories(): Promise<CategoryConfig[]> {
  const existing = await listCategories()
  if (existing.length > 0) return existing
  const created: CategoryConfig[] = []
  for (const c of DEFAULT_CATEGORIES) {
    const ref = await addDoc(collection(db, 'categories'), c)
    created.push({ id: ref.id, ...c })
  }
  return created
}

export async function createCategory(input: {
  key: string
  label: string
  color: string
  order: number
}): Promise<string> {
  const ref = await addDoc(collection(db, 'categories'), {
    key: input.key,
    label: input.label,
    color: input.color,
    order: input.order,
  })
  return ref.id
}

export async function updateCategory(
  id: string,
  patch: Partial<Pick<CategoryConfig, 'key' | 'label' | 'color' | 'order'>>,
): Promise<void> {
  await updateDoc(doc(db, 'categories', id), patch)
}

export async function deleteCategory(id: string): Promise<void> {
  await deleteDoc(doc(db, 'categories', id))
}

// ───── 학생별 수업 일정 (관리형 캘린더) ─────

export async function listClassSessionsForStudent(
  studentUid: string,
): Promise<ClassSession[]> {
  const snap = await getDocs(
    query(
      collection(db, 'classSessions'),
      where('studentUid', '==', studentUid),
      orderBy('dateISO', 'asc'),
    ),
  )
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClassSession, 'id'>) }))
}

export async function listAllClassSessions(): Promise<ClassSession[]> {
  const snap = await getDocs(
    query(collection(db, 'classSessions'), orderBy('dateISO', 'asc')),
  )
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ClassSession, 'id'>) }))
}

export async function createClassSession(input: {
  studentUid: string
  title: string
  dateISO: string
  startTime: string
  endTime: string
  location: string
  cost: number
  status: ClassSessionStatus
  paid?: boolean
  note?: string
}): Promise<string> {
  const payload: Record<string, unknown> = {
    studentUid: input.studentUid,
    title: input.title,
    dateISO: input.dateISO,
    startTime: input.startTime,
    endTime: input.endTime,
    location: input.location,
    cost: input.cost,
    status: input.status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  if (input.paid) payload.paid = true
  if (input.note && input.note.trim()) payload.note = input.note.trim()
  const ref = await addDoc(collection(db, 'classSessions'), payload)
  return ref.id
}

/** 여러 수업을 한 번의 배치로 생성 (반복 수업 자동 추가용). 생성 개수 반환. */
export async function createClassSessionsBatch(
  inputs: Array<{
    studentUid: string
    title: string
    dateISO: string
    startTime: string
    endTime: string
    location: string
    cost: number
    status: ClassSessionStatus
    paid?: boolean
    note?: string
  }>,
): Promise<number> {
  if (inputs.length === 0) return 0
  const batch = writeBatch(db)
  for (const input of inputs) {
    const ref = doc(collection(db, 'classSessions'))
    const payload: Record<string, unknown> = {
      studentUid: input.studentUid,
      title: input.title,
      dateISO: input.dateISO,
      startTime: input.startTime,
      endTime: input.endTime,
      location: input.location,
      cost: input.cost,
      status: input.status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    if (input.paid) payload.paid = true
    if (input.note && input.note.trim()) payload.note = input.note.trim()
    batch.set(ref, payload)
  }
  await batch.commit()
  return inputs.length
}

export async function updateClassSession(
  id: string,
  patch: Partial<
    Pick<
      ClassSession,
      | 'title'
      | 'dateISO'
      | 'startTime'
      | 'endTime'
      | 'location'
      | 'cost'
      | 'status'
      | 'paid'
      | 'attendance'
      | 'lessonContent'
      | 'feedback'
      | 'note'
    >
  >,
): Promise<void> {
  const update: Record<string, unknown> = { updatedAt: serverTimestamp() }
  // 빈 문자열이면 필드를 지운다(수업 일지/메모 등 텍스트 필드).
  const clearable = new Set(['note', 'lessonContent', 'feedback'])
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    if (clearable.has(k) && typeof v === 'string' && v.trim() === '') {
      update[k] = deleteField()
      continue
    }
    update[k] = v
  }
  await updateDoc(doc(db, 'classSessions', id), update)
}

export async function deleteClassSession(id: string): Promise<void> {
  await deleteDoc(doc(db, 'classSessions', id))
}

// ───── 선불 결제 (정산) ─────
export async function createPayment(input: {
  studentUid: string
  studentName: string
  amount: number
  dateISO: string
  note?: string
  createdBy: string
  createdByName: string
}): Promise<string> {
  const payload: Record<string, unknown> = {
    studentUid: input.studentUid,
    studentName: input.studentName,
    amount: Math.round(input.amount),
    dateISO: input.dateISO,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: serverTimestamp(),
  }
  if (input.note && input.note.trim()) payload.note = input.note.trim()
  const ref = await addDoc(collection(db, 'payments'), payload)
  return ref.id
}

export async function listAllPayments(): Promise<Payment[]> {
  const snap = await getDocs(
    query(collection(db, 'payments'), orderBy('dateISO', 'desc')),
  )
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Payment, 'id'>) }))
}

export async function listPaymentsForStudent(
  studentUid: string,
): Promise<Payment[]> {
  // orderBy 를 붙이면 (studentUid + dateISO) 복합 인덱스가 필요해 쿼리가 실패한다.
  // 잔액 계산은 결제 순서와 무관하므로 equality 필터만 사용(인덱스 불필요).
  const snap = await getDocs(
    query(collection(db, 'payments'), where('studentUid', '==', studentUid)),
  )
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Payment, 'id'>) }))
}

export async function deletePayment(id: string): Promise<void> {
  await deleteDoc(doc(db, 'payments', id))
}
