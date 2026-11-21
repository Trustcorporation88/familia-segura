import L from 'leaflet'
import { initials } from '../../lib/format'

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

/** Marcador em forma de "pin" com as iniciais do membro. */
export function memberIcon(name: string, color: string, opts: { stale?: boolean; me?: boolean; sos?: boolean } = {}) {
  const cls = ['fs-pin', opts.stale ? 'fs-pin--stale' : '', opts.me ? 'fs-pin--me' : '', opts.sos ? 'fs-pin--sos' : '']
    .filter(Boolean)
    .join(' ')
  return L.divIcon({
    className: 'fs-pin-wrap',
    html: `<div class="${cls}" style="--pin:${/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#7c3aed'}"><span>${escapeHtml(initials(name))}</span></div>`,
    iconSize: [44, 52],
    iconAnchor: [22, 50],
    popupAnchor: [0, -46],
  })
}

export function placeIcon(emoji: string) {
  return L.divIcon({
    className: 'fs-place-wrap',
    html: `<div class="fs-place">${escapeHtml(emoji)}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })
}

export function dotIcon(color: string) {
  return L.divIcon({
    className: 'fs-dot-wrap',
    html: `<div class="fs-dot" style="background:${color}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

/** Ícone do cluster: mostra quantas pessoas estão juntas. */
export function clusterIcon(cluster: L.MarkerCluster) {
  const count = cluster.getChildCount()
  return L.divIcon({
    className: 'fs-cluster-wrap',
    html: `<div class="fs-cluster"><span>${count}</span></div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  })
}
