import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, Copy, Link2, Share2, Timer, Trash2 } from 'lucide-react'
import { Button, Card, PageHeader } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useTracker } from '../context/TrackerContext'
import { useToast } from '../context/ToastContext'
import { createShare, deleteShare, shareUrl } from '../lib/api'
import { hourMinute } from '../lib/format'

const DURATIONS = [
  { label: '15 min', minutes: 15 },
  { label: '1 hora', minutes: 60 },
  { label: '4 horas', minutes: 240 },
  { label: '8 horas', minutes: 480 },
]

function remaining(ms: number) {
  const m = Math.max(0, Math.round(ms / 60_000))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h}h${m % 60 ? ` ${m % 60}min` : ''}`
}

export default function SharePage() {
  const { profile } = useAuth()
  const { position, shares } = useTracker()
  const toast = useToast()
  const [minutes, setMinutes] = useState(60)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [, tick] = useState(0)

  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30_000)
    return () => window.clearInterval(t)
  }, [])

  const now = Date.now()
  const active = shares.filter((s) => s.expiresAt.toMillis() > now)
  const expired = shares.filter((s) => s.expiresAt.toMillis() <= now)

  // Limpa links vencidos automaticamente.
  useEffect(() => {
    expired.forEach((s) => deleteShare(s.id).catch(() => undefined))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired.length])

  async function create() {
    if (!profile) return
    setCreating(true)
    try {
      const token = await createShare(profile, minutes, position)
      const url = shareUrl(token)
      if (navigator.share) {
        await navigator
          .share({ title: 'Minha localização', text: `Acompanhe minha localização ao vivo por ${DURATIONS.find((d) => d.minutes === minutes)?.label}:`, url })
          .catch(() => undefined)
      } else {
        await navigator.clipboard?.writeText(url)
        toast.show({ kind: 'success', title: 'Link copiado', body: 'Cole no WhatsApp ou onde quiser.' })
      }
    } catch {
      toast.show({ kind: 'danger', title: 'Não foi possível criar o link' })
    } finally {
      setCreating(false)
    }
  }

  async function copy(id: string) {
    await navigator.clipboard?.writeText(shareUrl(id))
    setCopied(id)
    window.setTimeout(() => setCopied(null), 2000)
  }

  return (
    <>
      <PageHeader
        title="Link temporário"
        subtitle="Compartilhe com quem não tem o app"
        action={
          <Link to="/ajustes" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        }
      />
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <Card>
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Link2 className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold text-slate-900">Sua localização ao vivo, por tempo limitado</p>
              <p className="mt-0.5 text-sm text-slate-600">Ideal para voltar de um app de transporte ou encontrar alguém. O link para de funcionar sozinho.</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d.minutes}
                onClick={() => setMinutes(d.minutes)}
                aria-pressed={minutes === d.minutes}
                className={`rounded-xl py-2.5 text-sm font-semibold transition ${minutes === d.minutes ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <Button full className="mt-4" loading={creating} onClick={create}>
            <Share2 className="h-5 w-5" /> Criar e enviar link
          </Button>
          {!position && <p className="mt-2 text-center text-xs text-amber-700">Ainda sem GPS. O link mostra sua posição assim que ela chegar.</p>}
        </Card>

        {active.length > 0 && (
          <section>
            <h2 className="mb-2 px-1 text-sm font-semibold text-slate-500">Links ativos</h2>
            <div className="space-y-2">
              {active.map((s) => (
                <Card key={s.id} className="flex items-center gap-3 !p-3">
                  <Timer className="h-5 w-5 shrink-0 text-emerald-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">Expira às {hourMinute(s.expiresAt)}</p>
                    <p className="text-xs text-slate-500">faltam {remaining(s.expiresAt.toMillis() - now)}</p>
                  </div>
                  <button onClick={() => copy(s.id)} className="rounded-xl p-2.5 text-slate-500 hover:bg-slate-100" aria-label="Copiar link">
                    {copied === s.id ? <Check className="h-5 w-5 text-emerald-600" /> : <Copy className="h-5 w-5" />}
                  </button>
                  <button
                    onClick={() => deleteShare(s.id).then(() => toast.show({ kind: 'info', title: 'Link desativado' }))}
                    className="rounded-xl p-2.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                    aria-label="Desativar link"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}
