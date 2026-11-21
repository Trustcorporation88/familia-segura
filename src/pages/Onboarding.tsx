import { useState, type FormEvent } from 'react'
import { KeyRound, Users } from 'lucide-react'
import { AuthLayout } from '../components/AuthLayout'
import { Button, ErrorText, Field } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { createCircle, joinCircle } from '../lib/api'
import { dataErrorMessage, firstName } from '../lib/format'

export default function Onboarding() {
  const { profile, logout } = useAuth()
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!profile) return null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setError('')
    setLoading(true)
    try {
      if (mode === 'create') await createCircle(profile, name || `Família ${profile.name.split(' ').slice(-1)[0]}`)
      else await joinCircle(profile, code)
    } catch (err) {
      console.error(err)
      setError(dataErrorMessage(err))
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title={`Oi, ${firstName(profile.name)}!`}
      subtitle="Crie o círculo da sua família ou entre com um código de convite."
      footer={<button onClick={logout} className="font-semibold text-brand-700 hover:underline">Sair da conta</button>}
    >
      <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1" role="tablist">
        {(['create', 'join'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m)
              setError('')
            }}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${
              mode === m ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600'
            }`}
          >
            {m === 'create' ? <Users className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
            {m === 'create' ? 'Criar círculo' : 'Tenho um código'}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {mode === 'create' ? (
          <Field label="Nome do círculo" name="circle" placeholder="Ex.: Família Silva" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} hint="Depois você recebe um código para convidar a família." />
        ) : (
          <Field
            label="Código de convite"
            name="code"
            placeholder="ABC123"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={7}
            autoCapitalize="characters"
            autoComplete="off"
            className="text-center font-mono text-2xl tracking-[0.4em]"
          />
        )}
        <ErrorText>{error}</ErrorText>
        <Button type="submit" full loading={loading} disabled={mode === 'join' && code.replace(/\W/g, '').length < 6}>
          {mode === 'create' ? 'Criar e continuar' : 'Entrar no círculo'}
        </Button>
      </form>
    </AuthLayout>
  )
}
