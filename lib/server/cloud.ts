import "server-only";

import { aiConfig } from "@/lib/ai/claude";
import { gmailConfigured } from "@/lib/gmail";

/**
 * What cloud infrastructure this deployment is actually running on, read from
 * the environment the platform sets: shown on the dashboard so the judges (and
 * the ops team) can see it is live, not a mock.
 */
export interface CloudStatus {
  hosting: { live: boolean; label: string; detail: string };
  database: { live: boolean; label: string; detail: string };
  ai: { live: boolean; label: string; detail: string };
  mail: { live: boolean; label: string; detail: string };
  scheduler: { live: boolean; label: string; detail: string };
}

export function cloudStatus(): CloudStatus {
  const service = process.env.K_SERVICE;
  const region = process.env.TVERIS_REGION ?? process.env.GOOGLE_CLOUD_REGION ?? null;
  const dbUrl = process.env.DATABASE_URL;
  let dbHost = "";
  try {
    dbHost = dbUrl ? new URL(dbUrl).hostname || "Cloud SQL socket" : "";
  } catch {
    dbHost = "configured";
  }
  const ai = aiConfig();
  return {
    hosting: service
      ? { live: true, label: "Google Cloud Run", detail: `${service}${region ? ` · ${region}` : ""} · revision ${process.env.K_REVISION ?? "?"}` }
      : { live: false, label: "Local server", detail: "Deploy with the Dockerfile to Cloud Run" },
    database: dbUrl
      ? { live: true, label: "PostgreSQL", detail: dbHost }
      : { live: false, label: "Local JSON store", detail: "Set DATABASE_URL (Cloud SQL) for shared state" },
    ai: ai.enabled
      ? { live: true, label: "Anthropic Claude API", detail: ai.model }
      : { live: false, label: "Rule engine only", detail: "Set ANTHROPIC_API_KEY to enable AI verification" },
    mail: gmailConfigured()
      ? { live: true, label: "Gmail API", detail: "OAuth read-only" }
      : { live: false, label: "Gmail not configured", detail: "Sample inbox bundled" },
    scheduler: process.env.CRON_SECRET
      ? { live: true, label: "Cloud Scheduler", detail: "Inbox re-read on a schedule" }
      : { live: false, label: "Manual runs", detail: "Set CRON_SECRET and a Cloud Scheduler job" },
  };
}
