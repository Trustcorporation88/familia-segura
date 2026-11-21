import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Bell, LogIn, LogOut, Siren } from 'lucide-react'
import { EmptyState, PageHeader } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useCircle } from '../context/CircleContext'
import { firstName, hourMinute, timeAgo } from '../lib/format'
import type { CircleEvent } from '../lib/types'

function describe(e: CircleEvent, me: string | undefined) {
  const who = e.uid === me ? 'Você' : firstName(e.name)
  if (e.type === 'sos') return `${who} enviou um SOS`
  if (e.type === 'arrive') return `${who} chegou em ${e.placeName ?? 'um lugar'}`
  return `${who} saiu de ${e.placeName ?? 'um lugar'}`
}

export default function AlertsPage() {
  const { profile } = useAuth()
  const { events } = useCircle()

  useEffect(() => {
    localStorage.setItem('fs:alertsSeen', String(Date.now()))
  }, [events.length])

  return (
    <>
      <PageHeader
        title="Alertas"
        subtitle="Chegadas, saídas e pedidos de ajuda"
        action={
          <Link to="/" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Voltar ao mapa">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        }
      />
      <div className="mx-auto max-w-2xl p-4">
        {events.length === 0 ? (
          <EmptyState icon={<Bell className="h-7 w-7" />} title="Nenhum alerta ainda" body="Crie lugares como Casa e Escola para receber avisos automáticos de chegada e saída." />
        ) : (
          <ol className="space-y-2">
            {events.map((e) => {
              const Icon = e.type === 'sos' ? Siren : e.type === 'arrive' ? LogIn : LogOut
              return (
                <li key={e.id} className={`flex items-center gap-3 rounded-2xl p-3 ring-1 ${e.type === 'sos' ? 'bg-red-50 ring-red-200' : 'bg-white ring-slate-200'}`}>
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      e.type === 'sos' ? 'bg-red-600 text-white' : e.type === 'arrive' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{describe(e, profile?.uid)}</p>
                    <p className="text-sm text-slate-500">
                      {hourMinute(e.ts)} · {timeAgo(e.ts)}
                    </p>
                  </div>
                  {e.type === 'sos' && e.lat != null && e.lng != null && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white"
                    >
                      Ver local
                    </a>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </>
  )
}
