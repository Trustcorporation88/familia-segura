import { createClient } from '@supabase/supabase-js'
import { isNativeApp, nativeFetch } from './native'

// URL e chave "publishable" são públicas por natureza (vão para o navegador).
// A segurança vem das políticas RLS do banco (ver supabase/migrations).
// Dá para sobrescrever pelas variáveis VITE_SUPABASE_URL / VITE_SUPABASE_KEY.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://otaecjtrkyfzydimnydj.supabase.co'
const key = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_KReVsDNFrSGmN8tZuPRj_w_n0fHkg4n'

/** Endereço e chave pública do projeto (usados também pelo Atalho do iPhone). */
export const SUPABASE_URL = url
export const SUPABASE_KEY = key

export const backendConfigured = Boolean(url && key)

export const supabase = createClient(url, key, {
  // No app instalado, as chamadas HTTP saem pela pilha nativa (continuam em segundo plano).
  global: isNativeApp() ? { fetch: nativeFetch } : undefined,
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: !isNativeApp() },
  realtime: { params: { eventsPerSecond: 5 } },
})
