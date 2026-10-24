import { timingSafeEqual } from "node:crypto";

import { startRun } from "@/lib/server/jobs";
import { sampleSource } from "@/lib/server/context";

export const dynamic = "force-dynamic";

/**
 * Called by Cloud Scheduler (e.g. every 15 minutes) to re-read the shared
 * inbox. Authenticated with a shared secret header, compared in constant time.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("x-tveris-cron") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json({ job: startRun(sampleSource()) }, { status: 202 });
}
