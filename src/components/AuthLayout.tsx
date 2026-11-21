import type { ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-gradient-to-b from-brand-50 via-white to-white">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-8 pt-[max(2.5rem,env(safe-area-inset-top))]">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <div>
            <p className="text-lg font-bold leading-tight text-slate-900">Família Segura</p>
            <p className="text-sm text-slate-500">Todo mundo junto, mesmo longe</p>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
        <p className="mt-1 text-slate-600">{subtitle}</p>

        <div className="mt-8 flex-1">{children}</div>

        {footer && <div className="mt-8 text-center text-sm text-slate-600">{footer}</div>}
      </div>
    </div>
  )
}
