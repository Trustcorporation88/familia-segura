import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { makeToken } from './format'
import type {
  Checkin,
  CheckinStatus,
  Circle,
  CircleEvent,
  CircleEventType,
  HistoryPoint,
  MemberLocation,
  Place,
  Share,
  UserProfile,
} from './types'

export type Unsubscribe = () => void

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error
  return res.data
}

/**
 * Assina mudanças de uma tabela (filtrada) e recarrega os dados a cada evento.
 * Recarregar é simples e à prova de falhas: as listas aqui são pequenas.
 */
function live<T>(
  channelName: string,
  tables: { table: string; filter?: string }[],
  load: () => Promise<T>,
  cb: (v: T) => void,
): Unsubscribe {
  let alive = true
  let timer: number | undefined
  const run = () => {
    load()
      .then((v) => alive && cb(v))
      .catch((e) => console.error(`[${channelName}]`, e))
  }
  const schedule = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(run, 150)
  }
  let channel: RealtimeChannel = supabase.channel(`${channelName}:${Math.random().toString(36).slice(2)}`)
  for (const t of tables) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: t.table, ...(t.filter ? { filter: t.filter } : {}) }, schedule)
  }
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') run()
  })
  run()
  // Ao voltar para o app, garante dados frescos (o celular pode ter dormido).
  const onVisible = () => document.visibilityState === 'visible' && run()
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    alive = false
    window.clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisible)
    supabase.removeChannel(channel)
  }
}

/* ---------- Perfil ---------- */

type ProfileRow = { id: string; name: string; email: string; phone: string; color: string; circle_id: string | null }

const toProfile = (r: ProfileRow): UserProfile => ({
  uid: r.id,
  name: r.name,
  email: r.email,
  phone: r.phone,
  color: r.color,
  circleId: r.circle_id,
})

export async function fetchProfile(uid: string): Promise<UserProfile | null> {
  const data = check(await supabase.from('profiles').select('*').eq('id', uid).maybeSingle())
  return data ? toProfile(data as ProfileRow) : null
}

export function watchProfile(uid: string, cb: (p: UserProfile | null) => void): Unsubscribe {
  return live('profile', [{ table: 'profiles', filter: `id=eq.${uid}` }], () => fetchProfile(uid), cb)
}

export async function updateProfile(uid: string, patch: { name?: string; phone?: string; color?: string }) {
  check(await supabase.from('profiles').update(patch).eq('id', uid))
}

/* ---------- Círculo ---------- */

export async function createCircle(_profile: UserProfile, name: string): Promise<string> {
  return check(await supabase.rpc('create_circle', { p_name: name })) as string
}

export async function joinCircle(_profile: UserProfile, rawCode: string): Promise<string> {
  const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (code.length !== 6) throw new Error('O código tem 6 caracteres.')
  return check(await supabase.rpc('join_circle', { p_code: code })) as string
}

export async function leaveCircle(_profile: UserProfile, circle: Circle) {
  check(await supabase.rpc('leave_circle', { p_circle: circle.id }))
}

export async function renameCircle(circleId: string, name: string) {
  check(await supabase.from('circles').update({ name: name.trim().slice(0, 40) }).eq('id', circleId))
}

async function fetchCircle(circleId: string): Promise<Circle | null> {
  const [c, m] = await Promise.all([
    supabase.from('circles').select('id,name,owner_id,invite_code').eq('id', circleId).maybeSingle(),
    supabase.from('circle_members').select('user_id').eq('circle_id', circleId),
  ])
  const circle = check(c) as { id: string; name: string; owner_id: string; invite_code: string } | null
  const members = (check(m) as { user_id: string }[]) ?? []
  if (!circle) return null
  return {
    id: circle.id,
    name: circle.name,
    ownerId: circle.owner_id,
    inviteCode: circle.invite_code,
    members: members.map((x) => x.user_id),
  }
}

export function watchCircle(circleId: string, cb: (c: Circle | null) => void, onError?: (e: Error) => void): Unsubscribe {
  return live(
    'circle',
    [
      { table: 'circles', filter: `id=eq.${circleId}` },
      { table: 'circle_members', filter: `circle_id=eq.${circleId}` },
    ],
    () =>
      fetchCircle(circleId).catch((e) => {
        onError?.(e)
        return null
      }),
    cb,
  )
}

/* ---------- Localização ---------- */

type LocationRow = {
  user_id: string
  name: string
  color: string
  lat: number | null
  lng: number | null
  accuracy: number | null
  battery: number | null
  charging: boolean | null
  sharing: boolean
  updated_at: string | null
}

export function watchLocations(circleId: string, cb: (list: MemberLocation[]) => void): Unsubscribe {
  return live(
    'locations',
    [{ table: 'locations', filter: `circle_id=eq.${circleId}` }],
    async () => {
      const rows = check(await supabase.from('locations').select('*').eq('circle_id', circleId)) as LocationRow[]
      return rows.map((r) => ({
        uid: r.user_id,
        name: r.name,
        color: r.color,
        lat: r.lat,
        lng: r.lng,
        accuracy: r.accuracy,
        battery: r.battery,
        charging: r.charging,
        sharing: r.sharing,
        updatedAt: r.updated_at,
      }))
    },
    cb,
  )
}

export async function writeLocation(
  circleId: string,
  profile: UserProfile,
  data: { lat: number; lng: number; accuracy: number; battery: number | null; charging: boolean | null },
) {
  check(
    await supabase.from('locations').upsert(
      {
        circle_id: circleId,
        user_id: profile.uid,
        name: profile.name,
        color: profile.color,
        ...data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'circle_id,user_id' },
    ),
  )
}

export async function setSharing(circleId: string, uid: string, sharing: boolean) {
  check(await supabase.from('locations').update({ sharing }).eq('circle_id', circleId).eq('user_id', uid))
}

export async function addHistoryPoint(circleId: string, uid: string, lat: number, lng: number) {
  check(await supabase.from('history').insert({ circle_id: circleId, user_id: uid, lat, lng }))
}

export async function loadHistory(circleId: string, uid: string, start: Date, end: Date): Promise<HistoryPoint[]> {
  const rows = check(
    await supabase
      .from('history')
      .select('id,user_id,lat,lng,ts')
      .eq('circle_id', circleId)
      .eq('user_id', uid)
      .gte('ts', start.toISOString())
      .lt('ts', end.toISOString())
      .order('ts', { ascending: true })
      .limit(2000),
  ) as { id: number; user_id: string; lat: number; lng: number; ts: string }[]
  return rows.map((r) => ({ id: r.id, uid: r.user_id, lat: r.lat, lng: r.lng, ts: r.ts }))
}

/* ---------- Lugares (cercas) ---------- */

export function watchPlaces(circleId: string, cb: (list: Place[]) => void): Unsubscribe {
  return live(
    'places',
    [{ table: 'places', filter: `circle_id=eq.${circleId}` }],
    async () => {
      const rows = check(await supabase.from('places').select('*').eq('circle_id', circleId).order('name')) as {
        id: string
        name: string
        emoji: string
        lat: number
        lng: number
        radius: number
        created_by: string | null
      }[]
      return rows.map((r) => ({ id: r.id, name: r.name, emoji: r.emoji, lat: r.lat, lng: r.lng, radius: r.radius, createdBy: r.created_by }))
    },
    cb,
  )
}

export async function savePlace(circleId: string, place: Omit<Place, 'id'>, id?: string) {
  const row = {
    circle_id: circleId,
    name: place.name,
    emoji: place.emoji,
    lat: place.lat,
    lng: place.lng,
    radius: Math.round(place.radius),
    created_by: place.createdBy,
  }
  if (id) check(await supabase.from('places').update(row).eq('id', id))
  else check(await supabase.from('places').insert(row))
}

export async function deletePlace(_circleId: string, id: string) {
  check(await supabase.from('places').delete().eq('id', id))
}

/* ---------- Alertas ---------- */

export function watchEvents(circleId: string, cb: (list: CircleEvent[]) => void): Unsubscribe {
  return live(
    'events',
    [{ table: 'events', filter: `circle_id=eq.${circleId}` }],
    async () => {
      const rows = check(
        await supabase.from('events').select('*').eq('circle_id', circleId).order('ts', { ascending: false }).limit(50),
      ) as {
        id: string
        type: CircleEventType
        user_id: string
        name: string
        place_id: string | null
        place_name: string | null
        lat: number | null
        lng: number | null
        ts: string
        due_at: string | null
      }[]
      return rows.map((r) => ({
        id: r.id,
        type: r.type,
        uid: r.user_id,
        name: r.name,
        placeId: r.place_id,
        placeName: r.place_name,
        lat: r.lat,
        lng: r.lng,
        ts: r.ts,
        dueAt: r.due_at,
      }))
    },
    cb,
  )
}

export async function pushEvent(
  circleId: string,
  profile: UserProfile,
  type: CircleEventType,
  extra: { placeId?: string; placeName?: string; lat?: number | null; lng?: number | null } = {},
) {
  check(
    await supabase.from('events').insert({
      circle_id: circleId,
      type,
      user_id: profile.uid,
      name: profile.name,
      place_id: extra.placeId ?? null,
      place_name: extra.placeName ?? null,
      lat: extra.lat ?? null,
      lng: extra.lng ?? null,
    }),
  )
}

/* ---------- Chegada combinada ---------- */

export function watchCheckins(circleId: string, cb: (list: Checkin[]) => void): Unsubscribe {
  return live(
    'checkins',
    [{ table: 'checkins', filter: `circle_id=eq.${circleId}` }],
    async () => {
      const since = new Date(Date.now() - 12 * 3600_000).toISOString()
      const rows = check(
        await supabase
          .from('checkins')
          .select('*')
          .eq('circle_id', circleId)
          .in('status', ['active', 'late'])
          .gte('created_at', since)
          .order('due_at'),
      ) as {
        id: string
        user_id: string
        name: string
        place_id: string | null
        place_name: string
        due_at: string
        grace_minutes: number
        status: CheckinStatus
        created_at: string
      }[]
      return rows.map((r) => ({
        id: r.id,
        uid: r.user_id,
        name: r.name,
        placeId: r.place_id,
        placeName: r.place_name,
        dueAt: r.due_at,
        graceMinutes: r.grace_minutes,
        status: r.status,
        createdAt: r.created_at,
      }))
    },
    cb,
  )
}

export async function startCheckin(placeId: string, due: Date, graceMinutes = 10): Promise<string> {
  return check(await supabase.rpc('start_checkin', { p_place: placeId, p_due: due.toISOString(), p_grace: graceMinutes })) as string
}

export async function finishCheckin(id: string, status: 'arrived' | 'cancelled') {
  check(await supabase.rpc('finish_checkin', { p_id: id, p_status: status }))
}

export async function extendCheckin(id: string, minutes: number) {
  check(await supabase.rpc('extend_checkin', { p_id: id, p_minutes: minutes }))
}

/* ---------- Link temporário ---------- */

type ShareRow = {
  id: string
  user_id?: string
  name: string
  color: string
  lat: number | null
  lng: number | null
  updated_at: string | null
  expires_at: string
}

const toShare = (r: ShareRow): Share => ({
  id: r.id,
  uid: r.user_id ?? '',
  name: r.name,
  color: r.color,
  lat: r.lat,
  lng: r.lng,
  updatedAt: r.updated_at,
  expiresAt: r.expires_at,
})

export async function createShare(profile: UserProfile, minutes: number, pos: { lat: number; lng: number } | null): Promise<string> {
  const token = makeToken()
  check(
    await supabase.from('shares').insert({
      id: token,
      user_id: profile.uid,
      name: profile.name,
      color: profile.color,
      lat: pos?.lat ?? null,
      lng: pos?.lng ?? null,
      updated_at: pos ? new Date().toISOString() : null,
      expires_at: new Date(Date.now() + minutes * 60_000).toISOString(),
    }),
  )
  return token
}

export function watchMyShares(uid: string, cb: (list: Share[]) => void): Unsubscribe {
  return live(
    'shares',
    [{ table: 'shares', filter: `user_id=eq.${uid}` }],
    async () => {
      const rows = check(await supabase.from('shares').select('*').eq('user_id', uid).order('expires_at', { ascending: false })) as ShareRow[]
      return rows.map(toShare)
    },
    cb,
  )
}

export async function updateShareLocation(token: string, lat: number, lng: number) {
  check(await supabase.from('shares').update({ lat, lng, updated_at: new Date().toISOString() }).eq('id', token))
}

export async function deleteShare(token: string) {
  check(await supabase.from('shares').delete().eq('id', token))
}

/** Página pública: sem login, lê pelo RPC (não dá para listar links). Atualiza a cada 15 s. */
export function watchShare(token: string, cb: (s: Share | null) => void): Unsubscribe {
  let alive = true
  const load = async () => {
    const { data, error } = await supabase.rpc('get_share', { p_token: token })
    if (!alive) return
    if (error) {
      console.error(error)
      cb(null)
      return
    }
    const row = (data as ShareRow[] | null)?.[0]
    cb(row ? toShare(row) : null)
  }
  void load()
  const t = window.setInterval(load, 15_000)
  return () => {
    alive = false
    window.clearInterval(t)
  }
}

export function shareUrl(token: string) {
  return `${window.location.origin}/s/${token}`
}
