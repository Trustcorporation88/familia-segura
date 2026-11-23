import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { isNativeApp } from '../lib/native'
import { Bell, ChevronRight, Link2, LogOut, MapPin, Pencil, UserPlus, Users } from 'lucide-react'
import { Avatar } from '../components/Avatar'
import { InviteDialog } from '../components/InviteDialog'
import { Card, PageHeader } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useCircle } from '../context/CircleContext'
import { useTracker } from '../context/TrackerContext'
import { useToast } from '../context/ToastContext'
import { leaveCircle, renameCircle, setSharing } from '../lib/api'
import { dataErrorMessage, firstName } from '../lib/format'

function Row({ icon, title, subtitle, to, onClick, right }: { icon: ReactNode; title: string; subtitle?: string; to?: string; onClick?: () => void; right?: ReactNode }) {
  const inner = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-slate-900">{title}</span>
        {subtitle && <span className="block truncate text-sm text-slate-500">{subtitle}</span>}
      </span>
      {right ?? <ChevronRight className="h-5 w-5 text-slate-300" />}
    </>
  )
  const cls = 'flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50'
  if (to) return <Link to={to} className={cls}>{inner}</Link>
  return <button onClick={onClick} className={cls}>{inner}</button>
}

export default function SettingsPage() {
  const { profile, logout } = useAuth()
  const { circle, members, me } = useCircle()
  const { status, syncStatus } = useTracker()
  const toast = useToast()
  const [inviteOpen, setInviteOpen] = useState(false)
  // No app instalado as notificações são pedidas ao abrir (ver AppShell).
  const [notif, setNotif] = useState(isNativeApp() ? 'granted' : typeof Notification !== 'undefined' ? Notification.permission : 'denied')

  if (!profile || !circle) return null
  const sharing = me?.sharing !== false

  async function toggleSharing() {
    if (!circle || !profile) return
    try {
      await setSharing(circle.id, profile.uid, !sharing)
    } catch (e) {
      toast.show({ kind: 'danger', title: 'Não foi possível alterar o compartilhamento', body: dataErrorMessage(e) })
      return
    }
    toast.show({ kind: 'info', title: sharing ? 'Compartilhamento pausado' : 'Compartilhamento ligado' })
  }

  async function askNotifications() {
    if (typeof Notification === 'undefined') return
    const p = await Notification.requestPermission()
    setNotif(p)
    if (p === 'granted') toast.show({ kind: 'success', title: 'Notificações ativadas', body: 'Você recebe alertas enquanto o app estiver aberto.' })
  }

  async function rename() {
    if (!circle) return
    const name = prompt('Novo nome do círculo', circle.name)
    if (name && name.trim()) await renameCircle(circle.id, name)
  }

  async function leave() {
    if (!circle || !profile) return
    const msg = circle.ownerId === profile.uid ? 'Você criou este círculo. Se sair, ele continua existindo para os outros. Sair mesmo assim?' : `Sair de ${circle.name}?`
    if (confirm(msg)) await leaveCircle(profile, circle)
  }

  return (
    <>
      <PageHeader title="Mais" />
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <Card className="flex items-center gap-3">
          <Avatar name={profile.name} color={profile.color} size={52} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold">{profile.name}</p>
            <p className="truncate text-sm text-slate-500">{profile.email}</p>
          </div>
        </Card>

        <Card className="!p-0 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${sharing ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              <MapPin className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-900">Compartilhar minha localização</span>
              <span className="block text-sm text-slate-500">
                {!sharing ? 'Pausado' : syncStatus === 'error' ? 'Falha de envio. Tentando novamente' : syncStatus === 'syncing' ? 'Enviando posição…' : status === 'active' ? 'GPS ativo neste aparelho' : status === 'denied' ? 'Bloqueado no navegador' : 'Aguardando GPS'}
              </span>
            </span>
            <button
              role="switch"
              aria-label="Compartilhar minha localização"
              aria-checked={sharing}
              onClick={toggleSharing}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${sharing ? 'bg-emerald-500' : 'bg-slate-300'}`}
            >
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${sharing ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>
        </Card>

        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Pausar interrompe novas atualizações. A última posição e o histórico continuam visíveis ao círculo. Links temporários existentes mantêm a última posição até expirarem ou serem desativados. O GPS só atualiza com o app aberto.</p>

        <Card className="!p-0 overflow-hidden divide-y divide-slate-100">
          <Row icon={<Link2 className="h-5 w-5" />} title="Link temporário" subtitle="Mostre onde você está por um tempo" to="/compartilhar" />
          <Row icon={<Bell className="h-5 w-5" />} title="Alertas" subtitle="Chegadas, saídas e SOS" to="/alertas" />
          {notif !== 'granted' && notif !== 'denied' && (
            <Row icon={<Bell className="h-5 w-5" />} title="Ativar notificações" subtitle="Receba avisos do círculo" onClick={askNotifications} />
          )}
        </Card>

        <section>
          <h2 className="mb-2 px-1 text-sm font-semibold text-slate-500">Círculo</h2>
          <Card className="!p-0 overflow-hidden divide-y divide-slate-100">
            <Row icon={<Users className="h-5 w-5" />} title={circle.name} subtitle={`${members.length} ${members.length === 1 ? 'pessoa' : 'pessoas'}: ${members.map((m) => firstName(m.name)).join(', ')}`} onClick={rename} right={<Pencil className="h-4 w-4 text-slate-400" />} />
            <Row icon={<UserPlus className="h-5 w-5" />} title="Convidar" subtitle={`Código ${circle.inviteCode}`} onClick={() => setInviteOpen(true)} />
            <Row icon={<LogOut className="h-5 w-5" />} title="Sair do círculo" onClick={leave} right={<span />} />
          </Card>
        </section>

        <button onClick={logout} className="w-full rounded-2xl py-3 text-center font-semibold text-red-600 hover:bg-red-50">
          Sair da conta
        </button>
        <p className="pb-4 text-center text-xs text-slate-400">Família Segura v2.0 · Mapas © OpenStreetMap</p>
      </div>
      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </>
  )
}
