"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { TverisLogo } from "@/components/brand/logo";
import { ClaudeMark, GmailMark, SampleInboxMark } from "@/components/brand/source-marks";
import { CATEGORY_COLOR } from "@/components/viz/inbox-canvas";
import { Icon } from "@/components/icons";
import { useProcessing } from "@/components/dashboard/api";
import type { WeeklyBrief } from "@/lib/ai/brief";
import { FieldTable } from "@/components/report/field-table";
import type { Overview, SearchRow } from "@/lib/domain/overview";
import type { SourceParam } from "@/lib/domain/source";
import { CATEGORY_LABELS, type Category, type EmailResult } from "@/lib/domain/types";
import { PRIORITY_ORDER } from "@/lib/pipeline/triage";
import { cn, formatClock, senderName, shortId } from "@/lib/utils";

/**
 * The dashboard, kept to one screen and almost no prose: a status card, three
 * tiles that filter, one chart, four actions, and the work itself. The numbers
 * do the talking, and every one of them leads to the emails behind it.
 */

export interface DashboardHomeProps {
  overview: Overview | null;
  brief: WeeklyBrief | null;
  source: SourceParam;
  ai: { enabled: boolean; model: string };
  gmailEmail: string | null;
}

type Job = "mismatch" | "review" | "prepare";

const JOB_LABEL: Record<Job, string> = {
  mismatch: "Mismatches",
  review: "Needs review",
  prepare: "SIs to prepare",
};

/** The same count the map shows: reviewed work is marked, not hidden. */
function inJob(row: SearchRow, job: Job): boolean {
  if (job === "mismatch") return row.category === "BL_COMPARISON" && row.status === "MISMATCH";
  if (job === "review") return row.category === "BL_COMPARISON" && row.status === "NEEDS_REVIEW";
  return row.category === "SI_REQUEST";
}

export function DashboardHome({ overview, brief, source, ai, gmailEmail }: DashboardHomeProps) {
  const router = useRouter();
  const [job, setJob] = useState<Job>("mismatch");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(6);
  const [selected, setSelected] = useState<string | null>(null);

  const counts = useMemo(() => {
    const of = (key: Job) => (overview === null ? 0 : overview.search.filter((row) => inJob(row, key)).length);
    return { mismatch: of("mismatch"), review: of("review"), prepare: of("prepare") };
  }, [overview]);

  const rows = useMemo(() => {
    if (overview === null) return [];
    const needle = query.trim().toLowerCase();
    return overview.search
      .filter((row) => inJob(row, job))
      .filter((row) =>
        needle === ""
          ? true
          : [row.id, row.subject, row.sender, row.route, row.vessel, row.consignee, ...row.refs]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(needle),
      )
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.id.localeCompare(b.id));
  }, [overview, job, query]);

  // A review or a retry elsewhere changes these numbers: refresh whenever the
  // tab comes back into view, so the dashboard is never stale.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  return (
    <div className="min-h-dvh bg-[var(--paper-warm)] text-[var(--ink-deep)]">
      <TopBar source={source} gmailEmail={gmailEmail} ai={ai} />
      {overview === null ? (
        <Empty source={source} />
      ) : (
        <main className="mx-auto w-full max-w-[1180px] px-5 pt-8 pb-16 md:px-8">
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:gap-12">
            <div className="space-y-4 lg:sticky lg:top-6">
              <StatusCard overview={overview} needsYou={counts.mismatch + counts.review} />
              <Queues overview={overview} source={source} />
              <Defects overview={overview} />
            </div>

            <div className="min-w-0">
              <Tiles counts={counts} active={job} onPick={(next) => { setJob(next); setLimit(6); }} />
              <Chart overview={overview} />
              <Actions source={source} />
              <WorkList
                job={job}
                rows={rows}
                query={query}
                onQuery={(value) => { setQuery(value); setLimit(6); }}
                limit={limit}
                onMore={() => setLimit((value) => value + 8)}
                onOpen={setSelected}
                selected={selected}
              />
              <BriefRow brief={brief} ai={ai} source={source} />
            </div>
          </div>

          {selected !== null ? (
            <PreviewPanel emailId={selected} source={source} onClose={() => setSelected(null)} />
          ) : null}
        </main>
      )}
    </div>
  );
}

// -- chrome ----------------------------------------------------------------------

function TopBar({ source, gmailEmail, ai }: { source: SourceParam; gmailEmail: string | null; ai: { enabled: boolean; model: string } }) {
  return (
    <header className="border-b border-[var(--hairline-warm)]">
      <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4 md:px-8">
        <Link href="/" className="xv-focus" aria-label="Tveris home">
          <TverisLogo size={26} />
        </Link>
        <nav className="flex flex-wrap items-center gap-1" aria-label="Main">
          <Tab href={`/dashboard?source=${source}`} label="Dashboard" active />
          <Tab href={`/inbox?source=${source}`} label="Inbox map" />
          <Tab href={`/report?source=${source}`} label="Report" />
          <Tab href="/connect" label="Sources" />
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-9 items-center gap-2 rounded-[6px] border border-[var(--hairline-warm)] bg-white px-2.5">
            {source === "gmail" ? <GmailMark size={16} /> : <SampleInboxMark size={16} />}
            <span className="text-[12.5px]">{source === "gmail" ? (gmailEmail ?? "Gmail") : "Sample inbox"}</span>
          </span>
          <span className="inline-flex min-h-9 items-center gap-2 rounded-[6px] border border-[var(--hairline-warm)] bg-white px-2.5">
            <ClaudeMark size={15} />
            <span className="text-[12.5px] text-[var(--ink-2)]">{ai.enabled ? ai.model : "Claude AI"}</span>
          </span>
        </div>
      </div>
    </header>
  );
}

function Tab({ href, label, active = false }: { href: string; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "xv-focus inline-flex min-h-9 items-center rounded-[6px] px-3 text-[13px] font-medium transition-colors",
        active ? "bg-[var(--ink-deep)] text-[var(--paper-warm)]" : "text-[var(--ink-2)] hover:text-[var(--ink-deep)]",
      )}
    >
      {label}
    </Link>
  );
}

// -- the card ------------------------------------------------------------------------

function StatusCard({ overview, needsYou }: { overview: Overview; needsYou: number }) {
  return (
    <div>
      <div className="flex w-full flex-col rounded-[10px] bg-[var(--saffron)] p-5 text-[var(--saffron-deep)]">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-[3px] border border-[rgba(61,46,0,0.32)] px-2 py-1 text-[10px] font-medium tracking-[0.09em] text-[var(--saffron-mid)] uppercase">
            {overview.ai.enabled ? "AI verified" : "Rule engine"}
          </span>
          <span className="text-[13px] font-medium tracking-[0.14em]">TVERIS</span>
        </div>

        {/* The chip: the detail a card carries, in ink on saffron. */}
        <span className="relative mt-6 mb-3 block h-[25px] w-[34px] rounded-[4px] bg-[#3d2e002e] shadow-[inset_0_0_0_1px_#3d2e002e]" aria-hidden>
          <span className="absolute top-[10px] right-1.5 left-1.5 block h-px bg-[#3d2e0042]" />
          <span className="absolute top-[18px] right-1.5 left-1.5 block h-px bg-[#3d2e0042]" />
        </span>

        <p className="font-mono text-[clamp(34px,4vw,44px)] leading-none font-medium tracking-[-0.035em]">{needsYou}</p>
        <p className="mt-2 text-[13.5px] text-[var(--saffron-mid)]">
          emails need you · {overview.total - needsYou} handled
        </p>

        <div className="mt-6 border-t border-[rgba(61,46,0,0.24)] pt-3">
          <p className="text-[11px] tracking-[0.09em] text-[var(--saffron-mid)] uppercase">Last read</p>
          <p className="font-mono text-[12px]">{formatClock(overview.finishedAt)}</p>
        </div>

        <div className="mt-4 flex justify-between gap-3 text-[11px] tracking-[0.09em] text-[var(--saffron-mid)] uppercase">
          <span className="truncate">{overview.sourceLabel}</span>
          <span className="font-mono">{overview.total} emails</span>
        </div>
      </div>
    </div>
  );
}

/** The five queues, at a glance, under the card. */
function Queues({ overview, source }: { overview: Overview; source: SourceParam }) {
  const rows = (Object.keys(CATEGORY_LABELS) as Category[]).map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    value: overview.search.filter((row) => row.category === category).length,
  }));
  return (
    <div className="rounded-[6px] border border-[var(--hairline-warm)] bg-white">
      <ul className="divide-y divide-[var(--hairline-warm)]">
        {rows.map((row) => (
          <li key={row.category}>
            <Link
              href={`/inbox?source=${source}&only=${row.category}`}
              className="xv-focus flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-[var(--paper-warm-2)]"
            >
              <span className="flex items-center gap-2">
                <span className="inline-block size-2 rounded-full" style={{ backgroundColor: CATEGORY_COLOR[row.category] }} aria-hidden />
                {row.label}
              </span>
              <span className="font-mono text-[13px]">{row.value}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The seven fields, worst offender first: what to fix upstream. */
function Defects({ overview }: { overview: Overview }) {
  const rows = overview.defectsByField.slice(0, 4);
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <div className="rounded-[6px] border border-[var(--hairline-warm)] bg-white p-4">
      <p className="text-[11px] tracking-[0.09em] text-[var(--ink-3)] uppercase">Where the BLs go wrong</p>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li key={row.field} className="grid grid-cols-[104px_minmax(0,1fr)_26px] items-center gap-2 text-[12.5px]">
            <span className="truncate">{row.label}</span>
            <span className="h-2 rounded-[2px] bg-[var(--paper-warm-2)]" aria-hidden>
              <span className="block h-full rounded-[2px] bg-[var(--brand-red)]" style={{ width: `${(row.count / max) * 100}%` }} />
            </span>
            <span className="text-right font-mono">{row.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// -- tiles, chart, actions ---------------------------------------------------------------

function Tiles({ counts, active, onPick }: { counts: Record<Job, number>; active: Job; onPick(job: Job): void }) {
  const tiles: Array<{ job: Job; label: string; tone: string }> = [
    { job: "mismatch", label: "Mismatches", tone: "text-bad" },
    { job: "review", label: "Needs review", tone: "text-warn" },
    { job: "prepare", label: "SIs to prepare", tone: "text-[var(--ink-deep)]" },
  ];
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((tile) => (
          <button
            key={tile.job}
            type="button"
            onClick={() => onPick(tile.job)}
            aria-pressed={active === tile.job}
            className={cn(
              "xv-focus flex flex-col gap-2 rounded-[6px] border p-4 text-left transition-colors",
              active === tile.job ? "border-[var(--ink-deep)] bg-white" : "border-[var(--hairline-warm)] hover:border-[var(--ink-3)]",
            )}
          >
            <span className="text-[11px] tracking-[0.09em] text-[var(--ink-3)] uppercase">{tile.label}</span>
            <span className={cn("font-mono text-[22px] leading-none font-medium tracking-[-0.03em]", tile.tone)}>{counts[tile.job]}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 mb-8 text-[12.5px] text-[var(--ink-3)]">Pick one to fill the list below.</p>
    </>
  );
}

function Chart({ overview }: { overview: Overview }) {
  const bars = (Object.keys(CATEGORY_LABELS) as Category[]).map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    value: overview.search.filter((row) => row.category === category).length,
  }));
  const max = Math.max(...bars.map((bar) => bar.value), 1);
  const ticks = [max, Math.round(max / 2), 0];
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between border-b border-[var(--ink-deep)] pb-3">
        <h3 className="text-[15px] font-medium">The inbox, by queue</h3>
        <span className="text-[12px] text-[var(--ink-3)]">{overview.total} emails</span>
      </div>
      <div className="flex gap-3">
        <div className="flex h-[180px] flex-none flex-col justify-between text-right font-mono text-[11px] text-[var(--ink-3)]">
          {ticks.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
        <div className="relative h-[180px] min-w-0 flex-1">
          <span className="absolute inset-x-0 top-0 h-px bg-[var(--hairline-warm)]" aria-hidden />
          <span className="absolute inset-x-0 top-1/2 h-px bg-[var(--hairline-warm)]" aria-hidden />
          <span className="absolute inset-x-0 bottom-0 h-px bg-[var(--ink-deep)]" aria-hidden />
          <div className="absolute inset-0 grid auto-cols-fr grid-flow-col items-end gap-3">
            {bars.map((bar) => (
              <div key={bar.category} className="group relative flex h-full items-end justify-center">
                <span
                  className="relative w-full max-w-[26px] rounded-t-[4px] opacity-85 transition-opacity group-hover:opacity-100"
                  style={{ height: `${(bar.value / max) * 100}%`, backgroundColor: CATEGORY_COLOR[bar.category] }}
                >
                  <span className="absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 rounded-[4px] bg-[var(--ink-deep)] px-2 py-1 font-mono text-[11.5px] whitespace-nowrap text-[var(--paper-warm)] opacity-0 transition-opacity group-hover:opacity-100">
                    {bar.value}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 grid auto-cols-fr grid-flow-col gap-3 pl-[46px] text-center text-[11.5px] text-[var(--ink-3)]">
        {bars.map((bar) => (
          <span key={bar.category} className="truncate">
            {bar.label}
          </span>
        ))}
      </div>
    </section>
  );
}

function Actions({ source }: { source: SourceParam }) {
  return (
    <div className="mb-10">
      <Link
        href={`/inbox?source=${source}`}
        className="xv-focus flex min-h-[86px] items-center justify-between gap-4 rounded-[6px] border border-[var(--ink-deep)] bg-[var(--ink-deep)] px-5 text-[var(--paper-warm)] transition-opacity hover:opacity-85"
      >
        <span>
          <span className="block text-[14px] font-medium">Inbox map</span>
          <span className="mt-1 block text-[12px] opacity-70">Every email on one map: open a branch down to its seven fields.</span>
        </span>
        <Icon name="Hierarchy" size={22} />
      </Link>
    </div>
  );
}

// -- the work ----------------------------------------------------------------------------

function WorkList({
  job,
  rows,
  query,
  onQuery,
  limit,
  onMore,
  onOpen,
  selected,
}: {
  job: Job;
  rows: SearchRow[];
  query: string;
  onQuery(value: string): void;
  limit: number;
  onMore(): void;
  onOpen(id: string): void;
  selected: string | null;
}) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--ink-deep)] pb-3">
        <h3 className="text-[15px] font-medium">
          {JOB_LABEL[job]} <span className="font-mono text-[13px] text-[var(--ink-3)]">{rows.length}</span>
        </h3>
        <label className="flex min-h-8 items-center gap-2 rounded-[6px] border border-[var(--hairline-warm)] px-2.5 focus-within:border-[var(--ink-deep)]">
          <Icon name="SearchNormal1" size={13} className="text-[var(--ink-3)]" />
          <input
            value={query}
            onChange={(event) => onQuery(event.currentTarget.value)}
            placeholder="Search"
            className="w-36 bg-transparent text-[12.5px] outline-none placeholder:text-[var(--ink-3)] sm:w-56"
            aria-label="Search this list"
          />
        </label>
      </div>
      {query.trim() !== "" ? (
        <p className="mb-2 text-[12px] text-[var(--ink-3)]" aria-live="polite">
          {rows.length === 0
            ? `No emails match "${query.trim()}" in ${JOB_LABEL[job].toLowerCase()}.`
            : `${rows.length} email${rows.length === 1 ? "" : "s"} match "${query.trim()}".`}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-[var(--ink-3)]">
          {query.trim() !== "" ? "Try another name, reference or email id." : "Nothing left here."}
        </p>
      ) : (
        <ul className="border-t border-[var(--hairline-warm)]">
          {rows.slice(0, limit).map((row) => (
            <li key={row.id} className="border-b border-[var(--hairline-warm)]">
              <button
                type="button"
                onClick={() => onOpen(row.id)}
                aria-pressed={selected === row.id}
                className={cn(
                  "xv-focus flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-white",
                  selected === row.id && "bg-white",
                )}
              >
                <span className="font-mono text-[12px] text-[var(--ink-3)]">#{shortId(row.id)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{row.subject}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-[var(--ink-3)]">
                    {row.route ?? row.sender}
                    {row.refs[0] ? ` · ${row.refs[0]}` : ""}
                  </span>
                </span>
                <span className="flex-none text-[12px] text-[var(--ink-2)]">{row.reviewed ? "Reviewed" : row.statusLabel}</span>
                <Icon name="ArrowRight2" size={13} className="flex-none text-[var(--ink-3)]" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows.length > limit ? (
        <button type="button" onClick={onMore} className="xv-focus mt-3 text-[12.5px] font-medium text-[var(--ink-3)] hover:text-[var(--ink-deep)]">
          Show {Math.min(8, rows.length - limit)} more
        </button>
      ) : null}
    </section>
  );
}

/**
 * A row's details, beside the list: what differs, what to do, and the way in
 * to the full page — only when the reviewer actually wants to change something.
 */
function PreviewPanel({ emailId, source, onClose }: { emailId: string; source: SourceParam; onClose(): void }) {
  const [state, setState] = useState<{ result: EmailResult | null; error: string | null }>({ result: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    // Fetching is talking to an external system, so it belongs in an effect;
    // one state object keeps it to a single update per answer.
    const load = async () => {
      try {
        const response = await fetch(`/api/emails/${encodeURIComponent(emailId)}?source=${source}`, {
          signal: controller.signal,
        });
        const body = (await response.json()) as { result?: EmailResult; error?: string };
        if (!response.ok || body.result === undefined) throw new Error(body.error ?? "Could not load this email.");
        setState({ result: body.result, error: null });
      } catch (caught) {
        if (controller.signal.aborted) return;
        setState({ result: null, error: caught instanceof Error ? caught.message : String(caught) });
      }
    };
    void load();
    return () => controller.abort();
  }, [emailId, source]);

  const { result, error } = state;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const check = result?.check ?? null;
  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[460px] flex-col border-l border-[var(--hairline-warm)] bg-white shadow-[-14px_0_40px_rgb(17,17,16,0.10)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--hairline-warm)] px-5 py-3">
        <span className="font-mono text-[12px] text-[var(--ink-3)]">#{shortId(emailId)}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="xv-focus grid size-8 place-items-center text-[var(--ink-3)] hover:text-[var(--ink-deep)]">
          <Icon name="CloseCircle" size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {error !== null ? <p className="text-[13px] text-bad">{error}</p> : null}
        {result === null && error === null ? <p className="text-[13px] text-[var(--ink-3)]">Loading…</p> : null}
        {result !== null ? (
          <div className="space-y-5">
            <div>
              <p className="text-[15px] leading-snug font-medium">{result.email.subject}</p>
              <p className="mt-1 text-[12px] text-[var(--ink-3)]">{senderName(result.email.from)}</p>
            </div>

            <div className="rounded-[6px] border border-[var(--hairline-warm)] bg-[var(--paper-warm)] p-3">
              <p className="text-[11px] tracking-[0.09em] text-[var(--ink-3)] uppercase">Next action</p>
              <p className="mt-1 text-[13px] leading-snug">{result.triage.action}</p>
            </div>

            {check !== null ? (
              <div className="space-y-2">
                <p
                  className={cn(
                    "text-[13px] font-medium",
                    check.status === "MISMATCH" ? "text-bad" : check.status === "OK" ? "text-ok" : "text-warn",
                  )}
                >
                  {check.summary}
                </p>
                <FieldTable check={check} compact />
              </div>
            ) : null}

            {result.review !== null ? (
              <p className="text-[12px] text-[var(--ink-3)]">
                Reviewed by {result.review.reviewer} ({result.review.decision})
                {result.review.note ? `: ${result.review.note}` : ""}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid gap-2 border-t border-[var(--hairline-warm)] p-4 sm:grid-cols-2">
        <Link
          href={`/emails/${emailId}?source=${source}`}
          className="xv-focus inline-flex min-h-10 items-center justify-center gap-2 rounded-[6px] bg-[var(--ink-deep)] px-3 text-[12.5px] font-medium text-[var(--paper-warm)] hover:opacity-85"
        >
          <Icon name="Edit2" size={14} />
          Review and correct
        </Link>
        <Link
          href={`/inbox?source=${source}&focus=${emailId}`}
          className="xv-focus inline-flex min-h-10 items-center justify-center gap-2 rounded-[6px] border border-[var(--hairline-warm)] px-3 text-[12.5px] font-medium hover:border-[var(--ink-deep)]"
        >
          <Icon name="Hierarchy" size={14} />
          Show on the map
        </Link>
      </div>
    </aside>
  );
}

function BriefRow({ brief, ai, source }: { brief: WeeklyBrief | null; ai: { enabled: boolean; model: string }; source: SourceParam }) {
  const [current, setCurrent] = useState(brief);
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      const body = (await response.json()) as { brief?: WeeklyBrief };
      if (body.brief) setCurrent(body.brief);
    } finally {
      setBusy(false);
    }
  };
  if (current === null) return null;
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between border-b border-[var(--ink-deep)] pb-3">
        <h3 className="flex items-center gap-2 text-[15px] font-medium">
          <ClaudeMark size={15} />
          {current.source === "ai" ? "Claude's brief" : "This week"}
        </h3>
        <button type="button" onClick={() => void ask()} disabled={busy} className="xv-focus text-[12px] text-[var(--ink-3)] hover:text-[var(--brand-red)]">
          {busy ? "Writing..." : ai.enabled ? "Ask Claude" : "Refresh"}
        </button>
      </div>
      <p className="text-[14px] font-medium">{current.headline}</p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-3">
        {current.recommendations.slice(0, 3).map((item, index) => (
          <li key={index} className="rounded-[6px] border border-[var(--hairline-warm)] p-3">
            <p className="text-[12.5px] font-medium">{item.title}</p>
            <p className="mt-1 text-[12px] leading-snug text-[var(--ink-3)]">{item.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Empty({ source }: { source: SourceParam }) {
  const { start, running, job } = useProcessing(source, () => window.location.reload());
  return (
    <main className="grid min-h-[70dvh] place-items-center p-6">
      <div className="w-full max-w-sm rounded-[10px] bg-[var(--saffron)] p-6 text-center text-[var(--saffron-deep)]">
        <p className="text-[17px] font-medium">This inbox has not been read yet.</p>
        <button
          type="button"
          onClick={() => void start()}
          disabled={running}
          className="xv-focus mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[6px] bg-[var(--ink-deep)] px-4 text-[13px] font-medium text-[var(--paper-warm)] disabled:opacity-50"
        >
          <Icon name="Flash" size={14} variant="Bold" />
          {running ? `Reading ${job?.done ?? 0}/${job?.total ?? "..."}` : "Read the inbox"}
        </button>
      </div>
    </main>
  );
}
