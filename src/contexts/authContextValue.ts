import { createContext } from 'react'
import type { UserAccount } from '../lib/types'

export interface SignUpInput {
  email: string
  password: string
  displayName: string
  school?: string
  phone?: string
  parentPhone?: string
}

export interface AuthContextValue {
  profile: UserAccount | null
  loading: boolean
  signUp: (input: SignUpInput) => Promise<void>
  signIn: (email: string, password: string, keepSignedIn?: boolean) => Promise<void>
  logOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
