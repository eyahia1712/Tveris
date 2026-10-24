import "server-only";

import { cookies, headers } from "next/headers";

import { GmailSource, SESSION_COOKIE, openSession, type GmailSession } from "@/lib/gmail";
import type { SourceParam } from "@/lib/domain/source";
import { BundleSource, HttpSource, defaultBundleRoot, type InboxSource } from "@/lib/sources";

/**
 * Which inbox a request is about. "sample" is the organisers' dataset (the
 * bundled files, or their Docker server when TVERIS_SOURCE_URL is set).
 * "gmail" is ONLY ever the signed-in user's own mailbox, resolved from their
 * encrypted session cookie, never from a parameter.
 */
export { parseSourceParam, type SourceParam } from "@/lib/domain/source";

export function sampleSource(): InboxSource {
  const url = process.env.TVERIS_SOURCE_URL;
  return url ? new HttpSource(url) : new BundleSource(defaultBundleRoot());
}

export async function appOrigin(): Promise<string> {
  if (process.env.TVERIS_PUBLIC_URL) return process.env.TVERIS_PUBLIC_URL.replace(/\/+$/, "");
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost:3000";
  const proto = list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function gmailRedirectUri(): Promise<string> {
  return `${await appOrigin()}/api/gmail/callback`;
}

export async function currentGmailSession(): Promise<GmailSession | null> {
  const jar = await cookies();
  return openSession(jar.get(SESSION_COOKIE)?.value);
}

export async function resolveSource(param: SourceParam): Promise<InboxSource | null> {
  if (param === "sample") return sampleSource();
  const session = await currentGmailSession();
  if (session === null) return null;
  return new GmailSource(session, await gmailRedirectUri());
}
