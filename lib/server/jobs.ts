import "server-only";

import { aiConfig } from "@/lib/ai/claude";
import type { EmailResult, HumanReview, Run } from "@/lib/domain/types";
import { failedResult, processEmail, processInbox } from "@/lib/pipeline/pipeline";
import { errorMessage } from "@/lib/pipeline/read";
import { applyReview } from "@/lib/pipeline/review";
import type { InboxSource } from "@/lib/sources";
import { getStore, sourceKey } from "@/lib/store";

/**
 * Background processing. A run over a whole inbox takes seconds (rules) to a
 * few minutes (Claude on every email), so it runs outside the request and the
 * dashboard polls its progress. One job per source at a time.
 */

export interface JobState {
  key: string;
  status: "running" | "done" | "failed";
  done: number;
  total: number;
  startedAt: string;
  error: string | null;
  /** The last few finished emails, for the live ticker. */
  recent: Array<{ id: string; category: string; status: string }>;
}

const globalJobs = globalThis as unknown as { __tverisJobs?: Map<string, JobState> };
const jobs = (globalJobs.__tverisJobs ??= new Map<string, JobState>());

export function jobFor(key: string): JobState | null {
  return jobs.get(key) ?? null;
}

export function startRun(source: InboxSource): JobState {
  const key = sourceKey(source.descriptor);
  const existing = jobs.get(key);
  if (existing?.status === "running") return existing;

  const job: JobState = {
    key,
    status: "running",
    done: 0,
    total: 0,
    startedAt: new Date().toISOString(),
    error: null,
    recent: [],
  };
  jobs.set(key, job);

  void (async () => {
    try {
      const run = await processInbox(source, {
        ai: aiConfig(),
        onProgress: ({ done, total, latest }) => {
          job.done = done;
          job.total = total;
          if (latest !== null) {
            job.recent = [
              { id: latest.email.email_id, category: latest.classification.category, status: latest.status },
              ...job.recent,
            ].slice(0, 8);
          }
        },
      });
      await getStore().saveRun(run);
      job.status = "done";
    } catch (error) {
      job.status = "failed";
      job.error = errorMessage(error);
    }
  })();

  return job;
}

function findResult(run: Run, emailId: string): EmailResult {
  const result = run.results.find((candidate) => candidate.email.email_id === emailId);
  if (result === undefined) throw new NotFoundError(`No email ${emailId} in this inbox.`);
  return result;
}

export class NotFoundError extends Error {}

function runOffset(run: Run): number {
  return Math.max(0, Date.now() - Date.parse(run.startedAt));
}

/** Re-run the whole pipeline for one email (the "Retry" button). */
export async function retryEmail(source: InboxSource, emailId: string): Promise<EmailResult> {
  const store = getStore();
  const key = sourceKey(source.descriptor);
  const run = await store.latestRun(key);
  if (run === null) throw new NotFoundError("This inbox has not been processed yet.");
  const previous = findResult(run, emailId);
  const startedAt = Date.parse(run.startedAt);
  let result: EmailResult;
  try {
    result = await processEmail(previous.email, source, { ai: aiConfig(), startedAt });
  } catch (error) {
    result = failedResult(previous.email, startedAt, errorMessage(error));
  }
  result = { ...result, attempts: previous.attempts + 1, doneAtMs: previous.doneAtMs };
  if (previous.review !== null) result = applyReview(result, previous.review, runOffset(run));
  await store.updateResult(key, result);
  return result;
}

/** Record a person's decision and recompute the report for that email. */
export async function reviewEmail(
  source: InboxSource,
  emailId: string,
  review: HumanReview,
): Promise<EmailResult> {
  const store = getStore();
  const key = sourceKey(source.descriptor);
  const run = await store.latestRun(key);
  if (run === null) throw new NotFoundError("This inbox has not been processed yet.");
  let base = findResult(run, emailId);

  // Moving an email into or out of the document check changes what has to be
  // read: re-run the pipeline with the reviewer's category first.
  const override = review.categoryOverride;
  const current = base.classification.category;
  if (override !== null && override !== current && (override === "BL_COMPARISON" || current === "BL_COMPARISON")) {
    base = await processEmail(base.email, source, {
      ai: aiConfig(),
      startedAt: Date.parse(run.startedAt),
      forcedCategory: override,
    });
    base = { ...base, doneAtMs: findResult(run, emailId).doneAtMs };
  }

  const reviewed = applyReview(base, review, runOffset(run));
  await store.updateResult(key, reviewed);
  return reviewed;
}
