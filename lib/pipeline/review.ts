import {
  FIELD_KEYS,
  FIELD_LABELS,
  type DocumentCheck,
  type DocumentReading,
  type EmailResult,
  type FieldKey,
  type HumanReview,
} from "@/lib/domain/types";
import { compareDocuments } from "@/lib/pipeline/compare";
import { makeValue } from "@/lib/pipeline/fields";
import { triageEmail } from "@/lib/pipeline/triage";

/**
 * Human in the loop: a person confirms or corrects a result and the report
 * updates. Corrected values are marked as entered by a person (source
 * "human") and the comparison is recomputed from them with the same
 * deterministic rules, so a reviewer's typo shows up as a mismatch too.
 */

function sideDocument(
  check: DocumentCheck,
  role: "SI" | "BL",
  corrections: HumanReview["corrections"],
  reviewer: string,
): DocumentReading | null {
  const side = role === "SI" ? "si" : "bl";
  const typed = FIELD_KEYS.filter((field) => {
    const value = corrections[field]?.[side];
    return typeof value === "string" && value.trim() !== "";
  });
  const existing =
    check.documents.find((doc) => doc.readable && doc.kind === role)
    ?? check.documents.find((doc) => doc.claimedRole === role)
    ?? null;
  const usable = existing !== null && existing.readable && existing.kind === role;
  if (!usable && typed.length === 0) return existing;

  // A person who types values for a side vouches for that side: it becomes a
  // readable document of the right kind, whatever the original file was.
  const base: DocumentReading = existing ?? {
    path: `review:${role}`,
    fileName: `${role} entered by reviewer`,
    format: "unknown",
    claimedRole: role,
    kind: role,
    kindEvidence: null,
    readable: true,
    readMethod: null,
    error: null,
    text: "",
    fields: {},
  };
  const fields = usable ? { ...base.fields } : {};
  for (const field of typed) {
    const value = corrections[field]?.[side] ?? "";
    fields[field] = makeValue(field, value, "entered by reviewer", `Entered by ${reviewer}`, "human");
  }
  return { ...base, kind: role, readable: true, error: null, fields };
}

export function recheckWithCorrections(
  check: DocumentCheck,
  review: HumanReview,
): DocumentCheck {
  const hasCorrections = Object.keys(review.corrections).length > 0;
  if (!hasCorrections) return check;
  const si = sideDocument(check, "SI", review.corrections, review.reviewer);
  const bl = sideDocument(check, "BL", review.corrections, review.reviewer);
  if (si === null || bl === null || !si.readable || !bl.readable) return check;

  const fields = compareDocuments(si, bl);
  const missing = fields.filter((field) => field.outcome === "missing");
  const mismatched = fields.filter((field) => field.outcome === "mismatch");
  const defectFields: FieldKey[] = mismatched.map((field) => field.field);
  const others = check.documents.filter((doc) => doc !== si && doc !== bl && doc.path !== si.path && doc.path !== bl.path);

  if (missing.length > 0) {
    const note = `Still missing after review: ${missing.map((field) => FIELD_LABELS[field.field]).join(", ")}.`;
    return {
      status: "NEEDS_REVIEW",
      reviewReason: "missing_value",
      defectFields,
      fields,
      documents: [si, bl, ...others],
      summary: note,
      reviewNote: note,
    };
  }
  return {
    status: mismatched.length > 0 ? "MISMATCH" : "OK",
    reviewReason: null,
    defectFields,
    fields,
    documents: [si, bl, ...others],
    summary:
      mismatched.length > 0
        ? `${mismatched.length} field${mismatched.length === 1 ? "" : "s"} differ after review: ${mismatched.map((field) => `${FIELD_LABELS[field.field]} (${field.note})`).join("; ")}.`
        : "No mismatch detected (confirmed after review).",
    reviewNote: null,
  };
}

export function applyReview(result: EmailResult, review: HumanReview, atMs: number): EmailResult {
  const check = result.check === null ? null : recheckWithCorrections(result.check, review);
  const category = result.classification.category;
  const classification = review.categoryOverride !== null && review.categoryOverride !== category
    ? { ...result.classification, category: review.categoryOverride, method: "human" as const, confidence: 1, rationale: `Category set by ${review.reviewer}.`, disagreement: false }
    : review.decision === "confirmed"
      ? { ...result.classification, disagreement: false }
      : result.classification;

  const triage = triageEmail(result.email, classification.category, check, classification.intent);
  if (review.decision === "confirmed" && check?.status !== "MISMATCH") {
    triage.priority = "low";
    triage.action = `Reviewed by ${review.reviewer}${review.note ? `: ${review.note}` : "."}`;
  }

  const status = check?.status ?? "OK";
  return {
    ...result,
    classification,
    check,
    status,
    reviewReason: check?.reviewReason ?? null,
    hasDefect: (check?.defectFields.length ?? 0) > 0,
    defectFields: check?.defectFields ?? [],
    triage,
    review,
    failure: null,
    events: [
      ...result.events,
      {
        stage: "review",
        outcome: "ok",
        detail: `${review.decision === "confirmed" ? "Confirmed" : "Corrected"} by ${review.reviewer}; status ${status}.`,
        atMs,
      },
    ],
  };
}
