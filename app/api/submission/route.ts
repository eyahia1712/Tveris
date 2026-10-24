import { toSubmission } from "@/lib/domain/submission";
import { errorResponse } from "@/lib/server/http";
import { parseSourceParam, resolveSource } from "@/lib/server/context";
import { getStore, sourceKey } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The organisers' self-evaluation file, downloadable from the dashboard. */
export async function GET(request: Request): Promise<Response> {
  try {
    const source = await resolveSource(parseSourceParam(new URL(request.url).searchParams.get("source")));
    if (source === null) return Response.json({ error: "Connect Gmail first." }, { status: 401 });
    const run = await getStore().latestRun(sourceKey(source.descriptor));
    if (run === null) return Response.json({ error: "Process the inbox first." }, { status: 404 });
    return new Response(JSON.stringify(toSubmission(run.results), null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="submission.json"',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
