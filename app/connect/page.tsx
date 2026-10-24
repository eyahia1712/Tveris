import Link from "next/link";

import { ClaudeMark, GmailMark, OutlookMark, SampleInboxMark } from "@/components/brand/source-marks";
import { TverisLogo } from "@/components/brand/logo";
import { Icon } from "@/components/icons";
import { DisconnectButton } from "@/components/report/disconnect-button";
import { BUTTON_PRIMARY, Micro } from "@/components/ui/bits";
import { aiConfig } from "@/lib/ai/claude";
import { gmailConfigured } from "@/lib/gmail";
import { currentGmailSession, parseSourceParam } from "@/lib/server/context";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sources" };

const ERRORS: Record<string, string> = {
  not_configured: "Gmail is not configured on this server yet (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and TVERIS_SECRET are required).",
  denied: "Google sign-in was cancelled or could not be verified.",
  exchange_failed: "Google did not return a usable token. Please try again.",
};

/** Where mail and intelligence come from, and which one is in use right now. */
export default async function ConnectPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const error = params.error;
  const session = await currentGmailSession();
  const configured = gmailConfigured();
  const ai = aiConfig();
  const evaluationServer = process.env.TVERIS_SOURCE_URL ?? null;
  const using = parseSourceParam(params.source) === "gmail" && session !== null ? "gmail" : "sample";

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3 md:px-8">
          <Link href="/" className="xv-focus" aria-label="Tveris home">
            <TverisLogo size={26} />
          </Link>
          <Link href="/dashboard" className="xv-focus inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
            <Icon name="ArrowLeft2" size={13} />
            Back to the dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-5 py-10 md:px-8">
        <div className="space-y-2">
          <Micro>Sources</Micro>
          <h1 className="text-[30px] leading-tight font-medium tracking-[-0.02em]">Connect the inbox your team already uses.</h1>
          <p className="max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
            Tveris reads new mail, sorts it into five queues, checks every shipping instruction against its draft bill of lading,
            and puts what needs a person first. Access is read-only: nothing is sent, nothing is deleted.
          </p>
        </div>

        {typeof error === "string" && ERRORS[error] ? (
          <p className="border border-bad/40 bg-[color-mix(in_srgb,var(--signal-bad)_6%,white)] p-3 text-[13px] text-bad" role="alert">
            {ERRORS[error]}
          </p>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <SourceCard
            mark={<SampleInboxMark size={30} />}
            title="Sample inbox"
            status={evaluationServer !== null ? `Live from ${evaluationServer}` : "520 emails, bundled"}
            active={using === "sample"}
            body="The organisers' dataset: JSON emails with SI and draft BL attachments in text, Excel, Word, PDF and scanned PDF. With TVERIS_SOURCE_URL set, Tveris reads their server and can self-evaluate."
            action={
              <Link href="/dashboard?source=sample" className={BUTTON_PRIMARY}>
                <Icon name="DirectInbox" size={14} /> Open this inbox
              </Link>
            }
          />

          <SourceCard
            mark={<GmailMark size={30} />}
            title="Gmail"
            status={session !== null ? `Connected as ${session.email}` : configured ? "Ready to connect" : "Coming soon"}
            active={using === "gmail"}
            body="Sign in with Google, read-only. Tveris pulls the last 14 days of mail and its document attachments, then checks them exactly like the sample inbox. The token stays encrypted in your own browser."
            action={
              session !== null ? (
                <div className="flex flex-wrap gap-2">
                  <Link href="/dashboard?source=gmail" className={BUTTON_PRIMARY}>
                    <Icon name="DirectInbox" size={14} /> Open my Gmail
                  </Link>
                  <DisconnectButton />
                </div>
              ) : (
                <a href="/api/gmail/connect" className={cn(BUTTON_PRIMARY, !configured && "pointer-events-none opacity-50")} aria-disabled={!configured}>
                  Connect Gmail
                </a>
              )
            }
          />

          <SourceCard
            mark={<ClaudeMark size={30} />}
            title="Claude"
            status={ai.enabled ? ai.model : undefined}
            active={false}
            body="Claude classifies every email and says why, reads scanned PDFs with vision, and maps layouts the parser has not seen. The seven-field comparison stays deterministic code, so a match is never a guess."
          />

          <SourceCard
            mark={<OutlookMark size={30} />}
            title="Outlook / Microsoft 365"
            status="On the roadmap"
            active={false}
            body="The same reading path as Gmail, through Microsoft Graph: one source interface, one pipeline, one dashboard."
          />
        </div>
      </main>
    </div>
  );
}

function SourceCard({
  mark,
  title,
  status,
  body,
  active,
  action,
}: {
  mark: React.ReactNode;
  title: string;
  status?: string;
  body: string;
  active: boolean;
  action?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 border p-5",
        active ? "border-[#FFC300] bg-[color-mix(in_srgb,#FFC300_12%,white)]" : "border-border bg-card",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center border border-border bg-white">{mark}</span>
          <div>
            <h2 className="text-[17px] leading-tight font-medium">{title}</h2>
            {status !== undefined ? (
              <p className={cn("mt-0.5 text-[12px]", active ? "text-[#5C4700]" : "text-muted-foreground")}>{status}</p>
            ) : null}
          </div>
        </div>
        {active ? (
          <span className="xv-micro xv-micro-sm inline-flex h-6 items-center gap-1.5 bg-[#FFC300] px-2 text-[#3D2E00]">
            <Icon name="TickCircle" size={12} variant="Bold" />
            In use
          </span>
        ) : null}
      </div>
      <p className={cn("text-[13px] leading-relaxed", active ? "text-[#5C4700]" : "text-muted-foreground")}>{body}</p>
      {action ? <div className="mt-auto pt-1">{action}</div> : null}
    </section>
  );
}
