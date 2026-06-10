import { createContext } from 'react'
import type { User } from 'firebase/auth'

export type UserRole = 'admin' | 'student'

export interface UserProfile {
  uid: string
  email: string
  displayName: string
  role: UserRole
  createdAt: unknown
}

export interface AuthContextValue {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signUp: (email: string, password: string, displayName: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  logOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
