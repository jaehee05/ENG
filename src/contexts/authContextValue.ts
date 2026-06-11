import { createContext } from 'react'
import type { UserAccount } from '../lib/types'

export interface AuthContextValue {
  profile: UserAccount | null
  loading: boolean
  signUp: (email: string, password: string, displayName: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  logOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
