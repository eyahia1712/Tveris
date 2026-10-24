import Link from "next/link";

import { Icon } from "@/components/icons";
import { Wordmark } from "@/components/dashboard/left-rail";
import { PrintButton } from "@/components/report/print-button";
import { FieldTable } from "@/components/report/field-table";
import { Micro, StatusChip } from "@/components/ui/bits";
import { FIELD_LABELS, REVIEW_REASON_LABELS } from "@/lib/domain/types";
import { parseSourceParam, resolveSource } from "@/lib/server/context";
import { getStore, sourceKey } from "@/lib/store";
import { cn, formatClock, shortId } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Discrepancy report" };

/**
 * The deliverable the problem statement asks for: every document-check email,
 * whether a mismatch was found, and exactly what needs attention, with SI and
 * BL values side by side. Printable.
 */
export default async function ReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const source = parseSourceParam((await searchParams).source);
  const inbox = await resolveSource(source);
  const run = inbox === null ? null : await getStore().latestRun(sourceKey(inbox.descriptor));
  const checks = (run?.results ?? [])
    .filter((result) => result.classification.category === "BL_COMPARISON")
    .sort((a, b) => {
      const rank = { MISMATCH: 0, NEEDS_REVIEW: 1, OK: 2 } as const;
      return rank[a.status] - rank[b.status] || a.email.email_id.localeCompare(b.email.email_id);
    });
  const mismatches = checks.filter((result) => result.status === "MISMATCH");
  const reviews = checks.filter((result) => result.status === "NEEDS_REVIEW");
  const fieldCounts = new Map<string, number>();
  for (const result of mismatches) {
    for (const field of result.defectFields) fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1);
  }

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
        <PrintButton />
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-5 py-8">
        <div className="space-y-2">
          <Micro>Discrepancy report · {run?.source.label ?? "No inbox"} · {formatClock(run?.finishedAt ?? null)}</Micro>
          <h1 className="text-[28px] leading-tight font-medium tracking-[-0.02em]">
            {checks.length} document checks: {mismatches.length} with mismatches, {reviews.length} for review, {checks.length - mismatches.length - reviews.length} clear.
          </h1>
        </div>

        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Checked" value={checks.length} />
          <Stat label="Mismatch" value={mismatches.length} tone="bad" />
          <Stat label="Needs review" value={reviews.length} tone="warn" />
          <Stat label="No mismatch" value={checks.length - mismatches.length - reviews.length} tone="ok" />
        </dl>

        {fieldCounts.size > 0 ? (
          <div className="space-y-2">
            <Micro>Where mismatches occur</Micro>
            <div className="space-y-1.5">
              {[...fieldCounts.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([field, count]) => (
                  <div key={field} className="grid grid-cols-[160px_1fr_40px] items-center gap-3 text-[13px]">
                    <span>{FIELD_LABELS[field as keyof typeof FIELD_LABELS]}</span>
                    <span className="h-2 bg-surface-2">
                      <span className="block h-full bg-bad" style={{ width: `${(count / Math.max(1, mismatches.length)) * 100}%` }} />
                    </span>
                    <span className="text-right font-mono">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        ) : null}

        <ol className="space-y-6">
          {checks.map((result) => (
            <li key={result.email.email_id} className="break-inside-avoid space-y-3 border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[12px] text-muted-foreground">{result.email.email_id}</p>
                  <Link href={`/emails/${result.email.email_id}?source=${source}`} className="xv-focus block text-[15px] font-medium hover:underline">
                    {result.email.subject}
                  </Link>
                </div>
                <StatusChip result={result} />
              </div>
              {result.status === "OK" ? (
                <p className="text-[13px] font-medium text-ok">No mismatch detected.</p>
              ) : result.status === "NEEDS_REVIEW" ? (
                <p className="text-[13px] text-warn">
                  {result.reviewReason ? `${REVIEW_REASON_LABELS[result.reviewReason]}. ` : ""}
                  {result.check?.reviewNote}
                </p>
              ) : (
                <p className={cn("text-[13px] font-medium text-bad")}>
                  {result.check?.fields
                    .filter((field) => field.outcome === "mismatch")
                    .map((field) => `${FIELD_LABELS[field.field]}: ${field.note}`)
                    .join(" · ")}
                </p>
              )}
              {result.check !== null && result.status !== "OK" && result.check.fields.length > 0 ? <FieldTable check={result.check} compact /> : null}
              {result.review !== null ? (
                <p className="text-[11px] text-muted-foreground">
                  Reviewed by {result.review.reviewer} ({result.review.decision}){result.review.note ? `: ${result.review.note}` : ""} · #{shortId(result.email.email_id)}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "bad" | "warn" | "ok" }) {
  return (
    <div className="border border-border bg-card p-3">
      <dt className="xv-micro xv-micro-sm text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 font-mono text-2xl font-medium", tone === "bad" && "text-bad", tone === "warn" && "text-warn", tone === "ok" && "text-ok")}>{value}</dd>
    </div>
  );
}
