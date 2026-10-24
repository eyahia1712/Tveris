import { BadRequestError, errorResponse } from "@/lib/server/http";
import { parseSourceParam, resolveSource } from "@/lib/server/context";
import { getStore, sourceKey } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * One processed email, for the dashboard's preview panel. Document texts are
 * dropped: the full page loads those when a reviewer actually opens the email.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    if (!/^[A-Za-z0-9_\-]{1,120}$/.test(id)) throw new BadRequestError("Invalid email id.");
    const source = await resolveSource(parseSourceParam(new URL(request.url).searchParams.get("source")));
    if (source === null) return Response.json({ error: "Connect Gmail first." }, { status: 401 });
    const run = await getStore().latestRun(sourceKey(source.descriptor));
    const result = run?.results.find((item) => item.email.email_id === id);
    if (result === undefined) return Response.json({ error: "No such email in this inbox." }, { status: 404 });
    return Response.json({
      result: {
        ...result,
        check:
          result.check === null
            ? null
            : { ...result.check, documents: result.check.documents.map((doc) => ({ ...doc, text: "" })) },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
