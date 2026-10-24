"use client";

import { useMemo, useState } from "react";

import { CategoryChip, PriorityChip, StatusChip } from "@/components/ui/bits";
import { CATEGORIES, CATEGORY_LABELS, type Category, type EmailResult, type Run } from "@/lib/domain/types";
import { PRIORITY_ORDER } from "@/lib/pipeline/triage";
import { cn, senderName, shortId } from "@/lib/utils";

type Filter = "attention" | "all" | Category;

/**
 * The same inbox as a to-do list: most urgent first, one line per email,
 * with the next action spelled out. This is the view a person works from.
 */
export function QueueView({
  run,
  query,
  selectedEmailId,
  onPick,
}: {
  run: Run;
  query: string;
  selectedEmailId: string | null;
  onPick(result: EmailResult): void;
}) {
  const [filter, setFilter] = useState<Filter>("attention");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return run.results
      .filter((result) => {
        if (filter === "attention") {
          if (result.review !== null) return false;
          if (!(result.failure !== null || result.triage.priority === "critical" || result.triage.priority === "high")) return false;
        } else if (filter !== "all" && result.classification.category !== filter) {
          return false;
        }
        if (needle === "") return true;
        return (
          result.email.email_id.toLowerCase().includes(needle)
          || result.email.subject.toLowerCase().includes(needle)
          || result.email.from.toLowerCase().includes(needle)
          || result.triage.references.some((reference) => reference.value.toLowerCase().includes(needle))
        );
      })
      .sort(
        (a, b) =>
          PRIORITY_ORDER[a.triage.priority] - PRIORITY_ORDER[b.triage.priority]
          || a.email.email_id.localeCompare(b.email.email_id),
      );
  }, [run, filter, query]);

  const attention = run.results.filter(
    (result) => result.review === null && (result.failure !== null || result.triage.priority === "critical" || result.triage.priority === "high"),
  ).length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-2 border-b border-border bg-card px-4 py-3" role="tablist" aria-label="Filter">
        <FilterTab active={filter === "attention"} onClick={() => setFilter("attention")} label="Needs you" count={attention} strong />
        <FilterTab active={filter === "all"} onClick={() => setFilter("all")} label="All" count={run.results.length} />
        {CATEGORIES.map((category) => (
          <FilterTab
            key={category}
            active={filter === category}
            onClick={() => setFilter(category)}
            label={CATEGORY_LABELS[category]}
            count={run.summary.byCategory[category]}
          />
        ))}
      </div>
      {query.trim() !== "" ? (
        <p className="border-b border-border bg-surface px-4 py-2 text-[12px] text-muted-foreground" aria-live="polite">
          {rows.length === 0
            ? `No emails match "${query.trim()}".`
            : `${rows.length} email${rows.length === 1 ? "" : "s"} match "${query.trim()}".`}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="px-6 py-10 text-center text-[13px] text-muted-foreground">
            {query.trim() !== ""
              ? "Try another name, reference or email id."
              : filter === "attention"
                ? "Nothing needs you right now."
                : "No emails match."}
          </p>
        ) : (
          <ul className="divide-y divide-border bg-card">
            {rows.map((result) => (
              <li key={result.email.email_id}>
                <button
                  type="button"
                  onClick={() => onPick(result)}
                  className={cn(
                    "xv-focus grid w-full grid-cols-[76px_1fr] gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-surface md:grid-cols-[76px_minmax(0,1fr)_auto]",
                    selectedEmailId === result.email.email_id && "bg-accent/5",
                  )}
                >
                  <span className="flex flex-col gap-1">
                    <PriorityChip priority={result.triage.priority} className="w-fit" />
                    <span className="font-mono text-[12px] text-muted-foreground">#{shortId(result.email.email_id)}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">{result.email.subject}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                      {senderName(result.email.from)} · {result.triage.action}
                    </span>
                  </span>
                  <span className="col-span-2 flex items-center gap-2 md:col-span-1 md:justify-end">
                    <CategoryChip category={result.classification.category} />
                    <StatusChip result={result} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FilterTab({ active, onClick, label, count, strong }: { active: boolean; onClick(): void; label: string; count: number; strong?: boolean }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "xv-micro xv-micro-sm xv-focus inline-flex min-h-8 items-center gap-2 border px-3 transition-colors",
        active ? "border-primary bg-primary text-white" : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <span className={cn("font-mono", active ? "text-white/80" : strong && count > 0 ? "text-bad" : "")}>{count}</span>
    </button>
  );
}
