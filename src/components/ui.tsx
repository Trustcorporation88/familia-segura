import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-sm shadow-brand-600/30',
  secondary: 'bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50',
  ghost: 'bg-transparent text-brand-700 hover:bg-brand-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  full?: boolean
}

export function Button({ variant = 'primary', loading, full, className = '', children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
        variants[variant]
      } ${full ? 'w-full' : ''} ${className}`}
    >
      {loading && <Loader2 className="h-5 w-5 animate-spin" />}
      {children}
    </button>
  )
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  icon?: ReactNode
  hint?: string
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, icon, hint, id, className = '', ...rest }, ref) {
  const inputId = id ?? rest.name
  return (
    <label htmlFor={inputId} className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <span className="relative block">
        {icon && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>}
        <input
          ref={ref}
          id={inputId}
          {...rest}
          className={`block w-full rounded-xl border border-slate-300 bg-white py-3 text-base text-slate-900 placeholder:text-slate-400 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${
            icon ? 'pl-11 pr-4' : 'px-4'
          } ${className}`}
        />
      </span>
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
})

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-slate-500">
      <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  )
}

export function FullScreenSpinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50">
      <Spinner label={label} />
    </div>
  )
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="truncate text-sm text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 ${className}`}>{children}</div>
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
      {children}
    </p>
  )
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">{icon}</div>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
