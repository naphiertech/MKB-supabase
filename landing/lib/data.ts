// ============================================================
// ATTENRIDER SITE DATA - Biometric & Geofencing System
// ============================================================

export const siteConfig = {
  name: "AttenRider",
  tagline: "Geofencing-Based Rider Attendance & Monitoring",
  description:
    "An advanced workforce intelligence system for logistics couriers, combining real-time geofencing validation and biometric facial recognition to ensure operational transparency.",
  url: "https://mkbsystem.com",
  ogImage: "/images/og-image.jpg",
  email: "contact@mkbsystem.com",
  phone: "(555) 123-4567",
  socials: {
    instagram: "https://instagram.com/mkbsystem",
    facebook: "https://facebook.com/mkbsystem",
    twitter: "https://twitter.com/mkbsystem",
  },
}

export interface TimelineEvent {
  year: string
  title: string
  description: string
}

export const storyTimeline: TimelineEvent[] = [
  {
    year: "Phase 1",
    title: "System Conceptualization",
    description:
      "Identified critical gaps in third-party logistics rider monitoring and designed the architecture for a tamper-proof attendance system.",
  },
  {
    year: "Phase 2",
    title: "Facial Recognition Integration",
    description:
      "Implemented OpenCV and TensorFlow FaceNet to facilitate accurate rider time-in and time-out, effectively eliminating buddy punching.",
  },
  {
    year: "Phase 3",
    title: "Geofencing Deployment",
    description:
      "Established strict geographical boundaries for operational zones, allowing the system to validate rider locations against their assigned areas.",
  },
  {
    year: "Phase 4",
    title: "Live Workforce Monitoring",
    description:
      "Rolled out the centralized HR and Admin dashboard for real-time tracking of active riders and automatic boundary violation detection.",
  },
  {
    year: "Phase 5",
    title: "Payroll Support & Analytics",
    description:
      "Integrated automated attendance history and basic payroll computation features to streamline administrative workflows.",
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
    bio: "Alan heads the development of our biometric modules, leveraging TensorFlow to ensure sub-second facial verification accuracy.",
    image: "https://images.pexels.com/photos/30496628/pexels-photo-30496628.jpeg?auto=compress&cs=tinysrgb&w=400",
  },
  {
    name: "Sarah Chen",
    role: "Human Resources Director",
    bio: "Sarah designs our dashboard metrics, ensuring that HR and Admin personnel have clear visibility into workforce attendance and payroll data.",
    image: "https://images.pexels.com/photos/7109065/pexels-photo-7109065.jpeg?auto=compress&cs=tinysrgb&w=400",
  },
  {
    name: "Marcus Johansson",
    role: "Systems Architect",
    bio: "Marcus built the real-time geolocation tracking engine that handles thousands of simultaneous rider coordinates for boundary validation.",
    image: "https://images.pexels.com/photos/6149787/pexels-photo-6149787.jpeg?auto=compress&cs=tinysrgb&w=400",
  },
  {
    name: "Elena Rodriguez",
    role: "UI/UX Specialist",
    bio: "Elena crafts intuitive interfaces for both the administrative dashboard and the rider-facing mobile attendance portal.",
    image: "https://images.pexels.com/photos/9304685/pexels-photo-9304685.jpeg?auto=compress&cs=tinysrgb&w=400",
  },
  {
    name: "David Okafor",
    role: "Geofencing Coordinator",
    bio: "David maps and maintains the precise coordinates for our operational zones, configuring the logic for out-of-bound alerts.",
    image: "https://images.pexels.com/photos/31282368/pexels-photo-31282368.jpeg?auto=compress&cs=tinysrgb&w=400",
  },
  {
    name: "Maya Patel",
    role: "Data Analytics Lead",
    bio: "Maya analyzes violation logs and attendance trends to help management optimize third-party logistics deployments.",
    image: "https://images.pexels.com/photos/7148059/pexels-photo-7148059.jpeg?auto=compress&cs=tinysrgb&w=400",
  },
]

export interface MenuItem {
  name: string
  description: string
  price: string
  category: string
  tags?: string[]
  image?: string
}

export interface Location {
  slug: string
  name: string
  shortName: string
  tagline: string
  description: string
  address: string
  city: string
  phone: string
  hours: { days: string; time: string }[]
  image: string
  gallery: string[]
  features: string[]
  menu: MenuItem[]
}

export const locations: Location[] = [
  {
    slug: "talon-talon-zone",
    name: "Talon-Talon Geofence",
    shortName: "Talon-Talon Zone",
    tagline: "Eastern Monitoring Sector",
    description:
      "A high-density operational zone. Riders assigned to this area are closely monitored using tight radius-based geofences to ensure compliance and rapid response times.",
    address: "Talon-Talon District",
    city: "Zamboanga City, 7000",
    phone: "(555) 100-0001",
    hours: [
      { days: "Monitoring", time: "24/7 Active" },
    ],
    image: "https://images.pexels.com/photos/7019213/pexels-photo-7019213.jpeg?auto=compress&cs=tinysrgb&w=1200",
    gallery: [
      "https://images.pexels.com/photos/10834810/pexels-photo-10834810.jpeg?auto=compress&cs=tinysrgb&w=800",
      "https://images.pexels.com/photos/4487363/pexels-photo-4487363.jpeg?auto=compress&cs=tinysrgb&w=800",
    ],
    features: [
      "Strict Boundary Enforcement",
      "High-Traffic Monitoring",
      "Immediate Violation Alerts",
      "Live Coordinate Sync",
    ],
    menu: [
      {
        name: "Biometric Time-In",
        description: "TensorFlow-powered facial recognition verification.",
        price: "Active",
        category: "Attendance",
        tags: ["Verified"],
        image: "https://images.pexels.com/photos/8090298/pexels-photo-8090298.jpeg?auto=compress&cs=tinysrgb&w=800",
      },
    ],
  },
  {
    slug: "cabaluay-zone",
    name: "Cabaluay Geofence",
    shortName: "Cabaluay Zone",
    tagline: "Northern Operations Area",
    description:
      "Covering extensive northern routes, the Cabaluay zone utilizes broader dome-based monitoring to accommodate longer transit times while maintaining strict boundary alerts.",
    address: "Cabaluay District",
    city: "Zamboanga City, 7000",
    phone: "(555) 200-0002",
    hours: [
      { days: "Monitoring", time: "24/7 Active" },
    ],
    image: "https://images.pexels.com/photos/31112250/pexels-photo-31112250.jpeg?auto=compress&cs=tinysrgb&w=1200",
    gallery: [
      "https://images.pexels.com/photos/4483610/pexels-photo-4483610.jpeg?auto=compress&cs=tinysrgb&w=800",
      "https://images.pexels.com/photos/4487382/pexels-photo-4487382.jpeg?auto=compress&cs=tinysrgb&w=800",
    ],
    features: [
      "Extended Boundary Mapping",
      "Long-Range Tracking",
      "Offline Status Detection",
      "Payroll Data Sync",
    ],
    menu: [
      {
        name: "Boundary Detection",
        description: "Real-time coordinate comparison against assigned zone.",
        price: "Active",
        category: "Security",
        tags: ["Alerts"],
        image: "https://images.pexels.com/photos/4480987/pexels-photo-4480987.jpeg?auto=compress&cs=tinysrgb&w=800",
      },
    ],
  },
  {
    slug: "baliwasan-zone",
    name: "Baliwasan Geofence",
    shortName: "Baliwasan Zone",
    tagline: "Western Urban Sector",
    description:
      "A dynamic urban zone where real-time rider maps are crucial. Admin and HR teams heavily monitor this area for unauthorized detours during active shifts.",
    address: "Baliwasan District",
    city: "Zamboanga City, 7000",
    phone: "(555) 300-0003",
    hours: [
      { days: "Monitoring", time: "24/7 Active" },
    ],
    image: "https://images.pexels.com/photos/7019259/pexels-photo-7019259.jpeg?auto=compress&cs=tinysrgb&w=1200",
    gallery: [
      "https://images.pexels.com/photos/15016531/pexels-photo-15016531.jpeg?auto=compress&cs=tinysrgb&w=800",
      "https://images.pexels.com/photos/30625283/pexels-photo-30625283.jpeg?auto=compress&cs=tinysrgb&w=800",
    ],
    features: [
      "Urban Density Mapping",
      "Real-Time Dashboard Sync",
      "Attendance Validation",
      "Active Shift Logs",
    ],
    menu: [
      {
        name: "Live Rider Map",
        description: "Interactive dashboard displaying current rider locations.",
        price: "Active",
        category: "Monitoring",
        image: "https://images.pexels.com/photos/281260/pexels-photo-281260.jpeg?auto=compress&cs=tinysrgb&w=800",
      },
    ],
  },
  {
    slug: "ayala-zone",
    name: "Ayala Geofence",
    shortName: "Ayala Zone",
    tagline: "Western Boundary Sector",
    description:
      "The farthest western monitoring zone. This area relies on the notification and alert module to immediately signal administrators if riders exit the city limits.",
    address: "Ayala District",
    city: "Zamboanga City, 7000",
    phone: "(555) 400-0004",
    hours: [
      { days: "Monitoring", time: "24/7 Active" },
    ],
    image: "https://images.pexels.com/photos/4484042/pexels-photo-4484042.jpeg?auto=compress&cs=tinysrgb&w=1200",
    gallery: [
      "https://images.pexels.com/photos/4628583/pexels-photo-4628583.jpeg?auto=compress&cs=tinysrgb&w=800",
      "https://images.pexels.com/photos/5775099/pexels-photo-5775099.jpeg?auto=compress&cs=tinysrgb&w=800",
    ],
    features: [
      "Limit Perimeter Alerts",
      "Offline Grace Period",
      "Activity Logging",
      "Historical Route Data",
    ],
    menu: [
      {
        name: "Violation Logging",
        description: "Automated recording of all geofence breaches.",
        price: "Active",
        category: "Security",
        tags: ["Audit"],
        image: "https://images.pexels.com/photos/7857526/pexels-photo-7857526.jpeg?auto=compress&cs=tinysrgb&w=800",
      },
    ],
  },
]

export interface Testimonial {
  quote: string
  author: string
  location: string
  rating: number
}

export const testimonials: Testimonial[] = [
  {
    quote:
      "Since integrating AttenRider's biometric attendance, we've completely eliminated buddy punching. The payroll accuracy has improved drastically.",
    author: "Sarah M.",
    location: "HR Director",
    rating: 5,
  },
  {
    quote:
      "The geofencing alerts are a game changer. Our admins no longer have to guess if riders are actually in their assigned zones; we get notified immediately.",
    author: "Michael T.",
    location: "Operations Manager",
    rating: 5,
  },
  {
    quote:
      "The live rider map allows us to see exactly who is active and online. It brings total operational transparency to our third-party logistics.",
    author: "Priya K.",
    location: "Fleet Supervisor",
    rating: 5,
  },
  {
    quote:
      "Automated attendance-based salary computation saves our accounting team hours of manual work every cutoff. The data is validated and trustworthy.",
    author: "Robert L.",
    location: "Payroll Administrator",
    rating: 5,
  },
]

export const galleryImages = [
  { src: "https://images.pexels.com/photos/6169123/pexels-photo-6169123.jpeg?auto=compress&cs=tinysrgb&w=800", alt: "Workforce Monitoring Dashboard" },
  { src: "https://images.pexels.com/photos/11100371/pexels-photo-11100371.jpeg?auto=compress&cs=tinysrgb&w=800", alt: "Live Geofencing Map" },
  { src: "https://images.pexels.com/photos/4481258/pexels-photo-4481258.jpeg?auto=compress&cs=tinysrgb&w=800", alt: "HR Admin Panel" },
  { src: "https://images.pexels.com/photos/5990263/pexels-photo-5990263.jpeg?auto=compress&cs=tinysrgb&w=800", alt: "Biometric Facial Recognition Terminal" },
  { src: "https://images.pexels.com/photos/4481260/pexels-photo-4481260.jpeg?auto=compress&cs=tinysrgb&w=800", alt: "Rider Activity Logs" },
  { src: "https://images.pexels.com/photos/8090299/pexels-photo-8090299.jpeg?auto=compress&cs=tinysrgb&w=800", alt: "Mobile Time-In Application" },
]
