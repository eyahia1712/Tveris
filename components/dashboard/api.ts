"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Category, EmailResult, FieldKey } from "@/lib/domain/types";
import type { SourceParam } from "@/lib/domain/source";

/** Thin, typed client for the Tveris API. Errors surface as messages. */

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

export interface JobState {
  status: "running" | "done" | "failed";
  done: number;
  total: number;
  error: string | null;
  recent: Array<{ id: string; category: string; status: string }>;
}

export function startProcessing(source: SourceParam): Promise<{ job: JobState }> {
  return call("/api/run", { method: "POST", body: JSON.stringify({ source }) });
}

export function pollProcessing(source: SourceParam): Promise<{ job: JobState | null }> {
  return call(`/api/run?source=${source}`, { cache: "no-store" });
}

export interface ReviewInput {
  source: SourceParam;
  reviewer: string;
  decision: "confirmed" | "corrected";
  categoryOverride: Category | null;
  corrections: Partial<Record<FieldKey, { si?: string; bl?: string }>>;
  note: string;
}

export function submitReview(emailId: string, input: ReviewInput): Promise<{ result: EmailResult }> {
  return call(`/api/emails/${encodeURIComponent(emailId)}/review`, { method: "POST", body: JSON.stringify(input) });
}

export function retryEmail(emailId: string, source: SourceParam): Promise<{ result: EmailResult }> {
  return call(`/api/emails/${encodeURIComponent(emailId)}/retry`, { method: "POST", body: JSON.stringify({ source }) });
}

export function evaluate(): Promise<{ scoreboard: unknown }> {
  return call("/api/evaluate", { method: "POST" });
}

/**
 * Start a whole-inbox run and follow it until it finishes. `onDone` fires
 * once, when the run is saved, so the page can reload the new results.
 */
export function useProcessing(source: SourceParam, onDone: () => void) {
  const [job, setJob] = useState<JobState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneRef = useRef(onDone);

  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  const follow = useCallback(() => {
    const tick = async () => {
      try {
        const { job: next } = await pollProcessing(source);
        setJob(next);
        if (next?.status === "running") {
          timer.current = setTimeout(tick, 700);
        } else if (next?.status === "done") {
          doneRef.current();
        } else if (next?.status === "failed") {
          setError(next.error ?? "Processing failed.");
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    };
    void tick();
  }, [source]);

  // A run started elsewhere (another tab) is picked up on load.
  useEffect(() => {
    let cancelled = false;
    void pollProcessing(source)
      .then(({ job: current }) => {
        if (cancelled || current?.status !== "running") return;
        setJob(current);
        follow();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [source, follow]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const { job: started } = await startProcessing(source);
      setJob(started);
      follow();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [source, follow]);

  return { job, error, start, running: job?.status === "running" };
}
