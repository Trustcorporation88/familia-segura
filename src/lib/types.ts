/** Datas chegam do Supabase como texto ISO 8601. */
export type Ts = string

export interface UserProfile {
  uid: string
  name: string
  email: string
  phone: string
  color: string
  circleId: string | null
}

export interface Circle {
  id: string
  name: string
  ownerId: string
  members: string[]
  inviteCode: string
}

export interface MemberLocation {
  uid: string
  name: string
  color: string
  lat: number | null
  lng: number | null
  accuracy: number | null
  battery: number | null
  charging: boolean | null
  sharing: boolean
  updatedAt: Ts | null
}

export interface Place {
  id: string
  name: string
  emoji: string
  lat: number
  lng: number
  radius: number
  createdBy: string | null
}

export type CircleEventType = 'arrive' | 'leave' | 'sos'

export interface CircleEvent {
  id: string
  type: CircleEventType
  uid: string
  name: string
  placeId: string | null
  placeName: string | null
  lat: number | null
  lng: number | null
  ts: Ts | null
}

export interface HistoryPoint {
  id: number
  uid: string
  lat: number
  lng: number
  ts: Ts
}

export interface Share {
  id: string
  uid: string
  name: string
  color: string
  lat: number | null
  lng: number | null
  updatedAt: Ts | null
  expiresAt: Ts
}

export interface LatLng {
  lat: number
  lng: number
}
