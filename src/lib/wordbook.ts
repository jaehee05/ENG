import {
  arrayUnion,
  collection,
  doc,
  getDocs,
  increment,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { db } from './firebase'
import type { WordLookup } from './types'

export function lookupDocId(en: string): string {
  return en.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '_').slice(0, 100) || '_'
}

export async function lookupWord(input: {
  uid: string
  en: string
  ko: string
  readingId?: string
  readingTitle?: string
}): Promise<void> {
  const ref = doc(db, 'users', input.uid, 'wordLookups', lookupDocId(input.en))
  const payload: Record<string, unknown> = {
    en: input.en,
    ko: input.ko,
    count: increment(1),
    lastSeenAt: serverTimestamp(),
  }
  if (input.readingId) {
    payload.readings = arrayUnion({
      id: input.readingId,
      title: input.readingTitle ?? '',
    })
  }
  await setDoc(ref, payload, { merge: true })
}

export async function listMyWordbook(uid: string): Promise<WordLookup[]> {
  const snap = await getDocs(
    query(collection(db, 'users', uid, 'wordLookups'), orderBy('lastSeenAt', 'desc')),
  )
  return snap.docs.map((d) => d.data() as WordLookup)
}

export async function listMyWordbookKeys(uid: string): Promise<Set<string>> {
  const snap = await getDocs(collection(db, 'users', uid, 'wordLookups'))
  const set = new Set<string>()
  for (const d of snap.docs) {
    const en = d.data().en as string | undefined
    if (en) set.add(en.toLowerCase())
  }
  return set
}
