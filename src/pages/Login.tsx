import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { AuthLayout } from '../components/AuthLayout'
import { Button, ErrorText, Field } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { authErrorMessage } from '../lib/format'

export default function Login() {
  const { signIn, resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function onReset() {
    setError('')
    setInfo('')
    if (!email) {
      setError('Digite seu e-mail acima para receber o link de nova senha.')
      return
    }
    try {
      await resetPassword(email)
      setInfo('Enviamos um link para redefinir sua senha. Confira seu e-mail.')
    } catch (err) {
      setError(authErrorMessage(err))
    }
  }

  return (
    <AuthLayout
      title="Bem-vindo de volta"
      subtitle="Entre para ver onde sua família está."
      footer={
        <>
          Novo por aqui?{' '}
          <Link to="/cadastro" className="font-semibold text-brand-700 hover:underline">
            Criar uma conta gratuita
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field
          label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="voce@email.com"
          icon={<Mail className="h-5 w-5" />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <div className="relative">
          <Field
            label="Senha"
            name="password"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Sua senha"
            icon={<Lock className="h-5 w-5" />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pr-12"
            required
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Esconder senha' : 'Mostrar senha'}
            className="absolute bottom-2 right-2 rounded-lg p-2 text-slate-400 hover:text-slate-700"
          >
            {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={onReset} className="text-sm font-medium text-brand-700 hover:underline">
            Esqueci minha senha
          </button>
        </div>
        <ErrorText>{error}</ErrorText>
        {info && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">{info}</p>}
        <Button type="submit" full loading={loading} disabled={!email || !password}>
          Entrar
        </Button>
      </form>
    </AuthLayout>
  )
}
