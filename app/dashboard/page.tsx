import { DashboardHome } from "@/components/dashboard-home/dashboard-home";
import { rulesBrief, type WeeklyBrief } from "@/lib/ai/brief";
import { aiConfig } from "@/lib/ai/claude";
import { buildOverview } from "@/lib/domain/overview";
import { currentGmailSession, parseSourceParam, resolveSource } from "@/lib/server/context";
import { getStore, sourceKey } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

/** The working screen: what needs a person now, and what to do about it. */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const session = await currentGmailSession();
  const requested = parseSourceParam(params.source);
  const source = requested === "gmail" && session === null ? "sample" : requested;
  const inbox = await resolveSource(source);
  const key = inbox === null ? null : sourceKey(inbox.descriptor);
  const run = key === null ? null : await getStore().latestRun(key);
  const overview = run === null ? null : buildOverview(run, new Date());

  let brief: WeeklyBrief | null = null;
  if (overview !== null && key !== null) {
    const cached = await getStore().getMeta<WeeklyBrief>(`brief:${key}`);
    brief = cached !== null && cached.runId === overview.runId ? cached : rulesBrief(overview);
  }
  const ai = aiConfig();

  return (
    <DashboardHome
      overview={overview}
      brief={brief}
      source={source}
      ai={{ enabled: ai.enabled, model: ai.model }}
      gmailEmail={session?.email ?? null}
    />
  );
}
