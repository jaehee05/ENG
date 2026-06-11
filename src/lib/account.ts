import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type QueryDocumentSnapshot,
  type DocumentSnapshot,
} from 'firebase/firestore'
import { db } from './firebase'
import type { UserAccount, UserStatus } from './types'

function fromSnap(snap: QueryDocumentSnapshot | DocumentSnapshot): UserAccount {
  const d = snap.data() ?? {}
  return {
    id: snap.id,
    email: d.email ?? '',
    password: d.password,
    displayName: d.displayName ?? '',
    role: d.role === 'admin' ? 'admin' : 'student',
    status: (d.status === 'active' || d.status === 'rejected') ? d.status : 'pending',
    school: d.school,
    phone: d.phone,
    parentPhone: d.parentPhone,
    createdAt: (d.createdAt as Timestamp | undefined) ?? null,
  }
}

export async function getAccount(id: string): Promise<UserAccount | null> {
  const snap = await getDoc(doc(db, 'users', id))
  if (!snap.exists()) return null
  return fromSnap(snap)
}

export async function signUpAccount(input: {
  email: string
  password: string
  displayName: string
  school?: string
  phone?: string
  parentPhone?: string
}): Promise<UserAccount> {
  const email = input.email.trim().toLowerCase()
  const dup = await getDocs(
    query(collection(db, 'users'), where('email', '==', email), limit(1)),
  )
  if (!dup.empty) throw new Error('이미 가입된 이메일입니다.')

  const any = await getDocs(query(collection(db, 'users'), limit(1)))
  const isFirst = any.empty

  const role: 'admin' | 'student' = isFirst ? 'admin' : 'student'
  const status: UserStatus = isFirst ? 'active' : 'pending'

  const displayName = input.displayName.trim()
  const school = (input.school ?? '').trim()
  const phone = (input.phone ?? '').trim()
  const parentPhone = (input.parentPhone ?? '').trim()

  const ref = await addDoc(collection(db, 'users'), {
    email,
    password: input.password,
    displayName,
    role,
    status,
    school,
    phone,
    parentPhone,
    createdAt: serverTimestamp(),
  })
  return {
    id: ref.id,
    email,
    password: input.password,
    displayName,
    role,
    status,
    school,
    phone,
    parentPhone,
    createdAt: null,
  }
}

export async function signInAccount(email: string, password: string): Promise<UserAccount> {
  const e = email.trim().toLowerCase()
  const snap = await getDocs(
    query(collection(db, 'users'), where('email', '==', e), limit(1)),
  )
  if (snap.empty) throw new Error('이메일 또는 비밀번호가 일치하지 않습니다.')
  const acc = fromSnap(snap.docs[0])
  if (acc.password !== password) {
    throw new Error('이메일 또는 비밀번호가 일치하지 않습니다.')
  }
  return acc
}

export async function listAccounts(): Promise<UserAccount[]> {
  const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')))
  return snap.docs.map(fromSnap)
}

export async function setAccountStatus(id: string, status: UserStatus): Promise<void> {
  await updateDoc(doc(db, 'users', id), { status })
}

export async function setAccountPassword(id: string, password: string): Promise<void> {
  await updateDoc(doc(db, 'users', id), { password })
}

export async function deleteAccount(id: string): Promise<void> {
  await deleteDoc(doc(db, 'users', id))
}
