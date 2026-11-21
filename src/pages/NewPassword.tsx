import { useState, type FormEvent } from 'react'
import { Lock } from 'lucide-react'
import { AuthLayout } from '../components/AuthLayout'
import { Button, ErrorText, Field } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { authErrorMessage } from '../lib/format'

export default function NewPassword() {
  const { setNewPassword } = useAuth()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 6) return setError('A senha precisa ter pelo menos 6 caracteres.')
    setLoading(true)
    try {
      await setNewPassword(password)
    } catch (err) {
      setError(authErrorMessage(err))
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Criar nova senha" subtitle="Escolha uma senha nova para sua conta.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Nova senha" name="new-password" type="password" autoComplete="new-password" placeholder="Mínimo de 6 caracteres" icon={<Lock className="h-5 w-5" />} value={password} onChange={(e) => setPassword(e.target.value)} />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" full loading={loading}>
          Salvar e entrar
        </Button>
      </form>
    </AuthLayout>
  )
}
