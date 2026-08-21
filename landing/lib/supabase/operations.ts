import { supabase } from "./client"
import { getHubMarketingMeta } from "@/lib/data"

export interface OperationalZone {
  id: string
  hubId: string | null
  name: string
  zoneType: "polygon" | "circle"
  polygonCoordinates?: [number, number][] | null
  center?: [number, number] | null
  radius?: number | null
  color: string
}

export interface OperationalHub {
  id: string
  name: string
  description: string | null
  slug: string
  // Marketing & Presentation metadata
  tagline: string
  marketingDescription: string
  district: string
  city: string
  image: string
  gallery: string[]
  hubCapabilities: Array<{ name: string; description: string; category: string }>
  // Operational Data from Supabase
  zones: OperationalZone[]
}

/**
 * Generates a clean, URL-safe slug from any Hub name generically.
 * e.g. "Talon-Talon Hub" -> "talon-talon"
 *      "Baliwasan Hub" -> "baliwasan"
 *      "Eastern Logistics Hub" -> "eastern-logistics"
 */
export function generateHubSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bhub\b/gi, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function normalizeSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/-zone$/i, "")
    .replace(/-hub$/i, "")
    .replace(/[^a-z0-9]/g, "")
}

function mapDbZone(row: any): OperationalZone {
  let center: [number, number] | null = null

  if (row.lat !== null && row.lng !== null && !isNaN(Number(row.lat)) && !isNaN(Number(row.lng))) {
    center = [Number(row.lat), Number(row.lng)]
  } else if (Array.isArray(row.polygon_coordinates) && row.polygon_coordinates.length > 0) {
    const latSum = row.polygon_coordinates.reduce((sum: number, c: [number, number]) => sum + c[0], 0)
    const lngSum = row.polygon_coordinates.reduce((sum: number, c: [number, number]) => sum + c[1], 0)
    center = [latSum / row.polygon_coordinates.length, lngSum / row.polygon_coordinates.length]
  }

  return {
    id: row.id,
    hubId: row.hub_id || null,
    name: row.name,
    zoneType: (row.zone_type === "circle" ? "circle" : "polygon") as "polygon" | "circle",
    polygonCoordinates: Array.isArray(row.polygon_coordinates) ? row.polygon_coordinates : null,
    center,
    radius: row.radius !== null ? Number(row.radius) : null,
    color: row.color || "#f59e0b",
  }
}

/**
 * Fetch all active operational Hubs along with their assigned active Geofence Zones from Supabase
 */
export async function getPublicHubs(): Promise<OperationalHub[]> {
  try {
    // 1. Fetch active hubs from public view (sanitized, minimal columns)
    const { data: hubsData, error: hubsError } = await supabase
      .from("public_hubs")
      .select("id, name, description")
      .order("name", { ascending: true })

    if (hubsError) {
      console.error("Error fetching public_hubs from Supabase:", hubsError.message)
      return []
    }

    // 2. Fetch active zones from public view (sanitized, minimal columns)
    const { data: zonesData, error: zonesError } = await supabase
      .from("public_zones")
      .select("id, hub_id, name, zone_type, lat, lng, radius, polygon_coordinates, color")
      .order("name", { ascending: true })

    const allZones: OperationalZone[] = (!zonesError && zonesData) ? zonesData.map(mapDbZone) : []

    // 3. Map hubs and pair with assigned zones
    return (hubsData || []).map((hubRow) => {
      const slug = generateHubSlug(hubRow.name)
      const marketing = getHubMarketingMeta(slug, hubRow.name)
      const hubZones = allZones.filter((z) => z.hubId === hubRow.id)

      return {
        id: hubRow.id,
        name: hubRow.name,
        description: hubRow.description,
        slug,
        tagline: marketing.tagline || "Operational Center",
        marketingDescription: marketing.description || hubRow.description || "",
        district: marketing.district || `${hubRow.name.replace(/\s*Hub\s*/i, "").trim()} District`,
        city: marketing.city || "Zamboanga City, 7000",
        image: marketing.image || "https://images.pexels.com/photos/7019213/pexels-photo-7019213.jpeg?auto=compress&cs=tinysrgb&w=1200",
        gallery: marketing.gallery || [],
        hubCapabilities: marketing.hubCapabilities || [],
        zones: hubZones,
      }
    })
  } catch (err) {
    console.error("Error in getPublicHubs:", err)
    return []
  }
}

/**
 * Fetch a single Hub by slug, legacy alias, or UUID along with its assigned geofence zones from Supabase
 */
export async function getPublicHubBySlug(slug: string): Promise<OperationalHub | null> {
  const hubs = await getPublicHubs()
  const targetNorm = normalizeSlug(slug)

  const found = hubs.find(
    (h) =>
      h.slug === slug ||
      h.id === slug ||
      normalizeSlug(h.slug) === targetNorm ||
      generateHubSlug(h.name) === slug
  )
  return found || null
}

/**
 * Fetch active geofence zones belonging to a specific Hub ID from Supabase
 */
export async function getPublicZonesByHubId(hubId: string): Promise<OperationalZone[]> {
  try {
    const { data, error } = await supabase
      .from("public_zones")
      .select("id, hub_id, name, zone_type, lat, lng, radius, polygon_coordinates, color")
      .eq("hub_id", hubId)
      .order("name", { ascending: true })

    if (error) throw error
    return (data || []).map(mapDbZone)
  } catch (err) {
    console.error(`Error fetching zones for hub ${hubId}:`, err)
    return []
  }
}
