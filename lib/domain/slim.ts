import type { Run } from "@/lib/domain/types";

/**
 * The dashboard does not need full document texts (they are read on the
 * email's own page), so they are dropped before a run crosses to the client.
 */
export function slimRun(run: Run): Run {
  return {
    ...run,
    results: run.results.map((result) => ({
      ...result,
      check:
        result.check === null
          ? null
          : { ...result.check, documents: result.check.documents.map((doc) => ({ ...doc, text: "" })) },
    })),
  };
}
