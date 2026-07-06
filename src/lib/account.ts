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
import type { MockSubject, UserAccount, UserStatus } from './types'

export function validatePassword(pw: string): void {
  if (!pw || pw.length < 4) {
    throw new Error('비밀번호는 4자 이상이어야 합니다.')
  }
  if (/^\d+$/.test(pw)) {
    throw new Error('유추하기 쉬운 암호는 사용할 수 없습니다.')
  }
}

function fromSnap(snap: QueryDocumentSnapshot | DocumentSnapshot): UserAccount {
  const d = snap.data() ?? {}
  const rawSubjects = Array.isArray(d.subjects) ? d.subjects : undefined
  const subjects = rawSubjects
    ? (rawSubjects.filter(
        (x: unknown) => x === 'korean' || x === 'english',
      ) as MockSubject[])
    : undefined
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
    subjects,
    preregistered: d.preregistered === true ? true : undefined,
    createdAt: (d.createdAt as Timestamp | undefined) ?? null,
  }
}

export async function updateAccountSubjects(
  id: string,
  subjects: MockSubject[],
): Promise<void> {
  await updateDoc(doc(db, 'users', id), { subjects })
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
  validatePassword(input.password)
  const email = input.email.trim().toLowerCase()
  const dup = await getDocs(
    query(collection(db, 'users'), where('email', '==', email), limit(1)),
  )
  const displayName = input.displayName.trim()
  const school = (input.school ?? '').trim()
  const phone = (input.phone ?? '').trim()
  const parentPhone = (input.parentPhone ?? '').trim()

  if (!dup.empty) {
    const existing = fromSnap(dup.docs[0])
    if (existing.preregistered) {
      // 사전 등록된 학생 → 자동 활성화. 관리자가 미리 지정한 이름/학교/연락처/과목/과제 등은 그대로 유지하고,
      // 학생 입력값이 있으면 그것으로 덮어씀 (본인이 정정할 수 있게).
      const patch: Record<string, unknown> = {
        password: input.password,
        status: 'active',
        preregistered: false,
      }
      if (displayName) patch.displayName = displayName
      if (school) patch.school = school
      if (phone) patch.phone = phone
      if (parentPhone) patch.parentPhone = parentPhone
      await updateDoc(doc(db, 'users', existing.id), patch)
      return {
        ...existing,
        password: input.password,
        status: 'active',
        preregistered: undefined,
        displayName: displayName || existing.displayName,
        school: school || existing.school,
        phone: phone || existing.phone,
        parentPhone: parentPhone || existing.parentPhone,
      }
    }
    throw new Error('이미 가입된 이메일입니다.')
  }

  const any = await getDocs(query(collection(db, 'users'), limit(1)))
  const isFirst = any.empty

  const role: 'admin' | 'student' = isFirst ? 'admin' : 'student'
  const status: UserStatus = isFirst ? 'active' : 'pending'

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

/** 관리자가 학생 회원가입 전에 미리 계정을 만들어둔다. 학생이 같은 이메일로 signUp 하면 자동 활성화. */
export async function createPreregisteredStudent(input: {
  email: string
  displayName: string
  school?: string
  phone?: string
  parentPhone?: string
  subjects?: MockSubject[]
}): Promise<UserAccount> {
  const email = input.email.trim().toLowerCase()
  if (!email || !/.+@.+/.test(email)) {
    throw new Error('올바른 이메일을 입력하세요.')
  }
  const displayName = input.displayName.trim()
  if (!displayName) throw new Error('이름을 입력하세요.')

  const dup = await getDocs(
    query(collection(db, 'users'), where('email', '==', email), limit(1)),
  )
  if (!dup.empty) throw new Error('해당 이메일의 계정이 이미 존재합니다.')

  const payload: Record<string, unknown> = {
    email,
    displayName,
    role: 'student',
    status: 'pending',
    preregistered: true,
    createdAt: serverTimestamp(),
  }
  const school = (input.school ?? '').trim()
  const phone = (input.phone ?? '').trim()
  const parentPhone = (input.parentPhone ?? '').trim()
  if (school) payload.school = school
  if (phone) payload.phone = phone
  if (parentPhone) payload.parentPhone = parentPhone
  if (input.subjects && input.subjects.length > 0) payload.subjects = input.subjects

  const ref = await addDoc(collection(db, 'users'), payload)
  return {
    id: ref.id,
    email,
    displayName,
    role: 'student',
    status: 'pending',
    preregistered: true,
    school: school || undefined,
    phone: phone || undefined,
    parentPhone: parentPhone || undefined,
    subjects: input.subjects,
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
  validatePassword(password)
  await updateDoc(doc(db, 'users', id), { password })
}

export async function deleteAccount(id: string): Promise<void> {
  await deleteDoc(doc(db, 'users', id))
}
