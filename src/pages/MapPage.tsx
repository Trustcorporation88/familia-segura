import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Circle as LCircle, Marker, Popup } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import type { Map as LeafletMap } from 'leaflet'
import { BatteryCharging, BatteryLow, BatteryMedium, Bell, ChevronDown, ChevronUp, ExternalLink, LocateFixed, MapPinOff, Timer, UserPlus } from 'lucide-react'
import { BaseMap, FitBounds } from '../components/map/BaseMap'
import { clusterIcon, memberIcon, placeIcon } from '../components/map/icons'
import { Avatar } from '../components/Avatar'
import { InviteDialog } from '../components/InviteDialog'
import { CheckinDialog, MyCheckinBar, countdown, useNow } from '../components/Checkin'
import { useAuth } from '../context/AuthContext'
import { useCircle } from '../context/CircleContext'
import { useTracker } from '../context/TrackerContext'
import { formatDistance, metersBetween } from '../lib/geo'
import { requestLocation } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { BellRing } from 'lucide-react'
import { firstName, hourMinute, isStale, timeAgo, tsToDate } from '../lib/format'
import { GOOGLE_MAPS_URL, openExternal } from '../lib/native'
import type { MemberLocation, Place } from '../lib/types'

/** Sem posição nova no Família Segura há este tempo: oferece abrir o Google Maps. */
const MAPS_FALLBACK_MIN = 12

function placeOf(m: MemberLocation, places: Place[]): Place | null {
  if (m.lat == null || m.lng == null) return null
  return places.find((p) => metersBetween({ lat: m.lat!, lng: m.lng! }, p) <= p.radius) ?? null
}

/** Altura aproximada da lista de pessoas, para o zoom não esconder ninguém atrás dela. */
const isWide = () => window.innerWidth >= 768
function sheetInset() {
  return isWide() ? 48 : Math.min(window.innerHeight * 0.46, 340) + 24
}
/** No desktop a lista fica à esquerda. */
function leftInset() {
  return isWide() ? 400 : 48
}

function Battery({ level, charging }: { level: number | null; charging: boolean | null }) {
  if (level == null) return null
  const Icon = charging ? BatteryCharging : level <= 20 ? BatteryLow : BatteryMedium
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${level <= 20 && !charging ? 'text-red-600' : 'text-slate-500'}`}>
      <Icon className="h-4 w-4" />
      {level}%
    </span>
  )
}

export default function MapPage() {
  const { profile } = useAuth()
  const { circle, members, places, events, checkins, myCheckin } = useCircle()
  const now = useNow()
  const [checkinOpen, setCheckinOpen] = useState(false)
  const { status, syncStatus, position, retry } = useTracker()
  const [map, setMap] = useState<LeafletMap | null>(null)
  const [sheetOpen, setSheetOpen] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const toast = useToast()
  const [pinged, setPinged] = useState<Record<string, number>>({})

  async function ping(m: MemberLocation) {
    if (!circle || !profile) return
    try {
      await requestLocation(circle.id, profile, m.uid)
      setPinged((p) => ({ ...p, [m.uid]: Date.now() }))
      toast.show({ kind: 'info', title: `Pedido enviado para ${firstName(m.name)}`, body: 'Se a pessoa tocar na notificação, a posição dela atualiza aqui em segundos.' })
    } catch {
      toast.show({ kind: 'danger', title: 'Não foi possível enviar o pedido' })
    }
  }

  const located = members.filter((m) => m.lat != null && m.lng != null)
  const fitKey = located.length ? `${located.length}` : 'none'
  const bounds = useMemo(
    () => (located.length ? (located.map((m) => [m.lat!, m.lng!]) as [number, number][]) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fitKey],
  )

  const lastSeen = Number(localStorage.getItem('fs:alertsSeen') || 0)
  const unread = events.filter((e) => e.uid !== profile?.uid && (e.type !== 'ping' || e.targetUid === profile?.uid) && (tsToDate(e.ts)?.getTime() ?? 0) > lastSeen).length
  const recentSos = events.find((e) => e.type === 'sos' && Date.now() - (tsToDate(e.ts)?.getTime() ?? 0) < 30 * 60_000)

  function focus(m: MemberLocation) {
    if (!map || m.lat == null || m.lng == null) return
    map.flyTo([m.lat, m.lng], 16, { duration: 0.8 })
  }

  function fitAll() {
    if (!map || !located.length) return
    map.fitBounds(located.map((m) => [m.lat!, m.lng!]) as [number, number][], {
      paddingTopLeft: [sheetOpen ? leftInset() : 48, 96],
      paddingBottomRight: [48, sheetOpen ? sheetInset() : 96],
      maxZoom: 16,
    })
  }

  return (
    <div className="relative h-full w-full">
      <BaseMap onReady={setMap}>
        <FitBounds bounds={bounds} fitKey={fitKey} bottomInset={sheetInset()} leftInset={leftInset()} />

        {places.map((p) => (
          <LCircle key={p.id} center={[p.lat, p.lng]} radius={p.radius} pathOptions={{ color: '#7c3aed', weight: 2, fillOpacity: 0.08 }} />
        ))}
        {places.map((p) => (
          <Marker key={`pl-${p.id}`} position={[p.lat, p.lng]} icon={placeIcon(p.emoji)} interactive={false} />
        ))}

        <MarkerClusterGroup iconCreateFunction={clusterIcon} showCoverageOnHover={false} maxClusterRadius={50} spiderfyOnMaxZoom chunkedLoading>
          {located.map((m) => (
            <Marker
              key={m.uid}
              position={[m.lat!, m.lng!]}
              icon={memberIcon(m.name, m.color, { stale: !m.sharing || isStale(m.updatedAt), me: m.uid === profile?.uid, sos: recentSos?.uid === m.uid || checkins.some((c) => c.uid === m.uid && countdown(c, now).late) })}
              zIndexOffset={m.uid === profile?.uid ? 500 : 0}
            >
              <Popup>
                <strong>{m.uid === profile?.uid ? 'Você' : m.name}</strong>
                <br />
                {placeOf(m, places)?.name ?? 'Fora dos lugares salvos'} · {timeAgo(m.updatedAt)}
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </BaseMap>

      {/* Barra superior */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[900] flex items-start gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-2xl bg-white/95 px-4 py-2.5 shadow-md ring-1 ring-slate-200 backdrop-blur">
          <span className="truncate font-semibold text-slate-900">{circle?.name ?? 'Meu círculo'}</span>
          <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{members.length}</span>
        </div>
        <div className="flex-1" />
        <button onClick={() => setInviteOpen(true)} aria-label="Convidar" className="pointer-events-auto rounded-2xl bg-white/95 p-3 text-slate-700 shadow-md ring-1 ring-slate-200 hover:text-brand-700">
          <UserPlus className="h-5 w-5" />
        </button>
        <Link to="/alertas" aria-label={`Alertas${unread ? `, ${unread} novos` : ''}`} className="pointer-events-auto relative rounded-2xl bg-white/95 p-3 text-slate-700 shadow-md ring-1 ring-slate-200 hover:text-brand-700">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Link>
      </div>

      {/* Aviso de GPS */}
      {(status === 'denied' || status === 'unsupported' || status === 'error' || status === 'paused') && (
        <div className="absolute inset-x-3 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.75rem)] z-[900] mx-auto max-w-md rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 shadow-md ring-1 ring-amber-200">
          <div className="flex items-start gap-2">
            <MapPinOff className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="flex-1">
              {status === 'denied' && 'A localização está bloqueada no navegador. Libere nas configurações do site para sua família te ver.'}
              {status === 'unsupported' && 'Este navegador não oferece localização.'}
              {status === 'error' && 'Não conseguimos pegar seu GPS agora.'}
              {status === 'paused' && 'Você pausou o compartilhamento. Sua família vê sua última posição.'}
            </div>
            {(status === 'error' || status === 'denied') && (
              <button onClick={retry} className="font-semibold text-amber-900 underline">
                Tentar de novo
              </button>
            )}
            {status === 'paused' && (
              <Link to="/ajustes" className="font-semibold text-amber-900 underline">
                Ajustes
              </Link>
            )}
          </div>
        </div>
      )}

      {syncStatus === 'error' && (
        <div role="alert" className="absolute inset-x-3 top-32 z-[900] mx-auto max-w-md rounded-xl bg-red-50 p-3 text-sm text-red-900 shadow">
          O GPS está disponível, mas houve falha ao enviar dados ao servidor. Tentando novamente. Sua família pode ver uma posição antiga.
        </div>
      )}

      {/* Botão centralizar */}
      <button
        onClick={fitAll}
        aria-label="Mostrar todos"
        className={`absolute right-3 z-[900] rounded-2xl bg-white p-3 text-slate-700 shadow-md ring-1 ring-slate-200 transition-all hover:text-brand-700 ${sheetOpen ? 'bottom-[min(46vh,340px)] md:bottom-6' : 'bottom-20 md:bottom-6'}`}
      >
        <LocateFixed className="h-5 w-5" />
      </button>

      {/* Lista de membros (bottom sheet) */}
      <section className="absolute inset-x-0 bottom-0 z-[900] mx-auto max-w-2xl rounded-t-3xl bg-white shadow-sheet ring-1 ring-slate-200 md:inset-x-auto md:bottom-auto md:left-3 md:top-20 md:w-[370px] md:rounded-3xl">
        <button onClick={() => setSheetOpen((o) => !o)} className="flex w-full items-center justify-between px-5 pb-2 pt-3" aria-expanded={sheetOpen}>
          <span className="mx-auto block h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
          <span className="absolute left-5 top-3 text-sm font-semibold text-slate-900 sm:static">Pessoas</span>
          {sheetOpen ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronUp className="h-5 w-5 text-slate-400" />}
        </button>
        {sheetOpen && (
          <div className="px-3 pb-1">
            {myCheckin ? (
              <MyCheckinBar />
            ) : (
              <button
                onClick={() => setCheckinOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-50 py-2.5 text-sm font-semibold text-brand-700 ring-1 ring-brand-100 hover:bg-brand-100"
              >
                <Timer className="h-4 w-4" /> Combinar chegada
              </button>
            )}
          </div>
        )}
        {sheetOpen && (
          <ul className="max-h-[min(38vh,280px)] md:max-h-[calc(100dvh-14rem)] divide-y divide-slate-100 overflow-y-auto px-2 pb-3">
            {members.map((m) => {
              const isMe = m.uid === profile?.uid
              const place = !isStale(m.updatedAt) && m.sharing ? placeOf(m, places) : null
              const dist =
                !isMe && position && m.lat != null && m.lng != null ? formatDistance(metersBetween(position, { lat: m.lat, lng: m.lng })) : null
              const stale = isStale(m.updatedAt)
              // Botão do Google Maps só para quem não está atualizando pelo Família Segura
              // (ex.: iPhone pelo site). O app Android reenvia a cada 5 min, então
              // quem tem o app não mostra o botão enquanto estiver em dia.
              const showMaps = !isMe && (m.sharing === false || isStale(m.updatedAt, MAPS_FALLBACK_MIN))
              const ck = checkins.find((c) => c.uid === m.uid)
              const cd = ck ? countdown(ck, now) : null
              return (
                <li key={m.uid} className="relative">
                  <button onClick={() => focus(m)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-slate-50 ${isMe ? '' : showMaps ? 'pr-36' : 'pr-24'}`}>
                    <Avatar name={m.name} color={m.color} size={44} dimmed={stale} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-semibold text-slate-900">{isMe ? 'Você' : firstName(m.name)}</span>
                        {recentSos?.uid === m.uid && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">SOS</span>}
                        {cd?.late && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">ATRASADO</span>}
                        {m.sharing === false && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">pausado</span>}
                      </span>
                      {ck && (
                        <span className={`flex items-center gap-1 truncate text-xs font-medium ${cd?.late ? 'text-red-700' : 'text-brand-700'}`}>
                          <Timer className="h-3.5 w-3.5 shrink-0" /> Indo para {ck.placeName} · até {hourMinute(ck.dueAt)}
                        </span>
                      )}
                      <span className="block truncate text-sm text-slate-500">
                        {m.lat == null
                          ? 'Aguardando localização'
                          : place
                            ? `${place.emoji} Em ${place.name}`
                            : dist
                              ? `A ${dist} de você`
                              : 'Fora dos lugares salvos'}
                        {' · '}
                        {timeAgo(m.updatedAt)}
                      </span>
                    </span>
                    <Battery level={m.battery} charging={m.charging} />
                  </button>
                  {showMaps && (
                    // Quem compartilha a localização com você pelo Google Maps aparece lá
                    // com a foto no mapa. O Google só permite link por até 24 h, então o
                    // botão abre o app do Google Maps (ou o link salvo, se houver).
                    <button
                      onClick={() => openExternal(m.mapsLink ?? GOOGLE_MAPS_URL)}
                      aria-label={`Abrir Google Maps para ver ${firstName(m.name)}`}
                      title="Abrir Google Maps"
                      className="absolute right-24 top-1/2 -translate-y-1/2 rounded-xl p-2 text-brand-600 hover:bg-brand-50 hover:text-brand-700"
                    >
                      <ExternalLink className="h-5 w-5" />
                    </button>
                  )}
                  {!isMe && (
                    <button
                      onClick={() => ping(m)}
                      disabled={now - (pinged[m.uid] ?? 0) < 60_000}
                      aria-label={`Pedir localização de ${firstName(m.name)}`}
                      title="Pedir localização"
                      className="absolute right-14 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-400 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-30"
                    >
                      <BellRing className="h-5 w-5" />
                    </button>
                  )}
                </li>
              )
            })}
            {members.length <= 1 && (
              <li className="px-3 py-3">
                <button onClick={() => setInviteOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-200 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-50">
                  <UserPlus className="h-4 w-4" /> Convidar alguém da família
                </button>
              </li>
            )}
          </ul>
        )}
      </section>

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <CheckinDialog open={checkinOpen} onClose={() => setCheckinOpen(false)} />
    </div>
  )
}
