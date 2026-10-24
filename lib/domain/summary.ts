import { CATEGORIES, type Category, type EmailResult, type RunSummary, type Status } from "@/lib/domain/types";

/** Counts for a run; pure, so the dashboard can recompute after a review. */
export function summarize(results: EmailResult[]): RunSummary {
  const byCategory = Object.fromEntries(CATEGORIES.map((category) => [category, 0])) as Record<Category, number>;
  const byStatus: Record<Status, number> = { OK: 0, MISMATCH: 0, NEEDS_REVIEW: 0 };
  let failures = 0;
  let aiClassified = 0;
  let disagreements = 0;
  for (const result of results) {
    byCategory[result.classification.category] += 1;
    if (result.classification.category === "BL_COMPARISON") byStatus[result.status] += 1;
    if (result.failure !== null) failures += 1;
    if (result.classification.aiCategory !== null) aiClassified += 1;
    if (result.classification.disagreement) disagreements += 1;
  }
  return {
    total: results.length,
    byCategory,
    byStatus,
    mismatches: byStatus.MISMATCH,
    needsReview: byStatus.NEEDS_REVIEW,
    failures,
    aiClassified,
    disagreements,
  };
}
