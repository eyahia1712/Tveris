import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { gmail, type gmail_v1 } from "@googleapis/gmail";
import { OAuth2Client } from "google-auth-library";

import type { EmailRecord, SourceDescriptor } from "@/lib/domain/types";
import type { InboxSource } from "@/lib/sources";

/**
 * Gmail as an inbox source. Read-only scope; the refresh token lives in an
 * encrypted, httpOnly cookie on the user's browser (never in a database), so
 * disconnecting is deleting a cookie and one user can never read another's
 * mailbox through the dashboard.
 */

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  // Sending is only ever done from a reply the reviewer confirmed by hand.
  "https://www.googleapis.com/auth/gmail.send",
  "openid",
  "email",
];
export const SESSION_COOKIE = "tveris_gmail";

export function gmailConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.TVERIS_SECRET);
}

export function oauthClient(redirectUri: string): OAuth2Client {
  return new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  });
}

export interface GmailSession {
  email: string;
  refreshToken: string;
}

function key(): Buffer {
  const secret = process.env.TVERIS_SECRET;
  if (!secret) throw new Error("TVERIS_SECRET is not set");
  return createHash("sha256").update(secret).digest();
}

export function sealSession(session: GmailSession): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function openSession(sealed: string | undefined): GmailSession | null {
  if (!sealed || !gmailConfigured()) return null;
  try {
    const raw = Buffer.from(sealed, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(text) as Partial<GmailSession>;
    if (typeof parsed.email !== "string" || typeof parsed.refreshToken !== "string") return null;
    return { email: parsed.email, refreshToken: parsed.refreshToken };
  } catch {
    return null; // tampered or rotated secret: treat as signed out
  }
}

function header(message: gmail_v1.Schema$Message, name: string): string {
  return (
    message.payload?.headers?.find((entry) => entry.name?.toLowerCase() === name.toLowerCase())
      ?.value ?? ""
  );
}

function decode(data: string | null | undefined): string {
  return data ? Buffer.from(data, "base64url").toString("utf8") : "";
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface Walked {
  plain: string[];
  html: string[];
  attachments: Array<{ id: string; fileName: string }>;
}

function walk(part: gmail_v1.Schema$MessagePart | undefined, into: Walked): void {
  if (!part) return;
  if (part.filename && part.body?.attachmentId) {
    into.attachments.push({ id: part.body.attachmentId, fileName: part.filename });
  } else if (part.mimeType === "text/plain" && part.body?.data) {
    into.plain.push(decode(part.body.data));
  } else if (part.mimeType === "text/html" && part.body?.data) {
    into.html.push(decode(part.body.data));
  }
  for (const child of part.parts ?? []) walk(child, into);
}

/**
 * Send one reply from the connected mailbox. The caller has already shown the
 * reviewer exactly who it goes to and had them confirm it; nothing in the
 * pipeline ever calls this on its own.
 */
export async function sendReply(
  session: GmailSession,
  redirectUri: string,
  message: { to: string; subject: string; body: string },
): Promise<string> {
  const auth = oauthClient(redirectUri);
  auth.setCredentials({ refresh_token: session.refreshToken });
  const api = gmail({ version: "v1", auth });
  const headers = [
    `From: ${session.email}`,
    `To: ${message.to}`,
    `Subject: ${encodeHeader(message.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ].join("\r\n");
  const raw = Buffer.from(`${headers}\r\n\r\n${message.body}`, "utf8").toString("base64url");
  const sent = await api.users.messages.send({ userId: "me", requestBody: { raw } });
  return sent.data.id ?? "";
}

/** RFC 2047 for anything a subject line may carry beyond ASCII. */
function encodeHeader(value: string): string {
  return /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** Only shipping-document formats are worth downloading. */
const DOCUMENT_FILE = /\.(txt|pdf|docx|xlsx)$/i;

export class GmailSource implements InboxSource {
  readonly descriptor: SourceDescriptor;
  private readonly api: gmail_v1.Gmail;

  constructor(private readonly session: GmailSession, redirectUri: string) {
    const auth = oauthClient(redirectUri);
    auth.setCredentials({ refresh_token: session.refreshToken });
    this.api = gmail({ version: "v1", auth });
    this.descriptor = { kind: "gmail", label: `Gmail: ${session.email}`, location: session.email };
  }

  async listEmails(): Promise<EmailRecord[]> {
    const query = process.env.GMAIL_QUERY ?? "newer_than:14d -in:chats -in:sent";
    const limit = Math.min(Number(process.env.GMAIL_MAX_MESSAGES ?? 150), 500);
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.api.users.messages.list({
        userId: "me",
        q: query,
        maxResults: Math.min(100, limit - ids.length),
        pageToken,
      });
      for (const message of page.data.messages ?? []) if (message.id) ids.push(message.id);
      pageToken = page.data.nextPageToken ?? undefined;
    } while (pageToken && ids.length < limit);

    const records: EmailRecord[] = [];
    // Small batches keep within Gmail's per-user rate limits.
    for (let index = 0; index < ids.length; index += 10) {
      const batch = ids.slice(index, index + 10);
      const messages = await Promise.all(
        batch.map((id) => this.api.users.messages.get({ userId: "me", id, format: "full" })),
      );
      for (const { data } of messages) {
        if (!data.id) continue;
        const walked: Walked = { plain: [], html: [], attachments: [] };
        walk(data.payload, walked);
        const body = walked.plain.join("\n").trim() || htmlToText(walked.html.join("\n")) || data.snippet || "";
        const internal = Number(data.internalDate);
        records.push({
          email_id: `gmail_${data.id}`,
          from: header(data, "From"),
          subject: header(data, "Subject") || "(no subject)",
          body,
          attachments: walked.attachments
            .filter((attachment) => DOCUMENT_FILE.test(attachment.fileName))
            .map((attachment) =>
              `gmail/${data.id}/${attachment.id}/${encodeURIComponent(attachment.fileName)}`,
            ),
          ...(Number.isFinite(internal) ? { receivedAt: new Date(internal).toISOString() } : {}),
        });
      }
    }
    return records;
  }

  async readAttachment(attachmentPath: string): Promise<Uint8Array> {
    const [prefix, messageId, attachmentId] = attachmentPath.split("/");
    if (prefix !== "gmail" || !messageId || !attachmentId) {
      throw new Error(`Not a Gmail attachment path: ${attachmentPath}`);
    }
    const { data } = await this.api.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });
    if (!data.data) throw new Error("Gmail returned an empty attachment");
    return new Uint8Array(Buffer.from(data.data, "base64url"));
  }
}
