const KEY = 'fs:inviteCode'

/** Guarda o código do link de convite até a pessoa terminar o cadastro (sobrevive ao e-mail de confirmação). */
export function rememberInviteCode(raw: string | null | undefined) {
  const code = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
  if (code.length === 6) localStorage.setItem(KEY, code)
}
export function pendingInviteCode(): string {
  return localStorage.getItem(KEY) ?? ''
}
export function clearInviteCode() {
  localStorage.removeItem(KEY)
}
export function inviteUrl(code: string) {
  return `${window.location.origin}/entrar/${code}`
}
