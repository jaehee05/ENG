import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
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
  if (input.maxAttempts && input.maxAttempts > 0) {
    payload.maxAttempts = Math.trunc(input.maxAttempts)
  }
  if (input.studentUid) {
    payload.studentUid = input.studentUid
    if (input.studentName) payload.studentName = input.studentName
  }
  const ref = await addDoc(collection(db, 'vocabSets'), payload)
  return ref.id
}

export async function listVocabSetsForStudent(
  studentUid: string,
): Promise<VocabSet[]> {
  const snap = await getDocs(
    query(
      collection(db, 'vocabSets'),
      where('studentUid', '==', studentUid),
      orderBy('createdAt', 'desc'),
    ),
  )
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VocabSet, 'id'>) }))
}

export async function deleteVocabSet(id: string): Promise<void> {
  await deleteDoc(doc(db, 'vocabSets', id))
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

export async function updateVocabSetOwner(
  id: string,
  studentUid: string,
  studentName: string,
): Promise<void> {
  await updateDoc(doc(db, 'vocabSets', id), {
    studentUid,
    studentName,
  })
}

export async function listVocabSeries(): Promise<VocabSeries[]> {
  const snap = await getDocs(
    query(collection(db, 'vocabSeries'), orderBy('createdAt', 'desc')),
  )
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VocabSeries, 'id'>) }))
}

export async function getVocabSeries(id: string): Promise<VocabSeries | null> {
  const snap = await getDoc(doc(db, 'vocabSeries', id))
  if (!snap.exists()) return null
  return { id: snap.id, ...(snap.data() as Omit<VocabSeries, 'id'>) }
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
  if (input.words && input.words.length > 0) {
    payload.words = input.words
  }
  const ref = await addDoc(collection(db, 'vocabSeries'), payload)
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
      'title' | 'maxAttempts' | 'words' | 'perDay' | 'usedCount' | 'lastDayNumber'
    >
  >,
): Promise<void> {
  const update: Record<string, unknown> = { updatedAt: serverTimestamp() }
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) update[k] = v
  }
  await updateDoc(doc(db, 'vocabSeries', id), update)
}

export async function deleteVocabSeries(id: string): Promise<void> {
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
  const ref = await addDoc(collection(db, 'attempts'), payload)
  return ref.id
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
