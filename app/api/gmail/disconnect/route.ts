import { cookies } from "next/headers";

import { SESSION_COOKIE } from "@/lib/gmail";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
