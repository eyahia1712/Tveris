import { BadRequestError, errorResponse, readJson } from "@/lib/server/http";
import { retryEmail } from "@/lib/server/jobs";
import { parseSourceParam, resolveSource } from "@/lib/server/context";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    if (!/^[A-Za-z0-9_\-]{1,120}$/.test(id)) throw new BadRequestError("Invalid email id.");
    const body = (await readJson(request)) as { source?: unknown };
    const source = await resolveSource(parseSourceParam(body.source));
    if (source === null) return Response.json({ error: "Connect Gmail first." }, { status: 401 });
    return Response.json({ result: await retryEmail(source, id) });
  } catch (error) {
    return errorResponse(error);
  }
}
