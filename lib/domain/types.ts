/**
 * The Tveris domain model. Everything the pipeline produces, the store keeps
 * and the dashboard renders is one of these shapes. The submission format the
 * organisers score (sample_submission.json) is derived from `EmailResult`.
 */

export const CATEGORIES = [
  "BL_COMPARISON",
  "SI_REQUEST",
  "INVOICE_QUERY",
  "GENERAL",
  "SPAM",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const FIELD_KEYS = [
  "shipper",
  "consignee",
  "notify_party",
  "port_of_loading",
  "port_of_discharge",
  "container_count",
  "gross_weight_kg",
] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

export type Status = "OK" | "MISMATCH" | "NEEDS_REVIEW";

export const REVIEW_REASONS = [
  "wrong_doc_type",
  "missing_attachment",
  "unreadable",
  "missing_value",
] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];

/** One inbox record, exactly as the dataset (or a Gmail sync) delivers it. */
export interface EmailRecord {
  email_id: string;
  from: string;
  subject: string;
  body: string;
  attachments: string[];
  /** ISO time the message arrived, when the source knows it (Gmail does). */
  receivedAt?: string;
}

export type DocFormat = "txt" | "pdf" | "docx" | "xlsx" | "unknown";

export type DocKind =
  | "SI"
  | "BL"
  | "COMMERCIAL_INVOICE"
  | "PACKING_LIST"
  | "CERTIFICATE_OF_ORIGIN"
  | "UNKNOWN";

export type ReadMethod = "text" | "pdf-text" | "docx" | "xlsx" | "vision";

export type ValueSource = "parser" | "vision" | "ai" | "human";

/** A value read from a document, with the line it came from. */
export interface ExtractedValue {
  /** The value as printed (first line of a party block). Null when absent. */
  raw: string | null;
  /** Canonical form used for comparison. Null when missing. */
  normalized: string | number | null;
  /** The source line or cell, so a reviewer can see where it came from. */
  evidence: string | null;
  /** The label the document used for this field ("Load Port", "POL", ...). */
  label: string | null;
  source: ValueSource;
  /** True when the label is there but the value is blank / N/A / TBA / ____. */
  missing: boolean;
}

export type FieldMap = Partial<Record<FieldKey, ExtractedValue>>;

export interface DocumentReading {
  path: string;
  fileName: string;
  format: DocFormat;
  /** The role the filename claims (email_004_SI.txt claims SI). */
  claimedRole: "SI" | "BL" | null;
  /** What the content actually is. */
  kind: DocKind;
  /** The printed title line that decided `kind`. */
  kindEvidence: string | null;
  readable: boolean;
  readMethod: ReadMethod | null;
  /** Why the document could not be read, when it could not. */
  error: string | null;
  /** Plain text (lines) used for extraction, capped for storage. */
  text: string;
  fields: FieldMap;
}

export type FieldOutcome = "match" | "mismatch" | "missing";

export interface FieldComparison {
  field: FieldKey;
  si: ExtractedValue | null;
  bl: ExtractedValue | null;
  outcome: FieldOutcome;
  /** Short human explanation ("SI: 3 / BL: 4", "port code ignored", ...). */
  note: string;
}

export interface DocumentCheck {
  status: Status;
  reviewReason: ReviewReason | null;
  defectFields: FieldKey[];
  fields: FieldComparison[];
  documents: DocumentReading[];
  /** One sentence for the report: "No mismatch detected." etc. */
  summary: string;
  /** What a person has to do when status is NEEDS_REVIEW. */
  reviewNote: string | null;
}

export type ClassificationMethod = "ai" | "rules" | "human";

export interface Classification {
  category: Category;
  confidence: number;
  method: ClassificationMethod;
  /** Why this category, in one or two sentences. */
  rationale: string;
  /** What the sender wants, in plain words ("Send draft BL for SIN832764835"). */
  intent: string;
  /** The rule engine's answer, kept for the cross-check. */
  rulesCategory: Category;
  /** The AI's answer when the AI ran. */
  aiCategory: Category | null;
  /** True when rules and AI disagreed: shown to the reviewer. */
  disagreement: boolean;
}

export type Priority = "critical" | "high" | "normal" | "low" | "none";

export interface Triage {
  priority: Priority;
  /** The next thing a person should do, as an imperative sentence. */
  action: string;
  /** Business references found in the email (OC no., booking, invoice ...). */
  references: Reference[];
}

export interface Reference {
  kind: "oc" | "booking" | "invoice" | "bl" | "po" | "vessel";
  value: string;
}

export type StageName =
  | "receive"
  | "classify"
  | "read"
  | "extract"
  | "compare"
  | "triage"
  | "review";

export interface PipelineEvent {
  stage: StageName;
  outcome: "ok" | "warn" | "failed" | "retried";
  detail: string;
  /** Milliseconds since the start of the run. Drives the graph replay. */
  atMs: number;
}

export interface HumanReview {
  reviewer: string;
  at: string;
  decision: "confirmed" | "corrected";
  categoryOverride: Category | null;
  /** Values a person typed in for a document side. */
  corrections: Partial<Record<FieldKey, { si?: string; bl?: string }>>;
  note: string;
}

export interface EmailResult {
  email: EmailRecord;
  classification: Classification;
  /** Present for BL_COMPARISON emails only. */
  check: DocumentCheck | null;
  status: Status;
  reviewReason: ReviewReason | null;
  hasDefect: boolean;
  defectFields: FieldKey[];
  triage: Triage;
  review: HumanReview | null;
  events: PipelineEvent[];
  /** Offset (ms since run start) at which this email finished processing. */
  doneAtMs: number;
  /** A pipeline failure that was caught and shown rather than hidden. */
  failure: string | null;
  attempts: number;
}

export interface RunSummary {
  total: number;
  byCategory: Record<Category, number>;
  byStatus: Record<Status, number>;
  mismatches: number;
  needsReview: number;
  failures: number;
  aiClassified: number;
  disagreements: number;
}

export interface Run {
  id: string;
  source: SourceDescriptor;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number;
  ai: { enabled: boolean; model: string | null };
  results: EmailResult[];
  summary: RunSummary;
}

export type SourceDescriptor =
  | { kind: "bundle"; label: string; location: string }
  | { kind: "http"; label: string; location: string }
  | { kind: "gmail"; label: string; location: string };

/** One row of the organisers' self-evaluation format. */
export interface SubmissionRow {
  category: Category;
  status: Status;
  review_reason: ReviewReason | null;
  defect_fields: FieldKey[];
  has_defect: boolean;
}

export const FIELD_LABELS: Record<FieldKey, string> = {
  shipper: "Shipper",
  consignee: "Consignee",
  notify_party: "Notify party",
  port_of_loading: "Port of loading",
  port_of_discharge: "Port of discharge",
  container_count: "Container count",
  gross_weight_kg: "Gross weight (kg)",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  BL_COMPARISON: "Document check",
  SI_REQUEST: "SI request",
  INVOICE_QUERY: "Invoice query",
  GENERAL: "General",
  SPAM: "Spam",
};

export const REVIEW_REASON_LABELS: Record<ReviewReason, string> = {
  wrong_doc_type: "Wrong document attached",
  missing_attachment: "Attachment missing",
  unreadable: "Document unreadable",
  missing_value: "Required value missing",
};
