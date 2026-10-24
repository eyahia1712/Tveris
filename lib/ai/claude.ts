import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { CATEGORIES, FIELD_KEYS, type Category, type EmailRecord } from "@/lib/domain/types";

/**
 * Claude, used where judgement or eyes are needed:
 *   1. classifying every email (the rule engine cross-checks it),
 *   2. reading scanned, image-only PDFs (vision),
 *   3. extracting fields when a layout defeats the parser.
 * The comparison itself stays deterministic code: an LLM never decides that
 * two values match.
 *
 * Requests use structured outputs (schema-validated JSON) and the server-side
 * refusal fallback, so a declined request is retried on another model rather
 * than failing the email.
 */

export const DEFAULT_MODEL = "claude-opus-5";

export interface AiConfig {
  enabled: boolean;
  model: string;
}

export function aiConfig(): AiConfig {
  const hasCredentials =
    Boolean(process.env.ANTHROPIC_API_KEY) || Boolean(process.env.ANTHROPIC_AUTH_TOKEN);
  return {
    enabled: hasCredentials && process.env.TVERIS_AI !== "off",
    model: process.env.TVERIS_MODEL || DEFAULT_MODEL,
  };
}

let cachedClient: Anthropic | null = null;
function client(): Anthropic {
  cachedClient ??= new Anthropic({ maxRetries: 3, timeout: 120_000 });
  return cachedClient;
}

export class AiRefusalError extends Error {}

const FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};

// -- classification -----------------------------------------------------------

const ClassificationSchema = z.object({
  category: z.enum(CATEGORIES),
  confidence: z.number(),
  rationale: z.string(),
  intent: z.string(),
});
export type AiClassification = z.infer<typeof ClassificationSchema>;

const CLASSIFY_SYSTEM = `You triage the shared inbox of a shipping documentation team (a paper exporter's logistics desk). Classify ONE email into exactly one category:

- BL_COMPARISON: the sender asks the team to CHECK a draft Bill of Lading against the Shipping Instruction (SI), or sends SI + draft BL "for checking/confirmation". This applies even when an attachment is missing, unreadable or turns out to be the wrong document: the request itself is still a document check.
- SI_REQUEST: a new shipping instruction to be prepared or submitted, typically SI details (shipper, consignee, POL, POD, goods) given for a booking or OC number.
- INVOICE_QUERY: billing questions and actions: invoice queries, local charges/THC, D&D/detention/demurrage, missing GR for billing, invoice cancellation, freight charge breakdowns.
- GENERAL: operational updates and everything else legitimate: berthing reports, loading summaries, outstanding-BL lists, automated robot notifications, holiday notices, broadcast reminders, and follow-ups that only ask someone to SEND a draft BL (nothing to compare yet).
- SPAM: unsolicited marketing, phishing, prizes, crypto, fake delivery fees, account-verification scams.

Rules:
- Decide from the BODY and the attachments. Subjects are old thread titles and are often misleading.
- Ignore quoted history below separators; judge the newest message.
- confidence is your probability (0 to 1) that the category is right.
- intent: one short plain sentence saying what the sender wants, including the key reference number if present.
- rationale: one sentence on the deciding evidence.`;

export async function classifyWithAi(email: EmailRecord, model: string): Promise<AiClassification> {
  const attachments = email.attachments.length === 0
    ? "(none)"
    : email.attachments.map((path) => path.split("/").pop()).join(", ");
  const response = await client().beta.messages.parse({
    model,
    max_tokens: 4000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(ClassificationSchema) },
    system: CLASSIFY_SYSTEM,
    messages: [
      {
        role: "user",
        content: `From: ${email.from}\nSubject: ${email.subject}\nAttachments: ${attachments}\n\n${email.body.slice(0, 6000)}`,
      },
    ],
  });
  if (response.stop_reason === "refusal") {
    throw new AiRefusalError("The model declined to classify this email.");
  }
  const parsed = response.parsed_output;
  if (parsed === null) throw new Error("The model returned no valid classification.");
  return { ...parsed, confidence: Math.min(1, Math.max(0, parsed.confidence)) };
}

// -- document reading ------------------------------------------------------------

const FieldSchema = z.object({
  value: z.string().nullable(),
  evidence: z.string().nullable(),
});

const DocumentSchema = z.object({
  legible: z.boolean(),
  doc_kind: z.enum([
    "SI",
    "BL",
    "COMMERCIAL_INVOICE",
    "PACKING_LIST",
    "CERTIFICATE_OF_ORIGIN",
    "UNKNOWN",
  ]),
  title: z.string().nullable(),
  fields: z.object(
    Object.fromEntries(FIELD_KEYS.map((key) => [key, FieldSchema])) as Record<
      (typeof FIELD_KEYS)[number],
      typeof FieldSchema
    >,
  ),
});
export type AiDocument = z.infer<typeof DocumentSchema>;

const READ_INSTRUCTIONS = `Read this shipping document exactly as printed.

Return:
- legible: false if the page cannot be read reliably.
- doc_kind: SI (shipping instruction, "BL instruction" or "bill of lading instruction"), BL (bill of lading / draft BL), COMMERCIAL_INVOICE, PACKING_LIST, CERTIFICATE_OF_ORIGIN or UNKNOWN.
- title: the document's title line.
- fields: for each of shipper, consignee, notify_party, port_of_loading, port_of_discharge, container_count, gross_weight_kg give
  value: the value exactly as printed (party = company-name line only; ports as printed; container count as printed, e.g. "6 x 40'HC"; gross weight with its unit), or null if the field is absent;
  evidence: the full printed line the value came from, or null.
Labels vary ("Load Port" = port of loading, "POD" = port of discharge, "To the Order of" = consignee). Copy blanks and placeholders (N/A, TBA, ____) literally. Never infer or correct a value; never take a value from another field.`;

export async function readDocumentWithAi(
  input: { pdf: Uint8Array } | { text: string },
  model: string,
): Promise<AiDocument> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = "pdf" in input
    ? [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: Buffer.from(input.pdf).toString("base64"),
          },
        },
        { type: "text", text: READ_INSTRUCTIONS },
      ]
    : [{ type: "text", text: `${READ_INSTRUCTIONS}\n\n<document>\n${input.text.slice(0, 20000)}\n</document>` }];

  const response = await client().beta.messages.parse({
    model,
    max_tokens: 8000,
    ...FALLBACK,
    output_config: { effort: "medium", format: betaZodOutputFormat(DocumentSchema) },
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason === "refusal") {
    throw new AiRefusalError("The model declined to read this document.");
  }
  const parsed = response.parsed_output;
  if (parsed === null) throw new Error("The model returned no valid document reading.");
  return parsed;
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof Anthropic.RateLimitError) return true;
  if (error instanceof Anthropic.InternalServerError) return true;
  if (error instanceof Anthropic.APIConnectionError) return true;
  if (error instanceof Anthropic.APIError) return (error.status ?? 0) >= 500;
  return false;
}

export type { Category };
