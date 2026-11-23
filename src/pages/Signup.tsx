import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Lock, Mail, MailCheck, Phone, User } from 'lucide-react'
import { AuthLayout } from '../components/AuthLayout'
import { Button, ErrorText, Field } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { authErrorMessage } from '../lib/format'
import { pendingInviteCode } from '../lib/invite'

export function formatPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export default function Signup() {
  const { signUp } = useAuth()
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [consent, setConsent] = useState(false)
  const [sentTo, setSentTo] = useState('')

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: k === 'phone' ? formatPhone(e.target.value) : e.target.value }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (form.name.trim().length < 2) return setError('Digite seu nome.')
    if (form.password.length < 6) return setError('A senha precisa ter pelo menos 6 caracteres.')
    if (!consent) return setError('Para usar o app, aceite compartilhar sua localização com seu círculo.')
    setLoading(true)
    try {
      const needsConfirmation = await signUp(form)
      if (needsConfirmation) {
        setSentTo(form.email.trim())
        setLoading(false)
      }
    } catch (err) {
      setError(authErrorMessage(err))
      setLoading(false)
    }
  }

  if (sentTo) {
    return (
      <AuthLayout title="Confira seu e-mail" subtitle="Falta só confirmar que o e-mail é seu.">
        <div className="rounded-2xl bg-brand-50 p-5 text-center ring-1 ring-brand-100">
          <MailCheck className="mx-auto h-10 w-10 text-brand-600" />
          <p className="mt-3 text-slate-700">
            Enviamos um link para <strong>{sentTo}</strong>. Toque nele para ativar a conta e voltar ao app.
          </p>
          <p className="mt-2 text-sm text-slate-500">Não chegou? Olhe a caixa de spam ou promoções.</p>
        </div>
        <Link to="/login" className="mt-6 block text-center font-semibold text-brand-700 hover:underline">
          Já confirmei, quero entrar
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Criar sua conta"
      subtitle={pendingInviteCode() ? `Convite para o círculo com código ${pendingInviteCode()}. Crie sua conta para entrar.` : "Leva menos de um minuto."}
      footer={
        <>
          Já tem conta?{' '}
          <Link to="/login" className="font-semibold text-brand-700 hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Nome" name="name" autoComplete="name" placeholder="Como sua família te chama" icon={<User className="h-5 w-5" />} value={form.name} onChange={set('name')} required />
        <Field
          label="Celular"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 91234-5678"
          icon={<Phone className="h-5 w-5" />}
          value={form.phone}
          onChange={set('phone')}
          hint="Opcional. Ajuda sua família a te ligar rápido."
        />
        <Field label="E-mail" name="email" type="email" inputMode="email" autoComplete="email" placeholder="voce@email.com" icon={<Mail className="h-5 w-5" />} value={form.email} onChange={set('email')} required />
        <Field
          label="Senha"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="Mínimo de 6 caracteres"
          icon={<Lock className="h-5 w-5" />}
          value={form.password}
          onChange={set('password')}
          required
        />
        <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
          <span>
            Concordo em compartilhar minha localização <strong>apenas com as pessoas do meu círculo</strong>. Posso pausar quando quiser.
          </span>
        </label>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" full loading={loading}>
          Criar conta
        </Button>
      </form>
    </AuthLayout>
  )
}
