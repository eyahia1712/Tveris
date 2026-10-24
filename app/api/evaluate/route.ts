import { toSubmission } from "@/lib/domain/submission";
import { errorResponse } from "@/lib/server/http";
import { HttpSource } from "@/lib/sources";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Send the current sample-inbox result to the organisers' self-evaluation
 * endpoint (POST /submit). Only available when TVERIS_SOURCE_URL points at
 * their server; the scoreboard comes back without the reference answers.
 */
export async function POST(): Promise<Response> {
  try {
    const url = process.env.TVERIS_SOURCE_URL;
    if (!url) {
      return Response.json(
        { error: "Set TVERIS_SOURCE_URL to the organisers' server (e.g. http://localhost:8080) to self-evaluate." },
        { status: 409 },
      );
    }
    const run = await getStore().latestRun("sample");
    if (run === null) return Response.json({ error: "Process the inbox first." }, { status: 404 });
    return Response.json({ scoreboard: await new HttpSource(url).submit(toSubmission(run.results)) });
  } catch (error) {
    return errorResponse(error);
  }
}
