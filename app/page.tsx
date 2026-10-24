import { LandingPage, type LandingNumbers } from "@/components/landing/landing-page";
import { aiConfig } from "@/lib/ai/claude";
import { buildShipments } from "@/lib/domain/shipments";
import { sampleSource } from "@/lib/server/context";
import { getStore, sourceKey } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * The landing page. Its numbers come from the last processed run of the
 * shared inbox, so the claims on the page are the product's own results.
 */
export default async function HomePage() {
  const run = await getStore().latestRun(sourceKey(sampleSource().descriptor));
  const ai = aiConfig();
  const numbers: LandingNumbers | null =
    run === null
      ? null
      : {
          emails: run.summary.total,
          checks: run.summary.byCategory.BL_COMPARISON,
          mismatches: run.summary.mismatches,
          escalations: run.summary.needsReview,
          shipments: buildShipments(run).length,
          aiEnabled: run.ai.enabled,
          model: run.ai.model ?? ai.model,
        };

  return <LandingPage numbers={numbers} />;
}
