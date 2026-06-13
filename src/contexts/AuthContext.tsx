import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AuthContext, type SignUpInput } from './authContextValue'
import {
  getAccount,
  signInAccount,
  signUpAccount,
} from '../lib/account'
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
        if (acc) setProfile(stripPassword(acc))
        else clearStoredId()
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
    } else {
      clearStoredId()
      setProfile(null)
    }
  }

  async function signUp(input: SignUpInput) {
    const acc = await signUpAccount(input)
    persist(acc, true)
  }

  async function signIn(email: string, password: string, keepSignedIn = true) {
    const acc = await signInAccount(email, password)
    persist(acc, keepSignedIn)
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
