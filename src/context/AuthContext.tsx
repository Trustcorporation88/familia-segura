import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { auth } from '../lib/firebase'
import { saveProfile, watchProfile } from '../lib/api'
import { randomColor } from '../lib/format'
import type { UserProfile } from '../lib/types'

interface AuthState {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (data: { name: string; phone: string; email: string; password: string }) => Promise<void>
  resetPassword: (email: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [profileReady, setProfileReady] = useState(false)

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u)
    setAuthReady(true)
    if (!u) {
      setProfile(null)
      setProfileReady(true)
    } else {
      setProfileReady(false)
    }
  }), [])

  useEffect(() => {
    if (!user) return
    return watchProfile(user.uid, (p) => {
      setProfile(p)
      setProfileReady(true)
    })
  }, [user])

  const value: AuthState = {
    user,
    profile,
    loading: !authReady || !profileReady,
    async signIn(email, password) {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    },
    async signUp({ name, phone, email, password }) {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
      await updateProfile(cred.user, { displayName: name.trim() })
      await saveProfile({
        uid: cred.user.uid,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        color: randomColor(),
        circleId: null,
      })
    },
    async resetPassword(email) {
      await sendPasswordResetEmail(auth, email.trim())
    },
    async logout() {
      await signOut(auth)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fora do AuthProvider')
  return ctx
}
