import {
  FIELD_KEYS,
  type Category,
  type Classification,
  type DocumentCheck,
  type DocumentReading,
  type EmailRecord,
  type EmailResult,
  type FieldMap,
  type PipelineEvent,
  type Run,
  type StageName,
  type Status,
} from "@/lib/domain/types";
import {
  aiConfig,
  classifyWithAi,
  isRetryable,
  readDocumentWithAi,
  type AiConfig,
  type AiDocument,
} from "@/lib/ai/claude";
import { classifyByRules, type RulesVerdict } from "@/lib/pipeline/classify-rules";
import { decideCheck } from "@/lib/pipeline/compare";
import { claimedRoleFromName, detectKind } from "@/lib/pipeline/doctype";
import { countFound, extractFields, makeValue } from "@/lib/pipeline/fields";
import { errorMessage, readAttachment } from "@/lib/pipeline/read";
import { triageEmail } from "@/lib/pipeline/triage";
import { summarize } from "@/lib/domain/summary";
import type { InboxSource } from "@/lib/sources";

/**
 * The end-to-end flow for one email:
 *   receive -> classify (rules + Claude, cross-checked) -> read attachments
 *   (text, Word, Excel, PDF, vision for scans) -> extract the 7 fields ->
 *   compare (deterministic) -> triage (priority + next action).
 * Every stage logs an event. A failure in any stage is caught, recorded on the
 * email and shown in the dashboard with a retry, never silently dropped.
 */

export interface ProcessOptions {
  ai: AiConfig;
  /** ms clock origin of the run, for replay offsets. */
  startedAt: number;
  /** Force a category (a reviewer's override). */
  forcedCategory?: Category;
}

const TEXT_CAP = 8000;

class EventLog {
  readonly events: PipelineEvent[] = [];
  constructor(private readonly origin: number) {}
  add(stage: StageName, outcome: PipelineEvent["outcome"], detail: string): void {
    this.events.push({ stage, outcome, detail, atMs: Math.max(0, Date.now() - this.origin) });
  }
}

async function withRetry<T>(
  work: () => Promise<T>,
  log: EventLog,
  stage: StageName,
  attempts = 2,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      if (attempt < attempts && isRetryable(error)) {
        log.add(stage, "retried", `Attempt ${attempt} failed (${errorMessage(error)}); retrying.`);
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
        continue;
      }
      break;
    }
  }
  throw lastError;
}

// -- classification ----------------------------------------------------------------

function combine(rules: RulesVerdict, ai: { category: Category; confidence: number; rationale: string; intent: string } | null): Classification {
  if (ai === null) {
    return {
      category: rules.category,
      confidence: rules.confidence,
      method: "rules",
      rationale: `Rule engine: ${rules.signals.join("; ")}.`,
      intent: rules.intent,
      rulesCategory: rules.category,
      aiCategory: null,
      disagreement: false,
    };
  }
  if (ai.category === rules.category) {
    return {
      category: ai.category,
      confidence: Math.max(ai.confidence, rules.confidence),
      method: "ai",
      rationale: ai.rationale,
      intent: ai.intent || rules.intent,
      rulesCategory: rules.category,
      aiCategory: ai.category,
      disagreement: false,
    };
  }
  // They disagree. A near-certain rule (an explicit "compare the SI and draft
  // BL", a phishing phrase) beats a hesitant model; otherwise Claude decides.
  // Either way the email is flagged for a person to confirm.
  const rulesWin = rules.confidence >= 0.95 && ai.confidence < 0.85;
  return {
    category: rulesWin ? rules.category : ai.category,
    confidence: Math.min(rulesWin ? rules.confidence : ai.confidence, 0.6),
    method: rulesWin ? "rules" : "ai",
    rationale: rulesWin
      ? `Rule engine (${rules.signals.join("; ")}) overrides a low-confidence AI answer (${ai.category}).`
      : `${ai.rationale} (Rule engine suggested ${rules.category}.)`,
    intent: ai.intent || rules.intent,
    rulesCategory: rules.category,
    aiCategory: ai.category,
    disagreement: true,
  };
}

// -- documents -------------------------------------------------------------------------

function fieldsFromAi(doc: AiDocument, source: "vision" | "ai"): FieldMap {
  const fields: FieldMap = {};
  for (const key of FIELD_KEYS) {
    const found = doc.fields[key];
    if (found.value === null) continue;
    fields[key] = makeValue(key, found.value, "read by AI", found.evidence, source);
  }
  return fields;
}

async function readDocument(
  attachmentPath: string,
  source: InboxSource,
  options: ProcessOptions,
  log: EventLog,
): Promise<DocumentReading> {
  const lastSegment = attachmentPath.split("/").pop() ?? attachmentPath;
  let fileName = lastSegment;
  try {
    fileName = decodeURIComponent(lastSegment);
  } catch {
    // not URI-encoded; keep as is
  }
  const base: DocumentReading = {
    path: attachmentPath,
    fileName,
    format: "unknown",
    claimedRole: claimedRoleFromName(fileName),
    kind: "UNKNOWN",
    kindEvidence: null,
    readable: false,
    readMethod: null,
    error: null,
    text: "",
    fields: {},
  };

  let bytes: Uint8Array;
  try {
    bytes = await source.readAttachment(attachmentPath);
  } catch (error) {
    log.add("read", "failed", `${fileName}: could not be fetched (${errorMessage(error)}).`);
    return { ...base, error: `Could not fetch the file: ${errorMessage(error)}` };
  }

  const raw = await readAttachment(bytes, fileName);
  const reading: DocumentReading = { ...base, format: raw.format };
  if (raw.error !== null) {
    log.add("read", "failed", `${fileName}: ${raw.error}.`);
    return { ...reading, error: raw.error };
  }

  if (raw.imageOnly) {
    if (!options.ai.enabled) {
      log.add("read", "failed", `${fileName}: scanned image with no text layer; vision is off.`);
      return {
        ...reading,
        error: "Scanned image with no text layer. Enable the AI (vision) to read it, or enter the values by hand.",
      };
    }
    try {
      const doc = await withRetry(() => readDocumentWithAi({ pdf: bytes }, options.ai.model), log, "read");
      if (!doc.legible) {
        log.add("read", "failed", `${fileName}: vision could not read the scan reliably.`);
        return { ...reading, readMethod: "vision", error: "The scan is not legible enough to read reliably." };
      }
      const fields = fieldsFromAi(doc, "vision");
      log.add("read", "ok", `${fileName}: scanned page read by Claude vision (${countFound(fields)}/7 fields).`);
      return {
        ...reading,
        kind: doc.doc_kind,
        kindEvidence: doc.title,
        readable: true,
        readMethod: "vision",
        text: FIELD_KEYS.map((key) => doc.fields[key].evidence).filter(Boolean).join("\n"),
        fields,
      };
    } catch (error) {
      log.add("read", "failed", `${fileName}: vision failed (${errorMessage(error)}).`);
      return { ...reading, readMethod: "vision", error: `Vision reading failed: ${errorMessage(error)}` };
    }
  }

  const kind = detectKind(raw.lines, raw.sheetNames);
  let fields = extractFields(raw.lines);
  const text = raw.lines.join("\n").slice(0, TEXT_CAP);
  log.add(
    "read",
    "ok",
    `${fileName}: ${raw.format.toUpperCase()} read as ${kind.kind === "UNKNOWN" ? "untitled document" : kind.kind}; ${countFound(fields)}/7 fields found.`,
  );

  // A layout the parser could not map: ask Claude for the labels it missed.
  // Values the parser DID find (even blank ones) are never overwritten.
  const isShippingDoc = kind.kind === "SI" || kind.kind === "BL" || (kind.kind === "UNKNOWN" && base.claimedRole !== null);
  if (isShippingDoc && countFound(fields) < FIELD_KEYS.length && options.ai.enabled) {
    try {
      const doc = await withRetry(() => readDocumentWithAi({ text }, options.ai.model), log, "extract");
      const fromAi = fieldsFromAi(doc, "ai");
      const filled = FIELD_KEYS.filter((key) => fields[key] === undefined && fromAi[key] !== undefined);
      fields = { ...fields, ...Object.fromEntries(filled.map((key) => [key, fromAi[key]])) };
      if (filled.length > 0) {
        log.add("extract", "ok", `${fileName}: Claude mapped ${filled.join(", ")} from an unusual layout.`);
      }
    } catch (error) {
      log.add("extract", "warn", `${fileName}: AI extraction unavailable (${errorMessage(error)}).`);
    }
  }

  return {
    ...reading,
    kind: kind.kind,
    kindEvidence: kind.evidence,
    readable: true,
    readMethod: raw.method,
    text,
    fields,
  };
}

// -- one email ------------------------------------------------------------------------------

export async function processEmail(
  email: EmailRecord,
  source: InboxSource,
  options: ProcessOptions,
): Promise<EmailResult> {
  const log = new EventLog(options.startedAt);
  log.add("receive", "ok", `${email.attachments.length} attachment(s) from ${email.from}.`);
  let failure: string | null = null;

  const rules = classifyByRules(email);
  let classification: Classification;
  if (options.forcedCategory !== undefined) {
    classification = {
      ...combine(rules, null),
      category: options.forcedCategory,
      confidence: 1,
      method: "human",
      rationale: "Category set by a reviewer.",
    };
  } else if (options.ai.enabled) {
    try {
      const ai = await withRetry(() => classifyWithAi(email, options.ai.model), log, "classify");
      classification = combine(rules, ai);
    } catch (error) {
      classification = combine(rules, null);
      log.add("classify", "warn", `AI classification failed (${errorMessage(error)}); rule engine used.`);
    }
  } else {
    classification = combine(rules, null);
  }
  log.add(
    "classify",
    classification.disagreement ? "warn" : "ok",
    `${classification.category} (${Math.round(classification.confidence * 100)}%, ${classification.method})${classification.disagreement ? `: rules said ${classification.rulesCategory}, AI said ${classification.aiCategory}` : ""}.`,
  );

  let check: DocumentCheck | null = null;
  if (classification.category === "BL_COMPARISON") {
    try {
      const documents: DocumentReading[] = [];
      for (const attachment of email.attachments) {
        documents.push(await readDocument(attachment, source, options, log));
      }
      check = decideCheck(documents, email.attachments.length);
      log.add(
        "compare",
        check.status === "OK" ? "ok" : "warn",
        check.status === "NEEDS_REVIEW" ? `Needs review (${check.reviewReason}).` : check.summary,
      );
    } catch (error) {
      failure = `Document check crashed: ${errorMessage(error)}`;
      log.add("compare", "failed", failure);
    }
  }

  const triage = triageEmail(email, classification.category, check, classification.intent);
  log.add("triage", "ok", `${triage.priority}: ${triage.action}`);

  const status: Status = failure !== null ? "NEEDS_REVIEW" : check?.status ?? "OK";
  return {
    email,
    classification,
    check,
    status,
    reviewReason: failure !== null ? "unreadable" : check?.reviewReason ?? null,
    hasDefect: (check?.defectFields.length ?? 0) > 0,
    defectFields: check?.defectFields ?? [],
    triage,
    review: null,
    events: log.events,
    doneAtMs: Math.max(0, Date.now() - options.startedAt),
    failure,
    attempts: 1,
  };
}

// -- the whole inbox --------------------------------------------------------------------------

export interface RunProgress {
  done: number;
  total: number;
  latest: EmailResult | null;
}

export async function processInbox(
  source: InboxSource,
  options: {
    ai?: AiConfig;
    concurrency?: number;
    onProgress?: (progress: RunProgress) => void;
    emails?: EmailRecord[];
  } = {},
): Promise<Run> {
  const ai = options.ai ?? aiConfig();
  const startedAt = Date.now();
  const emails = options.emails ?? (await source.listEmails());
  const concurrency = options.concurrency ?? (ai.enabled ? 8 : 16);
  const results: EmailResult[] = new Array(emails.length);
  let next = 0;
  let done = 0;

  const worker = async (): Promise<void> => {
    while (next < emails.length) {
      const index = next;
      next += 1;
      const email = emails[index] as EmailRecord;
      let result: EmailResult;
      try {
        result = await processEmail(email, source, { ai, startedAt });
      } catch (error) {
        result = failedResult(email, startedAt, errorMessage(error));
      }
      results[index] = result;
      done += 1;
      options.onProgress?.({ done, total: emails.length, latest: result });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, emails.length) }, worker));

  const finishedAt = Date.now();
  return {
    id: `run_${startedAt.toString(36)}`,
    source: source.descriptor,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: finishedAt - startedAt,
    ai: { enabled: ai.enabled, model: ai.enabled ? ai.model : null },
    results,
    summary: summarize(results),
  };
}

/** An email the pipeline could not process at all: visible, retryable. */
export function failedResult(email: EmailRecord, startedAt: number, message: string): EmailResult {
  const rules = classifyByRules(email);
  const classification = combine(rules, null);
  return {
    email,
    classification,
    check: null,
    status: rules.category === "BL_COMPARISON" ? "NEEDS_REVIEW" : "OK",
    reviewReason: rules.category === "BL_COMPARISON" ? "unreadable" : null,
    hasDefect: false,
    defectFields: [],
    triage: { priority: "high", action: `Processing failed: ${message}. Retry this email.`, references: [] },
    review: null,
    events: [{ stage: "receive", outcome: "failed", detail: message, atMs: Math.max(0, Date.now() - startedAt) }],
    doneAtMs: Math.max(0, Date.now() - startedAt),
    failure: message,
    attempts: 1,
  };
}

export { summarize };
