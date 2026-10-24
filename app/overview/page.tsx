import { redirect } from "next/navigation";

/** The dashboard used to live here; keep old links working. */
export default async function OverviewRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const source = (await searchParams).source;
  redirect(typeof source === "string" ? `/dashboard?source=${encodeURIComponent(source)}` : "/dashboard");
}
