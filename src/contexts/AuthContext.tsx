import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AuthContext, type SignUpInput } from './authContextValue'
import { fetchMe, signInAccount, signOutSession, signUpAccount } from '../lib/account'
import { clearToken, getToken, setToken } from '../lib/authApi'
import { bootstrapAdmin, setAdminSecret } from '../lib/ppurioApi'
import type { UserAccount } from '../lib/types'

/**
 * 세션은 서버가 발급한 토큰으로 잡는다.
 *
 * 예전에는 계정 id 를 저장해 두고 그 id 로 users 를 바로 읽었다. users 가
 * 규칙으로 닫힌 지금은 그럴 수 없고, id 는 관리자 화면 URL 에도 드러나는
 * 값이라 그것만으로 사람을 믿을 수도 없다.
 */

async function tryBootstrapAdminSecret(acc: UserAccount) {
  if (acc.role !== 'admin' || acc.status !== 'active') return
  try {
    const { adminSecret } = await bootstrapAdmin()
    if (adminSecret) setAdminSecret(adminSecret)
  } catch {
    // 비치명적. AdminNotify 페이지에서 수동 입력 가능.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserAccount | null>(null)
  const [loading, setLoading] = useState<boolean>(
    () => typeof window !== 'undefined' && !!getToken(),
  )

  useEffect(() => {
    if (!getToken()) return
    let cancelled = false
    fetchMe()
      .then((acc) => {
        if (cancelled) return
        setProfile(acc)
        void tryBootstrapAdminSecret(acc)
        void import('../lib/pushSetup').then((m) => m.registerPushTokenForUser())
      })
      .catch(() => {
        // 토큰이 만료됐거나 계정이 없어졌다. 조용히 로그아웃 상태로 둔다.
        if (!cancelled) {
          clearToken()
          setProfile(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function persist(acc: UserAccount, token: string, keepSignedIn: boolean) {
    setToken(token, keepSignedIn)
    setProfile(acc)
    // 네이티브 앱이면 FCM 토큰 등록 (실패해도 로그인엔 영향 없음)
    void import('../lib/pushSetup').then((m) => m.registerPushTokenForUser())
  }

  async function signUp(input: SignUpInput) {
    const { token, account } = await signUpAccount(input)
    setToken(token, true)
    await tryBootstrapAdminSecret(account)
    persist(account, token, true)
  }

  async function signIn(email: string, password: string, keepSignedIn = true) {
    const { token, account } = await signInAccount(email, password)
    // 비밀키를 받아오려면 토큰이 먼저 자리를 잡아야 한다.
    setToken(token, keepSignedIn)
    await tryBootstrapAdminSecret(account)
    persist(account, token, keepSignedIn)
  }

  async function logOut() {
    // 이 기기 토큰을 계정에서 먼저 떼어낸다. 안 그러면 다음 사람이 이 기기를
    // 써도 이전 사용자의 푸시가 계속 이 기기로 온다. (세션을 끊기 전에 해야
    // 한다 — 토큰이 없으면 서버가 요청을 받아주지 않는다.)
    if (profile?.id) {
      await import('../lib/pushSetup')
        .then((m) => m.unregisterPushTokenForUser())
        .catch(() => {})
    }
    await signOutSession()
    setAdminSecret('')
    clearToken()
    setProfile(null)
  }

  const refreshProfile = useCallback(async () => {
    if (!profile) return
    try {
      setProfile(await fetchMe())
    } catch {
      clearToken()
      setProfile(null)
    }
  }, [profile])

  return (
    <AuthContext.Provider value={{ profile, loading, signUp, signIn, logOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}
