"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { retryEmail, submitReview } from "@/components/dashboard/api";
import { Icon } from "@/components/icons";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, Micro } from "@/components/ui/bits";
import type { SourceParam } from "@/lib/domain/source";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  FIELD_KEYS,
  FIELD_LABELS,
  type Category,
  type EmailResult,
  type FieldKey,
} from "@/lib/domain/types";
import { cn } from "@/lib/utils";

type Draft = Partial<Record<FieldKey, { si?: string; bl?: string }>>;

/**
 * Human in the loop. A reviewer confirms the result, or corrects values
 * (typing what the physical document says) and/or the category; the server
 * recomputes the comparison with the same rules and the report updates.
 */
export function ReviewForm({ result, source }: { result: EmailResult; source: SourceParam }) {
  const router = useRouter();
  const [reviewer, setReviewer] = useState("Ops reviewer");
  const [category, setCategory] = useState<Category>(result.classification.category);
  const [draft, setDraft] = useState<Draft>({});
  const [note, setNote] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState<"confirm" | "correct" | "retry" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("tveris-reviewer");
      // Reading browser storage after hydration is syncing with an external
      // system; doing it in render would mismatch the server HTML.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setReviewer(saved);
    } catch {
      // storage unavailable: keep the default name
    }
  }, []);

  const check = result.check;
  const attention = new Set(
    check?.fields.filter((field) => field.outcome !== "match").map((field) => field.field) ?? [],
  );
  const editable = check === null ? [] : FIELD_KEYS.filter((field) => showAll || attention.has(field) || check.fields.length === 0);
  const current = (field: FieldKey, side: "si" | "bl") => {
    const value = check?.fields.find((row) => row.field === field)?.[side];
    return value === null || value === undefined ? "" : value.missing ? "" : value.raw ?? "";
  };

  const send = async (decision: "confirmed" | "corrected") => {
    setBusy(decision === "confirmed" ? "confirm" : "correct");
    setMessage(null);
    try {
      window.localStorage.setItem("tveris-reviewer", reviewer);
    } catch {
      // ignore
    }
    const corrections: Draft = {};
    for (const [field, sides] of Object.entries(draft) as Array<[FieldKey, { si?: string; bl?: string }]>) {
      const si = sides.si?.trim();
      const bl = sides.bl?.trim();
      if (si || bl) corrections[field] = { ...(si ? { si } : {}), ...(bl ? { bl } : {}) };
    }
    try {
      const { result: updated } = await submitReview(result.email.email_id, {
        source,
        reviewer: reviewer.trim() || "Reviewer",
        decision,
        categoryOverride: category !== result.classification.category ? category : null,
        corrections: decision === "corrected" ? corrections : {},
        note,
      });
      setDraft({});
      setMessage({
        tone: "ok",
        text:
          updated.classification.category === "BL_COMPARISON"
            ? `Report updated: ${updated.status === "OK" ? "no mismatch detected" : updated.status === "MISMATCH" ? `${updated.defectFields.length} field(s) differ` : "still needs review"}.`
            : `Saved as ${CATEGORY_LABELS[updated.classification.category]}.`,
      });
      router.refresh();
    } catch (caught) {
      setMessage({ tone: "bad", text: caught instanceof Error ? caught.message : String(caught) });
    } finally {
      setBusy(null);
    }
  };

  const retry = async () => {
    setBusy("retry");
    setMessage(null);
    try {
      const { result: updated } = await retryEmail(result.email.email_id, source);
      setMessage({ tone: updated.failure === null ? "ok" : "bad", text: updated.failure === null ? "Re-processed." : `Still failing: ${updated.failure}` });
      router.refresh();
    } catch (caught) {
      setMessage({ tone: "bad", text: caught instanceof Error ? caught.message : String(caught) });
    } finally {
      setBusy(null);
    }
  };

  const hasCorrections = Object.values(draft).some((sides) => sides?.si?.trim() || sides?.bl?.trim()) || category !== result.classification.category;

  return (
    <div className="space-y-4 border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <Micro>Review</Micro>
        {result.review !== null ? (
          <span className="text-[11px] text-muted-foreground">
            Last: {result.review.decision} by {result.review.reviewer}
          </span>
        ) : null}
      </div>

      <label className="block space-y-1">
        <span className="text-[12px] text-muted-foreground">Your name</span>
        <input value={reviewer} onChange={(event) => setReviewer(event.currentTarget.value)} maxLength={80} className="w-full border border-border px-2.5 py-2 text-[13px] outline-none focus:border-accent" />
      </label>

      <label className="block space-y-1">
        <span className="text-[12px] text-muted-foreground">Category</span>
        <select value={category} onChange={(event) => setCategory(event.currentTarget.value as Category)} className="w-full border border-border bg-card px-2 py-2 text-[13px] outline-none focus:border-accent">
          {CATEGORIES.map((option) => (
            <option key={option} value={option}>
              {CATEGORY_LABELS[option]}
            </option>
          ))}
        </select>
      </label>

      {check !== null ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-muted-foreground">
              {attention.size > 0 ? "Correct what the documents really say" : "Values (all match)"}
            </span>
            <button type="button" onClick={() => setShowAll((value) => !value)} className="xv-micro xv-micro-sm text-accent-ink hover:underline">
              {showAll ? "Only flagged" : "All fields"}
            </button>
          </div>
          {editable.length === 0 ? <p className="text-[12px] text-muted-foreground">Nothing flagged. Open all fields to change a value.</p> : null}
          {editable.map((field) => (
            <fieldset key={field} className={cn("space-y-1.5 border p-2.5", attention.has(field) ? "border-warn/40" : "border-border")}>
              <legend className="px-1 text-[12px] font-medium">{FIELD_LABELS[field]}</legend>
              {(["si", "bl"] as const).map((side) => (
                <label key={side} className="flex items-center gap-2">
                  <span className="w-6 font-mono text-[11px] text-muted-foreground uppercase">{side}</span>
                  <input
                    value={draft[field]?.[side] ?? ""}
                    placeholder={current(field, side) || "blank: type the value"}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setDraft((previous) => ({ ...previous, [field]: { ...previous[field], [side]: value } }));
                    }}
                    maxLength={300}
                    className="min-w-0 flex-1 border border-border px-2 py-1.5 font-mono text-[12px] outline-none placeholder:text-muted-foreground/70 focus:border-accent"
                  />
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      ) : null}

      <label className="block space-y-1">
        <span className="text-[12px] text-muted-foreground">Note (kept with the report)</span>
        <textarea value={note} onChange={(event) => setNote(event.currentTarget.value)} maxLength={1000} rows={2} className="w-full border border-border px-2.5 py-2 text-[13px] outline-none focus:border-accent" />
      </label>

      {message !== null ? (
        <p className={cn("text-[12px]", message.tone === "ok" ? "text-ok" : "text-bad")} role="status">
          {message.text}
        </p>
      ) : null}

      <div className="grid gap-2">
        <button type="button" onClick={() => void send("corrected")} disabled={busy !== null || !hasCorrections} className={BUTTON_PRIMARY}>
          <Icon name="Edit2" size={14} />
          {busy === "correct" ? "Updating report" : "Save corrections"}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void send("confirmed")} disabled={busy !== null} className={BUTTON_SECONDARY}>
            <Icon name="TickCircle" size={14} />
            {busy === "confirm" ? "Saving" : "Confirm"}
          </button>
          <button type="button" onClick={() => void retry()} disabled={busy !== null} className={BUTTON_SECONDARY}>
            <Icon name="Refresh" size={14} />
            {busy === "retry" ? "Retrying" : "Retry"}
          </button>
        </div>
      </div>
    </div>
  );
}
