import {
  addDoc,
  collection,
  deleteDoc,
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
} from 'firebase/firestore'
import { db } from './firebase'
import type {
  Assignment,
  AssignmentType,
  Attempt,
  Reading,
  ReadingResult,
  VocabResult,
  VocabSeries,
  VocabSet,
  WordEntry,
  ReadingQuestion,
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
  const ref = await addDoc(collection(db, 'vocabSets'), payload)
  return ref.id
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
  glossary: WordEntry[]
  choicesGlossary: WordEntry[]
  questions: ReadingQuestion[]
  createdBy: string
  createdByName: string
}): Promise<string> {
  const ref = await addDoc(collection(db, 'readings'), {
    ...input,
    createdAt: serverTimestamp(),
  })
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
  refId: string
  refTitle: string
  note?: string
  minCorrect?: number
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
    dueAt: input.dueAt ? Timestamp.fromDate(input.dueAt) : null,
  }
  if (input.note && input.note.trim()) payload.note = input.note.trim()
  if (input.minCorrect && input.minCorrect > 0) {
    payload.minCorrect = Math.trunc(input.minCorrect)
  }
  const ref = await addDoc(collection(db, 'assignments'), payload)
  return ref.id
}

export function isAssignmentDone(asn: Assignment, atts: Attempt[]): boolean {
  const matched = atts.filter(
    (a) => a.type === asn.type && a.refId === asn.refId && !a.practice,
  )
  if (matched.length === 0) return false
  if (asn.minCorrect && asn.minCorrect > 0) {
    return matched.some((a) => (a.correct ?? 0) >= (asn.minCorrect ?? 0))
  }
  return true
}

export async function listAssignmentsForStudent(uid: string): Promise<Assignment[]> {
  const snap = await getDocs(
    query(collection(db, 'assignments'), where('studentUid', '==', uid)),
  )
  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Assignment, 'id'>) }))
  return items.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
}

export async function deleteAssignment(id: string): Promise<void> {
  await deleteDoc(doc(db, 'assignments', id))
}

export function formatDate(ts: Timestamp | null | undefined): string {
  if (!ts) return ''
  const d = ts.toDate()
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}
