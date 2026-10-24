import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/icons";
import { FieldTable } from "@/components/report/field-table";
import { ReplyActions } from "@/components/report/reply-actions";
import { ReviewForm } from "@/components/report/review-form";
import { CategoryChip, Hairline, Micro, PriorityChip, StatusChip } from "@/components/ui/bits";
import { Wordmark } from "@/components/dashboard/left-rail";
import { draftReply } from "@/lib/domain/reply";
import { DOC_KIND_LABELS } from "@/lib/pipeline/doctype";
import { parseSourceParam, resolveSource } from "@/lib/server/context";
import { getStore, sourceKey } from "@/lib/store";
import { cn, formatDuration, senderName, shortId } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function EmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const source = parseSourceParam((await searchParams).source);
  const inbox = await resolveSource(source);
  if (inbox === null) notFound();
  const run = await getStore().latestRun(sourceKey(inbox.descriptor));
  const result = run?.results.find((item) => item.email.email_id === id);
  if (run === undefined || run === null || result === undefined) notFound();
  const reply = draftReply(result);
  const check = result.check;

  return (
    <div className="min-h-dvh">
      <header className="xv-no-print sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-3">
        <div className="flex items-center gap-4">
          <Wordmark />
          <Link href={`/inbox?source=${source}`} className="xv-focus inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
            <Icon name="ArrowLeft2" size={13} />
            Back to inbox
          </Link>
        </div>
        <Link href={`/report?source=${source}`} className="xv-micro xv-micro-sm xv-focus text-accent-ink hover:underline">
          Discrepancy report
        </Link>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[13px] text-muted-foreground">#{shortId(result.email.email_id)}</span>
              <PriorityChip priority={result.triage.priority} />
              <CategoryChip category={result.classification.category} />
              <StatusChip result={result} />
            </div>
            <h1 className="text-[24px] leading-tight font-medium tracking-[-0.015em]">{result.email.subject}</h1>
            <p className="text-[13px] text-muted-foreground">
              From <span className="text-foreground">{result.email.from}</span>
            </p>
          </div>

          <div className={cn("space-y-1 border p-4", result.triage.priority === "critical" ? "border-bad/40 bg-[color-mix(in_srgb,var(--signal-bad)_5%,white)]" : "border-border bg-card")}>
            <Micro>Next action</Micro>
            <p className="text-[15px] leading-snug">{result.triage.action}</p>
            {result.triage.references.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-2">
                {result.triage.references.map((reference) => (
                  <span key={`${reference.kind}:${reference.value}`} className="inline-flex h-6 items-center gap-1.5 border border-border bg-surface px-2 font-mono text-[11px]">
                    <span className="text-muted-foreground uppercase">{reference.kind}</span>
                    {reference.value}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {check !== null ? (
            <div className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <Micro>Discrepancy report</Micro>
                  <p className={cn("mt-1 text-[15px] font-medium", check.status === "MISMATCH" ? "text-bad" : check.status === "OK" ? "text-ok" : "text-warn")}>
                    {check.summary}
                  </p>
                </div>
              </div>
              <FieldTable check={check} />
              {check.reviewNote !== null ? (
                <p className="border border-warn/40 bg-[color-mix(in_srgb,var(--signal-warn)_6%,white)] p-3 text-[13px] text-warn">{check.reviewNote}</p>
              ) : null}
            </div>
          ) : null}

          {check !== null && check.documents.length > 0 ? (
            <div className="space-y-3">
              <Micro>Documents as read</Micro>
              <div className="grid gap-3 md:grid-cols-2">
                {check.documents.map((doc) => (
                  <div key={doc.path} className="flex min-w-0 flex-col border border-border bg-card">
                    <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                      <span className="truncate font-mono text-[12px]">{doc.fileName}</span>
                      <span className={cn("xv-micro xv-micro-sm shrink-0", !doc.readable || (doc.kind !== "SI" && doc.kind !== "BL") ? "text-warn" : "text-muted-foreground")}>
                        {doc.readable ? DOC_KIND_LABELS[doc.kind] : "Unreadable"}
                      </span>
                    </div>
                    <p className="px-3 pt-2 text-[11px] text-muted-foreground">
                      {doc.readable
                        ? `${doc.format.toUpperCase()} · ${doc.readMethod === "vision" ? "read by Claude vision" : "text extracted"}${doc.kindEvidence ? ` · title "${doc.kindEvidence}"` : ""}`
                        : doc.error}
                    </p>
                    <pre className="m-3 mt-2 max-h-64 overflow-auto bg-surface p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                      {doc.text || "(no text)"}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Micro>Email</Micro>
            <pre className="max-h-96 overflow-auto border border-border bg-card p-4 font-sans text-[13px] leading-relaxed whitespace-pre-wrap">{result.email.body}</pre>
          </div>
        </section>

        <aside className="space-y-6">
          <ReviewForm result={result} source={source} />

          {reply !== null ? (
            <div id="draft-reply" className="scroll-mt-20 space-y-2">
              <Micro>Draft reply</Micro>
              <pre className="max-h-72 overflow-auto border border-border bg-surface p-3 font-sans text-[12px] leading-relaxed whitespace-pre-wrap">{reply}</pre>
              <ReplyActions
                emailId={result.email.email_id}
                source={source}
                to={result.email.from}
                subject={/^re:/i.test(result.email.subject) ? result.email.subject : `RE: ${result.email.subject}`}
                reply={reply}
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Micro>Why this category</Micro>
            <p className="text-[13px] leading-snug text-muted-foreground">{result.classification.rationale}</p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {Math.round(result.classification.confidence * 100)}% · rules: {result.classification.rulesCategory}
              {result.classification.aiCategory !== null ? ` · AI: ${result.classification.aiCategory}` : " · AI not used"}
            </p>
          </div>

          <div className="space-y-2">
            <Micro>Pipeline trace</Micro>
            <ol className="space-y-2 border-l border-border pl-4">
              {result.events.map((event, index) => (
                <li key={index} className="relative text-[12px] leading-snug">
                  <span
                    className={cn(
                      "absolute top-1.5 -left-[21px] size-2 rounded-full",
                      event.outcome === "failed" ? "bg-bad" : event.outcome === "warn" || event.outcome === "retried" ? "bg-warn" : "bg-ok",
                    )}
                    aria-hidden
                  />
                  <span className="xv-micro xv-micro-sm text-muted-foreground">
                    {event.stage} · {formatDuration(event.atMs)}
                  </span>
                  <span className="block">{event.detail}</span>
                </li>
              ))}
            </ol>
            <p className="text-[11px] text-muted-foreground">
              Attempts: {result.attempts} · Sender {senderName(result.email.from)}
            </p>
          </div>
          <Hairline />
        </aside>
      </main>
    </div>
  );
}
