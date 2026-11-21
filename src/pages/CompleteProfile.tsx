import { useEffect, useState, type FormEvent } from 'react'
import { Phone, User } from 'lucide-react'
import { AuthLayout } from '../components/AuthLayout'
import { Button, ErrorText, Field, FullScreenSpinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { saveProfile } from '../lib/api'
import { randomColor } from '../lib/format'
import { formatPhone } from './Signup'

/**
 * Aparece quando existe login mas não existe perfil no Firestore
 * (conta criada na versão antiga do app, ou cadastro interrompido).
 */
export default function CompleteProfile() {
  const { user, logout } = useAuth()
  const [name, setName] = useState(user?.displayName ?? '')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [waiting, setWaiting] = useState(true)

  // Logo após o cadastro, o perfil leva um instante para chegar.
  useEffect(() => {
    const t = window.setTimeout(() => setWaiting(false), 2500)
    return () => window.clearTimeout(t)
  }, [])

  if (waiting) return <FullScreenSpinner label="Preparando sua conta…" />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    if (name.trim().length < 2) return setError('Digite seu nome.')
    setLoading(true)
    try {
      await saveProfile({ uid: user.uid, name: name.trim(), phone, email: user.email ?? '', color: randomColor(), circleId: null })
    } catch {
      setError('Não foi possível salvar. Tente de novo.')
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Falta pouco" subtitle="Complete seu perfil para continuar." footer={<button onClick={logout} className="font-semibold text-brand-700 hover:underline">Sair</button>}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Nome" name="name" autoComplete="name" icon={<User className="h-5 w-5" />} value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Celular" name="phone" type="tel" inputMode="tel" icon={<Phone className="h-5 w-5" />} value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="(11) 91234-5678" />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" full loading={loading}>
          Continuar
        </Button>
      </form>
    </AuthLayout>
  )
}
