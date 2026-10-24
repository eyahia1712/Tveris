import { aiConfig } from "@/lib/ai/claude";
import { jobFor, startRun } from "@/lib/server/jobs";
import { errorResponse, readJson } from "@/lib/server/http";
import { parseSourceParam, resolveSource } from "@/lib/server/context";
import { getStore, sourceKey } from "@/lib/store";

export const dynamic = "force-dynamic";

/** GET: the job status (for polling) and whether a run exists. */
export async function GET(request: Request): Promise<Response> {
  try {
    const param = parseSourceParam(new URL(request.url).searchParams.get("source"));
    const source = await resolveSource(param);
    if (source === null) return Response.json({ error: "Connect Gmail first." }, { status: 401 });
    const key = sourceKey(source.descriptor);
    const run = await getStore().latestRun(key);
    return Response.json({
      job: jobFor(key),
      run: run === null ? null : { id: run.id, finishedAt: run.finishedAt, summary: run.summary },
      ai: aiConfig().enabled,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST: process (or re-process) the whole inbox in the background. */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await readJson(request)) as { source?: unknown };
    const source = await resolveSource(parseSourceParam(body.source));
    if (source === null) return Response.json({ error: "Connect Gmail first." }, { status: 401 });
    return Response.json({ job: startRun(source) }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
