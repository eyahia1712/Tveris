import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";

import { GMAIL_SCOPES, gmailConfigured, oauthClient } from "@/lib/gmail";
import { gmailRedirectUri } from "@/lib/server/context";

export const dynamic = "force-dynamic";

/** Start Google sign-in (read-only Gmail scope), with a CSRF state cookie. */
export async function GET(): Promise<Response> {
  if (!gmailConfigured()) {
    return Response.redirect(new URL("/connect?error=not_configured", await gmailRedirectUri()), 302);
  }
  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set("tveris_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 600, path: "/" });
  const url = oauthClient(await gmailRedirectUri()).generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES,
    state,
  });
  return Response.redirect(url, 302);
}
