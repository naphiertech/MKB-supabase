import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { Check, ArrowUpRight, ArrowRight } from "lucide-react"
import { SectionHeader, Eyebrow } from "@/components/section-header"
import { CtaSection } from "@/components/home/cta-section"
import { systemModules, type SystemModule, siteConfig, getDashboardUrl } from "@/lib/data"

export const metadata: Metadata = {
  title: "Modules & Capabilities",
  description:
    "Explore the core capabilities of the MKBRiderTrack enterprise platform — biometric attendance, facial recognition, geofencing, parcel rates, payroll, multi-hub dispatch, and audit trails.",
}

export default function ModulesPage() {
  const dashboardUrl = getDashboardUrl()

  return (
    <>
      <section className="page-hero container">
        <div data-enter>
          <Eyebrow>SYSTEM CAPABILITIES</Eyebrow>
        </div>
        <div className="page-hero-grid">
          <h1 data-enter>
            Integrated pillars of
            <br />
            <span>last-mile intelligence.</span>
          </h1>
          <div data-enter>
            <p className="lead">
              Every capability in MKBRiderTrack is engineered to operate as a coordinated
              system—ensuring end-to-end transparency from rider check-in to finalized salary
              disbursement.
            </p>
            <Link
              href="/contact"
              className="text-link"
            >
              Contact <ArrowUpRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      <section className="container section-space">
        <div className="flex flex-col gap-20">
          {systemModules.map((mod: SystemModule, index: number) => {
            const isEven = index % 2 === 0
            return (
              <article
                key={mod.id}
                id={mod.id}
                className="scroll-mt-24 border-b border-[#e7e8e2] pb-20 last:border-b-0 last:pb-0"
                data-reveal
              >
                <div
                  className={`grid items-center gap-12 lg:grid-cols-2 lg:gap-16 ${
                    isEven ? "" : "lg:grid-flow-dense"
                  }`}
                >
                  {/* Media */}
                  <div className={isEven ? "" : "lg:col-start-2"}>
                    <div className="relative aspect-[16/10] overflow-hidden rounded-md border border-[#e3e6da] bg-[#f0f2e9] shadow-sm">
                      <Image
                        src={mod.image}
                        alt={mod.title}
                        fill
                        className="object-cover transition-transform duration-500 hover:scale-[1.03]"
                        sizes="(max-width: 1024px) 100vw, 50vw"
                      />
                    </div>
                  </div>

                  {/* Content */}
                  <div className={isEven ? "" : "lg:col-start-1"}>
                    <div className="eyebrow mb-2" style={{ fontSize: "8px", letterSpacing: "1.4px" }}>
                      <span />
                      {mod.category.toUpperCase()}
                    </div>
                    <h2 className="text-3xl font-semibold tracking-tight text-[#282b26]">
                      {mod.title}
                    </h2>
                    <p className="mt-3 text-xs leading-relaxed text-[#767a71] md:text-sm">
                      {mod.description}
                    </p>

                    <div className="mt-6 border-t border-[#e7e8e2] pt-5">
                      <div className="eyebrow mb-3" style={{ fontSize: "8px", letterSpacing: "1.2px" }}>
                        KEY FEATURES
                      </div>
                      <ul className="space-y-2.5">
                        {mod.features.map((feature, i) => (
                          <li key={i} className="flex items-center gap-2.5 text-xs text-[#5f6758]">
                            <Check size={14} className="text-[var(--orange)] shrink-0" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-7">
                      <a
                        href={dashboardUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="button button-orange text-xs"
                      >
                        Explore in Portal
                        <ArrowUpRight size={16} />
                      </a>
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <CtaSection />
    </>
  )
}
