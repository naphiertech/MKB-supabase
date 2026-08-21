"use client"

import { useEffect, useRef, useState } from "react"
import { MapPin, Layers, RotateCcw, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { OperationalHub, OperationalZone } from "@/lib/supabase/operations"
import "leaflet/dist/leaflet.css"

interface HubZoneMapProps {
  hub: OperationalHub
}

export function HubZoneMap({ hub }: HubZoneMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const zoneLayersMapRef = useRef<Map<string, any>>(new Map())
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (!isMounted || !mapContainerRef.current) return

    let isCleanedUp = false

    const initMap = async () => {
      const L = await import("leaflet")

      if (isCleanedUp || !mapContainerRef.current) return

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }

      // Initialize Leaflet map
      const map = L.map(mapContainerRef.current, {
        scrollWheelZoom: false,
        zoomControl: true,
        attributionControl: false,
      })

      mapInstanceRef.current = map

      // OpenStreetMap clean tile layer
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map)

      const layerGroup = L.layerGroup().addTo(map)
      zoneLayersMapRef.current.clear()

      const bounds = L.latLngBounds([])

      // 1. Render all assigned Geofence Zones
      hub.zones.forEach((zone) => {
        const color = zone.color || "#2563EB"

        if (zone.zoneType === "polygon" && zone.polygonCoordinates && zone.polygonCoordinates.length > 0) {
          const latLngs = zone.polygonCoordinates.map((c) => [c[0], c[1]] as [number, number])

          const polygon = L.polygon(latLngs, {
            color: color,
            weight: 2.5,
            opacity: 0.9,
            fillColor: color,
            fillOpacity: 0.22,
            dashArray: "3, 6",
          }).addTo(layerGroup)

          latLngs.forEach((coord) => bounds.extend(coord))

          polygon.bindPopup(
            `
            <div style="background-color: #0c0c0f; color: #f4f4f5; padding: 12px 14px; border-radius: 8px; min-width: 220px; font-family: system-ui, -apple-system, sans-serif; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.6); border: 1px solid #2a2a30;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
                <span style="font-size: 9px; font-family: monospace; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; background-color: rgba(245, 158, 11, 0.15); color: #fbbf24; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(245, 158, 11, 0.3);">
                  Polygon Geofence
                </span>
                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${color};"></span>
              </div>
              <h4 style="font-family: system-ui, sans-serif; font-size: 14px; font-weight: 700; color: #ffffff; margin: 0 0 4px 0;">
                ${zone.name}
              </h4>
              <p style="font-size: 11px; color: #a0a0a8; margin: 0 0 6px 0;">
                Assigned to <strong>${hub.name}</strong>
              </p>
              <div style="border-top: 1px solid #2a2a30; padding-top: 6px; font-family: monospace; font-size: 10px; color: #fbbf24;">
                ${zone.polygonCoordinates.length} perimeter vertices calibrated
              </div>
            </div>
          `,
            { className: "custom-hub-popup" }
          )

          polygon.on("click", () => {
            setSelectedZoneId(zone.id)
          })

          zoneLayersMapRef.current.set(zone.id, polygon)
        } else if (zone.zoneType === "circle" && zone.center) {
          const circle = L.circle(zone.center, {
            color: color,
            weight: 2.5,
            opacity: 0.9,
            fillColor: color,
            fillOpacity: 0.22,
            radius: zone.radius || 1500,
          }).addTo(layerGroup)

          bounds.extend(circle.getBounds())

          circle.bindPopup(
            `
            <div style="background-color: #0c0c0f; color: #f4f4f5; padding: 12px 14px; border-radius: 8px; min-width: 220px; font-family: system-ui, -apple-system, sans-serif; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.6); border: 1px solid #2a2a30;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
                <span style="font-size: 9px; font-family: monospace; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; background-color: rgba(245, 158, 11, 0.15); color: #fbbf24; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(245, 158, 11, 0.3);">
                  Radial Geofence
                </span>
                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${color};"></span>
              </div>
              <h4 style="font-family: system-ui, sans-serif; font-size: 14px; font-weight: 700; color: #ffffff; margin: 0 0 4px 0;">
                ${zone.name}
              </h4>
              <p style="font-size: 11px; color: #a0a0a8; margin: 0 0 6px 0;">
                Assigned to <strong>${hub.name}</strong>
              </p>
              <div style="border-top: 1px solid #2a2a30; padding-top: 6px; font-family: monospace; font-size: 10px; color: #fbbf24;">
                Radius: ${zone.radius || 1500}m
              </div>
            </div>
          `,
            { className: "custom-hub-popup" }
          )

          circle.on("click", () => {
            setSelectedZoneId(zone.id)
          })

          zoneLayersMapRef.current.set(zone.id, circle)
        }
      })

      // 2. Render Physical Hub Marker if representative point available
      const hubCenter = hub.zones.find((z) => z.center)?.center ||
        (hub.zones[0]?.polygonCoordinates?.[0] ? hub.zones[0].polygonCoordinates[0] : null)

      if (hubCenter) {
        bounds.extend(hubCenter)

        const customHubIcon = L.divIcon({
          className: "hub-marker-custom",
          html: `
            <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px;">
              <div style="position: absolute; width: 36px; height: 36px; border-radius: 50%; background-color: rgba(245, 158, 11, 0.3); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
              <div style="position: relative; width: 28px; height: 28px; border-radius: 8px; background-color: #f59e0b; border: 2px solid #0a0a0a; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.5);">
                <span style="color: #0a0a0a; font-family: monospace; font-weight: 900; font-size: 12px;">M</span>
              </div>
            </div>
          `,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          popupAnchor: [0, -18],
        })

        const hubMarker = L.marker(hubCenter, { icon: customHubIcon }).addTo(layerGroup)

        hubMarker.bindPopup(
          `
          <div style="background-color: #0c0c0f; color: #f4f4f5; padding: 12px 14px; border-radius: 8px; min-width: 220px; font-family: system-ui, -apple-system, sans-serif; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.6); border: 1px solid rgba(245, 158, 11, 0.4);">
            <span style="font-size: 9px; font-family: monospace; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; background-color: rgba(245, 158, 11, 0.15); color: #fbbf24; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(245, 158, 11, 0.3); display: inline-block; margin-bottom: 4px;">
              Operational Center
            </span>
            <h4 style="font-family: system-ui, sans-serif; font-size: 14px; font-weight: 700; color: #ffffff; margin: 4px 0 2px 0;">
              ${hub.name}
            </h4>
            <p style="font-size: 11px; color: #a0a0a8; margin: 2px 0 0 0;">
              ${hub.district}, ${hub.city}
            </p>
          </div>
        `,
          { className: "custom-hub-popup" }
        )
      }

      // Auto-fit to all geometries
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
      }
    }

    initMap()

    return () => {
      isCleanedUp = true
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [isMounted, hub])

  const handleSelectZone = (zone: OperationalZone) => {
    setSelectedZoneId(zone.id)
    const layer = zoneLayersMapRef.current.get(zone.id)
    if (layer && mapInstanceRef.current) {
      if (layer.getBounds) {
        mapInstanceRef.current.fitBounds(layer.getBounds(), { padding: [50, 50], maxZoom: 16 })
      } else if (layer.getLatLng) {
        mapInstanceRef.current.setView(layer.getLatLng(), 15)
      }
      layer.openPopup()
    }
  }

  const handleResetView = () => {
    setSelectedZoneId(null)
    if (!mapInstanceRef.current) return

    import("leaflet").then((L) => {
      const bounds = L.latLngBounds([])
      hub.zones.forEach((zone) => {
        if (zone.polygonCoordinates) {
          zone.polygonCoordinates.forEach((c) => bounds.extend(c))
        } else if (zone.center) {
          bounds.extend(zone.center)
        }
      })
      if (bounds.isValid()) {
        mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
      }
    })
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Zone Selector Chips & Legend Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-bryl">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-accent" />
          <span className="font-mono text-xs font-semibold text-foreground uppercase tracking-wider">
            Assigned Zones ({hub.zones.length})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hub.zones.map((zone) => {
            const isSelected = selectedZoneId === zone.id
            return (
              <button
                key={zone.id}
                type="button"
                onClick={() => handleSelectZone(zone)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-xs transition-all cursor-pointer ${
                  isSelected
                    ? "border-accent bg-accent/15 text-foreground font-bold shadow-2xs"
                    : "border-border bg-secondary/50 text-muted-foreground hover:border-accent/40 hover:text-foreground"
                }`}
              >
                <span
                  className="size-2 rounded-full shrink-0"
                  style={{ backgroundColor: zone.color || "#2563EB" }}
                />
                <span>{zone.name}</span>
              </button>
            )
          })}

          <Button
            variant="outline"
            size="sm"
            onClick={handleResetView}
            className="h-7 text-xs border-border bg-card hover:bg-secondary text-muted-foreground hover:text-foreground px-2.5 rounded-lg ml-1 font-mono cursor-pointer"
          >
            <RotateCcw className="size-3 mr-1 text-accent" />
            <span>Reset View</span>
          </Button>
        </div>
      </div>

      {/* Map Container */}
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-border shadow-bryl bg-secondary/30">
        {!isMounted ? (
          <div className="flex h-full w-full items-center justify-center bg-secondary font-mono text-xs text-muted-foreground">
            Loading Spatial Map Engine...
          </div>
        ) : hub.zones.length === 0 ? (
          <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center">
            <AlertTriangle className="size-8 text-accent mb-2" />
            <h4 className="font-sans text-base font-bold text-foreground">No Geofence Zones Found</h4>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              No calibrated polygon or circle geofence boundaries are currently assigned to this hub in Supabase.
            </p>
          </div>
        ) : (
          <div ref={mapContainerRef} className="h-full w-full z-0" />
        )}

        {/* Live Database Overlay Badge */}
        <div className="absolute bottom-3 left-3 z-10 rounded-lg border border-border bg-background/95 px-2.5 py-1 shadow-xs backdrop-blur-md">
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Supabase Verified Geofences</span>
          </div>
        </div>
      </div>
    </div>
  )
}
