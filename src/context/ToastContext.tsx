import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'

type ToastKind = 'info' | 'success' | 'danger'

interface Toast {
  id: number
  kind: ToastKind
  title: string
  body?: string
}

interface ToastApi {
  show: (t: Omit<Toast, 'id'>, ms?: number) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), [])

  const show = useCallback<ToastApi['show']>(
    (t, ms = 5000) => {
      const id = Date.now() + Math.random()
      setToasts((all) => [...all.slice(-2), { ...t, id }])
      window.setTimeout(() => dismiss(id), ms)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[2000] flex flex-col items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl px-4 py-3 shadow-lg ring-1 ${
              t.kind === 'danger'
                ? 'bg-red-600 text-white ring-red-700'
                : t.kind === 'success'
                  ? 'bg-white text-slate-900 ring-emerald-200'
                  : 'bg-white text-slate-900 ring-slate-200'
            }`}
          >
            {t.kind === 'danger' ? (
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
            ) : t.kind === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            ) : (
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-tight">{t.title}</p>
              {t.body && <p className={`mt-0.5 text-sm ${t.kind === 'danger' ? 'text-red-50' : 'text-slate-600'}`}>{t.body}</p>}
            </div>
            <button aria-label="Fechar" onClick={() => dismiss(t.id)} className="-mr-1 rounded-full p-1 opacity-70 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast fora do ToastProvider')
  return ctx
}
