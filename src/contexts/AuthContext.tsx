import { useEffect, useState, type ReactNode } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { AuthContext, type UserProfile, type UserRole } from './authContextValue'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        const snap = await getDoc(doc(db, 'users', u.uid))
        setProfile(snap.exists() ? (snap.data() as UserProfile) : null)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })
  }, [])

  async function signUp(email: string, password: string, displayName: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName })

    const role: UserRole = await runTransaction(db, async (tx) => {
      const metaRef = doc(db, 'meta', 'app')
      const metaSnap = await tx.get(metaRef)
      const initialized = metaSnap.exists() && metaSnap.data()?.initialized === true
      const assigned: UserRole = initialized ? 'student' : 'admin'

      tx.set(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        email,
        displayName,
        role: assigned,
        createdAt: serverTimestamp(),
      })
      if (!initialized) {
        tx.set(metaRef, { initialized: true, firstUserUid: cred.user.uid }, { merge: true })
      }
      return assigned
    })

    setProfile({
      uid: cred.user.uid,
      email,
      displayName,
      role,
      createdAt: null,
    })
  }

  async function signIn(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password)
  }

  async function logOut() {
    await signOut(auth)
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signUp, signIn, logOut }}>
      {children}
    </AuthContext.Provider>
  )
}
