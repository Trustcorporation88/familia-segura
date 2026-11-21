import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  addHistoryPoint,
  pushEvent,
  updateShareLocation,
  watchMyShares,
  writeLocation,
} from '../lib/api'
import { evaluateGeofences, metersBetween, type PlaceStates } from '../lib/geo'
import { ms } from '../lib/format'
import type { LatLng, Place, Share, UserProfile } from '../lib/types'

export type TrackerStatus = 'starting' | 'active' | 'paused' | 'denied' | 'unsupported' | 'error'

interface TrackerState {
  status: TrackerStatus
  position: (LatLng & { accuracy: number }) | null
  shares: Share[]
  retry: () => void
}

const TrackerContext = createContext<TrackerState | null>(null)

// Intervalos de escrita (economiza bateria e banco).
const LOCATION_MIN_METERS = 20
const LOCATION_MAX_MS = 60_000
const HISTORY_MIN_METERS = 75
const HISTORY_MAX_MS = 10 * 60_000

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

function loadPlaceStates(uid: string): PlaceStates {
  try {
    return JSON.parse(localStorage.getItem(`fs:places:${uid}`) || '{}') as PlaceStates
  } catch {
    return {}
  }
}

function savePlaceStates(uid: string, s: PlaceStates) {
  localStorage.setItem(`fs:places:${uid}`, JSON.stringify(s))
}

export function TrackerProvider({
  profile,
  circleId,
  places,
  sharing,
  children,
}: {
  profile: UserProfile
  circleId: string
  places: Place[]
  sharing: boolean
  children: ReactNode
}) {
  const [status, setStatus] = useState<TrackerStatus>('starting')
  const [position, setPosition] = useState<TrackerState['position']>(null)
  const [shares, setShares] = useState<Share[]>([])
  const [attempt, setAttempt] = useState(0)

  const lastLocWrite = useRef<{ pos: LatLng; at: number } | null>(null)
  const lastHistWrite = useRef<{ pos: LatLng; at: number } | null>(null)
  const placesRef = useRef(places)
  const sharesRef = useRef(shares)
  const profileRef = useRef(profile)
  placesRef.current = places
  sharesRef.current = shares
  profileRef.current = profile

  useEffect(() => watchMyShares(profile.uid, setShares), [profile.uid])

  const handlePosition = useCallback(
    async (geo: GeolocationPosition) => {
      const pos = { lat: geo.coords.latitude, lng: geo.coords.longitude }
      const accuracy = Math.round(geo.coords.accuracy)
      setPosition({ ...pos, accuracy })
      setStatus('active')
      const now = Date.now()
      const me = profileRef.current

      // 1) Última localização no círculo
      const lw = lastLocWrite.current
      if (!lw || metersBetween(lw.pos, pos) >= LOCATION_MIN_METERS || now - lw.at >= LOCATION_MAX_MS) {
        lastLocWrite.current = { pos, at: now }
        const battery = await readBattery()
        writeLocation(circleId, me, { ...pos, accuracy, ...battery }).catch(console.error)

        // Links temporários ativos acompanham a mesma cadência
        for (const s of sharesRef.current) {
          if (ms(s.expiresAt) > now) updateShareLocation(s.id, pos.lat, pos.lng).catch(console.error)
        }
      }

      // 2) Histórico (trajeto do dia). Ignora leituras muito imprecisas.
      const hw = lastHistWrite.current
      if (accuracy <= 150 && (!hw || metersBetween(hw.pos, pos) >= HISTORY_MIN_METERS || now - hw.at >= HISTORY_MAX_MS)) {
        lastHistWrite.current = { pos, at: now }
        addHistoryPoint(circleId, me.uid, pos.lat, pos.lng).catch(console.error)
      }

      // 3) Cercas virtuais
      if (accuracy <= 200 && placesRef.current.length > 0) {
        const prev = loadPlaceStates(me.uid)
        const { next, transitions } = evaluateGeofences(pos, accuracy, placesRef.current, prev)
        savePlaceStates(me.uid, next)
        for (const t of transitions) {
          pushEvent(circleId, me, t.type, { placeId: t.place.id, placeName: t.place.name, ...pos }).catch(console.error)
        }
      }
    },
    [circleId],
  )

  useEffect(() => {
    if (!sharing) {
      setStatus('paused')
      return
    }
    if (!('geolocation' in navigator)) {
      setStatus('unsupported')
      return
    }
    setStatus('starting')
    const id = navigator.geolocation.watchPosition(
      (p) => void handlePosition(p),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setStatus('denied')
        else setStatus((s) => (s === 'active' ? s : 'error'))
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [sharing, handlePosition, attempt])

  // Ao voltar para o app, força uma atualização imediata.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') lastLocWrite.current = null
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const value: TrackerState = {
    status,
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
