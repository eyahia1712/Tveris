import {
  FIELD_LABELS,
  REVIEW_REASON_LABELS,
  type Category,
  type DocumentCheck,
  type EmailRecord,
  type Priority,
  type Reference,
  type Triage,
} from "@/lib/domain/types";

/**
 * Turning a classified email into the next action for a person, ranked by
 * urgency. A wrong BL that gets issued costs the most (cargo released to the
 * wrong party, amendment fees), so discrepancies come first; then anything a
 * person must decide; then requests someone is waiting on; then updates.
 */

const REFERENCE_PATTERNS: Array<[Reference["kind"], RegExp]> = [
  ["oc", /\b\d[A-Z]{3}-\d{5}\b/g],
  ["invoice", /\b52500\d{5}\b/g],
  ["po", /\bPO[ _#.]*(\d{2}[_ ]?\d{2}[_ ]?\d{3,4}|\d{5,})\b/gi],
  ["bl", /\b(?:OOLU|MSCU|MAEU|HLCU|CMAU|ONEY|YMLU|EGLV|COSU)[A-Z0-9]{6,}\b/g],
  ["booking", /\b(?:MCLSIN[A-Z0-9]{6,}|SIN\d{9}|SIJ\d{7}|PSGSE\d{7}|ONEYSINF\d{5}|YMJAI\d{9}|I\d{9}|\d{12})\b/g],
  ["vessel", /\b[A-Z][A-Z ]{2,20}\d{0,4} V\.[A-Z0-9]{3,9}\b/g],
];

export function findReferences(email: EmailRecord): Reference[] {
  const text = `${email.subject}\n${email.body.split(/_{5,}/)[0] ?? ""}`;
  const seen = new Set<string>();
  const references: Reference[] = [];
  for (const [kind, pattern] of REFERENCE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0].trim();
      const key = `${kind}:${value}`;
      if (seen.has(key)) continue;
      // A booking pattern also matches the invoice number; keep the stronger kind.
      if ([...seen].some((entry) => entry.endsWith(`:${value}`))) continue;
      seen.add(key);
      references.push({ kind, value });
      if (references.length >= 6) return references;
    }
  }
  return references;
}

const URGENT_WORDS = /\b(asap|urgent|immediately|today|by end of day|eod|before (we )?release)\b/i;

export function triageEmail(
  email: EmailRecord,
  category: Category,
  check: DocumentCheck | null,
  intent: string,
): Triage {
  const references = findReferences(email);
  const ref = references.find((reference) => reference.kind === "oc" || reference.kind === "booking");
  const refText = ref ? ` for ${ref.value}` : "";
  const urgent = URGENT_WORDS.test(email.body);
  // "asap" lifts a request one step, but never above the discrepancies and
  // escalations: those are what "urgent" must keep meaning.
  const bump = (priority: Priority): Priority => (urgent && priority === "low" ? "normal" : priority);

  switch (category) {
    case "BL_COMPARISON": {
      if (check === null) {
        return { priority: "high", action: `Run the SI vs BL check${refText}.`, references };
      }
      if (check.status === "MISMATCH") {
        const fields = check.defectFields.map((field) => FIELD_LABELS[field].toLowerCase());
        return {
          priority: "critical",
          action: `Ask for the draft BL${refText} to be amended: ${fields.join(", ")} differ from the SI.`,
          references,
        };
      }
      if (check.status === "NEEDS_REVIEW" && check.reviewReason !== null) {
        return {
          priority: "high",
          action: `${REVIEW_REASON_LABELS[check.reviewReason]}: ${check.reviewNote ?? "review the documents."}`,
          references,
        };
      }
      return {
        priority: bump("normal"),
        action: `Confirm the draft BL${refText}: all seven fields match the SI.`,
        references,
      };
    }
    case "SI_REQUEST":
      return {
        priority: bump("normal"),
        action: `Prepare and submit the shipping instruction${refText} to the carrier.`,
        references,
      };
    case "INVOICE_QUERY": {
      const cancel = /\bcancel\b/i.test(email.body);
      return {
        priority: bump(cancel ? "high" : "normal"),
        action: cancel
          ? `Cancel the invoice and reverse the PGI${refText}, then confirm to the requester.`
          : `Reply with the billing answer${refText}: ${intent}`,
        references,
      };
    }
    case "GENERAL": {
      const needsDoc = /\b(send|share|provide)\b.*\bdraft (BL|B\/L)\b/i.test(email.body);
      return {
        priority: bump(needsDoc ? "normal" : "low"),
        action: needsDoc
          ? `Send the draft BL${refText} to the requester for checking.`
          : "Read when convenient; no action detected.",
        references,
      };
    }
    case "SPAM":
      return { priority: "none", action: "Ignore. Do not click links or reply.", references: [] };
  }
}

export const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
  none: 4,
};
