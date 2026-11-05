import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { FIELD_LABELS, type EmailResult, type Run } from "@/lib/domain/types";

/**
 * The dashboard assistant. Every answer is grounded in the facts of the
 * current inbox run, written below as plain text. With an API key, Claude
 * answers from those facts; without one, a small rule-based engine answers the
 * common questions from the same facts, so the assistant never goes dark.
 */

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export const CHAT_MODEL = process.env.TVERIS_CHAT_MODEL || "claude-opus-5-5";

const REASON_TEXT: Record<string, string> = {
  wrong_doc_type: "an attachment is not the document it claims to be",
  missing_attachment: "the SI or the draft BL is missing",
  unreadable: "a file could not be read",
  missing_value: "a field is blank on the SI",
};

const short = (text: string, n = 90) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);
const idNo = (id: string) => `#${id.replace(/^email_/, "")}`;

function mismatchLine(result: EmailResult): string {
  const fields = (result.check?.fields ?? [])
    .filter((field) => field.outcome === "mismatch")
    .map((field) => `${FIELD_LABELS[field.field]}: SI "${field.si?.raw ?? "—"}" vs BL "${field.bl?.raw ?? "—"}"`);
  return `${idNo(result.email.email_id)} ${short(result.email.subject, 70)} | ${fields.join("; ")}`;
}

/** The facts of one run, compact enough to send with every question. */
export function runFacts(run: Run): string {
  const s = run.summary;
  const results = run.results;
  const mismatches = results.filter((r) => r.status === "MISMATCH");
  const reviews = results.filter((r) => r.status === "NEEDS_REVIEW");
  const defects = new Map<string, number>();
  for (const r of mismatches) for (const f of r.defectFields) defects.set(FIELD_LABELS[f], (defects.get(FIELD_LABELS[f]) ?? 0) + 1);
  const urgent = results.filter((r) => r.triage.priority === "critical").length;
  const needPerson = s.byStatus.MISMATCH + s.byStatus.NEEDS_REVIEW + urgent - mismatches.filter((r) => r.triage.priority === "critical").length;

  return [
    `INBOX: ${run.source.label}. ${s.total} emails processed in ${run.durationMs} ms, ${s.failures} failures. Classifier: ${run.ai.enabled ? `Claude (${run.ai.model})` : "rule engine"}.`,
    `QUEUES: document check ${s.byCategory.BL_COMPARISON}, SI request ${s.byCategory.SI_REQUEST}, invoice query ${s.byCategory.INVOICE_QUERY}, general ${s.byCategory.GENERAL}, spam ${s.byCategory.SPAM} (quarantined).`,
    `DOCUMENT CHECKS (SI vs draft BL): ${s.byStatus.OK} clear, ${s.byStatus.MISMATCH} mismatch, ${s.byStatus.NEEDS_REVIEW} need review. About ${needPerson} emails need a person; the rest are handled.`,
    `FIELDS THAT DIFFER MOST: ${[...defects].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}.`,
    `MISMATCHES (first 25):\n${mismatches.slice(0, 25).map(mismatchLine).join("\n")}`,
    `NEEDS REVIEW (first 20):\n${reviews.slice(0, 20).map((r) => `${idNo(r.email.email_id)} ${short(r.email.subject, 60)} | ${REASON_TEXT[r.reviewReason ?? ""] ?? r.reviewReason}`).join("\n")}`,
  ].join("\n\n");
}

const PRODUCT = `ABOUT TVERIS: an agentic AI for shipping-document trust (HackAI 2026, Track 02 Secure Logistics & Digital Trust, team The Minions).
Workflow per email: Observe (read the inbox) -> Classify into 5 queues (Claude, cross-checked by a rule engine) -> pick a reader per file (Excel, Word, PDF, Claude vision for scans) -> extract the 7 fields (shipper, consignee, notify party, port of loading, port of discharge, container count, gross weight) with the source line -> compare SI vs draft BL with deterministic code -> decide OK / MISMATCH / NEEDS_REVIEW with a reason -> triage and draft a reply -> a human approves before anything is sent. Every step is logged (audit trail).
Safeguards: AI never decides a match; unclear cases are escalated, never guessed; Gmail is read-only and the token is encrypted; mail is shown as text; spam is quarantined.
Trade escrow (the Escrow page): the exporter sends a payment request for a container; the importer pays into escrow on BNB Smart Chain; the money stays locked while the agent checks the documents (SI vs BL) and the container's journey (container number, seal, port of discharge, delivery). If everything matches and the buyer confirms, the money is released to the seller; if the documents are tampered with or the cargo goes wrong, the buyer is refunded. The verdict's fingerprint (hash) is stored with the payout. It builds on the team's Amanah escrow agent on BNB Chain testnet.`;

const SYSTEM = `You are the Tveris assistant inside a shipping documentation desk's dashboard.
Answer from the facts below and the description of Tveris. If the facts do not contain the answer, say so plainly and suggest where in the dashboard to look.
Keep answers short: two to five sentences or a short list. Quote email numbers like #004 and exact values when they help. Never invent emails, values or numbers.`;

/** Answers with Claude, grounded in the run facts. */
export async function chatWithClaude(history: ChatTurn[], facts: string): Promise<string> {
  const client = new Anthropic({ maxRetries: 2, timeout: 60_000 });
  const response = await client.beta.messages.create({
    model: CHAT_MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: [{ type: "text", text: `${SYSTEM}\n\n${PRODUCT}\n\n${facts}`, cache_control: { type: "ephemeral" } }],
    messages: history.map((turn) => ({ role: turn.role, content: turn.content })),
  });
  if (response.stop_reason === "refusal") return "I can't help with that one. Try asking about the inbox, a document check or the escrow.";
  const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n").trim();
  return text || "I couldn't put an answer together. Please try rephrasing.";
}

/** The rule-based answers, used when no API key is configured or Claude is unavailable. */
export function answerOffline(question: string, run: Run): string {
  const q = question.toLowerCase();
  const s = run.summary;
  const mismatches = run.results.filter((r) => r.status === "MISMATCH");
  const reviews = run.results.filter((r) => r.status === "NEEDS_REVIEW");
  const idMatch = q.match(/#?\s?0*(\d{1,3})\b/);

  if (idMatch && /email|#|check|explain|what|why/.test(q)) {
    const id = `email_${idMatch[1]!.padStart(3, "0")}`;
    const r = run.results.find((x) => x.email.email_id === id);
    if (r) {
      if (r.status === "MISMATCH") {
        const lines = (r.check?.fields ?? []).filter((f) => f.outcome === "mismatch")
          .map((f) => `• ${FIELD_LABELS[f.field]}: SI says "${f.si?.raw}", draft BL says "${f.bl?.raw}"`);
        return `Email ${idNo(id)} is a mismatch. ${lines.length} field${lines.length === 1 ? "" : "s"} differ:\n${lines.join("\n")}\nNext action: ${r.triage.action}`;
      }
      if (r.status === "NEEDS_REVIEW") return `Email ${idNo(id)} needs a person because ${REASON_TEXT[r.reviewReason ?? ""] ?? "it is unclear"}. Tveris escalated it instead of guessing. Next action: ${r.triage.action}`;
      return `Email ${idNo(id)} is in the ${r.classification.category.replaceAll("_", " ").toLowerCase()} queue (${Math.round(r.classification.confidence * 100)}% confidence). ${r.check ? "All seven fields match the SI." : ""} Next action: ${r.triage.action}`;
    }
  }
  if (/attention|right now|priority|urgent|first|today/.test(q)) {
    const urgent = mismatches.filter((r) => r.triage.priority === "critical").slice(0, 3);
    return `Start with the ${s.byStatus.MISMATCH} mismatches: each draft BL differs from its SI and needs an amendment before the BL is issued. The most urgent:\n${urgent.map((r) => `• ${idNo(r.email.email_id)}: ${r.triage.action}`).join("\n")}\nThen clear the ${s.byStatus.NEEDS_REVIEW} escalated checks, where a file is missing, unreadable or blank. The other ${s.total - s.byStatus.MISMATCH - s.byStatus.NEEDS_REVIEW} emails are already sorted.`;
  }
  if (/escrow|blockchain|bnb|chain|payment|pay|money|amanah/.test(q)) {
    return "On the Escrow page, the exporter sends a payment request for the container and the importer pays into escrow on BNB Smart Chain. The money stays locked while Tveris checks the SI against the draft BL and follows the container (number, seal, port, delivery). If everything matches and the buyer confirms, the seller is paid; if a document is tampered with, the buyer is refunded. Every decision's fingerprint is kept with the payout.";
  }
  if (/how|work|agent|workflow|step|pipeline/.test(q)) {
    return "For every email the agent: 1) reads the inbox, 2) classifies it into one of five queues with Claude, cross-checked by rules, 3) picks the right reader for each attachment, 4) extracts the 7 fields with the line they came from, 5) compares SI vs draft BL with plain code, 6) decides OK, mismatch or needs review, and 7) drafts the next step. A person approves before anything is sent, and every step is logged.";
  }
  if (/mismatch|differ|wrong|error/.test(q)) {
    return `${s.byStatus.MISMATCH} draft BLs differ from their SI. The first few:\n${mismatches.slice(0, 4).map((r) => `• ${mismatchLine(r)}`).join("\n")}\nOpen any of them from the Mismatches list to see both values and the drafted reply.`;
  }
  if (/review|unclear|escalat|person|human/.test(q)) {
    const byReason = new Map<string, number>();
    for (const r of reviews) byReason.set(REASON_TEXT[r.reviewReason ?? ""] ?? "other", (byReason.get(REASON_TEXT[r.reviewReason ?? ""] ?? "other") ?? 0) + 1);
    return `${reviews.length} checks were escalated to a person instead of guessed:\n${[...byReason].map(([k, v]) => `• ${v} because ${k}`).join("\n")}`;
  }
  if (/spam|phish/.test(q)) return `${s.byCategory.SPAM} emails were quarantined as spam or phishing. Their links are never opened and they are shown as text only.`;
  if (/field|most|often/.test(q)) {
    const defects = new Map<string, number>();
    for (const r of mismatches) for (const f of r.defectFields) defects.set(FIELD_LABELS[f], (defects.get(FIELD_LABELS[f]) ?? 0) + 1);
    return `Across the ${mismatches.length} mismatches, the fields that differ most are: ${[...defects].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} (${v})`).join(", ")}.`;
  }
  if (/safe|secur|privacy|trust/.test(q)) return "Tveris never lets the AI decide a match: plain, tested rules compare the documents. Unclear cases go to a person, Gmail access is read-only with an encrypted token, mail is shown as text, and no reply is sent until a person confirms the recipient.";
  return `This inbox has ${s.total} emails: ${s.byStatus.MISMATCH} mismatches, ${s.byStatus.NEEDS_REVIEW} need review and ${s.byStatus.OK} clear checks, plus ${s.byCategory.SPAM} spam quarantined. Ask me about a specific email (for example "explain #004"), the mismatches, the review queue or the escrow.`;
}
