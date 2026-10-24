import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import type { Overview } from "@/lib/domain/overview";

/**
 * The weekly brief: what the desk should focus on next week, written by
 * Claude from the verified task list (never from raw guesses). The rule-based
 * brief below says the same thing without AI, so the dashboard always has one.
 */

const BriefSchema = z.object({
  headline: z.string(),
  recommendations: z.array(
    z.object({
      tier: z.enum(["urgent", "due", "followup"]),
      title: z.string(),
      detail: z.string(),
      emailIds: z.array(z.string()),
    }),
  ),
});

export type WeeklyBrief = z.infer<typeof BriefSchema> & {
  source: "ai" | "rules";
  model: string | null;
  runId: string;
  generatedAt: string;
};

export function rulesBrief(overview: Overview): WeeklyBrief {
  const [urgent, due, followup] = overview.tiers;
  const recommendations: WeeklyBrief["recommendations"] = [];
  if (urgent && urgent.count > 0) {
    recommendations.push({
      tier: "urgent",
      title: `Resolve ${urgent.count} BL/SI mismatch${urgent.count === 1 ? "" : "es"} first`,
      detail: "Each draft BL differs from its shipping instruction. Send the amendment request before the carrier finalises the BL.",
      emailIds: urgent.tasks.map((task) => task.emailId),
    });
  }
  if (followup && followup.count > 0) {
    recommendations.push({
      tier: "followup",
      title: `Chase ${followup.count} follow-ups`,
      detail: "Missing or unreadable documents, blank SI values and draft-BL requests. Ask senders for the right files; confirm what the AI could not decide.",
      emailIds: followup.tasks.map((task) => task.emailId),
    });
  }
  if (due && due.count > 0) {
    recommendations.push({
      tier: "due",
      title: `Verify and submit ${overview.counts.prepare} shipping instructions`,
      detail: `Plus ${overview.counts.verified} clean BL checks ready to confirm to customers.`,
      emailIds: due.tasks.map((task) => task.emailId),
    });
  }
  return {
    headline: `${overview.counts.urgent} urgent, ${overview.counts.review + overview.counts.awaiting} to chase, ${overview.counts.prepare} SIs to prepare next week.`,
    recommendations,
    source: "rules",
    model: null,
    runId: overview.runId,
    generatedAt: new Date().toISOString(),
  };
}

export async function aiBrief(overview: Overview, model: string): Promise<WeeklyBrief> {
  const digest = {
    inbox: overview.sourceLabel,
    emails: overview.total,
    counts: overview.counts,
    tiers: overview.tiers.map((tier) => ({
      tier: tier.tier,
      count: tier.count,
      examples: tier.tasks.map((task) => ({ emailId: task.emailId, ref: task.ref, title: task.title, detail: task.detail })),
    })),
    plan: overview.plan,
    ai: {
      lowConfidence: overview.ai.lowConfidence,
      disagreements: overview.ai.disagreements,
      unreadableDocuments: overview.ai.documents.unreadable,
    },
  };
  const client = new Anthropic({ maxRetries: 2, timeout: 90_000 });
  const response = await client.beta.messages.parse({
    model,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(BriefSchema) },
    system:
      "You brief the shipping shipping documentation desk (SI and bill-of-lading preparation, BL finalisation with forwarders and carriers, LC checking) on next week's work. Use only the facts given. Be concrete: counts, references, the action to take. 3 to 5 recommendations, most urgent first, each tied to the emailIds it concerns (from the examples only). The headline is one sentence.",
    messages: [{ role: "user", content: `Verified task list from the inbox pipeline:\n${JSON.stringify(digest)}` }],
  });
  if (response.stop_reason === "refusal" || response.parsed_output === null) {
    throw new Error("The model did not return a brief.");
  }
  const known = new Set(overview.search.map((row) => row.id));
  return {
    ...response.parsed_output,
    recommendations: response.parsed_output.recommendations.map((item) => ({
      ...item,
      emailIds: item.emailIds.filter((id) => known.has(id)),
    })),
    source: "ai",
    model,
    runId: overview.runId,
    generatedAt: new Date().toISOString(),
  };
}
