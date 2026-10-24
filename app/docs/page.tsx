import Link from "next/link";

import { TverisLogo } from "@/components/brand/logo";
import { SiteFooter } from "@/components/landing/site-footer";

export const metadata = { title: "Docs" };

/**
 * A short, honest technical page: what the system is, how to run it, and where
 * the code lives. The README in the repository is the full version.
 */
export default function DocsPage() {
  return (
    <div id="top" className="xv-landing min-h-dvh">
      <header className="border-b border-[var(--hairline-warm)] bg-[var(--paper-warm)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3 md:px-8">
          <Link href="/" className="xv-focus" aria-label="Tveris home">
            <TverisLogo size={26} />
          </Link>
          <Link href="/dashboard" className="xv-micro xv-micro-sm xv-focus min-h-9 bg-[var(--saffron)] px-4 leading-9 text-[var(--saffron-deep)]">
            Open the dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-10 px-5 py-14 md:px-8">
        <div>
          <p className="xv-micro xv-micro-sm text-[var(--ink-3)]">Docs</p>
          <h1 className="mt-3 text-[clamp(2rem,4vw,3rem)] leading-tight font-medium tracking-[-0.025em]">
            Tveris, end to end.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-[var(--ink-2)]">
            Tveris turns a shipping documentation inbox into a short, ranked list of work: it classifies every email,
            reads the SI and the draft BL in any format, compares the seven shipment fields, and escalates whatever it
            cannot decide, with the evidence attached.
          </p>
        </div>

        <Section title="Architecture">
          <ol className="space-y-3 text-[14px] leading-relaxed text-[var(--ink-2)]">
            <li><b className="text-[var(--ink-deep)]">Sources.</b> One interface serves the organisers&apos; dataset, their evaluation server and Gmail (read-only OAuth), so the pipeline is identical for all three.</li>
            <li><b className="text-[var(--ink-deep)]">Pipeline.</b> Classify (Claude + a rule engine, cross-checked) → read attachments (text, Excel, Word, PDF, vision for scans) → extract seven fields by meaning → compare deterministically → triage into a next action.</li>
            <li><b className="text-[var(--ink-deep)]">Store.</b> PostgreSQL when a database URL is set, JSON files otherwise. Reviews and retries update one email in place.</li>
            <li><b className="text-[var(--ink-deep)]">App.</b> Next.js serves the landing page, the dashboard, the inbox map, the email pages and the API, and runs whole-inbox jobs in the background.</li>
          </ol>
        </Section>

        <Section title="Run it locally">
          <pre className="overflow-x-auto border border-[var(--hairline-warm)] bg-[var(--paper-warm-2)] p-4 font-mono text-[13px] leading-relaxed">{`npm install
cp .env.example .env.local     # add ANTHROPIC_API_KEY for AI + vision
npm run process                # read the sample inbox from the command line
npm run dev                    # http://localhost:3000
npm test                       # the pipeline tests, including all 520 emails`}</pre>
        </Section>

        <Section title="Self-evaluation" id="runbook">
          <p className="text-[14px] leading-relaxed text-[var(--ink-2)]">
            With the organisers&apos; Docker server running, point Tveris at it and submit the run for the official scoreboard:
          </p>
          <pre className="mt-3 overflow-x-auto border border-[var(--hairline-warm)] bg-[var(--paper-warm-2)] p-4 font-mono text-[13px]">{`npm run process -- --source http://localhost:8080 --submit`}</pre>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--ink-2)]">
            The dashboard exports the same file from the left rail (&ldquo;JSON&rdquo;), keyed by email id, in the format of
            <code className="mx-1 font-mono text-[13px]">sample_submission.json</code>.
          </p>
        </Section>

        <Section title="Source code" id="github">
          <p className="text-[14px] leading-relaxed text-[var(--ink-2)]">
            The repository link is published with the hackathon submission. It contains the full README, the pipeline,
            the tests and the deployment files (Dockerfile for Cloud Run, environment template, scheduled re-read endpoint).
          </p>
        </Section>
      </main>

      <SiteFooter />
    </div>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3 border-t border-[var(--hairline-warm)] pt-8">
      <h2 className="text-[20px] font-medium tracking-[-0.015em]">{title}</h2>
      {children}
    </section>
  );
}
