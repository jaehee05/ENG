import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AuthContext, type SignUpInput } from './authContextValue'
import { fetchMe, signInAccount, signOutSession, signUpAccount } from '../lib/account'
import { clearToken, getToken, SessionExpiredError, setToken } from '../lib/authApi'
import { bootstrapAdmin, setAdminSecret } from '../lib/ppurioApi'
import type { UserAccount } from '../lib/types'

/**
 * 세션은 서버가 발급한 토큰으로 잡는다.
 *
 * 예전에는 계정 id 를 저장해 두고 그 id 로 users 를 바로 읽었다. users 가
 * 규칙으로 닫힌 지금은 그럴 수 없고, id 는 관리자 화면 URL 에도 드러나는
 * 값이라 그것만으로 사람을 믿을 수도 없다.
 */

/**
 * 부팅 때 내 계정 받아오기. 연결이 흔들리면 몇 번 더 두드린다.
 *
 * Capgo 가 새 번들을 받으면 그 자리에서 웹뷰를 다시 띄운다(directUpdate).
 * 그때 날아가던 요청은 끊기고, 새로 뜬 화면도 네트워크가 붙기 전에 먼저
 * 물어본다. 둘 다 "세션이 끝난 것"이 아니라 "지금 못 물어본 것"이다.
 *
 * 서버가 401 로 아니라고 한 것(SessionExpiredError)은 더 두드릴 이유가 없다.
 */
async function fetchMeResilient(): Promise<UserAccount> {
  const delays = [600, 1500]
  for (let i = 0; ; i++) {
    try {
      return await fetchMe()
    } catch (e) {
      if (e instanceof SessionExpiredError || i >= delays.length) throw e
      await new Promise((r) => setTimeout(r, delays[i]))
    }
  }
}

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
    fetchMeResilient()
      .then((acc) => {
        if (cancelled) return
        setProfile(acc)
        void tryBootstrapAdminSecret(acc)
        void import('../lib/pushSetup').then((m) => m.registerPushTokenForUser())
      })
      .catch((e) => {
        if (cancelled) return
        // 토큰을 버리는 건 서버가 아니라고 했을 때뿐이다. 연결이 안 된 것까지
        // 로그아웃으로 치면, 앱이 뜨는 순간 잠깐 끊긴 것만으로 로그인이
        // 풀려버린다 — Capgo 업데이트 직후가 딱 그런 순간이다.
        if (e instanceof SessionExpiredError) clearToken()
        setProfile(null)
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
    } catch (e) {
      // 여기서도 마찬가지 — 연결이 안 된 것뿐이면 보던 화면을 그대로 둔다.
      if (e instanceof SessionExpiredError) {
        clearToken()
        setProfile(null)
      }
    }
  }, [profile])

  return (
    <AuthContext.Provider value={{ profile, loading, signUp, signIn, logOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}
