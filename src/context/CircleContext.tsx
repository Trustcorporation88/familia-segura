import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { watchCheckins, watchCircle, watchEvents, watchLocations, watchPlaces } from '../lib/api'
import type { Checkin, Circle, CircleEvent, MemberLocation, Place, UserProfile } from '../lib/types'

interface CircleState {
  circle: Circle | null
  members: MemberLocation[]
  places: Place[]
  events: CircleEvent[]
  /** Chegadas combinadas em aberto (ativas ou atrasadas) */
  checkins: Checkin[]
  /** A minha, se houver */
  myCheckin: Checkin | null
  me: MemberLocation | null
  ready: boolean
}

const CircleContext = createContext<CircleState | null>(null)

export function CircleProvider({ profile, children }: { profile: UserProfile; children: ReactNode }) {
  const circleId = profile.circleId
  const [circle, setCircle] = useState<Circle | null>(null)
  const [locations, setLocations] = useState<MemberLocation[]>([])
  const [places, setPlaces] = useState<Place[]>([])
  const [events, setEvents] = useState<CircleEvent[]>([])
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!circleId) return
    setReady(false)
    const subs = [
      watchCircle(
        circleId,
        (c) => {
          setCircle(c)
          setReady(true)
        },
        () => setReady(true),
      ),
      watchLocations(circleId, setLocations),
      watchPlaces(circleId, setPlaces),
      watchEvents(circleId, setEvents),
      watchCheckins(circleId, setCheckins),
    ]
    return () => subs.forEach((u) => u())
  }, [circleId])

  const value = useMemo<CircleState>(() => {
    // Só mostra quem ainda faz parte do círculo.
    const memberSet = new Set(circle?.members ?? [])
    const members = locations
      .filter((l) => memberSet.has(l.uid))
      .sort((a, b) => (a.uid === profile.uid ? -1 : b.uid === profile.uid ? 1 : a.name.localeCompare(b.name)))
    return {
      circle,
      members,
      places,
      events,
      checkins: checkins.filter((c) => memberSet.has(c.uid)),
      myCheckin: checkins.find((c) => c.uid === profile.uid) ?? null,
      me: members.find((m) => m.uid === profile.uid) ?? null,
      ready,
    }
  }, [circle, locations, places, events, checkins, ready, profile.uid])

  return <CircleContext.Provider value={value}>{children}</CircleContext.Provider>
}

export function useCircle() {
  const ctx = useContext(CircleContext)
  if (!ctx) throw new Error('useCircle fora do CircleProvider')
  return ctx
}
