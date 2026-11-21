import { createClient } from '@supabase/supabase-js'

// URL e chave "publishable" são públicas por natureza (vão para o navegador).
// A segurança vem das políticas RLS do banco (ver supabase/migrations).
// Dá para sobrescrever pelas variáveis VITE_SUPABASE_URL / VITE_SUPABASE_KEY.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://otaecjtrkyfzydimnydj.supabase.co'
const key = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_KReVsDNFrSGmN8tZuPRj_w_n0fHkg4n'

export const backendConfigured = Boolean(url && key)

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 5 } },
})
