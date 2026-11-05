import { z } from "zod";

import { ChainNotConfigured, fund, markShipped, settle, setup, status } from "@/lib/chain/escrow";
import { readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET: the escrow, the three wallets and their balances on BNB Smart Chain testnet. */
export async function GET(): Promise<Response> {
  try {
    return Response.json(await status());
  } catch (error) {
    return failure(error);
  }
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup") }),
  z.object({ action: z.literal("fund"), listing: z.record(z.string(), z.unknown()), shipBySeconds: z.number().int().min(60).max(3600) }),
  z.object({ action: z.literal("ship"), dealId: z.number().int().positive(), shipment: z.record(z.string(), z.unknown()) }),
  z.object({ action: z.literal("settle"), dealId: z.number().int().positive(), decision: z.enum(["RELEASE", "REFUND"]), verdict: z.record(z.string(), z.unknown()) }),
]);

/** POST: one escrow step, sent and confirmed on-chain before the response. */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = Body.parse(await readJson(request));
    switch (body.action) {
      case "setup": return Response.json(await setup());
      case "fund": return Response.json(await fund(body.listing, body.shipBySeconds));
      case "ship": return Response.json(await markShipped(body.dealId, body.shipment));
      case "settle": return Response.json(await settle(body.dealId, body.decision, body.verdict));
    }
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown): Response {
  if (error instanceof ChainNotConfigured) return Response.json({ error: error.message, configured: false }, { status: 503 });
  if (error instanceof z.ZodError) return Response.json({ error: "Invalid request." }, { status: 400 });
  const message = error instanceof Error ? error.message : String(error);
  console.error("[tveris] escrow", message);
  const short = /insufficient funds/i.test(message) ? "Not enough test BNB in the wallet. Fund the agent first." : message.split("\n")[0]!.slice(0, 220);
  return Response.json({ error: short }, { status: 502 });
}
