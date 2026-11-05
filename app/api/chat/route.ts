import { z } from "zod";

import { aiConfig } from "@/lib/ai/claude";
import { answerOffline, chatWithClaude, CHAT_MODEL, runFacts } from "@/lib/ai/chat";
import { errorResponse, readJson } from "@/lib/server/http";
import { parseSourceParam, resolveSource } from "@/lib/server/context";
import { getStore, sourceKey } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  source: z.unknown().optional(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(2000) }))
    .min(1)
    .max(20),
});

/** POST: answer one question about the current inbox run. */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = Body.parse(await readJson(request));
    const last = body.messages.at(-1)!;
    if (last.role !== "user") return Response.json({ error: "The last message must be a question." }, { status: 400 });

    const source = await resolveSource(parseSourceParam(body.source));
    if (source === null) return Response.json({ error: "Connect a source first." }, { status: 401 });
    const run = await getStore().latestRun(sourceKey(source.descriptor));
    if (run === null) return Response.json({ error: "Process the inbox first." }, { status: 404 });

    if (aiConfig().enabled) {
      try {
        const answer = await chatWithClaude(body.messages, runFacts(run));
        return Response.json({ answer, mode: "claude", model: CHAT_MODEL });
      } catch (error) {
        console.error("[tveris] chat", error);
      }
    }
    return Response.json({ answer: answerOffline(last.content, run), mode: "rules" });
  } catch (error) {
    return errorResponse(error);
  }
}
