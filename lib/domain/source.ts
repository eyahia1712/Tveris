/**
 * Which inbox the dashboard shows. "sample" is the organisers' dataset;
 * "gmail" is always the signed-in user's own mailbox (resolved on the server
 * from their session, never from this value alone).
 */
export type SourceParam = "sample" | "gmail";

export function parseSourceParam(value: unknown): SourceParam {
  return value === "gmail" ? "gmail" : "sample";
}
