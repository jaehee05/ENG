/**
 * 계정 API 호출 + 세션 토큰 보관.
 *
 * users 컬렉션은 보안 규칙으로 닫혀 있어서 클라이언트가 직접 못 읽는다.
 * 계정에 관한 모든 일은 Cloud Functions 의 authApi 를 거친다 (functions/auth.js).
 */

import { Timestamp } from 'firebase/firestore'
import type { UserAccount } from './types'

const ENDPOINT_URL =
  'https://asia-northeast3-engh-c5082.cloudfunctions.net/authApi'

const TOKEN_KEY = 'eng_session_token'

/**
 * 토큰은 localStorage 나 sessionStorage 중 한 곳에만 둔다 — "로그인 유지" 를
 * 끄면 창을 닫을 때 같이 사라져야 한다.
 */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string, persistent: boolean): void {
  if (persistent) {
    localStorage.setItem(TOKEN_KEY, token)
    sessionStorage.removeItem(TOKEN_KEY)
  } else {
    sessionStorage.setItem(TOKEN_KEY, token)
    localStorage.removeItem(TOKEN_KEY)
  }
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
}

/** 세션이 끊겼을 때. 화면이 로그아웃 처리를 하도록 구분해서 던진다. */
export class SessionExpiredError extends Error {}

export async function callAuth<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  let res: Response
  try {
    res = await fetch(ENDPOINT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, payload }),
    })
  } catch {
    throw new Error('서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.')
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) {
    const msg = body.error || `요청 실패 (HTTP ${res.status})`
    if (res.status === 401) throw new SessionExpiredError(msg)
    throw new Error(msg)
  }
  return body as T
}

/** 토큰이 필요한 요청. 토큰이 없으면 서버까지 가지 않고 끊는다. */
export async function callAuthed<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const token = getToken()
  if (!token) throw new SessionExpiredError('로그인이 필요합니다.')
  return callAuth<T>(action, { ...payload, token })
}

/** 서버가 내려주는 계정 모양. createdAt 은 밀리초 숫자로 온다. */
export interface WireAccount extends Omit<UserAccount, 'createdAt'> {
  createdAt: number | null
}

/**
 * 화면이 쓰던 모양으로 되돌린다. createdAt 을 Timestamp 로 바꿔 두면 가입일
 * 표시 같은 기존 코드를 손대지 않아도 된다.
 */
export function toAccount(w: WireAccount): UserAccount {
  return {
    ...w,
    createdAt: w.createdAt == null ? null : Timestamp.fromMillis(w.createdAt),
  }
}
