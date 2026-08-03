/**
 * 계정 관련 동작.
 *
 * 예전에는 여기서 Firestore 의 users 를 직접 읽고 썼다. 지금은 보안 규칙으로
 * 닫혀 있어 전부 Cloud Functions 의 authApi 를 거친다 (functions/auth.js).
 * 화면이 부르던 이름과 인자는 그대로 두어 페이지들은 손대지 않았다.
 *
 * 다듬기(이메일 소문자화, 전화번호 형식, 학교 이름 정규화)는 여전히 여기서
 * 한다 — 화면에서 보이는 값과 저장되는 값을 같게 두려는 것이고, 서버도 받은
 * 값을 그대로 믿지 않고 자기 검사를 한 번 더 한다.
 */

import { callAuth, callAuthed, toAccount, type WireAccount } from './authApi'
import { formatPhoneKR } from './phone'
import { normalizeSchool } from './school'
import type { MockSubject, UserAccount, UserStatus } from './types'

export function validatePassword(pw: string): void {
  if (!pw || pw.length < 4) {
    throw new Error('비밀번호는 4자 이상이어야 합니다.')
  }
  if (/^\d+$/.test(pw)) {
    throw new Error('유추하기 쉬운 암호는 사용할 수 없습니다.')
  }
}

/** 로그인·가입 결과. 세션 토큰은 AuthContext 가 보관한다. */
export interface AuthResult {
  token: string
  account: UserAccount
}

export async function updateAccountColorKey(
  id: string,
  colorKey: string,
): Promise<void> {
  await callAuthed('setColorKey', { id, colorKey })
}

export async function updateAccountSubjects(
  id: string,
  subjects: MockSubject[],
): Promise<void> {
  await callAuthed('setSubjects', { id, subjects })
}

export interface AccountProfilePatch {
  displayName: string
  email: string
  school?: string
  phone?: string
  parentPhone?: string
}

/**
 * 학생의 기본 정보를 고친다. 본인이거나 관리자만 된다(서버에서 확인).
 *
 * 회원가입과 같은 규칙으로 다듬어 보낸다 — 이메일은 소문자 trim, 전화는
 * formatPhoneKR. 화면마다 형식이 다르면 사전 등록 자동 연결(이름+전화 대조)이
 * 어긋나고, 같은 사람이 두 계정으로 갈린다.
 *
 * 이메일은 로그인 아이디라 다른 계정이 쓰고 있으면 서버가 막는다. 비밀번호·
 * 상태·역할은 여기서 안 건드린다 — 각각 따로 있다.
 */
export async function updateAccountProfile(
  id: string,
  patch: AccountProfilePatch,
): Promise<UserAccount> {
  const displayName = patch.displayName.trim()
  if (!displayName) throw new Error('이름을 입력하세요.')
  const email = patch.email.trim().toLowerCase()
  if (!email) throw new Error('이메일을 입력하세요.')

  const { account } = await callAuthed<{ account: WireAccount }>('updateProfile', {
    id,
    patch: {
      displayName,
      email,
      school: normalizeSchool(patch.school),
      phone: formatPhoneKR(patch.phone),
      parentPhone: formatPhoneKR(patch.parentPhone),
    },
  })
  return toAccount(account)
}

export async function getAccount(id: string): Promise<UserAccount | null> {
  const { account } = await callAuthed<{ account: WireAccount | null }>('getAccount', {
    id,
  })
  return account ? toAccount(account) : null
}

/** 세션 토큰만으로 내 계정을 받아온다. 앱을 다시 열었을 때 쓴다. */
export async function fetchMe(): Promise<UserAccount> {
  const { account } = await callAuthed<{ account: WireAccount }>('me')
  return toAccount(account)
}

export async function signUpAccount(input: {
  email: string
  password: string
  displayName: string
  school?: string
  phone?: string
  parentPhone?: string
}): Promise<AuthResult> {
  validatePassword(input.password)
  const r = await callAuth<{ token: string; account: WireAccount }>('signUp', {
    email: input.email.trim().toLowerCase(),
    password: input.password,
    displayName: input.displayName.trim(),
    school: normalizeSchool(input.school),
    phone: formatPhoneKR(input.phone),
    parentPhone: formatPhoneKR(input.parentPhone),
  })
  return { token: r.token, account: toAccount(r.account) }
}

/** 관리자가 학생 회원가입 전에 미리 계정을 만들어둔다. 학생이 같은 (이름, 전화)로 가입하면 자동 활성화. */
export async function createPreregisteredStudent(input: {
  displayName: string
  phone: string
  school?: string
  parentPhone?: string
  subjects?: MockSubject[]
}): Promise<UserAccount> {
  const displayName = input.displayName.trim()
  if (!displayName) throw new Error('이름을 입력하세요.')
  const phone = formatPhoneKR(input.phone)
  if (!phone) throw new Error('학생 전화번호를 입력하세요. (가입 시 매칭에 필요)')

  const { account } = await callAuthed<{ account: WireAccount }>('createPreregistered', {
    displayName,
    phone,
    school: normalizeSchool(input.school),
    parentPhone: formatPhoneKR(input.parentPhone),
    subjects: input.subjects ?? [],
  })
  return toAccount(account)
}

export async function signInAccount(
  email: string,
  password: string,
): Promise<AuthResult> {
  const r = await callAuth<{ token: string; account: WireAccount }>('signIn', {
    email: email.trim().toLowerCase(),
    password,
  })
  return { token: r.token, account: toAccount(r.account) }
}

export async function signOutSession(): Promise<void> {
  await callAuthed('signOut').catch(() => {
    // 이미 끊긴 세션이면 그만이다. 로그아웃을 막을 이유가 없다.
  })
}

export async function listAccounts(): Promise<UserAccount[]> {
  const { accounts } = await callAuthed<{ accounts: WireAccount[] }>('listAccounts')
  return accounts.map(toAccount)
}

export async function setAccountStatus(id: string, status: UserStatus): Promise<void> {
  await callAuthed('setStatus', { id, status })
}

/** 지문 문제풀이 접근 권한 설정. */
export async function setReadingAccess(id: string, allowed: boolean): Promise<void> {
  await callAuthed('setReadingAccess', { id, allowed })
}

export async function setAccountPassword(id: string, password: string): Promise<void> {
  validatePassword(password)
  await callAuthed('setPassword', { id, password })
}

export async function deleteAccount(id: string): Promise<void> {
  await callAuthed('deleteAccount', { id })
}

/**
 * 아직 평문으로 남아 있는 비밀번호를 한꺼번에 해시로 바꾼다 (관리자).
 * 여러 번 눌러도 안전하다 — 이미 해시인 것은 건너뛴다.
 */
export async function hashAllPasswords(): Promise<{
  total: number
  hashed: number
  already: number
  empty: number
}> {
  return callAuthed('hashAllPasswords')
}
