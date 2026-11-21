import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, MapPin, Plus, Timer, X } from 'lucide-react'
import { useCircle } from '../context/CircleContext'
import { useToast } from '../context/ToastContext'
import { extendCheckin, finishCheckin, startCheckin } from '../lib/api'
import { dataErrorMessage, hourMinute, ms } from '../lib/format'
import type { Checkin } from '../lib/types'
import { Button, ErrorText } from './ui'

const PRESETS = [15, 30, 45, 60, 90, 120]

function fmtMinutes(m: number) {
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h${r}` : `${h}h`
}

/** "faltam 12 min" / "atrasado 5 min" */
export function countdown(c: Checkin, now = Date.now()) {
  const diff = Math.round((ms(c.dueAt) - now) / 60_000)
  if (c.status === 'late' || diff < 0) return { late: true, text: `atrasado ${fmtMinutes(Math.max(1, -diff))}` }
  return { late: false, text: diff <= 0 ? 'chegando agora' : `faltam ${fmtMinutes(diff)}` }
}

export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(t)
  }, [intervalMs])
  return now
}

export function CheckinDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { places } = useCircle()
  const toast = useToast()
  const [placeId, setPlaceId] = useState<string>('')
  const [minutes, setMinutes] = useState(30)
  const [customTime, setCustomTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open && !placeId && places[0]) setPlaceId(places[0].id)
  }, [open, places, placeId])

  const due = useMemo(() => {
    if (customTime) {
      const [h, m] = customTime.split(':').map(Number)
      const d = new Date()
      d.setHours(h, m, 0, 0)
      if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1)
      return d
    }
    return new Date(Date.now() + minutes * 60_000)
  }, [customTime, minutes])

  if (!open) return null

  async function start() {
    if (!placeId) return setError('Escolha para onde você vai.')
    setSaving(true)
    setError('')
    try {
      await startCheckin(placeId, due)
      const place = places.find((p) => p.id === placeId)
      toast.show({ kind: 'success', title: `Combinado: ${place?.name} até ${hourMinute(due)}`, body: 'Quando você chegar, a família é avisada sozinha.' })
      onClose()
    } catch (e) {
      setError(
        (e as { message?: string })?.message?.includes('invalid_due') ? 'Escolha um horário entre 1 minuto e 12 horas a partir de agora.' : dataErrorMessage(e),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1500] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="checkin-title">
      <div className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Timer className="h-6 w-6" />
          </div>
          <button onClick={onClose} aria-label="Fechar" className="rounded-full p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <h2 id="checkin-title" className="mt-4 text-xl font-bold text-slate-900">Chegada combinada</h2>
        <p className="mt-1 text-sm text-slate-600">
          Diga para onde vai e até quando chega. Se chegar, avisamos que você chegou bem. Se não chegar, a família recebe um alerta com sua última
          posição, <strong>mesmo se seu celular desligar</strong>.
        </p>

        {places.length === 0 ? (
          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-600 ring-1 ring-slate-200">
            Primeiro salve um lugar (Casa, Escola…).
            <Link to="/lugares" onClick={onClose} className="mt-3 flex items-center justify-center gap-1 font-semibold text-brand-700">
              <MapPin className="h-4 w-4" /> Criar lugar
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-2 mt-5 text-sm font-medium text-slate-700">Vou para</p>
            <div className="flex flex-wrap gap-2">
              {places.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPlaceId(p.id)}
                  aria-pressed={placeId === p.id}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${placeId === p.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  {p.emoji} {p.name}
                </button>
              ))}
            </div>

            <p className="mb-2 mt-5 text-sm font-medium text-slate-700">Chego em</p>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMinutes(m)
                    setCustomTime('')
                  }}
                  aria-pressed={!customTime && minutes === m}
                  className={`rounded-xl py-2.5 text-sm font-semibold transition ${!customTime && minutes === m ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  {fmtMinutes(m)}
                </button>
              ))}
            </div>
            <label className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
              <span className="flex items-center gap-2 text-sm text-slate-700">
                <Clock className="h-4 w-4" /> Ou até o horário
              </span>
              <input type="time" value={customTime} onChange={(e) => setCustomTime(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-base" />
            </label>

            <p className="mt-4 text-center text-sm text-slate-500">
              Prazo: <strong className="text-slate-900">{hourMinute(due)}</strong> · tolerância de 10 min
            </p>
            <ErrorText>{error}</ErrorText>
            <Button full className="mt-3" loading={saving} onClick={start}>
              Combinar chegada
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

/** Faixa com a minha chegada em andamento. */
export function MyCheckinBar() {
  const { myCheckin } = useCircle()
  const toast = useToast()
  const now = useNow()
  const [busy, setBusy] = useState(false)
  if (!myCheckin) return null
  const cd = countdown(myCheckin, now)

  async function run(fn: () => Promise<void>, msg: string) {
    setBusy(true)
    try {
      await fn()
      toast.show({ kind: 'success', title: msg })
    } catch (e) {
      toast.show({ kind: 'danger', title: 'Não deu certo', body: dataErrorMessage(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`rounded-2xl p-3 shadow-md ring-1 ${cd.late ? 'bg-red-50 ring-red-200' : 'bg-white/95 ring-slate-200'} backdrop-blur`}>
      <div className="flex items-center gap-3">
        <Timer className={`h-5 w-5 shrink-0 ${cd.late ? 'text-red-600' : 'text-brand-600'}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">
            Indo para {myCheckin.placeName} · até {hourMinute(myCheckin.dueAt)}
          </p>
          <p className={`text-xs ${cd.late ? 'font-semibold text-red-700' : 'text-slate-500'}`}>
            {cd.late && myCheckin.status === 'late' ? 'Sua família foi avisada do atraso' : cd.text}
          </p>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <button disabled={busy} onClick={() => run(() => finishCheckin(myCheckin.id, 'arrived'), 'Família avisada: você chegou bem')} className="inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
          <CheckCircle2 className="h-4 w-4" /> Cheguei
        </button>
        <button disabled={busy} onClick={() => run(() => extendCheckin(myCheckin.id, 15), '+15 minutos no prazo')} className="inline-flex items-center justify-center gap-1 rounded-xl bg-slate-100 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200 disabled:opacity-60">
          <Plus className="h-4 w-4" /> 15 min
        </button>
        <button disabled={busy} onClick={() => run(() => finishCheckin(myCheckin.id, 'cancelled'), 'Combinado cancelado')} className="rounded-xl bg-slate-100 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-60">
          Cancelar
        </button>
      </div>
    </div>
  )
}
