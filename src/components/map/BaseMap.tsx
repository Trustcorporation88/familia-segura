import { useEffect, type ReactNode } from 'react'
import { MapContainer, TileLayer, ZoomControl, useMap } from 'react-leaflet'
import type { LatLngExpression, LatLngBoundsExpression, Map as LeafletMap } from 'leaflet'

// Centro padrão: Brasil
export const DEFAULT_CENTER: LatLngExpression = [-15.78, -47.93]

export function BaseMap({
  center = DEFAULT_CENTER,
  zoom = 4,
  children,
  className = '',
  onReady,
  zoomControl = true,
}: {
  center?: LatLngExpression
  zoom?: number
  children?: ReactNode
  className?: string
  onReady?: (map: LeafletMap) => void
  zoomControl?: boolean
}) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      zoomControl={false}
      attributionControl
      className={`h-full w-full ${className}`}
      ref={(m) => {
        if (m && onReady) onReady(m)
      }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      {zoomControl && <ZoomControl position="topright" />}
      <InvalidateOnResize />
      {children}
    </MapContainer>
  )
}

/** Corrige mapa "cinza" quando o container muda de tamanho (bottom sheet, rotação). */
function InvalidateOnResize() {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(el)
    return () => ro.disconnect()
  }, [map])
  return null
}

/** Ajusta o zoom para mostrar todos os pontos uma vez (ou quando `key` muda). */
export function FitBounds({
  bounds,
  fitKey,
  maxZoom = 16,
  bottomInset = 48,
  leftInset = 48,
}: {
  bounds: LatLngBoundsExpression | null
  fitKey: string
  maxZoom?: number
  /** Espaço extra embaixo (ex.: lista de pessoas por cima do mapa). */
  bottomInset?: number
  leftInset?: number
}) {
  const map = useMap()
  useEffect(() => {
    if (!bounds) return
    map.fitBounds(bounds, { paddingTopLeft: [leftInset, 96], paddingBottomRight: [48, bottomInset], maxZoom })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey])
  return null
}
