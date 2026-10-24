import { cookies } from "next/headers";

import { SESSION_COOKIE, oauthClient, sealSession } from "@/lib/gmail";
import { appOrigin, gmailRedirectUri } from "@/lib/server/context";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const origin = await appOrigin();
  const url = new URL(request.url);
  const jar = await cookies();
  const expected = jar.get("tveris_oauth_state")?.value;
  jar.delete("tveris_oauth_state");
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) {
    return Response.redirect(`${origin}/connect?error=denied`, 302);
  }
  try {
    const client = oauthClient(await gmailRedirectUri());
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token || !tokens.id_token) throw new Error("Google returned no refresh token");
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    const email = ticket.getPayload()?.email;
    if (!email) throw new Error("Google returned no email address");
    jar.set(SESSION_COOKIE, sealSession({ email, refreshToken: tokens.refresh_token }), {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return Response.redirect(`${origin}/?source=gmail&connected=1`, 302);
  } catch (error) {
    console.error("[tveris] gmail callback", error);
    return Response.redirect(`${origin}/connect?error=exchange_failed`, 302);
  }
}
