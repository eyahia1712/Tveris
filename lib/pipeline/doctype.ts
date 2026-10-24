import type { DocKind } from "@/lib/domain/types";

/**
 * What a document IS, decided from its content, never from its filename:
 * "email_501_BL.txt" is a commercial invoice. The first title-like line that
 * names a document type wins; SI titles are tested before BL titles because
 * "BILL OF LADING INSTRUCTION" is a shipping instruction.
 */
const KIND_MARKERS: Array<[DocKind, RegExp]> = [
  ["COMMERCIAL_INVOICE", /\b(commercial|proforma|tax) invoice\b/i],
  ["PACKING_LIST", /\bpacking list\b/i],
  ["CERTIFICATE_OF_ORIGIN", /\bcertificate of origin\b/i],
  [
    "SI",
    /\b(shipping instructions?|bl instructions?|b\/l instructions?|bill of lading instructions?|booking instructions?)\b|^s\.?\s?i\.?$/i,
  ],
  ["BL", /\b(bill of lading|b\/l draft|draft b\/?l|sea ?waybill|house bl|ocean bl)\b/i],
];

export interface KindDecision {
  kind: DocKind;
  evidence: string | null;
}

/** Title zone: the first few non-empty lines of the document. */
const TITLE_LINES = 6;

export function detectKind(lines: string[], sheetNames: string[] = []): KindDecision {
  const candidates = [
    ...sheetNames.map((name) => name.trim()),
    ...lines.map((line) => line.trim()).filter((line) => line !== "").slice(0, TITLE_LINES),
  ];
  for (const line of candidates) {
    for (const [kind, pattern] of KIND_MARKERS) {
      if (pattern.test(line)) return { kind, evidence: line };
    }
  }
  // No title: a warning banner further down ("*** CERTIFICATE OF ORIGIN -
  // NOT AN SI OR BL ***") still tells the truth about foreign documents.
  for (const line of lines) {
    for (const [kind, pattern] of KIND_MARKERS.slice(0, 3)) {
      if (pattern.test(line)) return { kind, evidence: line.trim() };
    }
  }
  return { kind: "UNKNOWN", evidence: null };
}

export function claimedRoleFromName(fileName: string): "SI" | "BL" | null {
  const stem = fileName.replace(/\.[a-z0-9]+$/i, "").toUpperCase();
  if (/(^|[_\-\s.])(SI|SHIPPING[_\-\s]?INSTRUCTION)$/.test(stem)) return "SI";
  if (/(^|[_\-\s.])(BL|B\/L|BOL|BILL[_\-\s]?OF[_\-\s]?LADING|DRAFT[_\-\s]?BL)$/.test(stem)) {
    return "BL";
  }
  if (/\bSI\b|SHIPPING.?INSTRUCTION/.test(stem)) return "SI";
  if (/\bB\/?L\b|LADING/.test(stem)) return "BL";
  return null;
}

export const DOC_KIND_LABELS: Record<DocKind, string> = {
  SI: "Shipping instruction",
  BL: "Draft bill of lading",
  COMMERCIAL_INVOICE: "Commercial invoice",
  PACKING_LIST: "Packing list",
  CERTIFICATE_OF_ORIGIN: "Certificate of origin",
  UNKNOWN: "Unrecognised document",
};
