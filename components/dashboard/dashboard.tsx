"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { Icon, type IconName } from "@/components/icons";
import { BUTTON_PRIMARY } from "@/components/ui/bits";
import { CATEGORY_COLOR, HUB_ICONS, InboxCanvas } from "@/components/viz/inbox-canvas";
import { useReplay } from "@/components/viz/use-replay";
import type { SourceParam } from "@/lib/domain/source";
import { CATEGORY_LABELS, type Category, type EmailResult, type Run } from "@/lib/domain/types";
import { summarize } from "@/lib/domain/summary";
import {
  buildInboxGraph,
  defaultOpenGroups,
  emailNodeId,
  groupId,
  groupOf,
  HUB_ORDER,
  visibleAt,
  type GraphNode,
} from "@/lib/viz/inbox-graph";
import { cn } from "@/lib/utils";

import { useProcessing } from "./api";
import { Inspector } from "./inspector";
import { LeftRail } from "./left-rail";
import { QueueView } from "./queue-view";

type StageView = "map" | "queue";

export interface DashboardProps {
  initialRun: Run | null;
  source: SourceParam;
  /** Show only this queue, opened: how the dashboard hands a queue over. */
  only?: Category | null;
  /** Land on this email, opened and selected. */
  focus?: string | null;
  gmail: { configured: boolean; email: string | null };
  ai: { enabled: boolean; model: string };
}

export function Dashboard({ initialRun, source, gmail, ai, only = null, focus = null }: DashboardProps) {
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(initialRun);
  const [view, setView] = useState<StageView>("map");
  const [selected, setSelected] = useState<GraphNode | null>(() => {
    const result = focus === null ? undefined : initialRun?.results.find((item) => item.email.email_id === focus);
    if (result === undefined) return null;
    return {
      id: emailNodeId(result.email.email_id),
      kind: "email",
      label: result.email.email_id,
      tone: "neutral",
      depth: 3,
      atMs: result.doneAtMs,
      emailId: result.email.email_id,
    };
  });
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    if (initialRun === null) return new Set();
    if (only === null) {
      const open = defaultOpenGroups(initialRun);
      // Arriving on one email: make sure its own group is open too.
      const target = focus === null ? undefined : initialRun.results.find((item) => item.email.email_id === focus);
      if (target !== undefined) {
        const group = groupOf(target);
        open.add(groupId(target.classification.category, group.key));
      }
      return open;
    }
    // Arriving from the dashboard on one queue: open that queue, nothing else.
    return new Set(
      buildInboxGraph(initialRun, { openGroups: new Set(), openEmails: new Set() })
        .nodes.filter((node) => node.kind === "group" && node.category === only)
        .map((node) => node.id),
    );
  });
  const [openEmails, setOpenEmails] = useState<Set<string>>(() => (focus === null ? new Set() : new Set([focus])));
  const [hidden, setHidden] = useState<Set<Category>>(() =>
    only === null ? new Set() : new Set(HUB_ORDER.filter((category) => category !== only)),
  );
  const [query, setQuery] = useState("");
  const [railOpen, setRailOpen] = useState(false);

  // A fresh server run (after processing or a refresh) replaces local state.
  const [seenRun, setSeenRun] = useState(initialRun);
  if (initialRun !== seenRun) {
    setSeenRun(initialRun);
    setRun(initialRun);
    if (initialRun !== null && openGroups.size === 0) setOpenGroups(defaultOpenGroups(initialRun));
  }

  const refresh = useCallback(() => router.refresh(), [router]);
  const processing = useProcessing(source, refresh);
  const endMs = useMemo(() => (run === null ? 1 : Math.max(1, ...run.results.map((result) => result.doneAtMs))), [run]);
  const replay = useReplay(endMs);

  const graph = useMemo(() => {
    if (run === null) return { nodes: [], edges: [] };
    const full = buildInboxGraph(run, { openGroups, openEmails, hiddenCategories: hidden });
    return visibleAt(full, replay.active ? replay.t : null);
  }, [run, openGroups, openEmails, hidden, replay.active, replay.t]);

  // Keep the selection pointing at the live node (counts change after a review).
  const selectedNode = useMemo(
    () => (selected === null ? null : graph.nodes.find((node) => node.id === selected.id) ?? selected),
    [graph, selected],
  );

  const toggle = useCallback((node: GraphNode) => {
    if (node.kind === "group") {
      setOpenGroups((current) => {
        const next = new Set(current);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        return next;
      });
    } else if (node.kind === "email" && node.emailId !== undefined) {
      const id = node.emailId;
      // One open email at a time keeps the map readable.
      setOpenEmails((current) => (current.has(id) ? new Set() : new Set([id])));
    }
  }, []);

  const pickEmail = useCallback((result: EmailResult) => {
    const category = result.classification.category;
    const group = groupOf(result);
    const folded = category === "SI_REQUEST" ? null : groupId(category, group.key);
    setHidden((current) => {
      if (!current.has(category)) return current;
      const next = new Set(current);
      next.delete(category);
      return next;
    });
    if (folded !== null) setOpenGroups((current) => new Set(current).add(folded));
    else {
      // SI groups may be folded into "Other destinations": open whichever holds it.
      setOpenGroups((current) => {
        const next = new Set(current);
        next.add(groupId(category, group.key));
        next.add(groupId(category, "other"));
        return next;
      });
    }
    setOpenEmails(new Set([result.email.email_id]));
    setSelected({
      id: emailNodeId(result.email.email_id),
      kind: "email",
      label: result.email.email_id,
      tone: "neutral",
      depth: 3,
      atMs: result.doneAtMs,
      emailId: result.email.email_id,
    });
  }, []);

  const onResult = useCallback((result: EmailResult) => {
    setRun((current) => {
      if (current === null) return current;
      const results = current.results.map((existing) => (existing.email.email_id === result.email.email_id ? result : existing));
      return { ...current, results, summary: summarize(results) };
    });
  }, []);

  const expandAll = () => {
    if (run === null) return;
    const all = buildInboxGraph(run, { openGroups: new Set(), openEmails: new Set() })
      .nodes.filter((node) => node.kind === "group")
      .map((node) => node.id);
    const everything = all.every((id) => openGroups.has(id));
    setOpenGroups(everything ? defaultOpenGroups(run) : new Set(all));
  };

  const scope = `${source}:${run?.id ?? "none"}`;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside
        className={cn(
          "xv-no-print z-30 w-[320px] shrink-0 overflow-y-auto border-r border-border bg-card",
          "fixed inset-y-0 left-0 transition-transform md:static md:translate-x-0",
          railOpen ? "translate-x-0 shadow-xl" : "-translate-x-full",
        )}
      >
        <LeftRail
          run={run}
          source={source}
          gmail={gmail}
          replay={replay}
          job={processing.job}
          running={processing.running}
          jobError={processing.error}
          onProcess={() => void processing.start()}
        />
      </aside>
      {railOpen ? <button type="button" aria-label="Close panel" className="fixed inset-0 z-20 bg-black/20 md:hidden" onClick={() => setRailOpen(false)} /> : null}

      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="xv-no-print flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3">
          <button type="button" onClick={() => setRailOpen(true)} className="xv-focus grid size-9 place-items-center border border-border md:hidden" aria-label="Open panel">
            <Icon name="Element3" size={16} />
          </button>
          <div className="flex shrink-0 items-center gap-1 border border-border bg-card p-1" role="tablist" aria-label="View">
            <Segment active={view === "map"} onClick={() => setView("map")} icon="Hierarchy" label="Map" />
            <Segment active={view === "queue"} onClick={() => setView("queue")} icon="RowVertical" label="Queue" />
          </div>

          {view === "map" && run !== null ? (
            <div className="flex flex-wrap items-center gap-1.5" aria-label="Show categories">
              {HUB_ORDER.map((category) => (
                <button
                  key={category}
                  type="button"
                  aria-pressed={!hidden.has(category)}
                  onClick={() =>
                    setHidden((current) => {
                      const next = new Set(current);
                      if (next.has(category)) next.delete(category);
                      else next.add(category);
                      return next;
                    })
                  }
                  className={cn(
                    "xv-micro xv-micro-sm xv-focus inline-flex min-h-8 items-center gap-1.5 border px-2.5 transition-colors",
                    hidden.has(category) ? "border-dashed border-border text-muted-foreground/60" : "border-border bg-card text-foreground hover:bg-surface",
                  )}
                  title={hidden.has(category) ? "Show on map" : "Hide from map"}
                >
                  <Icon name={HUB_ICONS[category]} size={13} variant={hidden.has(category) ? "Linear" : "Bold"} />
                  <span className="hidden lg:inline">{CATEGORY_LABELS[category]}</span>
                  <span className="font-mono">{run.summary.byCategory[category]}</span>
                </button>
              ))}
              <button type="button" onClick={expandAll} className="xv-micro xv-micro-sm xv-focus inline-flex min-h-8 items-center gap-1.5 px-2 text-accent-ink hover:underline">
                <Icon name="Category2" size={13} />
                Open all
              </button>
            </div>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            {view === "queue" ? (
              <label className="flex min-h-9 items-center gap-2 border border-border bg-card px-2.5 focus-within:border-accent">
                <Icon name="SearchNormal1" size={14} className="text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="Search id, subject, booking..."
                  className="w-44 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground lg:w-60"
                  aria-label="Search emails"
                />
              </label>
            ) : null}
            <StatusPill run={run} ai={ai} running={processing.running} replaying={replay.active} />
          </div>
        </header>

        <div className="relative min-h-0 flex-1">
          {run === null ? (
            <EmptyState running={processing.running} done={processing.job?.done ?? 0} total={processing.job?.total ?? 0} onStart={() => void processing.start()} />
          ) : view === "map" ? (
            <InboxCanvas
              graph={graph}
              scope={scope}
              selectedId={selectedNode?.id ?? null}
              onSelect={setSelected}
              onToggle={toggle}
              rightInset={selectedNode !== null ? 440 : 0}
            />
          ) : (
            <QueueView run={run} query={query} selectedEmailId={selectedNode?.emailId ?? null} onPick={pickEmail} />
          )}

          {run !== null && selectedNode !== null ? (
            <Inspector
              run={run}
              node={selectedNode}
              source={source}
              onClose={() => setSelected(null)}
              onPickEmail={pickEmail}
              onResult={onResult}
            />
          ) : null}

          {view === "map" && run !== null ? <Legend /> : null}
        </div>
      </main>
    </div>
  );
}

function Segment({ active, onClick, icon, label }: { active: boolean; onClick(): void; icon: IconName; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "xv-micro xv-micro-sm xv-focus inline-flex min-h-8 items-center gap-1.5 px-3 transition-colors",
        active ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon name={icon} size={13} variant="Bold" />
      {label}
    </button>
  );
}

function StatusPill({ run, ai, running, replaying }: { run: Run | null; ai: { enabled: boolean; model: string }; running: boolean; replaying: boolean }) {
  const label = running
    ? "Reading inbox"
    : replaying
      ? "Replay"
      : run === null
        ? "Idle"
        : run.ai.enabled
          ? `AI · ${run.ai.model}`
          : ai.enabled
            ? "Rules run · AI ready"
            : "Rule engine";
  return (
    <span className={cn("xv-micro xv-micro-sm inline-flex min-h-8 items-center gap-2 border px-3", running ? "border-accent/40 text-accent-ink" : "border-border text-muted-foreground")}>
      <span className={cn("inline-block size-1.5 rounded-full", running ? "xv-live bg-accent" : run?.ai.enabled ? "bg-ok" : "bg-muted-foreground/60")} aria-hidden />
      {label}
    </span>
  );
}

function Legend() {
  const signals: Array<{ label: string; color: string }> = [
    { label: "Differs", color: "var(--signal-bad)" },
    { label: "Needs a person", color: "var(--signal-warn)" },
    { label: "Matches", color: "var(--signal-ok)" },
  ];
  const queues: Array<{ label: string; color: string }> = [
    { label: "SI request", color: CATEGORY_COLOR.SI_REQUEST },
    { label: "Invoice", color: CATEGORY_COLOR.INVOICE_QUERY },
    { label: "General", color: CATEGORY_COLOR.GENERAL },
    { label: "Spam", color: CATEGORY_COLOR.SPAM },
  ];
  return (
    <div className="xv-no-print pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-x-4 gap-y-2 border border-border bg-card/95 px-3 py-2">
      {[...signals, ...queues].map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="inline-block size-2 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
          {item.label}
        </span>
      ))}
      <span className="text-[11px] text-muted-foreground">Click a group to open it · drag to pin · scroll to zoom</span>
    </div>
  );
}

function EmptyState({ running, done, total, onStart }: { running: boolean; done: number; total: number; onStart(): void }) {
  return (
    <div className="xv-dotgrid grid h-full place-items-center p-6">
      <div className="w-full max-w-md border border-border bg-card p-6 text-center">
        <p className="xv-micro xv-micro-sm text-muted-foreground">Inbox not read yet</p>
        <p className="mt-2 text-[17px] font-medium">Let Tveris read every email, check every SI against its BL, and sort what needs you.</p>
        {running ? (
          <p className="mt-4 font-mono text-[13px] text-accent-ink" aria-live="polite">
            Reading {done}/{total || "..."}
          </p>
        ) : (
          <button type="button" onClick={onStart} className={cn(BUTTON_PRIMARY, "mt-5")}>
            <Icon name="Flash" size={14} variant="Bold" />
            Process inbox
          </button>
        )}
      </div>
    </div>
  );
}
