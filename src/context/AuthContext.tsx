import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { watchProfile } from '../lib/api'
import { randomColor } from '../lib/format'
import type { UserProfile } from '../lib/types'

interface AuthState {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  /** Usuário abriu o link de "esqueci minha senha" e precisa definir uma nova. */
  recovery: boolean
  signIn: (email: string, password: string) => Promise<void>
  /** Retorna true se a conta precisa ser confirmada pelo e-mail antes de entrar. */
  signUp: (data: { name: string; phone: string; email: string; password: string }) => Promise<boolean>
  resetPassword: (email: string) => Promise<void>
  setNewPassword: (password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [profileReady, setProfileReady] = useState(false)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setAuthReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setUser((prev) => {
        const next = session?.user ?? null
        // Evita re-render a cada refresh de token
        return prev?.id === next?.id ? (prev ?? next) : next
      })
      setAuthReady(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const uid = user?.id
  useEffect(() => {
    if (!uid) {
      setProfile(null)
      setProfileReady(true)
      return
    }
    setProfileReady(false)
    return watchProfile(uid, (p) => {
      setProfile(p)
      setProfileReady(true)
    })
  }, [uid])

  const value: AuthState = {
    user,
    profile,
    recovery,
    loading: !authReady || !profileReady,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
    },
    async signUp({ name, phone, email, password }) {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { name: name.trim(), phone: phone.trim(), color: randomColor() },
          emailRedirectTo: window.location.origin,
        },
      })
      if (error) throw error
      return !data.session
    },
    async resetPassword(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
      if (error) throw error
    },
    async setNewPassword(password) {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setRecovery(false)
    },
    async logout() {
      await supabase.auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fora do AuthProvider')
  return ctx
}
