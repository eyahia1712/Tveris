import {
  FIELD_KEYS,
  FIELD_LABELS,
  type DocumentCheck,
  type DocumentReading,
  type ExtractedValue,
  type FieldComparison,
  type FieldKey,
  type ReviewReason,
} from "@/lib/domain/types";
import { DOC_KIND_LABELS } from "@/lib/pipeline/doctype";
import { sameValue } from "@/lib/pipeline/normalize";

/**
 * SI vs BL comparison and the status decision. The SI is the reference. The
 * decision never guesses: a document that cannot be read, is the wrong kind,
 * is absent, or leaves a field blank sends the email to a person with the
 * reason, instead of producing a confident but invented verdict.
 */

function show(value: ExtractedValue | null): string {
  if (value === null) return "not found";
  if (value.missing) return value.raw === null ? "blank" : `"${value.raw}"`;
  return value.raw ?? String(value.normalized);
}

export function compareField(
  field: FieldKey,
  si: ExtractedValue | null,
  bl: ExtractedValue | null,
): FieldComparison {
  if (si === null || bl === null || si.missing || bl.missing) {
    const side = si === null || si.missing ? "SI" : "BL";
    return {
      field,
      si,
      bl,
      outcome: "missing",
      note: `${side} value is ${show(side === "SI" ? si : bl)}`,
    };
  }
  const same = sameValue(
    field,
    si.normalized as string | number,
    bl.normalized as string | number,
    si.raw ?? "",
    bl.raw ?? "",
  );
  return {
    field,
    si,
    bl,
    outcome: same ? "match" : "mismatch",
    note: same ? "Match" : `SI: ${show(si)} / BL: ${show(bl)}`,
  };
}

export function compareDocuments(si: DocumentReading, bl: DocumentReading): FieldComparison[] {
  return FIELD_KEYS.map((field) =>
    compareField(field, si.fields[field] ?? null, bl.fields[field] ?? null),
  );
}

function needsReview(
  reason: ReviewReason,
  reviewNote: string,
  documents: DocumentReading[],
  fields: FieldComparison[] = [],
): DocumentCheck {
  const defectFields = fields
    .filter((comparison) => comparison.outcome === "mismatch")
    .map((comparison) => comparison.field);
  return {
    status: "NEEDS_REVIEW",
    reviewReason: reason,
    defectFields,
    fields,
    documents,
    summary: reviewNote,
    reviewNote,
  };
}

/** Pick the SI and the BL out of whatever the email carried. */
export function assignRoles(documents: DocumentReading[]): {
  si: DocumentReading | null;
  bl: DocumentReading | null;
} {
  const readable = documents.filter((doc) => doc.readable);
  let si = readable.find((doc) => doc.kind === "SI") ?? null;
  let bl = readable.find((doc) => doc.kind === "BL" && doc !== si) ?? null;
  // An untitled document takes the role its filename claims, but only when
  // that role is still open and its content really looks like shipping data.
  for (const doc of readable) {
    if (doc.kind !== "UNKNOWN") continue;
    const found = Object.keys(doc.fields).length;
    if (found < 4) continue;
    if (doc.claimedRole === "SI" && si === null) si = doc;
    else if (doc.claimedRole === "BL" && bl === null) bl = doc;
  }
  return { si, bl };
}

export function decideCheck(documents: DocumentReading[], attachmentCount: number): DocumentCheck {
  if (attachmentCount === 0) {
    return needsReview(
      "missing_attachment",
      "The email asks for a document check but carries no attachments. Ask the sender to resend the SI and the draft BL.",
      documents,
    );
  }

  const unreadable = documents.filter((doc) => !doc.readable);
  if (unreadable.length > 0) {
    const names = unreadable.map((doc) => `${doc.fileName} (${doc.error ?? "unreadable"})`);
    return needsReview(
      "unreadable",
      `Could not read ${names.join(", ")}. Ask the sender for a clean copy, or type the values in by hand.`,
      documents,
    );
  }

  const foreign = documents.filter(
    (doc) => doc.kind !== "SI" && doc.kind !== "BL" && doc.kind !== "UNKNOWN",
  );
  if (foreign.length > 0) {
    const names = foreign.map(
      (doc) => `${doc.fileName} is a ${DOC_KIND_LABELS[doc.kind].toLowerCase()}`,
    );
    return needsReview(
      "wrong_doc_type",
      `${names.join("; ")}, not the ${foreign.some((doc) => doc.claimedRole === "SI") ? "SI" : "draft BL"}. Ask the sender for the correct document.`,
      documents,
    );
  }

  const { si, bl } = assignRoles(documents);
  if (si === null || bl === null) {
    const missing = si === null ? "shipping instruction (SI)" : "draft bill of lading (BL)";
    const reason: ReviewReason = documents.length < 2 ? "missing_attachment" : "wrong_doc_type";
    return needsReview(
      reason,
      reason === "missing_attachment"
        ? `The ${missing} is not attached. Ask the sender for it before checking.`
        : `None of the attachments is a ${missing}. Ask the sender for the correct document.`,
      documents,
    );
  }

  const fields = compareDocuments(si, bl);
  const missing = fields.filter((comparison) => comparison.outcome === "missing");
  if (missing.length > 0) {
    const list = missing.map(
      (comparison) => `${FIELD_LABELS[comparison.field]} (${comparison.note})`,
    );
    return needsReview(
      "missing_value",
      `Cannot confirm ${list.join(", ")}. Ask the customer for the value or enter it after checking.`,
      [si, bl],
      fields,
    );
  }

  const mismatched = fields.filter((comparison) => comparison.outcome === "mismatch");
  if (mismatched.length === 0) {
    return {
      status: "OK",
      reviewReason: null,
      defectFields: [],
      fields,
      documents: [si, bl],
      summary: "No mismatch detected.",
      reviewNote: null,
    };
  }
  return {
    status: "MISMATCH",
    reviewReason: null,
    defectFields: mismatched.map((comparison) => comparison.field),
    fields,
    documents: [si, bl],
    summary: `${mismatched.length} field${mismatched.length === 1 ? "" : "s"} differ: ${mismatched
      .map((comparison) => `${FIELD_LABELS[comparison.field]} (${comparison.note})`)
      .join("; ")}.`,
    reviewNote: null,
  };
}
