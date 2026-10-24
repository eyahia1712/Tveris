import Link from "next/link";

/**
 * The close of the landing page: the paper above dissolves into a deep ground,
 * dashed guides give it structure, and the wordmark rises into the page's
 * bottom edge, softening as it goes. Ink and paper only.
 */

const NAVIGATION = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/inbox", label: "Inbox map" },
  { href: "/report", label: "Discrepancy report" },
  { href: "/connect", label: "Connect a mailbox" },
];

const RESOURCES = [
  { href: "/docs", label: "Docs" },
  { href: "/dashboard", label: "Live demo" },
  { href: "/docs#runbook", label: "Demo runbook" },
];

const LINK = "transition-opacity hover:opacity-70";

export function SiteFooter() {
  return (
    <footer className="xv-footer-ground relative z-30 isolate overflow-hidden text-[#F3F3F3]">
      <div className="relative z-10 px-5 pt-28 md:px-8">
        <div className="mx-auto grid w-full max-w-7xl gap-12 lg:grid-cols-12 lg:gap-7">
          <div className="relative grid gap-9 lg:col-span-5">
            <Pin className="-top-5 left-0" />
            <div>
              <p className="xv-micro xv-micro-sm text-[#F3F3F3]/50">Built for</p>
              <p className="mt-3 text-[clamp(1.7rem,3vw,2.3rem)] leading-none font-medium tracking-[-0.02em]">HackAI 2026</p>
              <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-[#F3F3F3]/60">
                Agentic AI Cybersecurity Hackathon · GDEX × ANON × UTAR · Track 02: Secure Logistics &amp; Digital Trust.
              </p>
            </div>
            <div>
              <p className="xv-micro xv-micro-sm text-[#F3F3F3]/50">Verified by</p>
              <p className="mt-3 text-[clamp(1.7rem,3vw,2.3rem)] leading-none font-medium tracking-[-0.02em]">Claude · deterministic checks</p>
            </div>
          </div>

          <div className="grid gap-10 sm:grid-cols-2 lg:col-span-6 lg:col-start-7 lg:grid-cols-3">
            <FooterColumn heading="Navigation">
              {NAVIGATION.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={LINK}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </FooterColumn>
            <FooterColumn heading="Resources">
              {RESOURCES.map((item) => (
                <li key={item.label}>
                  <Link href={item.href} className={LINK}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </FooterColumn>
            <div className="flex items-start sm:justify-end">
              <a href="#top" className="group flex items-center gap-3" aria-label="Back to top">
                <span className="xv-micro xv-micro-sm text-[#F3F3F3]/70">Back to top</span>
                <span className="grid size-[34px] place-items-center bg-white/10 transition-colors group-hover:bg-white group-hover:text-[#04122b]">
                  <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5" />
                  </svg>
                </span>
              </a>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-16 w-full max-w-7xl border-t border-white/12">
          <div className="flex flex-wrap items-center justify-between gap-4 py-5">
            <p className="xv-micro xv-micro-sm text-[#F3F3F3]/55">Agentic AI Cybersecurity Hackathon 2026 · Secure Logistics &amp; Digital Trust</p>
            <p className="xv-micro xv-micro-sm text-[#F3F3F3]/45">© 2026 Team Tveris</p>
          </div>
        </div>
      </div>

      {/* The wordmark, sized to the page and cropped by its bottom edge. */}
      <div className="relative mt-2 h-[13.4vw] min-h-[59px] overflow-hidden">
        <p
          aria-hidden
          className="-mt-[0.05em] text-center text-[17.6vw] leading-[0.78] font-extrabold tracking-[-0.045em] whitespace-nowrap text-[#F3F3F3] italic"
          style={{ fontFamily: "var(--font-logo), var(--font-sans), sans-serif" }}
        >
          Tveris
        </p>
      </div>

      <div aria-hidden className="xv-bottom-blur">
        <span />
        <span />
        <span />
        <span />
      </div>
    </footer>
  );
}

/** The signature detail: a small square marking a section corner. */
function Pin({ className }: { className?: string }) {
  return <span aria-hidden className={`absolute block size-1.5 bg-[#F3F3F3]/70 ${className ?? ""}`} />;
}

function FooterColumn({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="xv-micro xv-micro-sm text-[#F3F3F3]/55">{heading}</h2>
      <ul className="mt-4 space-y-2.5 text-[16px] leading-snug font-medium">{children}</ul>
    </div>
  );
}
