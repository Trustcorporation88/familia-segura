import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  addHistoryPoint,
  finishCheckin,
  pushEvent,
  updateShareLocation,
  watchMyShares,
  writeLocation,
} from '../lib/api'
import { evaluateGeofences, isInsidePlace, metersBetween, type PlaceStates } from '../lib/geo'
import { ms } from '../lib/format'
import type { Checkin, LatLng, Place, Share, UserProfile } from '../lib/types'

export type TrackerStatus = 'starting' | 'active' | 'paused' | 'denied' | 'unsupported' | 'error'
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

interface TrackerState {
  status: TrackerStatus
  syncStatus: SyncStatus
  /** Client time of the last acknowledged circle-location write, never a GPS fix time. */
  syncedAt: number | null
  position: (LatLng & { accuracy: number }) | null
  shares: Share[]
  retry: () => void
}

const TrackerContext = createContext<TrackerState | null>(null)

const LOCATION_MIN_METERS = 20
const LOCATION_MAX_MS = 60_000
const HISTORY_MIN_METERS = 75
const HISTORY_MAX_MS = 10 * 60_000

type WriteStamp = { pos: LatLng; at: number }

interface BatteryLike {
  level: number
  charging: boolean
}

async function readBattery(): Promise<{ battery: number | null; charging: boolean | null }> {
  try {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> }
    if (!nav.getBattery) return { battery: null, charging: null }
    const b = await nav.getBattery()
    return { battery: Math.round(b.level * 100), charging: b.charging }
  } catch {
    return { battery: null, charging: null }
  }
}

function loadPlaceStates(key: string): PlaceStates {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}') as PlaceStates
  } catch {
    return {}
  }
}

function savePlaceStates(key: string, s: PlaceStates) {
  // Storage being disabled/full must not stop GPS synchronization.
  try {
    localStorage.setItem(key, JSON.stringify(s))
  } catch { /* Keep the session's in-memory state. */ }
}

export function TrackerProvider({
  profile,
  circleId,
  places,
  sharing,
  checkin,
  children,
}: {
  profile: UserProfile
  circleId: string
  places: Place[]
  sharing: boolean
  checkin: Checkin | null
  children: ReactNode
}) {
  const [status, setStatus] = useState<TrackerStatus>('starting')
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [syncedAt, setSyncedAt] = useState<number | null>(null)
  const [position, setPosition] = useState<TrackerState['position']>(null)
  const [shares, setShares] = useState<Share[]>([])
  const [attempt, setAttempt] = useState(0)
  const placesRef = useRef(places)
  const sharesRef = useRef(shares)
  const profileRef = useRef(profile)
  const checkinRef = useRef(checkin)
  checkinRef.current = checkin
  placesRef.current = places
  profileRef.current = profile

  useEffect(() => {
    let alive = true
    sharesRef.current = []
    setShares([])
    const stop = watchMyShares(profile.uid, (list) => {
      if (!alive) return
      sharesRef.current = list
      setShares(list)
    })
    return () => { alive = false; stop() }
  }, [profile.uid, circleId])

  useEffect(() => {
    // All write/deduplication state belongs to this user/circle/watch session.
    // Cleanup invalidates both queued GPS callbacks and continuations after await.
    let alive = true
    let running = false
    let latest: TrackerState['position'] = null
    let revision = 0
    let lastLocWrite: WriteStamp | null = null
    let lastHistWrite: WriteStamp | null = null
    const shareWrites = new Map<string, WriteStamp>()
    let finishedCheckin: string | null = null
    let failures = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let forceLocation = false
    const stateKey = `fs:places:${profile.uid}:${circleId}`
    let placeStates = loadPlaceStates(stateKey)
    setPosition(null)
    setSyncedAt(null)
    setSyncStatus('idle')

    if (!sharing) {
      setStatus('paused')
      return () => { alive = false }
    }
    if (!('geolocation' in navigator)) {
      setStatus('unsupported')
      return () => { alive = false }
    }

    const due = (stamp: WriteStamp | null | undefined, pos: LatLng, meters: number, maxMs: number) =>
      !stamp || metersBetween(stamp.pos, pos) >= meters || Date.now() - stamp.at >= maxMs

    const schedule = (delay: number) => {
      clearTimeout(timer)
      timer = setTimeout(() => { if (alive) void flush() }, delay)
    }

    async function flush() {
      if (!alive || running || !latest) return
      clearTimeout(timer)
      running = true
      const pos = latest
      const processedRevision = revision
      const me = profileRef.current
      let failed = false
      setSyncStatus('syncing')
      // A failed auxiliary write must not suppress other independent writes.
      const write = async (operation: () => Promise<unknown>, success: () => void) => {
        if (!alive) return
        try {
          await operation()
          if (alive) success()
        } catch (error) {
          if (alive) { failed = true; console.error(error) }
        }
      }

      try {
        if (forceLocation || due(lastLocWrite, pos, LOCATION_MIN_METERS, LOCATION_MAX_MS)) {
          const battery = await readBattery()
          if (!alive) return
          await write(
            () => writeLocation(circleId, me, { ...pos, ...battery }),
            () => {
              const at = Date.now()
              lastLocWrite = { pos, at }
              forceLocation = false
              setSyncedAt(at)
            },
          )
        }
        if (!alive) return
        for (const share of sharesRef.current) {
          if (!alive) return
          if (ms(share.expiresAt) > Date.now() && due(shareWrites.get(share.id), pos, LOCATION_MIN_METERS, LOCATION_MAX_MS)) {
            await write(
              () => updateShareLocation(share.id, pos.lat, pos.lng),
              () => { shareWrites.set(share.id, { pos, at: Date.now() }) },
            )
          }
        }
        if (!alive) return
        if (pos.accuracy <= 150 && due(lastHistWrite, pos, HISTORY_MIN_METERS, HISTORY_MAX_MS)) {
          await write(
            () => addHistoryPoint(circleId, me.uid, pos.lat, pos.lng),
            () => { lastHistWrite = { pos, at: Date.now() } },
          )
        }
        if (!alive) return
        const ck = checkinRef.current
        if (ck && (ck.status === 'active' || ck.status === 'late') && finishedCheckin !== ck.id && pos.accuracy <= 200) {
          const dest = placesRef.current.find((p) => p.id === ck.placeId)
          if (dest && isInsidePlace(pos, dest, pos.accuracy)) {
            await write(() => finishCheckin(ck.id, 'arrived'), () => { finishedCheckin = ck.id })
          }
        }
        if (!alive) return
        if (pos.accuracy <= 200 && placesRef.current.length > 0) {
          const { next, transitions } = evaluateGeofences(pos, pos.accuracy, placesRef.current, placeStates)
          const pending = new Set(transitions.map((t) => t.place.id))
          // Initialize/prune unchanged places, but commit transitions only after acknowledgement.
          placeStates = Object.fromEntries(Object.entries(next).map(([id, inside]) =>
            [id, pending.has(id) ? placeStates[id] : inside]))
          for (const t of transitions) {
            if (!alive) return
            await write(
              () => pushEvent(circleId, me, t.type, { placeId: t.place.id, placeName: t.place.name, lat: pos.lat, lng: pos.lng }),
              () => {
                placeStates[t.place.id] = next[t.place.id]
                savePlaceStates(stateKey, placeStates)
              },
            )
          }
          if (!alive) return
          savePlaceStates(stateKey, placeStates)
        }
      } catch (error) {
        if (alive) { failed = true; console.error(error) }
      } finally {
        running = false
        if (alive) {
          setSyncStatus(failed ? 'error' : 'synced')
          failures = failed ? failures + 1 : 0
          // Retain only the latest fix. Retry without waiting for a new GPS reading,
          // with capped backoff even if watchPosition keeps delivering fixes.
          if (failed) schedule(Math.min(5_000 * 2 ** Math.min(failures - 1, 4), 60_000))
          else if (revision !== processedRevision) schedule(0)
        }
      }
    }

    const refresh = () => {
      if (!alive || !latest) return
      forceLocation = true
      failures = 0
      if (!running) { clearTimeout(timer); void flush() }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    setStatus('starting')
    const id = navigator.geolocation.watchPosition(
      (geo) => {
        if (!alive) return
        latest = { lat: geo.coords.latitude, lng: geo.coords.longitude, accuracy: Math.round(geo.coords.accuracy) }
        revision += 1
        setPosition(latest)
        setStatus('active')
        if (!running && failures === 0) void flush()
      },
      (err) => {
        if (!alive) return
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error')
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
    )
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', refresh)
    return () => {
      alive = false
      clearTimeout(timer)
      navigator.geolocation.clearWatch(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', refresh)
    }
  }, [sharing, circleId, profile.uid, attempt])

  const value: TrackerState = {
    status,
    syncStatus,
    syncedAt,
    position,
    shares,
    retry: () => setAttempt((n) => n + 1),
  }

  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>
}

export function useTracker() {
  const ctx = useContext(TrackerContext)
  if (!ctx) throw new Error('useTracker fora do TrackerProvider')
  return ctx
}
