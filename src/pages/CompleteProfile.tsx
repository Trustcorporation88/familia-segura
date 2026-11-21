import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { AuthLayout } from '../components/AuthLayout'
import { Button, FullScreenSpinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'

/**
 * Login existe mas o perfil ainda não chegou. O perfil é criado por um gatilho
 * no banco durante o cadastro, então normalmente isso dura só um instante.
 */
export default function CompleteProfile() {
  const { logout } = useAuth()
  const [waiting, setWaiting] = useState(true)

  useEffect(() => {
    const t = window.setTimeout(() => setWaiting(false), 3000)
    return () => window.clearTimeout(t)
  }, [])

  if (waiting) return <FullScreenSpinner label="Preparando sua conta…" />

  return (
    <AuthLayout
      title="Quase lá"
      subtitle="Não conseguimos carregar seu perfil agora."
      footer={
        <button onClick={logout} className="font-semibold text-brand-700 hover:underline">
          Sair
        </button>
      }
    >
      <Button full onClick={() => window.location.reload()}>
        <RefreshCw className="h-5 w-5" /> Tentar de novo
      </Button>
    </AuthLayout>
  )
}
