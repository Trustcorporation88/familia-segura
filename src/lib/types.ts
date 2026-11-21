import type { Timestamp } from 'firebase/firestore'

export interface UserProfile {
  uid: string
  name: string
  email: string
  phone: string
  color: string
  circleId: string | null
  createdAt?: Timestamp
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
  updatedAt: Timestamp | null
}

export interface Place {
  id: string
  name: string
  emoji: string
  lat: number
  lng: number
  radius: number
  createdBy: string
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
  ts: Timestamp | null
}

export interface HistoryPoint {
  id: string
  uid: string
  lat: number
  lng: number
  ts: Timestamp
}

export interface Share {
  id: string
  uid: string
  name: string
  color: string
  lat: number | null
  lng: number | null
  updatedAt: Timestamp | null
  expiresAt: Timestamp
}

export interface LatLng {
  lat: number
  lng: number
}
