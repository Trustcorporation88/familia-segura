import { DialogFocus } from './DialogFocus'
import { useState } from 'react'
import { Phone, Siren, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useCircle } from '../context/CircleContext'
import { useTracker } from '../context/TrackerContext'
import { useToast } from '../context/ToastContext'
import { pushEvent } from '../lib/api'
import { Button } from './ui'

export function SosDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth()
  const { circle } = useCircle()
  const { position } = useTracker()
  const toast = useToast()
  const [sending, setSending] = useState(false)

  if (!open || !profile || !circle) return null

  async function send() {
    if (!profile || !circle) return
    setSending(true)
    try {
      await pushEvent(circle.id, profile, 'sos', { lat: position?.lat ?? null, lng: position?.lng ?? null })
      toast.show({ kind: 'success', title: 'SOS registrado', body: 'O pedido está disponível no círculo. Não há confirmação de leitura. Em emergência, ligue 190 ou 192.' })
      onClose()
    } catch {
      toast.show({ kind: 'danger', title: 'Não foi possível enviar o SOS', body: 'Verifique sua conexão. Em emergência, ligue 190.' })
    } finally {
      setSending(false)
    }
  }

  return (
    <DialogFocus onClose={onClose}>
    <div className="fixed inset-0 z-[1500] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="sos-title">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600">
            <Siren className="h-6 w-6" />
          </div>
          <button onClick={onClose} aria-label="Fechar" className="rounded-full p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <h2 id="sos-title" className="mt-4 text-xl font-bold text-slate-900">Pedir ajuda?</h2>
        <p className="mt-1 text-sm text-slate-600">
          O pedido ficará disponível no círculo <strong>{circle.name}</strong> com a sua localização
          {position ? '' : ' (ainda sem GPS, vamos enviar sem posição)'}.
        </p>
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Não há garantia de aviso com o app fechado, nem confirmação de leitura. O SOS não aciona serviços de emergência.</p>
        <div className="mt-6 space-y-3">
          <Button variant="danger" full loading={sending} onClick={send}>
            Enviar SOS para a família
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <a href="tel:190" className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-slate-100 font-semibold text-slate-800 hover:bg-slate-200">
              <Phone className="h-4 w-4" /> Polícia 190
            </a>
            <a href="tel:192" className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-slate-100 font-semibold text-slate-800 hover:bg-slate-200">
              <Phone className="h-4 w-4" /> SAMU 192
            </a>
          </div>
          <Button variant="ghost" full onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
    </DialogFocus>
  )
}
