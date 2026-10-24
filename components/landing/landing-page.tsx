import Link from "next/link";

import Image from "next/image";

import { TverisLogo } from "@/components/brand/logo";
import { ShipScene } from "@/components/landing/ship-scene";
import { SiteFooter } from "@/components/landing/site-footer";
import { cn } from "@/lib/utils";

/**
 * The front door: the ship and the promise on the first screen, the problem it
 * solves, the product itself in one picture, and the questions a judge or an
 * ops manager will ask. The live queues live inside, on /dashboard.
 */

export interface LandingNumbers {
  emails: number;
  checks: number;
  mismatches: number;
  escalations: number;
  shipments: number;
  aiEnabled: boolean;
  model: string;
}

/**
 * The page's measure: a centred column with real space on both sides, so the
 * layout holds its shape when the window is resized or zoomed.
 */
const SHELL = "mx-auto w-full max-w-[1120px] px-5 md:px-8";

const SAFFRON_BUTTON =
  "xv-micro xv-micro-sm xv-focus inline-flex min-h-11 items-center justify-center gap-2 bg-[var(--saffron)] px-5 text-[var(--saffron-deep)] transition-transform hover:-translate-y-0.5";
const INK_BUTTON =
  "xv-micro xv-micro-sm xv-focus inline-flex min-h-11 items-center justify-center gap-2 border border-[var(--ink-deep)] px-5 text-[var(--ink-deep)] transition-colors hover:bg-[var(--ink-deep)] hover:text-[var(--paper-warm)]";

export function LandingPage({ numbers }: { numbers: LandingNumbers | null }) {
  return (
    <div id="top" className="xv-landing min-h-dvh">
      <Nav />
      <Hero numbers={numbers} />
      <Problem />
      <Inside numbers={numbers} />
      <HowItWorks />
      <Faq numbers={numbers} />
      <SiteFooter />
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--hairline-warm)] bg-[var(--paper-warm)]/90 backdrop-blur">
      <div className={cn(SHELL, "flex flex-wrap items-center gap-x-6 gap-y-2 py-3")}>
        <Link href="/" className="xv-focus" aria-label="Tveris home">
          <TverisLogo size={26} />
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Sections">
          <NavLink href="#problem" label="The problem" />
          <NavLink href="#inside" label="Inside" />
          <NavLink href="#how" label="How it works" />
          <NavLink href="#faq" label="FAQ" />
        </nav>
        <div className="ml-auto">
          <Link href="/dashboard" className={cn(SAFFRON_BUTTON, "min-h-9 px-4")}>
            Open the dashboard
          </Link>
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="xv-micro xv-micro-sm xv-focus inline-flex min-h-9 items-center px-3 text-[var(--ink-2)] transition-colors hover:text-[var(--ink-deep)]"
    >
      {label}
    </a>
  );
}

/** The first screen: the promise, then the ship sailing across the page. */
function Hero({ numbers }: { numbers: LandingNumbers | null }) {
  return (
    <section className="relative">
      <div className={cn(SHELL, "pt-12 pb-10 md:pt-16")}>
        <TverisLogo size={62} className="-ml-0.5" />
        <p className="xv-micro xv-micro-sm mt-7 text-[var(--ink-3)]">Shipping document verification · from inbox to discrepancy report</p>
        <h1 className="mt-4 max-w-4xl text-[clamp(2.2rem,5.2vw,4rem)] leading-[1] font-medium tracking-[-0.03em]">
          Every bill of lading checked
          <br className="hidden sm:block" /> before the ship sails.
        </h1>
        <p className="mt-6 max-w-2xl text-[16px] leading-relaxed text-[var(--ink-2)]">
          A documentation desk gets hundreds of emails a day: document checks, new shipping instructions, invoice queries, notices and spam.
          Tveris reads all of them, compares every draft bill of lading with its shipping instruction field by field, and tells you what needs a person — with the evidence.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/dashboard" className={SAFFRON_BUTTON}>
            Open the dashboard
          </Link>
          <a href="#how" className={INK_BUTTON}>
            See how it works
          </a>
          {numbers !== null ? (
            <p className="text-[13px] text-[var(--ink-3)]">
              {numbers.emails} emails · {numbers.checks} document checks · 7 fields compared
            </p>
          ) : null}
        </div>
      </div>
      <ShipScene className="h-[min(35.9vw,520px)] border-y border-[var(--hairline-warm)]" />
    </section>
  );
}

const PROBLEMS = [
  {
    title: "The right email is hard to find",
    body: "A document check sits between a berthing report and a phishing mail. Staff read every message to decide what it needs, and a request that is missed is never checked.",
  },
  {
    title: "Comparing by eye is slow and risky",
    body: "Shipper, consignee, notify party, both ports, container count and gross weight, across two documents, hundreds of times a week. One missed consignee change releases cargo to the wrong company.",
  },
  {
    title: "The same field is written differently",
    body: "“Port of Loading” on the SI is “Load Port” on the BL. Values arrive as text, Excel, Word, PDF and scans, some of them blank or unreadable.",
  },
];

function Problem() {
  return (
    <section id="problem" className="scroll-mt-20 border-y border-[var(--hairline-warm)] bg-[var(--paper-warm-2)] py-16 md:py-24">
      <div className={SHELL}>
        <p className="xv-micro xv-micro-sm text-[var(--ink-3)]">The problem</p>
        <h2 className="mt-3 max-w-3xl text-[clamp(1.7rem,3.4vw,2.6rem)] leading-tight font-medium tracking-[-0.02em]">
          The work is not hard. Finding it, and doing it exactly, at volume, is.
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PROBLEMS.map((item, index) => (
            <article key={item.title} className="border border-[var(--hairline-warm)] bg-[var(--paper-warm)] p-6">
              <p className="font-mono text-[13px] text-[var(--ink-3)]">0{index + 1}</p>
              <h3 className="mt-3 text-[18px] leading-snug font-medium">{item.title}</h3>
              <p className="mt-3 text-[14px] leading-relaxed text-[var(--ink-2)]">{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The whole inbox in one picture, with the three signals beside it. */
function Inside({ numbers }: { numbers: LandingNumbers | null }) {
  const verified = (numbers?.checks ?? 0) - (numbers?.mismatches ?? 0) - (numbers?.escalations ?? 0);
  const signals = [
    { label: "Mismatch", value: numbers?.mismatches ?? 0, note: "a field differs from the SI", tone: "text-bad", dot: "bg-bad", edge: "border-bad/35" },
    { label: "Needs a person", value: numbers?.escalations ?? 0, note: "missing, unreadable, wrong document or blank", tone: "text-warn", dot: "bg-warn", edge: "border-warn/35" },
    { label: "Verified", value: verified, note: "all seven fields matched the SI", tone: "text-ok", dot: "bg-ok", edge: "border-ok/35" },
  ];
  return (
    <section id="inside" className="scroll-mt-20 py-16 md:py-24">
      <div className={SHELL}>
        <p className="xv-micro xv-micro-sm text-[var(--ink-3)]">Inside</p>
        <h2 className="mt-3 max-w-3xl text-[clamp(1.7rem,3.4vw,2.6rem)] leading-tight font-medium tracking-[-0.02em]">
          Built for the desk, <span className="text-[var(--brand-red)]">not for a demo</span>.
        </h2>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[var(--ink-2)]">
          {numbers === null
            ? "The whole inbox on one map: the inbox at the centre, the five queues around it."
            : `The whole inbox on one map — all ${numbers.emails} emails, from the last run.`}{" "}
          Every dot is an email, grouped under the queue it belongs to.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-12 lg:gap-7">
          <figure className="lg:col-span-8">
            <div className="overflow-hidden border border-[var(--hairline-warm)] bg-[var(--paper-warm)]">
              <Image
                src="/shots/graph-all.png"
                alt="The Tveris inbox map: 520 emails around five category hubs, mismatches in red, reviews in amber, verified checks in green"
                width={3600}
                height={2400}
                loading="eager"
                className="h-auto w-full"
                sizes="(max-width: 1024px) 100vw, 700px"
              />
            </div>
            <figcaption className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-[var(--ink-3)]">
              <Dot className="bg-bad" label="Mismatch" />
              <Dot className="bg-warn" label="Needs a person" />
              <Dot className="bg-ok" label="Verified" />
              <Dot className="bg-[#5C5A54]" label="Other mail" />
            </figcaption>
          </figure>

          <div className="flex flex-col gap-3 lg:col-span-4">
            {signals.map((signal) => (
              <div key={signal.label} className={cn("border bg-[var(--paper-warm)] p-4", signal.edge)}>
                <p className="flex items-center gap-2 text-[12px] text-[var(--ink-3)]">
                  <span className={cn("inline-block size-2.5 rounded-full", signal.dot)} aria-hidden />
                  {signal.label}
                </p>
                <p className={cn("mt-2 font-mono text-[32px] leading-none font-medium", signal.tone)}>{signal.value}</p>
                <p className="mt-2 text-[12.5px] leading-snug text-[var(--ink-2)]">{signal.note}</p>
              </div>
            ))}
            <Link href="/inbox" className={cn(SAFFRON_BUTTON, "mt-1")}>
              Open the live map
            </Link>
            <p className="text-[12px] leading-snug text-[var(--ink-3)]">
              In the app the map is live: pan, zoom, replay the run, and open any email down to its seven fields.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Dot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block size-2.5 rounded-full", className)} aria-hidden />
      {label}
    </span>
  );
}


const STEPS = [
  { title: "Read the inbox", body: "Gmail or a mail store, with every attachment: text, Excel, Word, PDF and scans.", note: "Read-only" },
  { title: "Sort into five queues", body: "Claude classifies each email; a rule engine checks the same one. Disagreements go to a person.", note: "AI + rules" },
  { title: "Extract seven fields", body: "Parties, both ports, containers and gross weight, matched by meaning, not by label.", note: "Any layout" },
  { title: "Compare and report", body: "Plain code judges SI against BL, so formatting never becomes a false alarm.", note: "Deterministic" },
  { title: "Escalate, don't guess", body: "Missing, unreadable, wrong or blank goes to review with its evidence, and the report updates.", note: "Human in the loop" },
];

/** The pipeline as five small cards, one per step. */
function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 border-t border-[var(--hairline-warm)] bg-[var(--paper-warm-2)] py-16 md:py-24">
      <div className={SHELL}>
        <p className="xv-micro xv-micro-sm text-[var(--ink-3)]">How it works</p>
        <h2 className="mt-3 max-w-3xl text-[clamp(1.5rem,2.8vw,2.1rem)] leading-tight font-medium tracking-[-0.02em]">
          Five steps, and a person exactly where one is needed.
        </h2>
        <ol className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className={cn(
                "flex flex-col border border-[var(--hairline-warm)] bg-[var(--paper-warm)] p-4",
                index === STEPS.length - 1 && "border-[var(--saffron)] bg-[color-mix(in_srgb,var(--saffron)_12%,var(--paper-warm))]",
              )}
            >
              <span
                className={cn(
                  "xv-micro xv-micro-sm inline-flex h-6 w-[30px] items-center justify-center",
                  index === STEPS.length - 1 ? "bg-[var(--saffron)] text-[var(--saffron-deep)]" : "bg-[var(--ink-deep)] text-[var(--paper-warm)]",
                )}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3.5 text-[15px] leading-snug font-medium tracking-[-0.01em]">{step.title}</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--ink-2)]">{step.body}</p>
              <p className="xv-micro xv-micro-sm mt-auto pt-3 text-[var(--ink-3)]">{step.note}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Faq({ numbers }: { numbers: LandingNumbers | null }) {
  const items: Array<{ q: string; a: string }> = [
    {
      q: "Where does the AI actually decide?",
      a: `Claude${numbers?.aiEnabled ? ` (${numbers.model})` : ""} classifies every email and explains why, reads scanned PDFs with vision, and maps layouts the parser has not seen. It never decides that two values match: the seven-field comparison is deterministic code, so the same documents always give the same verdict.`,
    },
    {
      q: "What happens when it cannot decide?",
      a: "The email goes to review with the reason — missing attachment, unreadable file, wrong document type, or a blank value — and the evidence. A person confirms it or types what the document really says, the comparison runs again on their values, and the report updates.",
    },
    {
      q: "Does it read my whole mailbox?",
      a: "Gmail access is read-only and covers recent mail and its document attachments. The token is kept encrypted in your own browser, never in our database, and disconnecting removes it. Nothing is ever sent or deleted on your behalf.",
    },
    {
      q: "Which document formats are supported?",
      a: "Plain text, Excel, Word, PDF with text, and image-only scans through vision. A file that cannot be opened is reported as unreadable instead of being skipped quietly.",
    },
    {
      q: "How do you avoid false alarms?",
      a: "Values are normalised before comparison: 131,058 KG equals 131058, a repeated city-state equals the city, and a missing port code is formatting, not a discrepancy. A wrong port is still caught, because the name decides, not the code.",
    },
    {
      q: "Can I check the numbers myself?",
      a: "Yes. The discrepancy report lists every check with both values side by side, the export produces the organisers' submission file, and the whole pipeline runs from the command line with the tests.",
    },
  ];
  return (
    <section id="faq" className="scroll-mt-20 border-t border-[var(--hairline-warm)] py-16 md:py-24">
      <div className={cn(SHELL, "grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]")}>
        <div>
          <p className="xv-micro xv-micro-sm text-[var(--ink-3)]">FAQ</p>
          <h2 className="mt-3 max-w-3xl text-[clamp(1.7rem,3.4vw,2.6rem)] leading-tight font-medium tracking-[-0.02em]">Questions worth asking.</h2>
          <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-[var(--ink-2)]">
            Ready to see it on real mail? Open the dashboard, or connect a mailbox and let Tveris read a fortnight of it.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/dashboard" className={SAFFRON_BUTTON}>
              Open the dashboard
            </Link>
            <Link href="/connect" className={INK_BUTTON}>
              Connect a mailbox
            </Link>
          </div>
        </div>
        <ul className="divide-y divide-[var(--hairline-warm)] border-y border-[var(--hairline-warm)]">
          {items.map((item) => (
            <li key={item.q}>
              <details className="group">
                <summary className="xv-focus flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[17px] leading-snug font-medium">
                  {item.q}
                  <span className="grid size-7 shrink-0 place-items-center border border-[var(--hairline-warm)] transition-colors group-open:bg-[var(--saffron)]" aria-hidden>
                    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M3 8h10" />
                      <path d="M8 3v10" className="group-open:hidden" />
                    </svg>
                  </span>
                </summary>
                <p className="pb-5 text-[14px] leading-relaxed text-[var(--ink-2)]">{item.a}</p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
