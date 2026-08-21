// ============================================================
// MKBRIDERTRACK SITE DATA - Fleet Logistics & Payroll System
// ============================================================

export const siteConfig = {
  name: "MKBRiderTrack",
  tagline: "Fleet Logistics, Biometric Attendance & Automated Payroll",
  description:
    "An enterprise workforce intelligence and fleet management platform for last-mile logistics couriers, combining biometric facial verification, real-time geofencing validation, parcel operations tracking, and automated payroll computation.",
  url: "https://mkbridertrack.vercel.app",
  ogImage: "/images/og-image.jpg",
  email: "operations@mkbsystem.com",
  phone: "(062) 991-2345",
  socials: {
    instagram: "https://instagram.com/mkbsystem",
    facebook: "https://facebook.com/mkbsystem",
    twitter: "https://twitter.com/mkbsystem",
  },
}

export function getDashboardUrl(): string {
  if (process.env.NEXT_PUBLIC_DASHBOARD_URL) {
    return process.env.NEXT_PUBLIC_DASHBOARD_URL
  }
  return process.env.NODE_ENV === "production"
    ? "https://mkb-system.vercel.app"
    : "http://localhost:5173"
}

export interface TimelineEvent {
  year: string
  title: string
  description: string
}

export const storyTimeline: TimelineEvent[] = [
  {
    year: "Phase 1",
    title: "System Architecture & Problem Scoping",
    description:
      "Identified critical inefficiencies in third-party courier monitoring, time-theft, and delivery reconciliation, designing a tamper-proof attendance and dispatch architecture.",
  },
  {
    year: "Phase 2",
    title: "Biometric Facial Verification",
    description:
      "Integrated neural facial landmark recognition and 3D liveness detection to ensure authenticated, GPS-verified courier Time-In and Time-Out, eliminating buddy punching.",
  },
  {
    year: "Phase 3",
    title: "Spatial Geofencing & Zone Enforcement",
    description:
      "Established strict geographical polygon boundaries and event-time Manila processing to detect boundary breaches, idle delays, and unauthorized operational detours.",
  },
  {
    year: "Phase 4",
    title: "Multi-Hub Fleet Telemetry & Mobile PWA",
    description:
      "Deployed centralized Admin/HR monitoring with role-based hub scoping, real-time WebSocket coordinate tracking, and an offline-first mobile outbox with idempotency replay.",
  },
  {
    year: "Phase 5",
    title: "Parcel Operations & Automated Payroll",
    description:
      "Integrated daily standard and heavy parcel tracking, effective-dated rate matrices, coverage-based cutoff readiness, and server-authoritative bulk approval workflows.",
  },
]

export interface TeamMember {
  name: string
  role: string
  bio: string
  image: string
}

export const teamMembers: TeamMember[] = [
  {
    name: "Dr. Alan Reyes",
    role: "Lead AI Engineer",
    bio: "Alan heads the development of biometric verification pipelines, utilizing facial landmark embeddings and liveness checks for sub-second on-device authentication.",
    image: "https://images.pexels.com/photos/30496628/pexels-photo-30496628.jpeg?auto=compress&cs=tinysrgb&w=400",
  },
  {
    name: "Sarah Chen",
    role: "Human Resources Director",
    bio: "Sarah shapes our workforce metrics and attendance validation policies, ensuring HR and Operations staff maintain complete visibility over daily shifts and compliance.",
    image: "https://images.pexels.com/photos/7109065/pexels-photo-7109065.jpeg?auto=compress&cs=tinysrgb&w=400",
  },
  {
    name: "Marcus Johansson",
    role: "Systems Architect",
    bio: "Marcus architected the real-time geolocation streaming engine, PostgreSQL geofence spatial triggers, and offline outbox synchronization for the mobile fleet.",
    image: "https://images.pexels.com/photos/6149787/pexels-photo-6149787.jpeg?auto=compress&cs=tinysrgb&w=400",
  },
  {
    name: "Elena Rodriguez",
    role: "UI/UX Specialist",
    bio: "Elena crafts responsive interfaces for both the operations control dashboard and the mobile courier console, prioritizing clarity under high operational tempo.",
    image: "https://images.pexels.com/photos/9304685/pexels-photo-9304685.jpeg?auto=compress&cs=tinysrgb&w=400",
  },
  {
    name: "David Okafor",
    role: "Geofencing Coordinator",
    bio: "David maps and maintains precise polygon boundaries for operational delivery sectors, calibrating spatial parameters for automated out-of-zone incident alerts.",
    image: "https://images.pexels.com/photos/31282368/pexels-photo-31282368.jpeg?auto=compress&cs=tinysrgb&w=400",
  },
  {
    name: "Maya Patel",
    role: "Data Analytics Lead",
    bio: "Maya analyzes operational parcel throughput, attendance punctuality trends, and delivery rates to help logistics leadership optimize fleet allocations.",
    image: "https://images.pexels.com/photos/7148059/pexels-photo-7148059.jpeg?auto=compress&cs=tinysrgb&w=400",
  },
]

export interface HubMarketingMeta {
  tagline: string
  description: string
  district: string
  city: string
  image: string
  gallery: string[]
  hubCapabilities: Array<{ name: string; description: string; category: string }>
}

/**
 * Marketing and presentation metadata for operational hubs.
 * Operational data (Names, Active Status, Geofence Zones, Coordinates) is retrieved directly from Supabase.
 */
export const hubMarketingMeta: Record<string, HubMarketingMeta> = {
  "talon-talon": {
    tagline: "Eastern Operations Center",
    description:
      "Serving as the primary operational dispatch and logistics center for eastern Zamboanga City, Talon-Talon Hub manages assigned courier fleets and multi-zone geofence perimeters.",
    district: "Talon-Talon District",
    city: "Zamboanga City, 7000",
    image: "https://images.pexels.com/photos/7019213/pexels-photo-7019213.jpeg?auto=compress&cs=tinysrgb&w=1200",
    gallery: [
      "https://images.pexels.com/photos/10834810/pexels-photo-10834810.jpeg?auto=compress&cs=tinysrgb&w=800",
      "https://images.pexels.com/photos/4487363/pexels-photo-4487363.jpeg?auto=compress&cs=tinysrgb&w=800",
    ],
    hubCapabilities: [
      {
        name: "Local Fleet Dispatch",
        description: "Coordinates day-to-day courier rosters, vehicle allocations, and shift attendance within the eastern sector.",
        category: "Fleet Management",
      },
      {
        name: "Geofence Enforcement",
        description: "Monitors assigned polygon perimeters with automated departure, idle, and detour alerts.",
        category: "Spatial Telemetry",
      },
      {
        name: "Parcel Drop Consolidation",
        description: "Local package intake, sorting, and daily delivery record reconciliation.",
        category: "Operations",
      },
    ],
  },
  "cabaluay": {
    tagline: "Northern Operations Center",
    description:
      "Serving northern transit corridors and regional logistics distribution, Cabaluay Hub oversees extended courier routes and perimeter geofence sectors across northern Zamboanga City.",
    district: "Cabaluay District",
    city: "Zamboanga City, 7000",
    image: "https://images.pexels.com/photos/31112250/pexels-photo-31112250.jpeg?auto=compress&cs=tinysrgb&w=1200",
    gallery: [
      "https://images.pexels.com/photos/4483610/pexels-photo-4483610.jpeg?auto=compress&cs=tinysrgb&w=800",
      "https://images.pexels.com/photos/4487382/pexels-photo-4487382.jpeg?auto=compress&cs=tinysrgb&w=800",
    ],
    hubCapabilities: [
      {
        name: "Corridor Monitoring",
        description: "Extended-range tracking for couriers servicing long-distance northern routes.",
        category: "Spatial Telemetry",
      },
      {
        name: "Transit Checkpoints",
        description: "Automated waypoint tracking ensuring on-schedule freight and parcel movement.",
        category: "Operations",
      },
      {
        name: "Regional Fleet Support",
        description: "Dedicated operational base for couriers covering northern territories.",
        category: "Fleet Management",
      },
    ],
  },
  "baliwasan": {
    tagline: "Western Urban Center",
    description:
      "A high-tempo commercial dispatch terminal handling heavy delivery volume, port vicinity freight, and dense commercial zones across western Zamboanga City.",
    district: "Baliwasan District",
    city: "Zamboanga City, 7000",
    image: "https://images.pexels.com/photos/7019259/pexels-photo-7019259.jpeg?auto=compress&cs=tinysrgb&w=1200",
    gallery: [
      "https://images.pexels.com/photos/15016531/pexels-photo-15016531.jpeg?auto=compress&cs=tinysrgb&w=800",
      "https://images.pexels.com/photos/30625283/pexels-photo-30625283.jpeg?auto=compress&cs=tinysrgb&w=800",
    ],
    hubCapabilities: [
      {
        name: "High-Volume Dispatch",
        description: "Optimized for dense delivery intervals and peak parcel dispatch schedules.",
        category: "Operations",
      },
      {
        name: "Urban Geofence Tracking",
        description: "Precision spatial alerts calibrated for high-density city navigation.",
        category: "Spatial Telemetry",
      },
      {
        name: "Commercial Routing",
        description: "Priority dispatch sequencing for commercial enterprise accounts.",
        category: "Fleet Management",
      },
    ],
  },
  "ayala": {
    tagline: "Western Boundary Operations Center",
    description:
      "The western operations terminal managing boundary perimeter enforcement, industrial logistics accounts, and western suburban distribution corridors.",
    district: "Ayala District",
    city: "Zamboanga City, 7000",
    image: "https://images.pexels.com/photos/4484042/pexels-photo-4484042.jpeg?auto=compress&cs=tinysrgb&w=1200",
    gallery: [
      "https://images.pexels.com/photos/4628583/pexels-photo-4628583.jpeg?auto=compress&cs=tinysrgb&w=800",
      "https://images.pexels.com/photos/5775099/pexels-photo-5775099.jpeg?auto=compress&cs=tinysrgb&w=800",
    ],
    hubCapabilities: [
      {
        name: "Perimeter Alerting",
        description: "Instantaneous notifications when couriers traverse terminal boundary limits.",
        category: "Spatial Telemetry",
      },
      {
        name: "Industrial Dispatch",
        description: "Handles heavy parcel operations and scheduled freight transfers.",
        category: "Operations",
      },
      {
        name: "Fleet Safety Oversight",
        description: "Continuous telemetry monitoring for outer perimeter route security.",
        category: "Fleet Management",
      },
    ],
  },
}

/**
 * Dynamically resolves marketing metadata for any Hub slug or name with generic fallback.
 */
export function getHubMarketingMeta(slug: string, hubName?: string): HubMarketingMeta {
  const cleanKey = slug.toLowerCase().replace(/-zone$/i, "").replace(/-hub$/i, "").trim()

  if (hubMarketingMeta[cleanKey]) {
    return hubMarketingMeta[cleanKey]
  }
  if (hubMarketingMeta[slug]) {
    return hubMarketingMeta[slug]
  }

  // Generic fallback for any newly added hub
  const districtName = hubName ? hubName.replace(/\s*Hub\s*/i, "").trim() : "Operational"
  return {
    tagline: `${districtName} Operations Center`,
    description: `Fulfillment and courier dispatch terminal managing assigned delivery fleets and geofence perimeters in ${districtName} District.`,
    district: `${districtName} District`,
    city: "Zamboanga City, 7000",
    image: "https://images.pexels.com/photos/7019213/pexels-photo-7019213.jpeg?auto=compress&cs=tinysrgb&w=1200",
    gallery: [],
    hubCapabilities: [
      {
        name: "Fleet Dispatch & Rostering",
        description: "Local shift management and courier assignment tracking.",
        category: "Fleet Management",
      },
      {
        name: "Geofence Boundary Monitoring",
        description: "Real-time departure, idle, and detour event telemetry.",
        category: "Spatial Telemetry",
      },
    ],
  }
}

// Fallback hub descriptors for static nav references
export interface StaticHubNav {
  slug: string
  name: string
  shortName: string
  district: string
}

export const staticHubsList: StaticHubNav[] = [
  { slug: "talon-talon", name: "Talon-Talon Hub", shortName: "Talon-Talon Hub", district: "Talon-Talon District" },
  { slug: "cabaluay", name: "Cabaluay Hub", shortName: "Cabaluay Hub", district: "Cabaluay District" },
  { slug: "baliwasan", name: "Baliwasan Hub", shortName: "Baliwasan Hub", district: "Baliwasan District" },
  { slug: "ayala", name: "Ayala Hub", shortName: "Ayala Hub", district: "Ayala District" },
]

export interface SystemModule {
  id: string
  title: string
  category: string
  tagline: string
  description: string
  features: string[]
  badge: string
  image: string
}

export const systemModules: SystemModule[] = [
  {
    id: "attendance-biometrics",
    title: "Biometric Facial Recognition & Liveness",
    category: "Attendance & Identity",
    tagline: "Zero Time-Theft Authentication",
    description:
      "On-device neural face matching paired with 3D liveness detection. Eliminates buddy punching and verifies mandatory GPS coordinate freshness on every Time In and Time Out event.",
    features: [
      "128-Dimensional Facial Vector Matching",
      "MediaPipe 3D Liveness Detection",
      "Mandatory GPS Freshness Validation",
      "Duplicate Timestamp Guarding",
    ],
    badge: "Biometric Engine",
    image: "https://images.pexels.com/photos/8566472/pexels-photo-8566472.jpeg?auto=compress&cs=tinysrgb&w=1200",
  },
  {
    id: "geofence-telemetry",
    title: "Spatial Geofencing & Boundary Alerts",
    category: "Geofencing & Telemetry",
    tagline: "Real-Time Boundary Adherence",
    description:
      "Precision polygon boundaries mapped across operational delivery sectors. Real-time spatial triggers immediately record boundary exits, idle delays, and unauthorized detours.",
    features: [
      "Custom Sector Polygon Mapping",
      "Automated Boundary Breach Alerts",
      "Idle Duration & Timeout Tracking",
      "Asia/Manila (PHT) Event-Time Validation",
    ],
    badge: "Spatial Intelligence",
    image: "https://images.pexels.com/photos/10697106/pexels-photo-10697106.jpeg?auto=compress&cs=tinysrgb&w=1200",
  },
  {
    id: "fleet-operations",
    title: "Multi-Hub Dispatch & Real-Time Monitoring",
    category: "Hub & Fleet Operations",
    tagline: "Live Operational Visibility",
    description:
      "Centralized dispatcher console displaying real-time courier locations, active shift duty statuses, and operational hub assignments across Zamboanga City sectors.",
    features: [
      "Live Interactive Fleet Map",
      "Home vs Operational Hub Scoping",
      "Real-Time Active Duty Badging",
      "Historical Telemetry Trail Audit",
    ],
    badge: "Fleet Operations",
    image: "https://images.pexels.com/photos/6169169/pexels-photo-6169169.jpeg?auto=compress&cs=tinysrgb&w=1200",
  },
  {
    id: "parcel-operations",
    title: "Daily Parcel Operations & Rate Engine",
    category: "Parcel Operations",
    tagline: "Auditable Delivery Reconciliation",
    description:
      "Daily courier delivery logging with effective-dated rate matrices, heavy parcel surcharge calculations (>4kg packages), append-only audit trails, and supervisor correction workflows.",
    features: [
      "Effective-Dated Courier Rate Matrices",
      ">4kg Heavy Parcel Surcharges",
      "Append-Only Audit History",
      "Supervisor Correction Workflows",
    ],
    badge: "Operations & Rates",
    image: "https://images.pexels.com/photos/4483610/pexels-photo-4483610.jpeg?auto=compress&cs=tinysrgb&w=1200",
  },
  {
    id: "salary-payroll",
    title: "Automated Cutoff Salary Computation",
    category: "Payroll & Payslips",
    tagline: "Server-Authoritative Compensation",
    description:
      "Automated payroll calculation syncing biometric DTR attendance with daily parcel delivery logs. Features coverage-based cutoff readiness and multi-status archive reporting.",
    features: [
      "Coverage-Based Readiness Calculation",
      "DTR Attendance & Punctuality Sync",
      "Draft, Submitted, Approved, Paid States",
      "Itemized Courier Payslip Generation",
    ],
    badge: "Payroll Engine",
    image: "https://images.pexels.com/photos/6863201/pexels-photo-6863201.jpeg?auto=compress&cs=tinysrgb&w=1200",
  },
  {
    id: "offline-pwa",
    title: "Offline-First Mobile PWA Architecture",
    category: "Offline Rider Support",
    tagline: "Uninterrupted Field Resilience",
    description:
      "Field-resilient mobile app utilizing IndexedDB local outbox queuing. Couriers can record attendance and deliveries offline, replaying transactions seamlessly upon network reconnection.",
    features: [
      "Local IndexedDB Outbox Storage",
      "Idempotency Key Replay Protection",
      "Background Sync Safeguards",
      "Mobile Camera Liveness Pipeline",
    ],
    badge: "Mobile Resilience",
    image: "https://images.pexels.com/photos/7706596/pexels-photo-7706596.jpeg?auto=compress&cs=tinysrgb&w=1200",
  },
  {
    id: "security-governance",
    title: "Row Level Security & Access Governance",
    category: "Security & Governance",
    tagline: "Zero-Trust Infrastructure",
    description:
      "Granular PostgreSQL Row Level Security enforcing strict multi-hub isolation. Role-scoped access controls for Admin, HR, Payroll, and Couriers backed by TOTP Multi-Factor Authentication.",
    features: [
      "PostgreSQL Row Level Security (RLS)",
      "Role Scoping (Admin / HR / Payroll / Rider)",
      "TOTP Multi-Factor Authentication",
      "Immutable Audit Log Tracking",
    ],
    badge: "Enterprise Security",
    image: "https://images.pexels.com/photos/5380642/pexels-photo-5380642.jpeg?auto=compress&cs=tinysrgb&w=1200",
  },
]

export const featuredCapabilities = [
  {
    id: "biometric-verification",
    name: "Biometric Facial Recognition",
    category: "Attendance & Identity",
    description: "Sub-second facial landmark matching and 3D liveness detection with GPS freshness verification on every shift.",
    status: "Production Ready",
    image: "https://images.pexels.com/photos/8566472/pexels-photo-8566472.jpeg?auto=compress&cs=tinysrgb&w=1200",
    href: "/modules#attendance-biometrics",
  },
  {
    id: "spatial-geofencing",
    name: "Spatial Polygon Geofencing",
    category: "Geofencing & Telemetry",
    description: "Strict sector perimeter monitoring with real-time boundary breach, idle timeout, and detour alerts.",
    status: "Live Active",
    image: "https://images.pexels.com/photos/10697106/pexels-photo-10697106.jpeg?auto=compress&cs=tinysrgb&w=1200",
    href: "/modules#geofence-telemetry",
  },
  {
    id: "parcel-rates",
    name: "Daily Parcel Rate Matrix",
    category: "Parcel Operations",
    description: "Standard and heavy parcel tracking with effective-dated rates, surcharges, and append-only audit trails.",
    status: "Operational",
    image: "https://images.pexels.com/photos/4483610/pexels-photo-4483610.jpeg?auto=compress&cs=tinysrgb&w=1200",
    href: "/modules#parcel-operations",
  },
  {
    id: "salary-computation",
    name: "Automated Cutoff Payroll",
    category: "Payroll & Payslips",
    description: "Coverage-based cutoff readiness, DTR hydration, and server-authoritative multi-tier approval flows.",
    status: "Integrated",
    image: "https://images.pexels.com/photos/6863201/pexels-photo-6863201.jpeg?auto=compress&cs=tinysrgb&w=1200",
    href: "/modules#salary-payroll",
  },
  {
    id: "fleet-telemetry",
    name: "Live Dispatch Telemetry",
    category: "Hub & Fleet Operations",
    description: "Interactive real-time map visualization, duty status indicators, and multi-hub operational tracking.",
    status: "Live Tracking",
    image: "https://images.pexels.com/photos/6169169/pexels-photo-6169169.jpeg?auto=compress&cs=tinysrgb&w=1200",
    href: "/modules#fleet-operations",
  },
  {
    id: "offline-resilience",
    name: "Offline Outbox & Idempotency",
    category: "Offline Rider Support",
    tagline: "Zero Data Loss",
    description: "IndexedDB transaction queuing and automatic background replay for continuous field operations.",
    status: "Reliability Hardened",
    image: "https://images.pexels.com/photos/7706596/pexels-photo-7706596.jpeg?auto=compress&cs=tinysrgb&w=1200",
    href: "/modules#offline-pwa",
  },
]

export interface Testimonial {
  quote: string
  author: string
  location: string
  rating: number
}

export const testimonials: Testimonial[] = []

export const galleryImages = [
  { src: "https://images.pexels.com/photos/6169123/pexels-photo-6169123.jpeg?auto=compress&cs=tinysrgb&w=800", alt: "Workforce Monitoring Dashboard" },
  { src: "https://images.pexels.com/photos/11100371/pexels-photo-11100371.jpeg?auto=compress&cs=tinysrgb&w=800", alt: "Live Geofencing Map" },
  { src: "https://images.pexels.com/photos/4481258/pexels-photo-4481258.jpeg?auto=compress&cs=tinysrgb&w=800", alt: "HR Admin Panel" },
  { src: "https://images.pexels.com/photos/5990263/pexels-photo-5990263.jpeg?auto=compress&cs=tinysrgb&w=800", alt: "Biometric Facial Recognition Terminal" },
  { src: "https://images.pexels.com/photos/4481260/pexels-photo-4481260.jpeg?auto=compress&cs=tinysrgb&w=800", alt: "Rider Activity Logs" },
  { src: "https://images.pexels.com/photos/8090299/pexels-photo-8090299.jpeg?auto=compress&cs=tinysrgb&w=800", alt: "Mobile Time-In Application" },
]
