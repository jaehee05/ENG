import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from './firebase'
import type {
  Attempt,
  Reading,
  ReadingResult,
  VocabResult,
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
  createdBy: string
  createdByName: string
}): Promise<string> {
  const ref = await addDoc(collection(db, 'vocabSets'), {
    ...input,
    createdAt: serverTimestamp(),
  })
  return ref.id
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
}): Promise<string> {
  const total = input.vocabResults.length
  const correct = input.vocabResults.filter((r) => r.correct).length
  const ref = await addDoc(collection(db, 'attempts'), {
    studentUid: input.studentUid,
    studentName: input.studentName,
    type: 'vocab',
    refId: input.refId,
    refTitle: input.refTitle,
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

export function formatDate(ts: Timestamp | null | undefined): string {
  if (!ts) return ''
  const d = ts.toDate()
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}
