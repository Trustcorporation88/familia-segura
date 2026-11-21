import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, Polyline, Tooltip } from 'react-leaflet'
import { addDays, isToday, startOfDay } from 'date-fns'
import { ChevronLeft, ChevronRight, Footprints, Route } from 'lucide-react'
import { BaseMap, FitBounds } from '../components/map/BaseMap'
import { Avatar } from '../components/Avatar'
import { Card, EmptyState, PageHeader, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useCircle } from '../context/CircleContext'
import { loadHistory } from '../lib/api'
import { dayLabel, firstName, hourMinute } from '../lib/format'
import { pathKm } from '../lib/geo'
import type { HistoryPoint } from '../lib/types'

export default function HistoryPage() {
  const { profile } = useAuth()
  const { circle, members } = useCircle()
  const [uid, setUid] = useState(profile?.uid ?? '')
  const [day, setDay] = useState(() => startOfDay(new Date()))
  const [points, setPoints] = useState<HistoryPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const member = members.find((m) => m.uid === uid) ?? members[0]

  useEffect(() => {
    if (!circle || !member) return
    let cancelled = false
    setLoading(true)
    setError('')
    loadHistory(circle.id, member.uid, day, addDays(day, 1))
      .then((p) => !cancelled && setPoints(p))
      .catch((e) => {
        console.error(e)
        if (!cancelled) {
          setPoints([])
          setError('Não foi possível carregar o histórico. Verifique sua conexão e tente de novo.')
        }
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [circle, member, day])

  const line = useMemo(() => points.map((p) => [p.lat, p.lng] as [number, number]), [points])
  const km = useMemo(() => pathKm(points), [points])
  const color = member?.color ?? '#7c3aed'

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Histórico" subtitle="Por onde cada um passou no dia" />

      <div className="mx-auto w-full max-w-2xl space-y-3 px-4 pt-3">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {members.map((m) => (
            <button
              key={m.uid}
              onClick={() => setUid(m.uid)}
              aria-pressed={member?.uid === m.uid}
              className={`flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-sm font-semibold transition ${
                member?.uid === m.uid ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'
              }`}
            >
              <Avatar name={m.name} color={m.color} size={28} />
              {m.uid === profile?.uid ? 'Você' : firstName(m.name)}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-white p-1.5 ring-1 ring-slate-200">
          <button onClick={() => setDay((d) => addDays(d, -1))} aria-label="Dia anterior" className="rounded-xl p-2 hover:bg-slate-100">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold capitalize text-slate-800">{isToday(day) ? 'Hoje' : dayLabel(day)}</span>
          <button onClick={() => setDay((d) => addDays(d, 1))} disabled={isToday(day)} aria-label="Próximo dia" className="rounded-xl p-2 hover:bg-slate-100 disabled:opacity-30">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-3">
        <div className="relative h-[45vh] min-h-[260px] overflow-hidden rounded-2xl ring-1 ring-slate-200">
          <BaseMap>
            <FitBounds bounds={line.length ? line : null} fitKey={`${member?.uid}-${day.getTime()}-${line.length}`} />
            {line.length > 1 && <Polyline positions={line} pathOptions={{ color, weight: 5, opacity: 0.85 }} />}
            {points.map((p, i) => (
              <CircleMarker
                key={p.id}
                center={[p.lat, p.lng]}
                radius={i === 0 || i === points.length - 1 ? 8 : 4}
                pathOptions={{ color: '#fff', weight: 2, fillColor: i === points.length - 1 ? color : i === 0 ? '#10b981' : color, fillOpacity: 1 }}
              >
                <Tooltip>{hourMinute(p.ts)}</Tooltip>
              </CircleMarker>
            ))}
          </BaseMap>
          {loading && (
            <div className="absolute inset-0 z-[900] flex items-center justify-center bg-white/60">
              <Spinner />
            </div>
          )}
        </div>

        {error && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">{error}</p>}

        {!loading && !error && points.length === 0 ? (
          <EmptyState icon={<Footprints className="h-7 w-7" />} title="Sem trajeto neste dia" body="O trajeto aparece aqui quando o app está aberto e compartilhando localização." />
        ) : (
          points.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Card className="!p-3 text-center">
                <Route className="mx-auto h-5 w-5 text-brand-600" />
                <p className="mt-1 text-lg font-bold">{km.toFixed(1).replace('.', ',')} km</p>
                <p className="text-xs text-slate-500">percorridos</p>
              </Card>
              <Card className="!p-3 text-center">
                <p className="text-xs text-slate-500">Início</p>
                <p className="mt-1 text-lg font-bold">{hourMinute(points[0].ts)}</p>
              </Card>
              <Card className="!p-3 text-center">
                <p className="text-xs text-slate-500">Último</p>
                <p className="mt-1 text-lg font-bold">{hourMinute(points[points.length - 1].ts)}</p>
              </Card>
            </div>
          )
        )}
      </div>
    </div>
  )
}
