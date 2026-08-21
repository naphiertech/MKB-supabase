"use client"

import { useEffect, useRef, useState, useMemo } from "react"
import "leaflet/dist/leaflet.css"
import { Building2, Compass, Layers, Maximize2, ShieldCheck, Check } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Location, GeofenceZone } from "@/lib/data"

interface HubZoneMapProps {
  hub: Location
}

const TILE_LAYER = {
  url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> &copy; <a href="https://carto.com/" target="_blank" rel="noopener noreferrer">CARTO</a>',
  subdomains: "abcd",
}

export function HubZoneMap({ hub }: HubZoneMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const layerGroupRef = useRef<any>(null)
  const zoneLayersMapRef = useRef<Map<string, any>>(new Map())

  const [isMounted, setIsMounted] = useState(false)
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)

  const selectedZone = useMemo(
    () => hub.zones.find((z) => z.id === selectedZoneId) || null,
    [hub.zones, selectedZoneId]
  )

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Initialize Map with dynamically imported Leaflet
  useEffect(() => {
    if (!isMounted || !mapContainerRef.current) return

    let isCleanedUp = false

    async function initMap() {
      const L = (await import("leaflet")).default

      if (isCleanedUp || !mapContainerRef.current) return

      // Clean up previous map instance
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }

      const map = L.map(mapContainerRef.current, {
        center: hub.hubCoordinates,
        zoom: 14,
        zoomControl: true,
        scrollWheelZoom: false,
      })

      L.tileLayer(TILE_LAYER.url, {
        attribution: TILE_LAYER.attribution,
        subdomains: TILE_LAYER.subdomains,
        maxZoom: 19,
      }).addTo(map)

      const layerGroup = L.layerGroup().addTo(map)
      layerGroupRef.current = layerGroup
      mapInstanceRef.current = map

      const bounds = L.latLngBounds([hub.hubCoordinates])

      // 1. Render Hub Operational Marker
      const hubIcon = L.divIcon({
        className: "hub-marker-custom",
        html: `
          <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2 cursor-pointer group">
            <div class="absolute size-9 rounded-full bg-amber-500/30 animate-ping opacity-75"></div>
            <div class="relative flex items-center justify-center size-8 rounded-full bg-amber-500 text-slate-950 shadow-lg border-2 border-slate-900">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
            </div>
            <div class="absolute top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900/95 border border-slate-700 px-2 py-0.5 text-[11px] font-bold text-slate-100 shadow-md pointer-events-none">
              ${hub.shortName}
            </div>
          </div>
        `,
        iconSize: [0, 0],
      })

      const hubMarker = L.marker(hub.hubCoordinates, { icon: hubIcon }).addTo(layerGroup)
      hubMarker.bindPopup(`
        <div class="p-1 min-w-[200px]">
          <p class="text-[10px] font-mono uppercase tracking-wider text-amber-500 font-bold">Operational Center</p>
          <h4 class="font-serif text-base font-bold text-slate-100 mt-0.5">${hub.name}</h4>
          <p class="text-xs text-slate-300 mt-1">${hub.district}, ${hub.city}</p>
          <p class="text-[11px] text-slate-400 mt-2 border-t border-slate-700 pt-1.5 font-medium">${hub.zones.length} Assigned Geofence Zones</p>
        </div>
      `)

      // 2. Render Zone Overlays
      zoneLayersMapRef.current.clear()

      hub.zones.forEach((zone) => {
        const color = zone.color || "#f59e0b"

        if (zone.zoneType === "polygon" && zone.polygonCoordinates && zone.polygonCoordinates.length >= 3) {
          zone.polygonCoordinates.forEach((coord) => bounds.extend(coord))

          const polygon = L.polygon(zone.polygonCoordinates, {
            color,
            weight: 2,
            opacity: 0.85,
            fillColor: color,
            fillOpacity: 0.14,
          }).addTo(layerGroup)

          polygon.bindPopup(`
            <div class="p-1 min-w-[210px]">
              <span class="inline-block text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">${zone.boundaryType}</span>
              <h4 class="font-serif text-sm font-bold text-slate-100 mt-1.5">${zone.name}</h4>
              <p class="text-[11px] text-slate-300 mt-1">${zone.purpose}</p>
            </div>
          `)

          polygon.on("click", () => {
            setSelectedZoneId(zone.id)
          })

          zoneLayersMapRef.current.set(zone.id, polygon)
        } else if (zone.zoneType === "circle" && zone.center && zone.radius) {
          bounds.extend(zone.center)
          const radiusInDeg = zone.radius / 111300
          bounds.extend([zone.center[0] + radiusInDeg, zone.center[1] + radiusInDeg])
          bounds.extend([zone.center[0] - radiusInDeg, zone.center[1] - radiusInDeg])

          const circle = L.circle(zone.center, {
            radius: zone.radius,
            color,
            weight: 2,
            opacity: 0.85,
            fillColor: color,
            fillOpacity: 0.14,
            dashArray: "6 6",
          }).addTo(layerGroup)

          circle.bindPopup(`
            <div class="p-1 min-w-[210px]">
              <span class="inline-block text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">${zone.boundaryType} (${zone.radius}m)</span>
              <h4 class="font-serif text-sm font-bold text-slate-100 mt-1.5">${zone.name}</h4>
              <p class="text-[11px] text-slate-300 mt-1">${zone.purpose}</p>
            </div>
          `)

          circle.on("click", () => {
            setSelectedZoneId(zone.id)
          })

          zoneLayersMapRef.current.set(zone.id, circle)
        }
      })

      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [45, 45], maxZoom: 15 })
      }
    }

    initMap()

    const container = mapContainerRef.current
    let resizeObserver: ResizeObserver | null = null

    if (container) {
      resizeObserver = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize()
        }
      })
      resizeObserver.observe(container)
    }

    return () => {
      isCleanedUp = true
      if (resizeObserver) resizeObserver.disconnect()
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
      layerGroupRef.current = null
      zoneLayersMapRef.current.clear()
    }
  }, [isMounted, hub])

  // Update styles on zone selection changes
  useEffect(() => {
    zoneLayersMapRef.current.forEach((layer, zoneId) => {
      const zone = hub.zones.find((z) => z.id === zoneId)
      if (!zone) return

      const isSelected = selectedZoneId === zoneId
      const isAnySelected = selectedZoneId !== null

      const color = zone.color || "#f59e0b"
      const weight = isSelected ? 3.5 : isAnySelected ? 1.5 : 2
      const opacity = isSelected ? 1 : isAnySelected ? 0.45 : 0.85
      const fillOpacity = isSelected ? 0.32 : isAnySelected ? 0.06 : 0.14

      layer.setStyle({
        color,
        weight,
        opacity,
        fillColor: color,
        fillOpacity,
      })

      if (isSelected) {
        layer.bringToFront()
      }
    })
  }, [selectedZoneId, hub.zones])

  const handleSelectZone = async (zone: GeofenceZone) => {
    const map = mapInstanceRef.current
    if (!map) return

    if (selectedZoneId === zone.id) {
      setSelectedZoneId(null)
      handleFitAll()
      return
    }

    setSelectedZoneId(zone.id)

    const layer = zoneLayersMapRef.current.get(zone.id)
    if (layer) {
      const L = (await import("leaflet")).default
      if (zone.zoneType === "polygon" && zone.polygonCoordinates) {
        const polyBounds = L.latLngBounds(zone.polygonCoordinates)
        map.fitBounds(polyBounds, { padding: [60, 60], maxZoom: 16 })
      } else if (zone.zoneType === "circle" && zone.center) {
        map.flyTo(zone.center, 15, { duration: 0.8 })
      }
      layer.openPopup()
    }
  }

  const handleFitAll = async () => {
    setSelectedZoneId(null)
    const map = mapInstanceRef.current
    if (!map) return

    const L = (await import("leaflet")).default
    const bounds = L.latLngBounds([hub.hubCoordinates])
    hub.zones.forEach((z) => {
      if (z.zoneType === "polygon" && z.polygonCoordinates) {
        z.polygonCoordinates.forEach((c) => bounds.extend(c))
      } else if (z.zoneType === "circle" && z.center && z.radius) {
        const radiusInDeg = z.radius / 111300
        bounds.extend([z.center[0] + radiusInDeg, z.center[1] + radiusInDeg])
        bounds.extend([z.center[0] - radiusInDeg, z.center[1] - radiusInDeg])
      }
    })

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [45, 45], maxZoom: 15 })
    }
  }

  if (!isMounted) {
    return (
      <div className="flex h-[420px] sm:h-[480px] lg:h-[560px] w-full items-center justify-center rounded-2xl border border-border/80 bg-card shadow-xl">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="size-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          <p className="text-xs font-mono uppercase tracking-wider">Loading Hub Geofence Map...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Map Main Container */}
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xl">
        {/* Map Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/40 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Building2 className="size-4 text-accent" />
            <span className="text-sm font-bold text-foreground">{hub.name}</span>
            <span className="text-muted-foreground">&middot;</span>
            <span className="text-xs font-mono text-muted-foreground">{hub.district}</span>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[11px] font-mono border-accent/40 text-accent font-semibold">
              {hub.zones.length} Active Zones
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={handleFitAll}
              className="h-7 text-xs gap-1 border-border/70 hover:border-accent/40"
            >
              <Maximize2 className="size-3 text-accent" />
              <span>Fit Overview</span>
            </Button>
          </div>
        </div>

        {/* Map Canvas with Floating Navigator on Desktop */}
        <div className="relative h-[420px] sm:h-[480px] lg:h-[560px] w-full">
          <div ref={mapContainerRef} className="h-full w-full z-0 bg-slate-900" />

          {/* Floating Zone Legend (Desktop / Tablet) */}
          <div className="absolute top-4 right-4 z-[400] hidden md:flex flex-col gap-2 max-w-[280px] w-full pointer-events-auto">
            <div className="rounded-xl border border-border/80 bg-card/90 backdrop-blur-md p-3.5 shadow-lg">
              <div className="flex items-center justify-between border-b border-border/60 pb-2 mb-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Layers className="size-3.5 text-accent" />
                  Hub Geofence Zones
                </p>
                {selectedZoneId && (
                  <button
                    onClick={handleFitAll}
                    className="text-[10px] text-accent hover:underline font-semibold cursor-pointer"
                  >
                    Clear Filter
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-2">
                {hub.zones.map((zone) => {
                  const isSelected = selectedZoneId === zone.id
                  return (
                    <button
                      key={zone.id}
                      onClick={() => handleSelectZone(zone)}
                      className={`group/item text-left flex flex-col rounded-lg p-2.5 transition-all border cursor-pointer ${
                        isSelected
                          ? "border-accent bg-accent/10 shadow-xs"
                          : "border-border/60 bg-card/60 hover:border-accent/40 hover:bg-card"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className="size-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: zone.color || "#f59e0b" }}
                          />
                          <span className="text-xs font-bold text-foreground truncate group-hover/item:text-accent">
                            {zone.name}
                          </span>
                        </div>
                        {isSelected && <Check className="size-3 text-accent shrink-0" />}
                      </div>

                      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                        <span>{zone.boundaryType}</span>
                        <span className="text-emerald-500 font-semibold">{zone.status}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Selected Zone Focus Bar */}
        {selectedZone && (
          <div className="flex items-center justify-between border-t border-border/70 bg-accent/5 px-5 py-3 text-xs">
            <div className="flex items-center gap-2">
              <Compass className="size-4 text-accent shrink-0" />
              <span className="font-semibold text-foreground">{selectedZone.name}:</span>
              <span className="text-muted-foreground hidden sm:inline">{selectedZone.purpose}</span>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono border-accent/40 text-accent font-semibold">
              {selectedZone.boundaryType}
            </Badge>
          </div>
        )}
      </div>

      {/* Mobile Zone Selector (Visible on Small Screens) */}
      <div className="flex flex-col gap-3 md:hidden">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Layers className="size-3.5 text-accent" />
          Assigned Geofence Perimeters ({hub.zones.length})
        </p>

        <div className="grid gap-2.5">
          {hub.zones.map((zone) => {
            const isSelected = selectedZoneId === zone.id
            return (
              <button
                key={zone.id}
                onClick={() => handleSelectZone(zone)}
                className={`text-left rounded-xl p-3.5 border transition-all cursor-pointer ${
                  isSelected
                    ? "border-accent bg-accent/10"
                    : "border-border bg-card hover:border-accent/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-3 rounded-full shrink-0"
                      style={{ backgroundColor: zone.color || "#f59e0b" }}
                    />
                    <span className="text-sm font-bold text-foreground">{zone.name}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono border-accent/40 text-accent">
                    {zone.boundaryType}
                  </Badge>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{zone.description}</p>
                <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="size-3 text-accent" />
                    {zone.purpose}
                  </span>
                  <span className="font-semibold text-accent">{isSelected ? "Viewing on Map" : "Focus on Map →"}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
