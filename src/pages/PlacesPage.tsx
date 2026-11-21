import { useEffect, useState } from 'react'
import { Circle as LCircle, Marker, useMapEvents } from 'react-leaflet'
import type { Map as LeafletMap } from 'leaflet'
import { Crosshair, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react'
import { BaseMap } from '../components/map/BaseMap'
import { placeIcon } from '../components/map/icons'
import { Avatar } from '../components/Avatar'
import { Button, Card, EmptyState, ErrorText, Field, PageHeader } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useCircle } from '../context/CircleContext'
import { useTracker } from '../context/TrackerContext'
import { useToast } from '../context/ToastContext'
import { deletePlace, savePlace } from '../lib/api'
import { formatDistance, metersBetween } from '../lib/geo'
import type { LatLng, Place } from '../lib/types'

const EMOJIS = ['🏠', '🏫', '💼', '🏋️', '🛒', '👵', '🏥', '⛪', '⚽', '📍']

function PickOnMap({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) })
  return null
}

function PlaceEditor({ initial, onClose }: { initial: Place | null; onClose: () => void }) {
  const { profile } = useAuth()
  const { circle } = useCircle()
  const { position } = useTracker()
  const toast = useToast()
  const [name, setName] = useState(initial?.name ?? '')
  const [emoji, setEmoji] = useState(initial?.emoji ?? '🏠')
  const [radius, setRadius] = useState(initial?.radius ?? 150)
  const [center, setCenter] = useState<LatLng | null>(initial ? { lat: initial.lat, lng: initial.lng } : position)
  const [map, setMap] = useState<LeafletMap | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (map && center) map.setView([center.lat, center.lng], 16)
    // só na abertura
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  function useMyLocation() {
    if (!position) return setError('Ainda não temos seu GPS. Toque no mapa para marcar o lugar.')
    setCenter(position)
    map?.flyTo([position.lat, position.lng], 16)
  }

  async function save() {
    if (!circle || !profile) return
    if (!name.trim()) return setError('Dê um nome para o lugar.')
    if (!center) return setError('Toque no mapa para marcar onde fica.')
    setSaving(true)
    try {
      await savePlace(
        circle.id,
        { name: name.trim().slice(0, 40), emoji, radius, lat: center.lat, lng: center.lng, createdBy: initial?.createdBy ?? profile.uid },
        initial?.id,
      )
      toast.show({ kind: 'success', title: initial ? 'Lugar atualizado' : 'Lugar criado', body: 'Vocês vão receber alertas de chegada e saída.' })
      onClose()
    } catch {
      setError('Não foi possível salvar. Tente de novo.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1500] flex flex-col bg-white" role="dialog" aria-modal="true" aria-labelledby="place-title">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h2 id="place-title" className="text-lg font-bold">{initial ? 'Editar lugar' : 'Novo lugar'}</h2>
        <button onClick={onClose} aria-label="Fechar" className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="relative h-[42vh] min-h-[240px] shrink-0">
        <BaseMap center={center ? [center.lat, center.lng] : undefined} zoom={center ? 16 : 4} onReady={setMap}>
          <PickOnMap onPick={setCenter} />
          {center && (
            <>
              <LCircle center={[center.lat, center.lng]} radius={radius} pathOptions={{ color: '#7c3aed', weight: 2, fillOpacity: 0.12 }} />
              <Marker
                position={[center.lat, center.lng]}
                icon={placeIcon(emoji)}
                draggable
                eventHandlers={{ dragend: (e) => setCenter(e.target.getLatLng()) }}
              />
            </>
          )}
        </BaseMap>
        <button onClick={useMyLocation} className="absolute bottom-3 left-3 z-[900] inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-md ring-1 ring-slate-200">
          <Crosshair className="h-4 w-4" /> Usar minha localização
        </button>
        {!center && (
          <p className="pointer-events-none absolute inset-x-0 top-3 z-[900] mx-auto w-fit rounded-full bg-slate-900/80 px-3 py-1.5 text-sm text-white">Toque no mapa para marcar o lugar</p>
        )}
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Field label="Nome" name="place-name" placeholder="Casa, Escola, Trabalho…" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Ícone</span>
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map((em) => (
              <button
                key={em}
                onClick={() => setEmoji(em)}
                aria-pressed={emoji === em}
                className={`h-11 w-11 rounded-xl text-xl transition ${emoji === em ? 'bg-brand-100 ring-2 ring-brand-500' : 'bg-slate-100 hover:bg-slate-200'}`}
              >
                {em}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="mb-1.5 flex justify-between text-sm font-medium text-slate-700">
            <span>Tamanho da área</span>
            <span className="text-brand-700">{formatDistance(radius)}</span>
          </span>
          <input type="range" min={50} max={1000} step={25} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-full accent-brand-600" />
          <span className="mt-1 block text-xs text-slate-500">Áreas maiores evitam alertas falsos quando o GPS oscila. 150 m funciona bem para casas.</span>
        </label>
        <ErrorText>{error}</ErrorText>
        <Button full loading={saving} onClick={save}>
          Salvar lugar
        </Button>
      </div>
    </div>
  )
}

export default function PlacesPage() {
  const { circle, places, members } = useCircle()
  const toast = useToast()
  const [editing, setEditing] = useState<Place | null | 'new'>(null)

  async function remove(p: Place) {
    if (!circle || !confirm(`Apagar "${p.name}"? Os alertas deste lugar param.`)) return
    await deletePlace(circle.id, p.id)
    toast.show({ kind: 'info', title: 'Lugar apagado' })
  }

  return (
    <>
      <PageHeader
        title="Lugares"
        subtitle="Alertas automáticos de chegada e saída"
        action={
          <Button onClick={() => setEditing('new')} className="!min-h-[40px] !px-3 !py-2">
            <Plus className="h-5 w-5" /> Novo
          </Button>
        }
      />
      <div className="mx-auto max-w-2xl space-y-3 p-4">
        {places.length === 0 ? (
          <EmptyState
            icon={<MapPin className="h-7 w-7" />}
            title="Nenhum lugar salvo"
            body="Salve Casa, Escola ou Trabalho e todo o círculo recebe um aviso quando alguém chega ou sai."
            action={<Button onClick={() => setEditing('new')}>Adicionar primeiro lugar</Button>}
          />
        ) : (
          places.map((p) => {
            const inside = members.filter((m) => m.lat != null && m.lng != null && metersBetween({ lat: m.lat, lng: m.lng }, p) <= p.radius)
            return (
              <Card key={p.id} className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-2xl">{p.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{p.name}</p>
                  <p className="text-sm text-slate-500">Raio de {formatDistance(p.radius)}</p>
                  {inside.length > 0 && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <div className="flex -space-x-2">
                        {inside.slice(0, 4).map((m) => (
                          <Avatar key={m.uid} name={m.name} color={m.color} size={24} />
                        ))}
                      </div>
                      <span className="text-xs text-emerald-700">{inside.length === 1 ? 'está aqui agora' : 'estão aqui agora'}</span>
                    </div>
                  )}
                </div>
                <button onClick={() => setEditing(p)} aria-label={`Editar ${p.name}`} className="rounded-xl p-2.5 text-slate-500 hover:bg-slate-100">
                  <Pencil className="h-5 w-5" />
                </button>
                <button onClick={() => remove(p)} aria-label={`Apagar ${p.name}`} className="rounded-xl p-2.5 text-slate-500 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-5 w-5" />
                </button>
              </Card>
            )
          })
        )}
      </div>
      {editing && <PlaceEditor initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}
