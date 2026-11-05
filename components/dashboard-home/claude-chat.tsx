"use client";

import { useEffect, useRef, useState } from "react";

import { ClaudeMark } from "@/components/brand/source-marks";
import type { SourceParam } from "@/lib/domain/source";

/**
 * The Claude assistant: a button in the top bar that opens a chat panel. Every
 * answer is grounded in the current inbox run (see /api/chat).
 */

interface Turn {
  role: "user" | "assistant";
  content: string;
  mode?: "claude" | "rules";
}

const SUGGESTED = [
  "What needs my attention right now?",
  "Explain email #004",
  "Which fields go wrong most often?",
  "Why were some cases escalated?",
  "How does the agent work, step by step?",
  "How does the trade escrow protect a payment?",
];

export function ClaudeChat({ source, label }: { source: SourceParam; label: string }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setDraft("");
    setBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source, messages: next.slice(-12).map(({ role, content }) => ({ role, content })) }),
      });
      const data = (await response.json()) as { answer?: string; mode?: "claude" | "rules"; error?: string };
      setTurns([...next, { role: "assistant", content: data.answer ?? data.error ?? "Something went wrong.", mode: data.mode }]);
    } catch {
      setTurns([...next, { role: "assistant", content: "I couldn't reach the server. Please try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="xv-focus inline-flex min-h-9 items-center gap-2 rounded-[6px] border border-[#D97757]/50 bg-white px-2.5 transition-colors hover:bg-[#FCEDE6]"
        aria-haspopup="dialog"
      >
        <ClaudeMark size={15} />
        <span className="text-[12.5px] font-medium text-[var(--ink-deep)]">{label}</span>
        <span className="rounded-full bg-[#D97757] px-1.5 py-0.5 text-[10px] font-semibold text-white">Ask</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/25" onClick={() => setOpen(false)}>
          <aside
            role="dialog"
            aria-label="Ask Claude about this inbox"
            className="flex h-full w-full max-w-[440px] flex-col border-l border-[var(--hairline-warm)] bg-[var(--paper-warm)] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center gap-3 border-b border-[var(--hairline-warm)] px-5 py-4">
              <span className="grid size-9 place-items-center rounded-full bg-[#FCEDE6]">
                <ClaudeMark size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">Ask Claude</p>
                <p className="text-[12px] text-[var(--ink-3)]">Answers come from this inbox run, never invented</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="xv-focus rounded-[6px] px-2 py-1 text-[20px] leading-none text-[var(--ink-3)] hover:text-[var(--ink-deep)]" aria-label="Close">
                ×
              </button>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {turns.length === 0 ? (
                <div>
                  <p className="text-[14px] leading-relaxed text-[var(--ink-2)]">
                    Hi! I can explain any email, the mismatches, the review queue, how the agent works or how the trade escrow keeps a payment safe.
                  </p>
                  <p className="xv-micro xv-micro-sm mt-5 text-[var(--ink-3)]">Try asking</p>
                  <div className="mt-2 flex flex-col gap-2">
                    {SUGGESTED.map((question) => (
                      <button
                        key={question}
                        type="button"
                        onClick={() => ask(question)}
                        className="xv-focus rounded-[8px] border border-[var(--hairline-warm)] bg-white px-3 py-2 text-left text-[13.5px] transition-colors hover:border-[#D97757]/60 hover:bg-[#FCEDE6]"
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {turns.map((turn, index) => (
                <div key={index} className={turn.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={
                      turn.role === "user"
                        ? "max-w-[85%] rounded-[12px] rounded-br-[4px] bg-[var(--ink-deep)] px-3.5 py-2.5 text-[13.5px] text-[var(--paper-warm)]"
                        : "max-w-[92%] rounded-[12px] rounded-bl-[4px] border border-[var(--hairline-warm)] bg-white px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-line"
                    }
                  >
                    {turn.content}
                  </div>
                </div>
              ))}

              {busy ? (
                <div className="flex items-center gap-2 text-[12.5px] text-[var(--ink-3)]">
                  <ClaudeMark size={14} />
                  <span className="inline-flex gap-1">
                    <span className="size-1.5 animate-bounce rounded-full bg-[#D97757]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-[#D97757] [animation-delay:120ms]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-[#D97757] [animation-delay:240ms]" />
                  </span>
                  Reading the inbox…
                </div>
              ) : null}
              <div ref={bottom} />
            </div>

            {turns.length > 0 ? (
              <div className="flex gap-1.5 overflow-x-auto border-t border-[var(--hairline-warm)] px-5 pt-3">
                {SUGGESTED.slice(0, 4).map((question) => (
                  <button key={question} type="button" onClick={() => ask(question)} disabled={busy} className="xv-focus shrink-0 rounded-full border border-[var(--hairline-warm)] bg-white px-2.5 py-1 text-[12px] whitespace-nowrap hover:bg-[#FCEDE6] disabled:opacity-50">
                    {question}
                  </button>
                ))}
              </div>
            ) : null}

            <form
              className="flex gap-2 px-5 py-4"
              onSubmit={(event) => {
                event.preventDefault();
                void ask(draft);
              }}
            >
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ask about an email, a field or the escrow…"
                maxLength={2000}
                className="xv-focus min-h-11 flex-1 rounded-[8px] border border-[var(--hairline-warm)] bg-white px-3 text-[14px]"
              />
              <button type="submit" disabled={busy || draft.trim() === ""} className="xv-focus min-h-11 rounded-[8px] bg-[#D97757] px-4 text-[13.5px] font-semibold text-white disabled:opacity-50">
                Ask
              </button>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}
