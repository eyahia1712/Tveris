"use client";

import Link from "next/link";

import { TverisLogo } from "@/components/brand/logo";
import { GmailMark } from "@/components/brand/source-marks";
import { Icon } from "@/components/icons";
import { Hairline, Micro } from "@/components/ui/bits";

/** The rail sits on saffron, so its buttons are ink, not the app's blue. */
const RAIL_PRIMARY =
  "xv-micro xv-micro-sm xv-focus inline-flex min-h-10 items-center justify-center gap-2 bg-[var(--ink-deep)] px-4 text-white transition-opacity hover:opacity-85 disabled:opacity-50";
const RAIL_SECONDARY =
  "xv-micro xv-micro-sm xv-focus inline-flex min-h-10 items-center justify-center gap-2 border border-[rgba(61,46,0,0.28)] bg-white px-4 text-foreground transition-colors hover:bg-surface disabled:opacity-50";
import { REPLAY_SPEEDS, type Replay } from "@/components/viz/use-replay";
import type { SourceParam } from "@/lib/domain/source";
import type { Run } from "@/lib/domain/types";
import { cn, formatClock, formatDuration } from "@/lib/utils";

import type { JobState } from "./api";

export interface RailProps {
  run: Run | null;
  source: SourceParam;
  gmail: { configured: boolean; email: string | null };
  replay: Replay;
  job: JobState | null;
  running: boolean;
  jobError: string | null;
  onProcess(): void;
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("xv-focus inline-flex items-center", className)} aria-label="Tveris overview">
      <TverisLogo size={24} />
    </Link>
  );
}

/** What needs a person: mismatches, reviews, urgent requests, failures. */
export function attentionCount(run: Run): number {
  return run.results.filter(
    (result) =>
      result.review === null
      && (result.failure !== null || result.triage.priority === "critical" || result.triage.priority === "high"),
  ).length;
}

export function LeftRail({ run, source, gmail, replay, job, running, jobError, onProcess }: RailProps) {
  const summary = run?.summary;
  const handsOff =
    run === null
      ? 0
      : run.results.filter(
          (result) =>
            result.classification.category === "SPAM"
            || result.triage.priority === "low"
            || result.triage.priority === "none"
            || (result.classification.category === "BL_COMPARISON" && result.status === "OK"),
        ).length;
  const checks = summary?.byCategory.BL_COMPARISON ?? 0;

  return (
    <div className="flex min-h-full flex-col gap-6 bg-[color-mix(in_srgb,#FFC300_12%,white)] p-5 md:p-6">
      <div className="flex items-center justify-between">
        <Wordmark />
        <Link
          href={gmail.email !== null ? "/inbox?source=gmail" : "/connect"}
          className="xv-focus xv-micro xv-micro-sm inline-flex min-h-8 items-center gap-2 border border-[rgba(61,46,0,0.28)] bg-white px-2.5 text-foreground transition-colors hover:bg-surface"
        >
          <GmailMark size={14} />
          {gmail.email !== null ? "My Gmail" : "Connect Gmail"}
        </Link>
      </div>

      <div className="space-y-3">
        <div className="flex border border-[rgba(61,46,0,0.22)] bg-white/70 p-1" role="tablist" aria-label="Inbox">
          <SourceTab href="/inbox?source=sample" active={source === "sample"} label="Sample inbox" icon="DirectInbox" />
        </div>
        <div>
          <Micro>{source === "gmail" ? gmail.email ?? "Gmail" : run?.source.label ?? "Sample inbox"}</Micro>
          <p className="mt-1.5 text-[17px] leading-snug font-medium tracking-[-0.01em]">
            {run === null
              ? "This inbox has not been read yet."
              : `${attentionCount(run)} of ${run.results.length} emails need you. Everything else is sorted.`}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <Hairline className="bg-[rgba(61,46,0,0.18)]" />
        <RunBadge run={run} job={job} running={running} error={jobError} />
        {run !== null ? (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
            <dt className="text-muted-foreground">Processed</dt>
            <dd className="text-right font-mono">{formatClock(run.finishedAt)}</dd>
            <dt className="text-muted-foreground">Took</dt>
            <dd className="text-right font-mono">{formatDuration(run.durationMs)}</dd>
            <dt className="text-muted-foreground">Classifier</dt>
            <dd className="truncate text-right font-mono">{run.ai.enabled ? run.ai.model : "rule engine"}</dd>
          </dl>
        ) : null}
      </div>

      {summary !== undefined ? (
        <dl className="grid grid-cols-2 gap-3">
          <Tile label="Mismatches" value={summary.mismatches} tone={summary.mismatches > 0 ? "bad" : undefined} />
          <Tile label="Needs review" value={summary.needsReview} tone={summary.needsReview > 0 ? "warn" : undefined} />
          <Tile label="Doc checks" value={checks} />
          <Tile label="Spam caught" value={summary.byCategory.SPAM} />
        </dl>
      ) : null}

      {run !== null ? (
        <div className="space-y-2 border border-ok/30 bg-white p-4">
          <Micro>Hands-off</Micro>
          <p className="font-mono text-2xl font-medium text-ok">
            {Math.round((handsOff / Math.max(1, run.results.length)) * 100)}%
          </p>
          <p className="text-[12px] leading-snug text-muted-foreground">
            {handsOff} emails need no action from you: clean BL checks, updates and spam. {summary?.disagreements ? `${summary.disagreements} classification${summary.disagreements === 1 ? "" : "s"} flagged where AI and rules disagreed.` : ""}
          </p>
        </div>
      ) : null}

      {run !== null ? (
        <div className="space-y-3">
          <Hairline className="bg-[rgba(61,46,0,0.18)]" />
          <div className="flex items-center justify-between gap-3">
            <div>
              <Micro>Replay</Micro>
              {!replay.active ? <p className="mt-1 text-[13px] text-muted-foreground">Watch the inbox get sorted</p> : null}
            </div>
            <button type="button" onClick={replay.toggle} className={cn(RAIL_PRIMARY, "min-h-9 px-3")}>
              <Icon name={replay.playing ? "Pause" : "Play"} size={14} variant="Bold" />
              {replay.playing ? "Pause" : "Play"}
            </button>
          </div>
          <input
            type="range"
            aria-label="Replay position"
            min={0}
            max={replay.endMs}
            step={Math.max(1, replay.endMs / 400)}
            value={replay.active ? replay.t : replay.endMs}
            onChange={(event) => replay.seek(Number(event.currentTarget.value))}
            className="w-full accent-[var(--ink-deep)]"
          />
          <div className="grid grid-cols-5 gap-2">
            {REPLAY_SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                aria-pressed={replay.speed === speed}
                onClick={() => replay.setSpeed(speed)}
                className={cn(
                  "xv-micro xv-micro-sm xv-focus min-h-9 border transition-colors",
                  replay.speed === speed
                    ? "border-[var(--ink-deep)] bg-[var(--ink-deep)] text-white"
                    : "border-[rgba(61,46,0,0.22)] bg-white text-muted-foreground hover:text-foreground",
                )}
              >
                {speed}x
              </button>
            ))}
            <button
              type="button"
              onClick={replay.stop}
              disabled={!replay.active}
              className="xv-micro xv-micro-sm xv-focus min-h-9 border border-[rgba(61,46,0,0.22)] bg-white text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              Live
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-auto space-y-2 pt-2">
        {run !== null ? (
          <Link href={`/report?source=${source}`} className={cn(RAIL_PRIMARY, "w-full min-h-11")}>
            <Icon name="DocumentText" size={15} variant="Bold" />
            Discrepancy report
          </Link>
        ) : null}
        {run === null ? (
          <button type="button" onClick={onProcess} disabled={running} className={cn(RAIL_SECONDARY, "w-full")}>
            <Icon name="Refresh" size={14} />
            {running ? "Reading" : "Process"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SourceTab({ href, active, label, icon }: { href: string; active: boolean; label: string; icon: "DirectInbox" | "Google" }) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={cn(
        "xv-micro xv-micro-sm xv-focus inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 transition-colors",
        active ? "bg-[var(--ink-deep)] text-white" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon name={icon} size={13} variant={active ? "Bold" : "Linear"} />
      {label}
    </Link>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: "bad" | "warn" }) {
  return (
    <div className="border border-[rgba(61,46,0,0.22)] bg-white p-3">
      <dt className="xv-micro xv-micro-sm text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 font-mono text-xl font-medium", tone === "bad" && "text-bad", tone === "warn" && "text-warn")}>{value}</dd>
    </div>
  );
}

function RunBadge({ run, job, running, error }: { run: Run | null; job: JobState | null; running: boolean; error: string | null }) {
  if (error !== null) {
    return (
      <p className="border border-bad/40 bg-[color-mix(in_srgb,var(--signal-bad)_6%,white)] p-2 text-[12px] text-bad" role="alert">
        {error}
      </p>
    );
  }
  if (running && job !== null) {
    const pct = job.total === 0 ? 0 : Math.round((job.done / job.total) * 100);
    return (
      <div className="space-y-2" aria-live="polite">
        <p className="xv-micro xv-micro-sm flex items-center gap-2 text-accent-ink">
          <span className="xv-live inline-block size-2 rounded-full bg-accent" aria-hidden />
          Reading {job.done}/{job.total || "..."}
        </p>
        <div className="h-1 w-full bg-surface-2">
          <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }
  if (run === null) {
    return <p className="xv-micro xv-micro-sm text-muted-foreground">Not processed</p>;
  }
  return (
    <p className="xv-micro xv-micro-sm inline-flex items-center gap-2 text-ok">
      <Icon name="TickCircle" size={14} variant="Bold" />
      Inbox processed{run.summary.failures > 0 ? ` · ${run.summary.failures} failed` : ""}
    </p>
  );
}
