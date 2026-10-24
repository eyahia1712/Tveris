import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { EmailRecord, SourceDescriptor, SubmissionRow } from "@/lib/domain/types";

/**
 * Where emails come from. The pipeline only sees this interface, so the
 * organisers' static bundle, their Docker server and a live Gmail mailbox are
 * interchangeable: the same classify/extract/compare path runs on all three.
 */
export interface InboxSource {
  readonly descriptor: SourceDescriptor;
  listEmails(): Promise<EmailRecord[]>;
  readAttachment(attachmentPath: string): Promise<Uint8Array>;
}

/** The organisers' ZIP bundle on disk: inbox/*.json + attachments/. */
export class BundleSource implements InboxSource {
  readonly descriptor: SourceDescriptor;

  constructor(private readonly root: string, label = "Sample inbox") {
    this.descriptor = { kind: "bundle", label, location: root };
  }

  async listEmails(): Promise<EmailRecord[]> {
    const inboxDir = path.join(this.root, "inbox");
    const names = (await readdir(inboxDir))
      .filter((name) => /^email_.*\.json$/.test(name))
      .sort();
    return Promise.all(
      names.map(async (name) =>
        parseEmailRecord(JSON.parse(await readFile(path.join(inboxDir, name), "utf8"))),
      ),
    );
  }

  async readAttachment(attachmentPath: string): Promise<Uint8Array> {
    const resolved = path.resolve(this.root, attachmentPath);
    // Attachment paths come from data: never let one escape the bundle.
    if (!resolved.startsWith(path.resolve(this.root) + path.sep)) {
      throw new Error(`Attachment path escapes the inbox folder: ${attachmentPath}`);
    }
    return new Uint8Array(await readFile(resolved));
  }
}

/** The organisers' Docker server (docker compose up -> http://localhost:8080). */
export class HttpSource implements InboxSource {
  readonly descriptor: SourceDescriptor;
  private readonly base: string;

  constructor(base: string) {
    this.base = base.replace(/\/+$/, "");
    this.descriptor = { kind: "http", label: "Evaluation server", location: this.base };
  }

  async listEmails(): Promise<EmailRecord[]> {
    const response = await fetch(`${this.base}/emails`);
    if (!response.ok) throw new Error(`GET /emails failed: ${response.status}`);
    const records = (await response.json()) as unknown[];
    return records.map(parseEmailRecord);
  }

  async readAttachment(attachmentPath: string): Promise<Uint8Array> {
    const response = await fetch(`${this.base}/${attachmentPath.replace(/^\/+/, "")}`);
    if (!response.ok) throw new Error(`GET ${attachmentPath} failed: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  /** POST /submit: the organisers' self-evaluation scoreboard. */
  async submit(submission: Record<string, SubmissionRow>): Promise<unknown> {
    const response = await fetch(`${this.base}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submission),
    });
    if (!response.ok) throw new Error(`POST /submit failed: ${response.status}`);
    return response.json();
  }
}

/** Validate one record at the boundary: bad data fails loudly, early. */
export function parseEmailRecord(value: unknown): EmailRecord {
  if (typeof value !== "object" || value === null) throw new Error("Email record is not an object");
  const record = value as Record<string, unknown>;
  const text = (key: string): string => {
    const field = record[key];
    if (typeof field !== "string") throw new Error(`Email record field "${key}" is missing`);
    return field;
  };
  const attachments = record.attachments;
  if (!Array.isArray(attachments) || attachments.some((item) => typeof item !== "string")) {
    throw new Error(`Email record ${String(record.email_id)} has invalid attachments`);
  }
  return {
    email_id: text("email_id"),
    from: text("from"),
    subject: text("subject"),
    body: text("body"),
    attachments: attachments as string[],
    ...(typeof record.receivedAt === "string" ? { receivedAt: record.receivedAt } : {}),
  };
}

export function defaultBundleRoot(): string {
  return process.env.TVERIS_DATA_DIR
    ? path.resolve(process.env.TVERIS_DATA_DIR)
    : path.join(process.cwd(), "data", "sample");
}
