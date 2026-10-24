import type { EmailResult, SubmissionRow } from "@/lib/domain/types";

/**
 * The organisers' self-evaluation shape (sample_submission.json): one object
 * keyed by email_id. Non-comparison emails carry status OK and no defects,
 * exactly as the sample file does.
 */
export function toSubmissionRow(result: EmailResult): SubmissionRow {
  const category = result.classification.category;
  if (category !== "BL_COMPARISON") {
    return { category, status: "OK", review_reason: null, defect_fields: [], has_defect: false };
  }
  return {
    category,
    status: result.status,
    review_reason: result.status === "NEEDS_REVIEW" ? result.reviewReason : null,
    defect_fields: result.defectFields,
    has_defect: result.defectFields.length > 0,
  };
}

export function toSubmission(results: EmailResult[]): Record<string, SubmissionRow> {
  const sorted = [...results].sort((a, b) => a.email.email_id.localeCompare(b.email.email_id));
  return Object.fromEntries(sorted.map((result) => [result.email.email_id, toSubmissionRow(result)]));
}
