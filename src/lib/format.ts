import { formatDistanceToNowStrict, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Ts } from './types'

export function tsToDate(ts: Ts | null | undefined): Date | null {
  if (!ts) return null
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Milissegundos de uma data ISO (0 se vazia). */
export function ms(ts: Ts | null | undefined): number {
  return tsToDate(ts)?.getTime() ?? 0
}

export function timeAgo(ts: Ts | null | undefined): string {
  const d = tsToDate(ts)
  if (!d) return 'sem atualização'
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'agora mesmo'
  return `há ${formatDistanceToNowStrict(d, { locale: ptBR })}`
}

export function isStale(ts: Ts | null | undefined, minutes = 30): boolean {
  const d = tsToDate(ts)
  if (!d) return true
  return Date.now() - d.getTime() > minutes * 60_000
}

export function hourMinute(ts: Ts | Date | null | undefined): string {
  const d = ts instanceof Date ? ts : tsToDate(ts ?? null)
  return d ? format(d, 'HH:mm') : '--:--'
}

export function dayLabel(d: Date): string {
  return format(d, "EEEE, d 'de' MMMM", { locale: ptBR })
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

export const MEMBER_COLORS = [
  '#7c3aed',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#14b8a6',
  '#6366f1',
]

export function randomColor(): string {
  return MEMBER_COLORS[Math.floor(Math.random() * MEMBER_COLORS.length)]
}

/** Código de convite fácil de ditar (sem 0/O, 1/I). */
export function makeInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

/** Token longo e imprevisível para links públicos. */
export function makeToken(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 28)
}

export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  const map: Record<string, string> = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/user-not-found': 'Não existe conta com esse e-mail.',
    'auth/wrong-password': 'Senha incorreta.',
    'auth/email-already-in-use': 'Já existe uma conta com esse e-mail.',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/too-many-requests': 'Muitas tentativas. Espere um pouco e tente de novo.',
    'auth/network-request-failed': 'Sem conexão. Verifique sua internet.',
    // Supabase Auth
    invalid_credentials: 'E-mail ou senha incorretos.',
    email_not_confirmed: 'Confirme seu e-mail pelo link que enviamos antes de entrar.',
    user_already_exists: 'Já existe uma conta com esse e-mail.',
    email_exists: 'Já existe uma conta com esse e-mail.',
    weak_password: 'A senha precisa ter pelo menos 6 caracteres.',
    over_email_send_rate_limit: 'Muitos e-mails enviados. Espere alguns minutos e tente de novo.',
    over_request_rate_limit: 'Muitas tentativas. Espere um pouco e tente de novo.',
    email_address_invalid: 'E-mail inválido.',
    validation_failed: 'Confira os dados digitados.',
  }
  if (map[code]) return map[code]
  const msg = (err as { message?: string })?.message ?? ''
  if (/fetch|network/i.test(msg)) return 'Sem conexão. Verifique sua internet.'
  return 'Algo deu errado. Tente novamente.'
}

/** Mensagem amigável para erros do banco (nunca mostra o texto técnico em inglês). */
export function dataErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  const msg = (err as { message?: string })?.message ?? ''
  if (msg.includes('invalid_code')) return 'Código não encontrado. Confira com quem te convidou.'
  if (msg.includes('profile_missing')) return 'Seu perfil ainda não foi criado. Saia e entre de novo.'
  if (code === '42501' || code === 'PGRST301' || /row-level security|permission/i.test(msg)) return 'Sem permissão para isso. Tente sair e entrar de novo.'
  if (/fetch|network/i.test(msg)) return 'Sem conexão com o servidor. Verifique sua internet.'
  if (code === 'permission-denied') return 'Sem permissão para salvar. Tente de novo em instantes; se continuar, avise quem administra o app.'
  if (code === 'unavailable' || code === 'deadline-exceeded') return 'Sem conexão com o servidor. Verifique sua internet.'
  if (code) return 'Algo deu errado. Tente novamente.'
  return err instanceof Error && err.message ? err.message : 'Algo deu errado. Tente novamente.'
}
