import { useState } from 'react'
import { Check, Copy, Share2, X } from 'lucide-react'
import { useCircle } from '../context/CircleContext'
import { Button } from './ui'

export function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { circle } = useCircle()
  const [copied, setCopied] = useState(false)
  if (!open || !circle) return null

  const text = `Entre no nosso círculo "${circle.name}" no Família Segura: ${window.location.origin} . Use o código ${circle.inviteCode}`

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Família Segura', text })
        return
      } catch {
        /* usuário cancelou */
      }
    }
    await copy()
  }

  async function copy() {
    await navigator.clipboard?.writeText(circle!.inviteCode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-[1500] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="invite-title">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 id="invite-title" className="text-xl font-bold text-slate-900">Convidar para {circle.name}</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded-full p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-600">A pessoa cria uma conta e digita este código em “Tenho um código”.</p>
        <button onClick={copy} className="mt-5 flex w-full items-center justify-center gap-3 rounded-2xl bg-brand-50 py-5 ring-1 ring-brand-100 hover:bg-brand-100" aria-label="Copiar código">
          <span className="font-mono text-3xl font-bold tracking-[0.3em] text-brand-700">{circle.inviteCode}</span>
          {copied ? <Check className="h-5 w-5 text-emerald-600" /> : <Copy className="h-5 w-5 text-brand-500" />}
        </button>
        <Button full className="mt-4" onClick={share}>
          <Share2 className="h-5 w-5" /> Enviar convite
        </Button>
      </div>
    </div>
  )
}
