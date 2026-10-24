import { Dashboard } from "@/components/dashboard/dashboard";
import { aiConfig } from "@/lib/ai/claude";
import { slimRun } from "@/lib/domain/slim";
import { gmailConfigured } from "@/lib/gmail";
import { currentGmailSession, parseSourceParam, resolveSource } from "@/lib/server/context";
import { getStore, sourceKey } from "@/lib/store";
import { CATEGORIES, type Category } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Inbox map" };

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const session = await currentGmailSession();
  const requested = parseSourceParam(params.source);
  // Asking for Gmail without a session falls back to the sample inbox.
  const source = requested === "gmail" && session === null ? "sample" : requested;
  const inbox = await resolveSource(source);
  const run = inbox === null ? null : await getStore().latestRun(sourceKey(inbox.descriptor));
  const ai = aiConfig();

  const only = typeof params.only === "string" && (CATEGORIES as readonly string[]).includes(params.only)
    ? (params.only as Category)
    : null;

  const focus = typeof params.focus === "string" ? params.focus : null;

  return (
    <Dashboard
      key={`${source}:${only ?? "all"}:${focus ?? ""}`}
      only={only}
      focus={focus}
      initialRun={run === null ? null : slimRun(run)}
      source={source}
      gmail={{ configured: gmailConfigured(), email: session?.email ?? null }}
      ai={{ enabled: ai.enabled, model: ai.model }}
    />
  );
}
