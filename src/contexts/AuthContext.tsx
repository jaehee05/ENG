import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AuthContext, type SignUpInput } from './authContextValue'
import {
  getAccount,
  signInAccount,
  signUpAccount,
} from '../lib/account'
import { bootstrapAdmin, setAdminSecret } from '../lib/ppurioApi'
import type { UserAccount } from '../lib/types'

const STORAGE_KEY = 'eng_account_id'

function getStoredId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY)
}

function writeStoredId(id: string, persistent: boolean) {
  if (persistent) {
    localStorage.setItem(STORAGE_KEY, id)
    sessionStorage.removeItem(STORAGE_KEY)
  } else {
    sessionStorage.setItem(STORAGE_KEY, id)
    localStorage.removeItem(STORAGE_KEY)
  }
}

function clearStoredId() {
  localStorage.removeItem(STORAGE_KEY)
  sessionStorage.removeItem(STORAGE_KEY)
}

function stripPassword(a: UserAccount): UserAccount {
  const { password: _omit, ...rest } = a
  void _omit
  return rest
}

async function tryBootstrapAdminSecret(acc: UserAccount, password: string) {
  if (acc.role !== 'admin' || acc.status !== 'active') return
  try {
    const { adminSecret } = await bootstrapAdmin(acc.id, password)
    if (adminSecret) setAdminSecret(adminSecret)
  } catch {
    // 비치명적. AdminNotify 페이지에서 수동 입력 가능.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserAccount | null>(null)
  const [loading, setLoading] = useState<boolean>(
    () => typeof window !== 'undefined' && !!getStoredId(),
  )

  useEffect(() => {
    const id = getStoredId()
    if (!id) return
    let cancelled = false
    getAccount(id)
      .then((acc) => {
        if (cancelled) return
        if (acc) {
          setProfile(stripPassword(acc))
          // 로그인 유지(앱 재시작) 시 sessionStorage의 관리자 비밀키가 사라지므로,
          // 복원된 계정의 비밀번호로 관리자 비밀키를 자동 재발급한다.
          if (acc.password) void tryBootstrapAdminSecret(acc, acc.password)
          void import('../lib/pushSetup').then((m) =>
            m.registerPushTokenForUser(acc.id),
          )
        } else {
          clearStoredId()
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function persist(acc: UserAccount | null, keepSignedIn = true) {
    if (acc) {
      writeStoredId(acc.id, keepSignedIn)
      setProfile(stripPassword(acc))
      // 네이티브 앱이면 FCM 토큰 등록 (실패해도 로그인엔 영향 없음)
      void import('../lib/pushSetup').then((m) =>
        m.registerPushTokenForUser(acc.id),
      )
    } else {
      clearStoredId()
      setProfile(null)
    }
  }

  async function signUp(input: SignUpInput) {
    const acc = await signUpAccount(input)
    await tryBootstrapAdminSecret(acc, input.password)
    persist(acc, true)
  }

  async function signIn(email: string, password: string, keepSignedIn = true) {
    const acc = await signInAccount(email, password)
    await tryBootstrapAdminSecret(acc, password)
    persist(acc, keepSignedIn)
  }

  async function logOut() {
    // 이 기기 토큰을 계정에서 먼저 떼어낸다. 안 그러면 다음 사람이 이 기기를
    // 써도 이전 사용자의 푸시가 계속 이 기기로 온다.
    const leavingUid = profile?.id
    if (leavingUid) {
      await import('../lib/pushSetup')
        .then((m) => m.unregisterPushTokenForUser(leavingUid))
        .catch(() => {})
    }
    setAdminSecret('')
    persist(null)
  }

  const refreshProfile = useCallback(async () => {
    if (!profile) return
    const acc = await getAccount(profile.id)
    if (acc) setProfile(stripPassword(acc))
    else persist(null)
  }, [profile])

  return (
    <AuthContext.Provider value={{ profile, loading, signUp, signIn, logOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}
