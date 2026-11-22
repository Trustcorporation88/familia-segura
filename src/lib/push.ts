import { supabase } from './supabase'

/** Chave pública VAPID: é pública por natureza (vai para o navegador). A privada fica no Vault do Supabase. */
export const VAPID_PUBLIC_KEY = 'BKAayjPsiowDDl0tLJEqB3bHNhvAizKfwutG9fkKG_VtZn7ShGiDU65IYaWUVxLn4HDFBwikKMNCrObFmewVi2Q'

export type PushState = 'unsupported' | 'ios_not_installed' | 'default' | 'denied' | 'granted'

const isIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export function pushState(): PushState {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
    return isIos() && !isStandalone() ? 'ios_not_installed' : 'unsupported'
  }
  if (isIos() && !isStandalone()) return 'ios_not_installed'
  return Notification.permission
}

function toKey(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function save(uid: string, sub: PushSubscription) {
  const j = sub.toJSON()
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) throw new Error('assinatura incompleta')
  const { error } = await supabase.from('push_subscriptions').upsert(
    { endpoint: j.endpoint, user_id: uid, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: navigator.userAgent.slice(0, 200) },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
}

/** Pede permissão (se precisar) e registra este aparelho para receber push. */
export async function enablePush(uid: string): Promise<PushState> {
  const state = pushState()
  if (state === 'unsupported' || state === 'ios_not_installed' || state === 'denied') return state
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC_KEY) as BufferSource }))
  await save(uid, sub)
  return 'granted'
}

/** Ao abrir o app: se já tem permissão, garante que a assinatura está salva (ela pode mudar). */
export async function ensurePush(uid: string) {
  if (pushState() !== 'granted') return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC_KEY) as BufferSource }))
    await save(uid, sub)
  } catch (e) {
    console.error('[push]', e)
  }
}

/** Ao sair da conta: este aparelho para de receber push desta pessoa. */
export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  } catch (e) {
    console.error('[push]', e)
  }
}
