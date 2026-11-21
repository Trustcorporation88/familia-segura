import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Marker, useMap } from 'react-leaflet'
import { Clock, ShieldCheck } from 'lucide-react'
import { BaseMap } from '../components/map/BaseMap'
import { memberIcon } from '../components/map/icons'
import { Avatar } from '../components/Avatar'
import { FullScreenSpinner } from '../components/ui'
import { watchShare } from '../lib/api'
import { firstName, hourMinute, ms, timeAgo } from '../lib/format'
import type { Share } from '../lib/types'

function Follow({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 15), { animate: true })
  }, [lat, lng, map])
  return null
}

export default function PublicShare() {
  const { token = '' } = useParams()
  const [share, setShare] = useState<Share | null | undefined>(undefined)
  const [, tick] = useState(0)

  useEffect(() => watchShare(token, setShare), [token])
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30_000)
    return () => window.clearInterval(t)
  }, [])

  if (share === undefined) return <FullScreenSpinner label="Abrindo localização…" />

  const expired = !share || ms(share.expiresAt) <= Date.now()

  if (expired) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-200 text-slate-500">
          <Clock className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-slate-900">Este link expirou</h1>
        <p className="mt-1 max-w-xs text-slate-600">Quem compartilhou pode gerar um novo link no app Família Segura.</p>
        <Link to="/login" className="mt-6 font-semibold text-brand-700 hover:underline">
          Conhecer o Família Segura
        </Link>
      </div>
    )
  }

  const hasPos = share.lat != null && share.lng != null

  return (
    <div className="relative h-[100dvh] w-full">
      <BaseMap center={hasPos ? [share.lat!, share.lng!] : undefined} zoom={hasPos ? 15 : 4}>
        {hasPos && (
          <>
            <Follow lat={share.lat!} lng={share.lng!} />
            <Marker position={[share.lat!, share.lng!]} icon={memberIcon(share.name, share.color)} />
          </>
        )}
      </BaseMap>
      <div className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[900] flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow ring-1 ring-slate-200">
        <ShieldCheck className="h-4 w-4 text-brand-600" /> Família Segura · link temporário
      </div>
      <div className="absolute inset-x-0 bottom-6 z-[900] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-md items-center gap-3 rounded-3xl bg-white p-4 shadow-sheet ring-1 ring-slate-200">
          <Avatar name={share.name} color={share.color} size={48} />
          <div className="min-w-0 flex-1">
            <p className="font-bold leading-snug text-slate-900">{firstName(share.name)} está compartilhando a localização</p>
            <p className="text-sm text-slate-500">
              {hasPos ? `Atualizado ${timeAgo(share.updatedAt)}` : 'Aguardando o GPS…'} · até {hourMinute(share.expiresAt)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
