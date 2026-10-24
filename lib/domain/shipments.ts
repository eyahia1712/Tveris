import {
  CATEGORY_LABELS,
  FIELD_LABELS,
  REVIEW_REASON_LABELS,
  type Category,
  type EmailResult,
  type Priority,
  type Run,
} from "@/lib/domain/types";
import { partyName, portName } from "@/lib/pipeline/normalize";
import { PRIORITY_ORDER } from "@/lib/pipeline/triage";
import { senderName, shortId } from "@/lib/utils";

/**
 * The inbox seen as SHIPMENTS instead of messages. A shipping documentation
 * desk thinks in bookings and OC numbers: "OC 5ALT-01226, Nantong to Karachi,
 * 6 x 40'HC". Every shipment-bearing email (a document check, a new SI, a
 * draft-BL request) becomes one card with its route, its load and its state.
 * Everything here is read from the documents or the email body; nothing is
 * invented.
 */

export type ShipmentState = "urgent" | "review" | "verified" | "prepare" | "awaiting";

export interface Shipment {
  /** OC number, booking or BL reference: whatever the email carried. */
  ref: string;
  emailId: string;
  state: ShipmentState;
  title: string;
  reason: string;
  pol: string | null;
  pod: string | null;
  containers: string | null;
  weight: string | null;
  vessel: string | null;
  consignee: string | null;
  sender: string;
  category: Category;
  priority: Priority;
  /** Classification confidence, 0..1, and who decided. */
  confidence: number;
  method: "ai" | "rules" | "human";
  reviewed: boolean;
}

function firstMatch(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  return match?.[1]?.trim() || null;
}

function lineValue(text: string, labels: string): string | null {
  return firstMatch(text, new RegExp(`^\\s*(?:${labels})[^:\\n]*:\\s*(.+)$`, "im"));
}

function refFor(result: EmailResult): string {
  const refs = result.triage.references;
  return (
    refs.find((reference) => reference.kind === "oc")?.value
    ?? refs.find((reference) => reference.kind === "booking")?.value
    ?? refs.find((reference) => reference.kind === "bl")?.value
    ?? `#${shortId(result.email.email_id)}`
  );
}

function fromCheck(result: EmailResult): Omit<Shipment, "state" | "title" | "reason"> {
  const check = result.check;
  const si = check?.documents.find((doc) => doc.kind === "SI" && doc.readable) ?? null;
  const bl = check?.documents.find((doc) => doc.kind === "BL" && doc.readable) ?? null;
  const reference = si ?? bl;
  const value = (key: keyof NonNullable<typeof reference>["fields"]) => {
    const found = reference?.fields[key];
    return found && !found.missing ? found.raw : null;
  };
  const docText = [si?.text, bl?.text].filter(Boolean).join("\n");
  const vessel =
    lineValue(docText, "ocean vessel|vessel name|vessel|export carrier") ?? firstMatch(docText, /^vessel\s+(.+)$/im);
  const oc = firstMatch(docText, /\bOC\s*NO\.?[:\s]+([0-9][A-Z]{3}-\d{5})/i);
  return {
    ref: oc ?? refFor(result),
    emailId: result.email.email_id,
    pol: value("port_of_loading"),
    pod: value("port_of_discharge"),
    containers: value("container_count"),
    weight: value("gross_weight_kg"),
    vessel: vessel ? vessel.replace(/\s+/g, " ").slice(0, 40) : null,
    consignee: value("consignee"),
    sender: senderName(result.email.from),
    category: result.classification.category,
    priority: result.triage.priority,
    confidence: result.classification.confidence,
    method: result.classification.method,
    reviewed: result.review !== null,
  };
}

function fromBody(result: EmailResult): Omit<Shipment, "state" | "title" | "reason"> {
  const body = result.email.body.split(/_{5,}/)[0] ?? "";
  const consigneeBlock = firstMatch(body, /consignee:\s*\n?\s*(.+)/i);
  return {
    ref: firstMatch(body, /instruction for\s+([0-9][A-Z]{3}-\d{5})/i) ?? refFor(result),
    emailId: result.email.email_id,
    pol: firstMatch(body, /^\s*POL\s*:\s*(.+)$/im),
    pod: firstMatch(body, /^\s*POD\s*:\s*(.+)$/im),
    containers: firstMatch(body, /\b(\d+\s*X\s*\d{2}'?\s?[A-Z]{2,3})\b/i),
    weight: firstMatch(body, /GROSS\s*WT\.?\s*:\s*([\d,.]+\s*KGS?)/i),
    vessel: firstMatch(`${result.email.subject}\n${body}`, /\b((?:[A-Z]+\s){1,3}\d{0,4}\s?V\.[A-Z0-9]{3,9})\b/),
    consignee: consigneeBlock ? partyName(consigneeBlock) : null,
    sender: senderName(result.email.from),
    category: result.classification.category,
    priority: result.triage.priority,
    confidence: result.classification.confidence,
    method: result.classification.method,
    reviewed: result.review !== null,
  };
}

export function shipmentFor(result: EmailResult): Shipment | null {
  const category = result.classification.category;
  if (category === "BL_COMPARISON") {
    const base = fromCheck(result);
    if (result.status === "MISMATCH") {
      const fields = result.defectFields.map((field) => FIELD_LABELS[field].toLowerCase());
      return {
        ...base,
        state: "urgent",
        title: "BL/SI mismatch",
        reason: `${fields.join(", ")} ${fields.length === 1 ? "differs" : "differ"} between SI and draft BL. Amend before the BL is finalised.`,
      };
    }
    if (result.status === "NEEDS_REVIEW") {
      return {
        ...base,
        state: "review",
        title: result.reviewReason ? REVIEW_REASON_LABELS[result.reviewReason] : "Needs review",
        reason: `${result.check?.reviewNote ?? "The check could not be completed."} Human review recommended.`,
      };
    }
    return { ...base, state: "verified", title: "Verified", reason: "All seven comparison fields matched." };
  }
  if (category === "SI_REQUEST") {
    return { ...fromBody(result), state: "prepare", title: "SI to prepare", reason: "New shipping instruction received. Prepare and submit to the carrier." };
  }
  if (category === "GENERAL" && /\b(send|share|provide)\b.*\bdraft (BL|B\/L)\b/i.test(result.email.body)) {
    return { ...fromBody(result), state: "awaiting", title: "Draft BL requested", reason: "The requester is waiting for the draft BL to check it." };
  }
  return null;
}

const STATE_ORDER: Record<ShipmentState, number> = { urgent: 0, review: 1, prepare: 2, awaiting: 3, verified: 4 };

export function buildShipments(run: Run): Shipment[] {
  return run.results
    .map(shipmentFor)
    .filter((shipment): shipment is Shipment => shipment !== null)
    .sort(
      (a, b) =>
        Number(a.reviewed) - Number(b.reviewed)
        || STATE_ORDER[a.state] - STATE_ORDER[b.state]
        || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
        || a.emailId.localeCompare(b.emailId),
    );
}

/** Clean display of a route end: drop the bracketed port code. */
export function routeEnd(value: string | null): string | null {
  return value === null ? null : portName(value);
}

export { CATEGORY_LABELS };
