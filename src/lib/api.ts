import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  arrayRemove,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'
import { makeInviteCode, makeToken } from './format'
import type {
  Circle,
  CircleEvent,
  CircleEventType,
  HistoryPoint,
  MemberLocation,
  Place,
  Share,
  UserProfile,
} from './types'

/* ---------- Perfil ---------- */

export async function saveProfile(profile: Omit<UserProfile, 'createdAt'>) {
  await setDoc(doc(db, 'users', profile.uid), { ...profile, createdAt: serverTimestamp() }, { merge: true })
}

export function watchProfile(uid: string, cb: (p: UserProfile | null) => void): Unsubscribe {
  return onSnapshot(doc(db, 'users', uid), (snap) => {
    cb(snap.exists() ? ({ uid, ...snap.data() } as UserProfile) : null)
  })
}

/* ---------- Círculo ---------- */

export async function createCircle(profile: UserProfile, name: string): Promise<string> {
  const circleRef = doc(collection(db, 'circles'))
  const code = makeInviteCode()
  const batch = writeBatch(db)
  batch.set(circleRef, {
    name: name.trim() || 'Minha família',
    ownerId: profile.uid,
    members: [profile.uid],
    inviteCode: code,
    createdAt: serverTimestamp(),
  })
  batch.set(doc(db, 'inviteCodes', code), { circleId: circleRef.id })
  batch.update(doc(db, 'users', profile.uid), { circleId: circleRef.id })
  await batch.commit()
  await ensurePresence(circleRef.id, profile)
  return circleRef.id
}

export async function joinCircle(profile: UserProfile, rawCode: string): Promise<string> {
  const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (code.length !== 6) throw new Error('O código tem 6 caracteres.')
  const invite = await getDoc(doc(db, 'inviteCodes', code))
  if (!invite.exists()) throw new Error('Código não encontrado. Confira com quem te convidou.')
  const circleId = invite.data().circleId as string
  const circleSnap = await getDoc(doc(db, 'circles', circleId))
  if (!circleSnap.exists()) throw new Error('Esse círculo não existe mais.')
  const members = (circleSnap.data().members as string[]) ?? []
  if (!members.includes(profile.uid)) {
    await updateDoc(doc(db, 'circles', circleId), { members: arrayUnion(profile.uid) })
  }
  await updateDoc(doc(db, 'users', profile.uid), { circleId })
  await ensurePresence(circleId, profile)
  return circleId
}

export async function leaveCircle(profile: UserProfile, circle: Circle) {
  await deleteDoc(doc(db, 'circles', circle.id, 'locations', profile.uid)).catch(() => undefined)
  if (circle.ownerId !== profile.uid) {
    await updateDoc(doc(db, 'circles', circle.id), { members: arrayRemove(profile.uid) })
  }
  await updateDoc(doc(db, 'users', profile.uid), { circleId: null })
}

export async function renameCircle(circleId: string, name: string) {
  await updateDoc(doc(db, 'circles', circleId), { name: name.trim().slice(0, 40) })
}

export function watchCircle(circleId: string, cb: (c: Circle | null) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'circles', circleId),
    (snap) => cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as Circle) : null),
    (e) => onError?.(e),
  )
}

/** Garante que o membro aparece na lista mesmo antes do primeiro GPS. */
async function ensurePresence(circleId: string, profile: UserProfile) {
  const ref = doc(db, 'circles', circleId, 'locations', profile.uid)
  const snap = await getDoc(ref)
  if (snap.exists()) return
  await setDoc(ref, {
    uid: profile.uid,
    name: profile.name,
    color: profile.color,
    lat: null,
    lng: null,
    accuracy: null,
    battery: null,
    charging: null,
    sharing: true,
    updatedAt: null,
  })
}

/* ---------- Localização ---------- */

export function watchLocations(circleId: string, cb: (list: MemberLocation[]) => void): Unsubscribe {
  return onSnapshot(collection(db, 'circles', circleId, 'locations'), (snap) => {
    cb(snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as MemberLocation))
  })
}

export async function writeLocation(
  circleId: string,
  profile: UserProfile,
  data: { lat: number; lng: number; accuracy: number; battery: number | null; charging: boolean | null },
) {
  await setDoc(
    doc(db, 'circles', circleId, 'locations', profile.uid),
    {
      uid: profile.uid,
      name: profile.name,
      color: profile.color,
      ...data,
      sharing: true,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function setSharing(circleId: string, uid: string, sharing: boolean) {
  await setDoc(doc(db, 'circles', circleId, 'locations', uid), { sharing }, { merge: true })
}

export async function addHistoryPoint(circleId: string, uid: string, lat: number, lng: number) {
  await addDoc(collection(db, 'circles', circleId, 'history'), { uid, lat, lng, ts: serverTimestamp() })
}

export async function loadHistory(circleId: string, uid: string, start: Date, end: Date): Promise<HistoryPoint[]> {
  const q = query(
    collection(db, 'circles', circleId, 'history'),
    where('uid', '==', uid),
    where('ts', '>=', Timestamp.fromDate(start)),
    where('ts', '<', Timestamp.fromDate(end)),
    orderBy('ts', 'asc'),
    limit(2000),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as HistoryPoint)
}

/* ---------- Lugares (cercas) ---------- */

export function watchPlaces(circleId: string, cb: (list: Place[]) => void): Unsubscribe {
  return onSnapshot(collection(db, 'circles', circleId, 'places'), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Place).sort((a, b) => a.name.localeCompare(b.name)))
  })
}

export async function savePlace(circleId: string, place: Omit<Place, 'id'>, id?: string) {
  if (id) await setDoc(doc(db, 'circles', circleId, 'places', id), place)
  else await addDoc(collection(db, 'circles', circleId, 'places'), place)
}

export async function deletePlace(circleId: string, id: string) {
  await deleteDoc(doc(db, 'circles', circleId, 'places', id))
}

/* ---------- Alertas ---------- */

export function watchEvents(circleId: string, cb: (list: CircleEvent[]) => void): Unsubscribe {
  const q = query(collection(db, 'circles', circleId, 'events'), orderBy('ts', 'desc'), limit(50))
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }) as CircleEvent))
  })
}

export async function pushEvent(
  circleId: string,
  profile: UserProfile,
  type: CircleEventType,
  extra: { placeId?: string; placeName?: string; lat?: number | null; lng?: number | null } = {},
) {
  await addDoc(collection(db, 'circles', circleId, 'events'), {
    type,
    uid: profile.uid,
    name: profile.name,
    placeId: extra.placeId ?? null,
    placeName: extra.placeName ?? null,
    lat: extra.lat ?? null,
    lng: extra.lng ?? null,
    ts: serverTimestamp(),
  })
}

/* ---------- Link temporário ---------- */

export async function createShare(
  profile: UserProfile,
  minutes: number,
  pos: { lat: number; lng: number } | null,
): Promise<string> {
  const token = makeToken()
  await setDoc(doc(db, 'shares', token), {
    uid: profile.uid,
    name: profile.name,
    color: profile.color,
    lat: pos?.lat ?? null,
    lng: pos?.lng ?? null,
    updatedAt: pos ? serverTimestamp() : null,
    expiresAt: Timestamp.fromMillis(Date.now() + minutes * 60_000),
  })
  return token
}

export function watchMyShares(uid: string, cb: (list: Share[]) => void): Unsubscribe {
  const q = query(collection(db, 'shares'), where('uid', '==', uid))
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Share)
        .sort((a, b) => b.expiresAt.toMillis() - a.expiresAt.toMillis()),
    )
  })
}

export async function updateShareLocation(token: string, lat: number, lng: number) {
  await updateDoc(doc(db, 'shares', token), { lat, lng, updatedAt: serverTimestamp() })
}

export async function deleteShare(token: string) {
  await deleteDoc(doc(db, 'shares', token))
}

export function watchShare(token: string, cb: (s: Share | null) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'shares', token),
    (snap) => cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as Share) : null),
    () => cb(null),
  )
}

export function shareUrl(token: string) {
  return `${window.location.origin}/s/${token}`
}
