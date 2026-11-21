import distance from '@turf/distance'
import length from '@turf/length'
import { lineString, point } from '@turf/helpers'
import type { LatLng, Place } from './types'

/** Distância em metros entre dois pontos. */
export function metersBetween(a: LatLng, b: LatLng): number {
  return distance(point([a.lng, a.lat]), point([b.lng, b.lat]), { units: 'meters' })
}

/** Está dentro da cerca? Usa a precisão do GPS como folga (até 100 m). */
export function isInsidePlace(pos: LatLng, place: Place, accuracy = 0): boolean {
  const slack = Math.min(Math.max(accuracy, 0), 100) * 0.5
  return metersBetween(pos, place) <= place.radius + slack
}

/**
 * Para sair, exige uma margem extra (histerese), evitando alertas
 * "chegou/saiu" repetidos quando o GPS oscila na borda da cerca.
 */
export function isOutsidePlace(pos: LatLng, place: Place, accuracy = 0): boolean {
  const margin = Math.max(30, place.radius * 0.15) + Math.min(Math.max(accuracy, 0), 100) * 0.5
  return metersBetween(pos, place) > place.radius + margin
}

export type PlaceStates = Record<string, boolean>

export interface GeofenceTransition {
  place: Place
  type: 'arrive' | 'leave'
}

/** Compara a posição com o estado anterior de cada lugar e devolve as transições. */
export function evaluateGeofences(
  pos: LatLng,
  accuracy: number,
  places: Place[],
  previous: PlaceStates,
): { next: PlaceStates; transitions: GeofenceTransition[] } {
  const next: PlaceStates = {}
  const transitions: GeofenceTransition[] = []
  for (const place of places) {
    const was = previous[place.id]
    let inside: boolean
    if (was === true) inside = !isOutsidePlace(pos, place, accuracy)
    else inside = isInsidePlace(pos, place, accuracy)
    next[place.id] = inside
    // Primeira leitura de um lugar só registra o estado, sem alerta.
    if (was !== undefined && was !== inside) {
      transitions.push({ place, type: inside ? 'arrive' : 'leave' })
    }
  }
  return { next, transitions }
}

/** Distância total percorrida (km) num trajeto. */
export function pathKm(points: LatLng[]): number {
  if (points.length < 2) return 0
  return length(lineString(points.map((p) => [p.lng, p.lat])), { units: 'kilometers' })
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0).replace('.', ',')} km`
}
