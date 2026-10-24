"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Icon } from "@/components/icons";
import { FieldTable } from "@/components/report/field-table";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CategoryChip, Hairline, Micro, PriorityChip, StatusChip } from "@/components/ui/bits";
import { HUB_ICONS } from "@/components/viz/inbox-canvas";
import { ReplyActions } from "@/components/report/reply-actions";
import { draftReply } from "@/lib/domain/reply";
import type { SourceParam } from "@/lib/domain/source";
import { CATEGORY_LABELS, type Category, type EmailResult, type Run } from "@/lib/domain/types";
import { PRIORITY_ORDER } from "@/lib/pipeline/triage";
import { groupOf, type GraphNode } from "@/lib/viz/inbox-graph";
import { cn, senderName, shortId } from "@/lib/utils";

import { retryEmail, submitReview } from "./api";

const CATEGORY_HELP: Record<Category, string> = {
  BL_COMPARISON: "Requests to check a draft bill of lading against its shipping instruction. Each is read, compared field by field and escalated when it cannot be decided.",
  SI_REQUEST: "New shipping instructions to prepare and submit to the carrier.",
  INVOICE_QUERY: "Billing questions and actions: charges, missing GR, D&D, cancellations.",
  GENERAL: "Updates, reports, robot notices and follow-ups. Mostly for information.",
  SPAM: "Phishing and marketing, quarantined. Never click, never reply.",
};

export interface InspectorProps {
  run: Run;
  node: GraphNode;
  source: SourceParam;
  onClose(): void;
  onPickEmail(result: EmailResult): void;
  onResult(result: EmailResult): void;
}

export function Inspector({ run, node, source, onClose, onPickEmail, onResult }: InspectorProps) {
  const result = node.emailId === undefined ? null : run.results.find((item) => item.email.email_id === node.emailId) ?? null;
  return (
    <aside
      className="xv-no-print absolute inset-y-0 right-0 z-20 flex w-full max-w-[440px] flex-col border-l border-border bg-card shadow-[-12px_0_32px_rgb(11_27_40/8%)]"
      aria-label="Details"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <Micro>{result !== null ? `Email #${shortId(result.email.email_id)}` : node.kind === "hub" ? "Category" : node.kind === "group" ? "Group" : "Inbox"}</Micro>
        <button type="button" onClick={onClose} aria-label="Close details" className="xv-focus grid size-8 place-items-center text-muted-foreground hover:text-foreground">
          <Icon name="CloseCircle" size={18} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {result !== null ? (
          <EmailPanel result={result} source={source} focusField={node.field} onResult={onResult} />
        ) : node.kind === "hub" && node.category !== undefined ? (
          <CategoryPanel run={run} category={node.category} onPickEmail={onPickEmail} />
        ) : node.kind === "group" && node.category !== undefined ? (
          <GroupPanel run={run} node={node} onPickEmail={onPickEmail} />
        ) : (
          <InboxPanel run={run} />
        )}
      </div>
    </aside>
  );
}

function EmailRow({ result, onPick }: { result: EmailResult; onPick(): void }) {
  return (
    <li>
      <button type="button" onClick={onPick} className="xv-focus flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-surface">
        <span className="mt-0.5 font-mono text-[12px] text-muted-foreground">#{shortId(result.email.email_id)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{result.email.subject}</span>
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{result.triage.action}</span>
        </span>
        <StatusChip result={result} className="shrink-0" />
      </button>
    </li>
  );
}

function sortByUrgency(results: EmailResult[]): EmailResult[] {
  return [...results].sort(
    (a, b) => PRIORITY_ORDER[a.triage.priority] - PRIORITY_ORDER[b.triage.priority] || a.email.email_id.localeCompare(b.email.email_id),
  );
}

function CategoryPanel({ run, category, onPickEmail }: { run: Run; category: Category; onPickEmail(result: EmailResult): void }) {
  const results = sortByUrgency(run.results.filter((result) => result.classification.category === category));
  const groups = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const result of results) {
      const group = groupOf(result);
      const entry = counts.get(group.key) ?? { label: group.label, count: 0 };
      entry.count += 1;
      counts.set(group.key, entry);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }, [results]);
  return (
    <div>
      <div className="space-y-3 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full border border-border">
            <Icon name={HUB_ICONS[category]} size={20} variant="Bulk" />
          </span>
          <div>
            <p className="text-[17px] font-medium">{CATEGORY_LABELS[category]}</p>
            <p className="font-mono text-[12px] text-muted-foreground">{results.length} emails</p>
          </div>
        </div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{CATEGORY_HELP[category]}</p>
        <div className="flex flex-wrap gap-2">
          {groups.map((group) => (
            <span key={group.label} className="inline-flex h-7 items-center gap-2 border border-border px-2 text-[12px]">
              {group.label}
              <span className="font-mono text-muted-foreground">{group.count}</span>
            </span>
          ))}
        </div>
      </div>
      <Hairline />
      <ul className="divide-y divide-border">
        {results.slice(0, 60).map((result) => (
          <EmailRow key={result.email.email_id} result={result} onPick={() => onPickEmail(result)} />
        ))}
      </ul>
      {results.length > 60 ? <p className="px-5 py-3 text-[12px] text-muted-foreground">Showing the 60 most urgent. The Queue view lists all.</p> : null}
    </div>
  );
}

function GroupPanel({ run, node, onPickEmail }: { run: Run; node: GraphNode; onPickEmail(result: EmailResult): void }) {
  const byId = new Map(run.results.map((result) => [result.email.email_id, result]));
  const list = (node.memberIds ?? []).map((id) => byId.get(id)).filter((result): result is EmailResult => result !== undefined);
  return (
    <div>
      <div className="space-y-1 px-5 py-4">
        <p className="text-[17px] font-medium">{node.label}</p>
        <p className="text-[13px] text-muted-foreground">
          {node.count} emails in {CATEGORY_LABELS[node.category!]}. {node.expanded ? "Shown on the map." : "Click the group on the map to open it."}
        </p>
      </div>
      <Hairline />
      <ul className="divide-y divide-border">
        {list.map((result) => (
          <EmailRow key={result.email.email_id} result={result} onPick={() => onPickEmail(result)} />
        ))}
      </ul>
    </div>
  );
}

function InboxPanel({ run }: { run: Run }) {
  return (
    <div className="space-y-4 px-5 py-4">
      <p className="text-[17px] font-medium">{run.source.label}</p>
      <dl className="divide-y divide-border border border-border">
        {(Object.keys(run.summary.byCategory) as Category[]).map((category) => (
          <div key={category} className="flex items-center justify-between px-3 py-2 text-[13px]">
            <dt>{CATEGORY_LABELS[category]}</dt>
            <dd className="font-mono">{run.summary.byCategory[category]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function EmailPanel({ result, source, focusField, onResult }: { result: EmailResult; source: SourceParam; focusField?: string; onResult(result: EmailResult): void }) {
  const [busy, setBusy] = useState<"retry" | "confirm" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reply = draftReply(result);
  const check = result.check;
  const needsPerson =
    result.review === null
    && (result.status === "NEEDS_REVIEW" || result.classification.disagreement || result.failure !== null);

  const run = async (kind: "retry" | "confirm") => {
    setBusy(kind);
    setError(null);
    try {
      const response =
        kind === "retry"
          ? await retryEmail(result.email.email_id, source)
          : await submitReview(result.email.email_id, {
              source,
              reviewer: "Ops reviewer",
              decision: "confirmed",
              categoryOverride: null,
              corrections: {},
              note: "Escalation confirmed; sender asked for corrected documents.",
            });
      onResult(response.result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5 px-5 py-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <PriorityChip priority={result.triage.priority} />
          <CategoryChip category={result.classification.category} />
          <StatusChip result={result} />
          {result.review !== null ? (
            <span className="xv-micro xv-micro-sm inline-flex h-6 items-center gap-1 border border-accent/40 px-2 text-accent-ink">
              <Icon name="TickCircle" size={12} variant="Bold" /> Reviewed
            </span>
          ) : null}
        </div>
        <p className="text-[16px] leading-snug font-medium">{result.email.subject}</p>
        <p className="text-[12px] text-muted-foreground">
          From <span className="text-foreground">{senderName(result.email.from)}</span>
          {result.email.attachments.length > 0 ? ` · ${result.email.attachments.length} attachment${result.email.attachments.length === 1 ? "" : "s"}` : ""}
        </p>
      </div>

      <div className={cn("space-y-1 border p-3", result.triage.priority === "critical" ? "border-bad/40 bg-[color-mix(in_srgb,var(--signal-bad)_5%,white)]" : "border-border bg-surface")}>
        <Micro>Next action</Micro>
        <p className="text-[13px] leading-snug">{result.triage.action}</p>
      </div>

      {result.failure !== null ? (
        <p className="border border-bad/40 p-3 text-[12px] text-bad" role="alert">
          Processing failed: {result.failure}
        </p>
      ) : null}

      {check !== null ? (
        <div className="space-y-2">
          <Micro>SI vs draft BL</Micro>
          <p className={cn("text-[13px] font-medium", check.status === "MISMATCH" ? "text-bad" : check.status === "OK" ? "text-ok" : "text-warn")}>
            {check.summary}
          </p>
          <FieldTable check={check} compact />
          {focusField !== undefined ? <p className="text-[11px] text-muted-foreground">Selected on the map: {focusField.replace(/_/g, " ")}</p> : null}
          <ul className="space-y-1 pt-1">
            {check.documents.map((doc) => (
              <li key={doc.path} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="truncate font-mono">{doc.fileName}</span>
                <span className={cn("shrink-0", !doc.readable ? "text-warn" : "text-muted-foreground")}>
                  {!doc.readable ? "unreadable" : `${doc.kind} · ${doc.readMethod === "vision" ? "vision" : doc.format}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-1">
        <Micro>Why this category</Micro>
        <p className="text-[13px] leading-snug text-muted-foreground">{result.classification.rationale}</p>
        <p className="font-mono text-[11px] text-muted-foreground">
          {Math.round(result.classification.confidence * 100)}% · {result.classification.method === "ai" ? "Claude + rules" : result.classification.method === "human" ? "set by reviewer" : "rule engine"}
          {result.classification.disagreement ? ` · AI said ${result.classification.aiCategory}, rules said ${result.classification.rulesCategory}` : ""}
        </p>
      </div>

      {reply !== null ? (
        <div className="space-y-2">
          <Micro>Draft reply</Micro>
          <pre className="max-h-48 overflow-auto border border-border bg-surface p-3 font-sans text-[12px] leading-relaxed whitespace-pre-wrap">{reply}</pre>
          <ReplyActions
            emailId={result.email.email_id}
            source={source}
            to={result.email.from}
            subject={/^re:/i.test(result.email.subject) ? result.email.subject : `RE: ${result.email.subject}`}
            reply={reply}
          />
        </div>
      ) : null}

      {error !== null ? <p className="text-[12px] text-bad" role="alert">{error}</p> : null}

      <div className="grid grid-cols-2 gap-2">
        <Link href={`/emails/${result.email.email_id}?source=${source}`} className={cn(BUTTON_PRIMARY, "col-span-2")}>
          <Icon name="Eye" size={14} />
          Open, review and correct
        </Link>
        {needsPerson && result.status === "NEEDS_REVIEW" ? (
          <button type="button" onClick={() => void run("confirm")} disabled={busy !== null} className={BUTTON_SECONDARY}>
            <Icon name="TickCircle" size={14} />
            {busy === "confirm" ? "Saving" : "Confirm escalation"}
          </button>
        ) : null}
        <button type="button" onClick={() => void run("retry")} disabled={busy !== null} className={cn(BUTTON_SECONDARY, !(needsPerson && result.status === "NEEDS_REVIEW") && "col-span-2")}>
          <Icon name="Refresh" size={14} />
          {busy === "retry" ? "Re-reading" : "Retry processing"}
        </button>
      </div>
    </div>
  );
}
