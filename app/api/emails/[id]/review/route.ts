import { z } from "zod";

import { CATEGORIES, FIELD_KEYS, type HumanReview } from "@/lib/domain/types";
import { BadRequestError, errorResponse, readJson } from "@/lib/server/http";
import { reviewEmail } from "@/lib/server/jobs";
import { parseSourceParam, resolveSource } from "@/lib/server/context";

export const dynamic = "force-dynamic";

const Correction = z
  .object({ si: z.string().max(300).optional(), bl: z.string().max(300).optional() })
  .strict();

const ReviewBody = z
  .object({
    source: z.enum(["sample", "gmail"]).default("sample"),
    reviewer: z.string().trim().min(1).max(80).default("Reviewer"),
    decision: z.enum(["confirmed", "corrected"]),
    categoryOverride: z.enum(CATEGORIES).nullable().default(null),
    corrections: z
      .partialRecord(z.enum(FIELD_KEYS), Correction)
      .default({}),
    note: z.string().max(1000).default(""),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    if (!/^[A-Za-z0-9_\-]{1,120}$/.test(id)) throw new BadRequestError("Invalid email id.");
    const parsed = ReviewBody.safeParse(await readJson(request));
    if (!parsed.success) throw new BadRequestError(parsed.error.issues.map((issue) => issue.message).join("; "));
    const body = parsed.data;
    const source = await resolveSource(parseSourceParam(body.source));
    if (source === null) return Response.json({ error: "Connect Gmail first." }, { status: 401 });

    const review: HumanReview = {
      reviewer: body.reviewer,
      at: new Date().toISOString(),
      decision: body.decision,
      categoryOverride: body.categoryOverride,
      corrections: body.corrections,
      note: body.note,
    };
    return Response.json({ result: await reviewEmail(source, id, review) });
  } catch (error) {
    return errorResponse(error);
  }
}
