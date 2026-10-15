"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  LayoutDashboard,
  Users,
  ScanFace,
  MapPin,
  Wallet,
  ChevronDown,
  ArrowUpRight,
  Bell,
  Search,
  Download,
  SlidersHorizontal,
  Check,
  Clock3,
  CircleHelp,
  X,
  ChevronRight,
  CalendarDays,
  ShieldCheck,
  ArrowRight,
} from "lucide-react"
import gsap from "gsap"
import { Brand } from "@/components/brand-logo"

export const riders = [
  { name: "Miguel Santos", id: "MKB-001", initials: "MS", time: "07:48 AM", out: "—", status: "On time", zone: "North Hub", location: "Inside zone", color: "sage" },
  { name: "Andrea Reyes", id: "MKB-002", initials: "AR", time: "07:52 AM", out: "—", status: "On time", zone: "Central Hub", location: "Inside zone", color: "peach" },
  { name: "Paolo Cruz", id: "MKB-003", initials: "PC", time: "08:16 AM", out: "—", status: "Late", zone: "North Hub", location: "Inside zone", color: "blue" },
  { name: "Daniel Garcia", id: "MKB-004", initials: "DG", time: "07:55 AM", out: "—", status: "On time", zone: "South Hub", location: "Inside zone", color: "sand" },
  { name: "Sofia Mendoza", id: "MKB-005", initials: "SM", time: "07:46 AM", out: "—", status: "On time", zone: "Central Hub", location: "Inside zone", color: "sage" },
  { name: "Luis Navarro", id: "MKB-006", initials: "LN", time: "—", out: "—", status: "Absent", zone: "South Hub", location: "Not recorded", color: "peach" },
  { name: "Nico Flores", id: "MKB-007", initials: "NF", time: "07:59 AM", out: "—", status: "On time", zone: "North Hub", location: "Inside zone", color: "blue" },
  { name: "Elena Ramos", id: "MKB-008", initials: "ER", time: "07:50 AM", out: "12:05 PM", status: "On time", zone: "Central Hub", location: "Inside zone", color: "sand" },
]

export function StatusBadge({ status }: { status: string }) {
  const colorClass =
    status === "Late" || status === "Pending"
      ? "amber"
      : status === "Absent" || status === "Outside zone"
      ? "red"
      : "green"
  return (
    <span className={`status-badge ${colorClass}`}>
      <span />
      {status}
    </span>
  )
}

export function MiniMap({ outside = false }: { outside?: boolean }) {
  return (
    <div
      className={`mini-map ${outside ? "outside" : ""}`}
      role="img"
      aria-label={`Approved operational area. Rider is ${outside ? "outside" : "inside"} the geofence.`}
    >
      <div className="map-block block-one" />
      <div className="map-block block-two" />
      <div className="map-block block-three" />
      <div className="map-road road-one" />
      <div className="map-road road-two" />
      <div className="map-road road-three" />
      <span className="map-street street-one">SERVICE ROAD</span>
      <span className="map-street street-two">NORTH AVENUE</span>
      <div className="geo-area">
        <span className="hub-marker">
          <span />
          North Hub
        </span>
      </div>
      <div className="rider-pin">
        <MapPin size={20} fill="currentColor" />
        <span>Rider location</span>
      </div>
      <span className="map-caption">APPROVED OPERATIONAL AREA</span>
    </div>
  )
}

export function DashboardPreview({
  compact = false,
  initialView = "Overview",
  role = "Admin",
}: {
  compact?: boolean
  initialView?: string
  role?: string
}) {
  const [view, setView] = useState(initialView)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("All riders")
  const [zone, setZone] = useState("All zones")
  const [filters, setFilters] = useState(false)
  const [notifications, setNotifications] = useState(false)
  const [selected, setSelected] = useState<(typeof riders)[number] | null>(null)
  const body = useRef<HTMLDivElement>(null)

  const filtered = riders.filter(
    (r) =>
      `${r.name} ${r.id}`.toLowerCase().includes(query.toLowerCase()) &&
      (status === "All riders" || r.status === status) &&
      (zone === "All zones" || r.zone === zone)
  )

  useEffect(() => {
    if (typeof window === "undefined") return
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (prefersReduced) return

    const ctx = gsap.context(() => {
      gsap.from(".rider-row", {
        opacity: 0,
        y: 5,
        duration: 0.23,
        stagger: 0.025,
      })
    }, body)
    return () => ctx.revert()
  }, [query, status, zone, view])

  const exportCSV = () => {
    const csv = [
      "Rider,Rider ID,Status,Time In,Time Out,Zone,Location",
      ...filtered.map(
        (r) => `${r.name},${r.id},${r.status},${r.time},${r.out},${r.zone},${r.location}`
      ),
    ].join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
    const a = document.createElement("a")
    a.href = url
    a.download = "ridertrack-sample-attendance.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={`dashboard ${compact ? "dashboard-compact" : ""}`}>
      <aside className="dash-sidebar">
        <Brand small />
        <div className="workspace">
          <span className="workspace-icon">M</span>
          <span>
            MKB Corporation
            <small>Operations workspace</small>
          </span>
          <ChevronDown size={12} />
        </div>
        <div className="sidebar-caption">WORKSPACE</div>
        <nav aria-label="Demo dashboard navigation">
          {[
            { name: "Overview", icon: LayoutDashboard },
            { name: "Attendance", icon: ScanFace },
            { name: "Monitoring", icon: MapPin },
            { name: "Payroll", icon: Wallet },
          ].map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={view === name ? "selected" : ""}
              onClick={() => {
                setView(name)
                setSelected(null)
              }}
            >
              <Icon size={14} />
              {name}
              {view === name && <span className="nav-small-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/contact">
            <CircleHelp size={14} />
            Help & support
            <ArrowUpRight size={12} />
          </Link>
          <div className="dash-user">
            <span className="avatar sand">{role === "HR" ? "HR" : "AD"}</span>
            <span>
              {role} workspace
              <small>Demo account</small>
            </span>
            <ChevronDown size={12} />
          </div>
        </div>
      </aside>

      <div className="dash-content" ref={body}>
        <header className="dash-topbar">
          <span>
            Workspace <ChevronRight size={11} /> <strong>{view}</strong>
          </span>
          <span className="dash-topbar-right">
            <span className="demo-label">DEMO</span>
            <button
              className="icon-button"
              onClick={() => setNotifications(!notifications)}
              aria-expanded={notifications}
              aria-label="View demo notifications"
            >
              <Bell size={14} />
              <i />
            </button>
            <span className="avatar sand">{role === "HR" ? "HR" : "AD"}</span>
          </span>
          {notifications && (
            <div className="notification-panel">
              <strong>Activity notifications</strong>
              <p>
                <Check size={14} />
                Miguel Santos checked in at 07:48 AM.
              </p>
              <p>
                <Clock3 size={14} />
                Paolo Cruz has a late attendance record.
              </p>
              <small>Illustrative activity &middot; 18 June 2026</small>
            </div>
          )}
        </header>

        <div className="dash-body">
          <div className="dash-title">
            <div>
              <h3>
                {view === "Overview"
                  ? "Workforce overview"
                  : view === "Payroll"
                  ? "Payroll overview"
                  : view === "Monitoring"
                  ? "Workforce monitoring"
                  : "Attendance records"}
              </h3>
              <p>
                {view === "Payroll"
                  ? "From attendance to reviewed payroll records."
                  : "A clear view of your riders. All in one place."}
              </p>
            </div>
            <span className="date-chip">
              <CalendarDays size={12} />
              Jun 18, 2026
              <ChevronDown size={10} />
            </span>
          </div>

          <div className="metric-grid">
            {[
              { label: "Total riders", value: "08", icon: Users, note: "Assigned workforce", style: "" },
              { label: "On time", value: "06", icon: Check, note: "Verified & checked in", style: "green" },
              { label: "Late", value: "01", icon: Clock3, note: "After scheduled start", style: "orange" },
              { label: "Absent", value: "01", icon: Users, note: "No attendance record", style: "muted" },
            ].map(({ label, value, icon: Icon, note, style }) => (
              <div className={`metric ${style}`} key={label}>
                <span>
                  {label}
                  <Icon size={13} />
                </span>
                <strong>{value}</strong>
                <small>{note}</small>
              </div>
            ))}
          </div>

          {view === "Payroll" ? (
            <div className="demo-payroll">
              <div className="table-heading">
                <h4>Current payroll period</h4>
                <StatusBadge status="Pending" />
              </div>
              <p>June 1–15, 2026 &middot; Sample preparation</p>
              <div className="payroll-mini-steps">
                <span>
                  <Check size={15} />
                  Attendance reviewed
                </span>
                <span>
                  <Clock3 size={15} />
                  Preparation in progress
                </span>
                <span>Awaiting submission</span>
              </div>
              <Link className="text-link" href="/modules">
                Explore the payroll workflow
                <ArrowRight size={14} />
              </Link>
            </div>
          ) : (
            <>
              <div className="table-heading">
                <h4>
                  {view === "Monitoring" ? "Rider activity" : "Today’s attendance"}
                  <span>{riders.length} riders</span>
                </h4>
                <div>
                  <span className="live-dot" />
                  Sample workspace
                </div>
              </div>

              <div className="table-toolbar">
                <label className="search-field">
                  <Search size={13} />
                  <input
                    aria-label="Search riders"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search riders..."
                  />
                </label>
                <select
                  aria-label="Filter attendance status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option>All riders</option>
                  <option>On time</option>
                  <option>Late</option>
                  <option>Absent</option>
                </select>
                <button
                  className={`tiny-button ${filters ? "filter-active" : ""}`}
                  onClick={() => setFilters(!filters)}
                  aria-expanded={filters}
                >
                  <SlidersHorizontal size={12} />
                  <span>Filter</span>
                </button>
                <button
                  className="tiny-button export-button"
                  onClick={exportCSV}
                  aria-label="Export sample attendance CSV"
                >
                  <Download size={12} />
                  <span>Export</span>
                </button>
              </div>

              {filters && (
                <div className="filter-bar">
                  <label>
                    Operational zone
                    <select value={zone} onChange={(e) => setZone(e.target.value)}>
                      <option>All zones</option>
                      <option>North Hub</option>
                      <option>Central Hub</option>
                      <option>South Hub</option>
                    </select>
                  </label>
                  <button
                    onClick={() => {
                      setZone("All zones")
                      setStatus("All riders")
                      setQuery("")
                    }}
                  >
                    Reset filters
                  </button>
                </div>
              )}

              <div className="table-scroll">
                <table className="rider-table">
                  <thead>
                    <tr>
                      <th>Rider</th>
                      <th>Status</th>
                      <th>Time In</th>
                      {!compact && <th>Time Out</th>}
                      <th className="zone-column">Zone</th>
                      {!compact && <th>Location state</th>}
                      <th aria-label="Details" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, compact ? 4 : 8).map((r) => (
                      <tr className="rider-row" key={r.id}>
                        <td>
                          <button className="rider-name" onClick={() => setSelected(r)}>
                            <span className={`avatar ${r.color}`}>{r.initials}</span>
                            <span>
                              {r.name}
                              <small>{r.id}</small>
                            </span>
                          </button>
                        </td>
                        <td>
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="time-cell">{r.time}</td>
                        {!compact && <td>{r.out}</td>}
                        <td className="zone-column">
                          <span className="zone-label">
                            <MapPin size={10} />
                            {r.zone}
                          </span>
                        </td>
                        {!compact && (
                          <td>
                            <span
                              className={
                                r.location === "Inside zone"
                                  ? "location-verified"
                                  : "muted-text"
                              }
                            >
                              {r.location === "Inside zone" && <ShieldCheck size={12} />} {r.location}
                            </span>
                          </td>
                        )}
                        <td>
                          <button
                            className="row-detail"
                            aria-label={`View ${r.name} attendance`}
                            onClick={() => setSelected(r)}
                          >
                            <ChevronRight size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length === 0 && (
                  <div className="empty-state">
                    No riders match your filters.
                    <button
                      onClick={() => {
                        setQuery("")
                        setStatus("All riders")
                        setZone("All zones")
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </div>

              {compact ? (
                <div className="dash-lower">
                  <div className="recent-activity">
                    <h4>
                      Latest activity
                      <span className="live-dot" />
                    </h4>
                    <div>
                      <span className="activity-check">
                        <Check size={12} />
                      </span>
                      <p>
                        <strong>Miguel Santos</strong> checked in
                        <small>Identity verified &middot; Inside North Hub</small>
                      </p>
                      <span>07:48</span>
                    </div>
                    <Link href="/modules">
                      View all activity
                      <ArrowUpRight size={11} />
                    </Link>
                  </div>
                  <div className="dash-map">
                    <MiniMap />
                    <div>
                      <span className="live-dot" />
                      Geofence active <span>North Hub</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="table-footer">
                  Showing {filtered.length} of {riders.length} riders
                  <span>Fictional data &middot; Product demonstration only</span>
                </div>
              )}
            </>
          )}

          {selected && (
            <div className="rider-detail-panel" role="region" aria-label="Selected rider details">
              <button
                className="detail-close icon-button"
                onClick={() => setSelected(null)}
                aria-label="Close rider details"
              >
                <X size={17} />
              </button>
              <span className={`avatar ${selected.color}`}>{selected.initials}</span>
              <h4>{selected.name}</h4>
              <p>
                {selected.id} &middot; {selected.zone}
              </p>
              <StatusBadge status={selected.status} />
              <dl>
                <div>
                  <dt>Time In</dt>
                  <dd>{selected.time}</dd>
                </div>
                <div>
                  <dt>Time Out</dt>
                  <dd>{selected.out}</dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{selected.location}</dd>
                </div>
                <div>
                  <dt>Identity</dt>
                  <dd>{selected.status === "Absent" ? "Not recorded" : "Face verified"}</dd>
                </div>
              </dl>
              <small>Illustrative attendance record</small>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
