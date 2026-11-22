import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Clock, Map, MapPin, Menu, Siren } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useCircle } from '../context/CircleContext'
import { useToast } from '../context/ToastContext'
import { firstName, hourMinute, tsToDate } from '../lib/format'
import type { CircleEvent } from '../lib/types'
import { SosDialog } from './SosDialog'
import { ensurePush } from '../lib/push'

function eventText(e: CircleEvent): { title: string; body?: string } {
  const who = firstName(e.name)
  if (e.type === 'ping') return { title: `${who} pediu sua localização`, body: 'Sua posição atual está sendo enviada.' }
  if (e.type === 'sos') return { title: `🚨 ${who} pediu ajuda (SOS)`, body: 'Abra o mapa para ver onde ela/ele está.' }
  if (e.type === 'checkin_late')
    return { title: `⚠️ ${who} não chegou em ${e.placeName ?? 'destino'} no horário`, body: `Combinado até ${hourMinute(e.dueAt)}. Veja a última posição no mapa e tente ligar.` }
  if (e.type === 'checkin_ok') return { title: `✅ ${who} chegou bem em ${e.placeName ?? 'destino'}` }
  if (e.type === 'checkin_start') return { title: `${who} está indo para ${e.placeName ?? 'um lugar'}`, body: `Chega até ${hourMinute(e.dueAt)}.` }
  if (e.type === 'arrive') return { title: `${who} chegou em ${e.placeName ?? 'um lugar'}` }
  return { title: `${who} saiu de ${e.placeName ?? 'um lugar'}` }
}

/** Mostra alertas novos de outros membros enquanto o app está aberto. */
function useLiveAlerts() {
  const { profile } = useAuth()
  const { events } = useCircle()
  const toast = useToast()
  const startedAt = useRef(Date.now())
  const seen = useRef(new Set<string>())

  useEffect(() => {
    for (const e of events) {
      if (seen.current.has(e.id)) continue
      seen.current.add(e.id)
      const at = tsToDate(e.ts)?.getTime() ?? Date.now()
      if (at < startedAt.current - 5000 || e.uid === profile?.uid) continue
      if (e.type === 'ping' && e.targetUid !== profile?.uid) continue
      const { title, body } = eventText(e)
      const urgent = e.type === 'sos' || e.type === 'checkin_late'
      toast.show({ kind: urgent ? 'danger' : e.type === 'checkin_ok' ? 'success' : 'info', title, body }, urgent ? 15000 : 6000)
      if (urgent && 'vibrate' in navigator) navigator.vibrate?.([300, 150, 300, 150, 600])
      if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
        navigator.serviceWorker?.ready
          .then((reg) => reg.showNotification(title, { body, icon: '/icon-192.png', tag: e.id }))
          .catch(() => new Notification(title, { body, icon: '/icon-192.png' }))
      }
    }
  }, [events, profile?.uid, toast])
}

const tabs = [
  { to: '/', label: 'Mapa', icon: Map, end: true },
  { to: '/lugares', label: 'Lugares', icon: MapPin },
  { to: '/historico', label: 'Histórico', icon: Clock },
  { to: '/ajustes', label: 'Mais', icon: Menu },
]

export function AppShell() {
  const [sosOpen, setSosOpen] = useState(false)
  const { profile } = useAuth()
  useLiveAlerts()
  // Aparelho que já aceitou notificações: mantém a assinatura de push atualizada.
  useEffect(() => {
    if (profile?.uid) void ensurePush(profile.uid)
  }, [profile?.uid])

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[11px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
      isActive ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800'
    }`

  return (
    <div className="flex h-[100dvh] flex-col bg-slate-50">
      <main className="relative min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>

      <nav
        aria-label="Navegação principal"
        className="relative z-[1000] border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex max-w-2xl items-stretch">
          {tabs.slice(0, 2).map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={tabClass}>
              <t.icon className="h-6 w-6" />
              {t.label}
            </NavLink>
          ))}
          <div className="flex flex-1 items-center justify-center">
            <button
              onClick={() => setSosOpen(true)}
              aria-label="Enviar SOS"
              className="-mt-6 flex h-16 w-16 flex-col items-center justify-center rounded-full bg-red-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-300 text-white shadow-lg shadow-red-600/40 ring-4 ring-white transition hover:bg-red-700 active:scale-95"
            >
              <Siren className="h-6 w-6" />
              <span className="text-[10px] font-bold leading-none">SOS</span>
            </button>
          </div>
          {tabs.slice(2).map((t) => (
            <NavLink key={t.to} to={t.to} className={tabClass}>
              <t.icon className="h-6 w-6" />
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <SosDialog open={sosOpen} onClose={() => setSosOpen(false)} />
    </div>
  )
}
