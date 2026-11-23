// Integração com o app instalado (Android/iOS via Capacitor).
// No navegador nada disto é usado: isNativeApp() é false e o código segue o caminho web.
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core'
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation'
import { LocalNotifications } from '@capacitor/local-notifications'

export const isNativeApp = () => Capacitor.isNativePlatform()

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation')

export interface NativeFix { lat: number; lng: number; accuracy: number }

/**
 * Observa a localização mesmo com o app em segundo plano ou a tela bloqueada.
 * No Android isso roda num serviço em primeiro plano, com notificação fixa
 * (exigência do sistema). Devolve uma função que para o rastreamento.
 */
export function startBackgroundWatch(
  onFix: (fix: NativeFix) => void,
  onError: (denied: boolean) => void,
): () => void {
  let id: string | null = null
  let stopped = false
  BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: 'Família Segura',
      backgroundMessage: 'Compartilhando sua localização com a família.',
      requestPermissions: true,
      stale: false,
      distanceFilter: 10,
    },
    (location, error) => {
      if (stopped) return
      if (error) {
        const denied = error.code === 'NOT_AUTHORIZED'
        onError(denied)
        if (denied && window.confirm('O Família Segura precisa da sua localização. Abrir as configurações agora?')) {
          void BackgroundGeolocation.openSettings()
        }
        return
      }
      if (location) onFix({ lat: location.latitude, lng: location.longitude, accuracy: Math.round(location.accuracy) })
    },
  ).then((watcherId) => {
    if (stopped) void BackgroundGeolocation.removeWatcher({ id: watcherId })
    else id = watcherId
  }).catch(() => { if (!stopped) onError(false) })
  return () => {
    stopped = true
    if (id) void BackgroundGeolocation.removeWatcher({ id })
  }
}

/**
 * fetch que usa a pilha HTTP nativa. O Android limita requisições feitas pelo
 * WebView depois de alguns minutos em segundo plano; pela via nativa os envios
 * de localização continuam saindo com a tela bloqueada.
 */
export async function nativeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = new Request(input, init)
  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => { headers[key] = value })
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  const body = hasBody ? await req.text() : undefined
  const res = await CapacitorHttp.request({
    url: req.url,
    method: req.method,
    headers,
    data: body || undefined,
    responseType: 'text',
    connectTimeout: 20_000,
    readTimeout: 30_000,
  })
  const text = res.data == null ? '' : typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
  const noBody = res.status === 204 || res.status === 205 || res.status === 304
  return new Response(noBody ? null : text, { status: res.status, headers: res.headers })
}

/** Pede permissão para notificações no app instalado (Android 13+ exige). */
export async function requestNativeNotifications(): Promise<boolean> {
  try {
    const current = await LocalNotifications.checkPermissions()
    if (current.display === 'granted') return true
    const asked = await LocalNotifications.requestPermissions()
    return asked.display === 'granted'
  } catch {
    return false
  }
}

let notificationSeq = 1
/** Mostra uma notificação do sistema a partir do app instalado. */
export async function showNativeNotification(title: string, body?: string) {
  try {
    await LocalNotifications.schedule({
      notifications: [{ id: notificationSeq++ % 2_000_000_000, title, body: body ?? '' }],
    })
  } catch (error) {
    console.error(error)
  }
}

/** No Android, abrir este endereço leva ao app do Google Maps. */
export const GOOGLE_MAPS_URL = 'https://www.google.com/maps'

/**
 * Abre um link fora do app. No app instalado, navegar para um endereço externo
 * faz o Android entregar o link ao app certo (ex.: Google Maps).
 */
export function openExternal(url: string) {
  if (isNativeApp()) window.location.href = url
  else window.open(url, '_blank', 'noopener,noreferrer')
}
