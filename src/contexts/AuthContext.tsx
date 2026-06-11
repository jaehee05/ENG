import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AuthContext } from './authContextValue'
import {
  getAccount,
  signInAccount,
  signUpAccount,
} from '../lib/account'
import type { UserAccount } from '../lib/types'

const STORAGE_KEY = 'eng_account_id'

function stripPassword(a: UserAccount): UserAccount {
  const { password: _omit, ...rest } = a
  void _omit
  return rest
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserAccount | null>(null)
  const [loading, setLoading] = useState<boolean>(
    () => typeof window !== 'undefined' && !!localStorage.getItem(STORAGE_KEY),
  )

  useEffect(() => {
    const id = localStorage.getItem(STORAGE_KEY)
    if (!id) return
    let cancelled = false
    getAccount(id)
      .then((acc) => {
        if (cancelled) return
        if (acc) setProfile(stripPassword(acc))
        else localStorage.removeItem(STORAGE_KEY)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function persist(acc: UserAccount | null) {
    if (acc) {
      localStorage.setItem(STORAGE_KEY, acc.id)
      setProfile(stripPassword(acc))
    } else {
      localStorage.removeItem(STORAGE_KEY)
      setProfile(null)
    }
  }

  async function signUp(email: string, password: string, displayName: string) {
    const acc = await signUpAccount({ email, password, displayName })
    persist(acc)
  }

  async function signIn(email: string, password: string) {
    const acc = await signInAccount(email, password)
    persist(acc)
  }

  async function logOut() {
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
