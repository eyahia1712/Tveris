import "server-only";

import { NotFoundError } from "@/lib/server/jobs";
import { errorMessage } from "@/lib/pipeline/read";

/** JSON error responses with the right status; internals never leak. */
export function errorResponse(error: unknown): Response {
  if (error instanceof NotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof BadRequestError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  console.error("[tveris]", error);
  return Response.json({ error: `Something went wrong: ${errorMessage(error)}` }, { status: 500 });
}

export class BadRequestError extends Error {}

export async function readJson(request: Request, limitBytes = 64_000): Promise<unknown> {
  const text = await request.text();
  if (text.length > limitBytes) throw new BadRequestError("Request body too large.");
  try {
    return text === "" ? {} : JSON.parse(text);
  } catch {
    throw new BadRequestError("Request body is not valid JSON.");
  }
}
