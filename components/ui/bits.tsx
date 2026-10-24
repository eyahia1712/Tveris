import type { ReactNode } from "react";

import { CATEGORY_LABELS, REVIEW_REASON_LABELS, type Category, type EmailResult, type Priority } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export function Hairline({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-border", className)} aria-hidden />;
}

export function Micro({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("xv-micro xv-micro-sm text-muted-foreground", className)}>{children}</p>;
}

const PRIORITY_SKIN: Record<Priority, string> = {
  critical: "border-bad/40 bg-[color-mix(in_srgb,var(--signal-bad)_9%,white)] text-bad",
  high: "border-warn/40 bg-[color-mix(in_srgb,var(--signal-warn)_9%,white)] text-warn",
  normal: "border-border bg-card text-foreground",
  low: "border-border bg-surface text-muted-foreground",
  none: "border-border bg-surface text-muted-foreground",
};

const PRIORITY_LABEL: Record<Priority, string> = {
  critical: "Urgent",
  high: "Action",
  normal: "To do",
  low: "FYI",
  none: "Ignore",
};

export function PriorityChip({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <span className={cn("xv-micro xv-micro-sm inline-flex h-6 items-center border px-2 whitespace-nowrap", PRIORITY_SKIN[priority], className)}>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function CategoryChip({ category, className }: { category: Category; className?: string }) {
  return (
    <span className={cn("xv-micro xv-micro-sm inline-flex h-6 items-center border border-border bg-card px-2 whitespace-nowrap text-foreground", className)}>
      {CATEGORY_LABELS[category]}
    </span>
  );
}

/** The outcome of a document check, or of classification for the rest. */
export function StatusChip({ result, className }: { result: EmailResult; className?: string }) {
  if (result.failure !== null) {
    return <span className={cn("xv-micro xv-micro-sm inline-flex h-6 items-center border border-bad/40 px-2 text-bad", className)}>Failed</span>;
  }
  if (result.classification.category !== "BL_COMPARISON") return null;
  const skin =
    result.status === "MISMATCH"
      ? "border-bad/40 bg-[color-mix(in_srgb,var(--signal-bad)_9%,white)] text-bad"
      : result.status === "NEEDS_REVIEW"
        ? "border-warn/40 bg-[color-mix(in_srgb,var(--signal-warn)_9%,white)] text-warn"
        : "border-ok/40 bg-[color-mix(in_srgb,var(--signal-ok)_8%,white)] text-ok";
  const label =
    result.status === "MISMATCH"
      ? `${result.defectFields.length} mismatch${result.defectFields.length === 1 ? "" : "es"}`
      : result.status === "NEEDS_REVIEW"
        ? result.reviewReason === null ? "Needs review" : REVIEW_REASON_LABELS[result.reviewReason]
        : "No mismatch";
  return <span className={cn("xv-micro xv-micro-sm inline-flex h-6 items-center border px-2 whitespace-nowrap", skin, className)}>{label}</span>;
}

export const BUTTON_PRIMARY =
  "xv-micro xv-micro-sm xv-focus inline-flex min-h-10 items-center justify-center gap-2 bg-primary px-4 text-white transition-colors hover:bg-accent disabled:opacity-50";
export const BUTTON_SECONDARY =
  "xv-micro xv-micro-sm xv-focus inline-flex min-h-10 items-center justify-center gap-2 border border-border bg-card px-4 text-foreground transition-colors hover:border-border-strong hover:bg-surface disabled:opacity-50";
