import { aiBrief, rulesBrief, type WeeklyBrief } from "@/lib/ai/brief";
import { aiConfig } from "@/lib/ai/claude";
import { buildOverview } from "@/lib/domain/overview";
import { errorResponse, readJson } from "@/lib/server/http";
import { parseSourceParam, resolveSource } from "@/lib/server/context";
import { getStore, sourceKey } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * POST: (re)generate next week's brief with Claude for the current run and
 * cache it. Without AI, the rule-based brief is returned (and not cached).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await readJson(request)) as { source?: unknown };
    const source = await resolveSource(parseSourceParam(body.source));
    if (source === null) return Response.json({ error: "Connect Gmail first." }, { status: 401 });
    const key = sourceKey(source.descriptor);
    const run = await getStore().latestRun(key);
    if (run === null) return Response.json({ error: "Process the inbox first." }, { status: 404 });
    const overview = buildOverview(run, new Date());
    const ai = aiConfig();
    if (!ai.enabled) return Response.json({ brief: rulesBrief(overview) });
    let brief: WeeklyBrief;
    try {
      brief = await aiBrief(overview, ai.model);
    } catch (error) {
      console.error("[tveris] brief", error);
      return Response.json({ brief: rulesBrief(overview), warning: "AI brief unavailable; showing the rule-based brief." });
    }
    await getStore().setMeta(`brief:${key}`, brief);
    return Response.json({ brief });
  } catch (error) {
    return errorResponse(error);
  }
}
