"use client";

import { useState } from "react";

import { GmailMark } from "@/components/brand/source-marks";
import { Icon } from "@/components/icons";
import type { SourceParam } from "@/lib/domain/source";
import { cn } from "@/lib/utils";

/**
 * What a reviewer does with a drafted reply: copy it into their own mail, or
 * let Tveris send it from the connected mailbox. Sending always shows who it
 * goes to and waits for a second click — a reply leaves the building only
 * because a person said so.
 */

const BUTTON =
  "xv-focus inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 border border-border bg-card px-3 text-[12.5px] font-medium transition-colors hover:bg-surface disabled:opacity-50";

type Phase = { kind: "idle" | "confirm" | "sending" } | { kind: "done"; note: string } | { kind: "failed"; note: string };

export function ReplyActions({
  emailId,
  source,
  to,
  subject,
  reply,
  className,
}: {
  emailId: string;
  source: SourceParam;
  to: string;
  subject: string;
  reply: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const copy = () => {
    void navigator.clipboard.writeText(reply).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  };

  /** Hand the reply to the reviewer's own mail client, fully written. */
  const handOver = (note: string) => {
    const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(reply)}`;
    window.location.href = href;
    setPhase({ kind: "done", note });
  };

  const send = async () => {
    setPhase({ kind: "sending" });
    try {
      const response = await fetch(`/api/emails/${emailId}/reply?source=${source}`, { method: "POST" });
      const payload = (await response.json()) as { sent?: boolean; message?: string; error?: string };
      if (response.ok && payload.sent === true) {
        setPhase({ kind: "done", note: `Sent to ${to}.` });
        return;
      }
      if (response.status === 409) {
        handOver(`${payload.message ?? "Opened in your mail app."} The reply is open in your mail app, addressed and written.`);
        return;
      }
      setPhase({ kind: "failed", note: payload.error ?? "Could not send that reply." });
    } catch {
      setPhase({ kind: "failed", note: "Could not reach the server." });
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex gap-2">
        <button type="button" onClick={copy} className={BUTTON}>
          <Icon name={copied ? "TickCircle" : "Copy"} size={14} />
          {copied ? "Copied" : "Copy reply"}
        </button>
        <button
          type="button"
          onClick={() => (phase.kind === "confirm" ? void send() : setPhase({ kind: "confirm" }))}
          disabled={phase.kind === "sending"}
          className={cn(
            BUTTON,
            phase.kind === "confirm" && "border-transparent bg-[var(--ink-deep)] text-white hover:bg-[var(--ink-deep)] hover:opacity-90",
          )}
        >
          <GmailMark size={15} />
          {phase.kind === "sending" ? "Sending" : phase.kind === "confirm" ? "Confirm send" : "Send reply"}
        </button>
      </div>
      {phase.kind === "confirm" ? (
        <p className="text-[12px] leading-snug text-muted-foreground">
          This goes to <span className="text-foreground">{to}</span> as “{subject}”. Click again to send it.
        </p>
      ) : null}
      {phase.kind === "done" || phase.kind === "failed" ? (
        <p className={cn("text-[12px] leading-snug", phase.kind === "failed" ? "text-bad" : "text-muted-foreground")} aria-live="polite">
          {phase.note}
        </p>
      ) : null}
    </div>
  );
}
