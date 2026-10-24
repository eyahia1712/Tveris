import {
  CATEGORY_LABELS,
  FIELD_KEYS,
  FIELD_LABELS,
  type Category,
  type EmailResult,
  type Priority,
  type Run,
  type Status,
} from "@/lib/domain/types";
import { buildShipments, routeEnd, type Shipment, type ShipmentState } from "@/lib/domain/shipments";
import { senderName } from "@/lib/utils";

/**
 * Everything the landing dashboard shows, computed once on the server from a
 * run: the urgent tasks, the next-week plan, the shipment cards, the search
 * index and the AI verification statistics. The client only filters.
 */

export type TaskTier = "urgent" | "due" | "followup";

export interface Task {
  tier: TaskTier;
  emailId: string;
  ref: string;
  title: string;
  detail: string;
}

export interface TierSummary {
  tier: TaskTier;
  label: string;
  headline: string;
  count: number;
  tasks: Task[];
}

export interface PlanDay {
  date: string;
  label: string;
  total: number;
  urgent: number;
  due: number;
  followup: number;
  focus: string;
}

export interface SearchRow {
  id: string;
  subject: string;
  sender: string;
  from: string;
  category: Category;
  status: Status;
  priority: Priority;
  action: string;
  refs: string[];
  route: string | null;
  vessel: string | null;
  consignee: string | null;
  confidence: number;
  method: "ai" | "rules" | "human";
  statusLabel: string;
  /** A person has already signed this one off. */
  reviewed: boolean;
}

export interface AiStats {
  enabled: boolean;
  model: string | null;
  classified: number;
  byMethod: { ai: number; rules: number; human: number };
  averageConfidence: number;
  lowConfidence: number;
  disagreements: number;
  documents: { total: number; text: number; office: number; pdf: number; vision: number; unreadable: number };
  fieldsExtracted: number;
  fieldsByAi: number;
  fieldsCompared: number;
  discrepancies: number;
  humanReview: number;
  reviewed: number;
}

export interface Overview {
  runId: string;
  sourceLabel: string;
  finishedAt: string | null;
  total: number;
  counts: {
    shipments: number;
    urgent: number;
    review: number;
    verified: number;
    prepare: number;
    awaiting: number;
    pendingAi: number;
  };
  tiers: TierSummary[];
  plan: PlanDay[];
  shipments: Shipment[];
  search: SearchRow[];
  ai: AiStats;
  /** How often each of the seven fields is the one that differs. */
  defectsByField: Array<{ field: string; label: string; count: number }>;
}

const TIER_OF: Partial<Record<ShipmentState, TaskTier>> = {
  urgent: "urgent",
  prepare: "due",
  verified: "due",
  review: "followup",
  awaiting: "followup",
};

function taskFor(shipment: Shipment): Task | null {
  const tier = TIER_OF[shipment.state];
  if (tier === undefined || shipment.reviewed) return null;
  const route = [routeEnd(shipment.pol), routeEnd(shipment.pod)].filter(Boolean).join(" → ");
  const detailByState: Record<ShipmentState, string> = {
    urgent: shipment.reason,
    review: shipment.reason,
    prepare: `Shipping instruction verification${route ? ` · ${route}` : ""}${shipment.containers ? ` · ${shipment.containers}` : ""}`,
    verified: `Confirm the draft BL to the requester${route ? ` · ${route}` : ""}`,
    awaiting: "Send the draft BL so the requester can check it.",
  };
  return {
    tier,
    emailId: shipment.emailId,
    ref: shipment.ref,
    title: shipment.title,
    detail: detailByState[shipment.state],
  };
}

function statusLabel(result: EmailResult): string {
  if (result.classification.category !== "BL_COMPARISON") return CATEGORY_LABELS[result.classification.category];
  if (result.status === "MISMATCH") return "Mismatch";
  if (result.status === "NEEDS_REVIEW") return "Needs review";
  return "Verified";
}

/** The next five working days from `today` (the desk's week ahead). */
function workingDays(today: Date, count: number): Date[] {
  const days: Date[] = [];
  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  while (days.length < count) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(new Date(cursor));
  }
  return days;
}

/**
 * A suggested plan for the next working week: urgent work first, then
 * follow-ups, then due work, spread by a daily capacity. The sample inbox
 * carries no ship dates, so this is a workload plan, labelled as such.
 */
function planWeek(tasks: Task[], today: Date, capacity = 40): PlanDay[] {
  const order: TaskTier[] = ["urgent", "followup", "due"];
  const queue = [...tasks].sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier));
  const days = workingDays(today, 5);
  const perDay = Math.max(capacity, Math.ceil(queue.length / days.length));
  return days.map((date, index) => {
    const slice = queue.slice(index * perDay, (index + 1) * perDay);
    const count = (tier: TaskTier) => slice.filter((task) => task.tier === tier).length;
    const urgent = count("urgent");
    const followup = count("followup");
    const due = count("due");
    return {
      date: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" }),
      total: slice.length,
      urgent,
      due,
      followup,
      focus:
        urgent > 0
          ? "Clear BL/SI mismatches before BLs are issued"
          : followup > 0
            ? "Chase missing documents and human reviews"
            : due > 0
              ? "Verify and submit shipping instructions"
              : "Buffer for new mail",
    };
  });
}

function aiStats(run: Run): AiStats {
  const results = run.results;
  const byMethod = { ai: 0, rules: 0, human: 0 };
  let confidence = 0;
  let low = 0;
  const documents = { total: 0, text: 0, office: 0, pdf: 0, vision: 0, unreadable: 0 };
  let fieldsExtracted = 0;
  let fieldsByAi = 0;
  let fieldsCompared = 0;
  let discrepancies = 0;
  for (const result of results) {
    byMethod[result.classification.method] += 1;
    confidence += result.classification.confidence;
    if (result.classification.confidence < 0.7 || result.classification.disagreement) low += 1;
    for (const doc of result.check?.documents ?? []) {
      documents.total += 1;
      if (!doc.readable) documents.unreadable += 1;
      else if (doc.readMethod === "vision") documents.vision += 1;
      else if (doc.readMethod === "pdf-text") documents.pdf += 1;
      else if (doc.readMethod === "docx" || doc.readMethod === "xlsx") documents.office += 1;
      else documents.text += 1;
      for (const key of FIELD_KEYS) {
        const value = doc.fields[key];
        if (value === undefined) continue;
        fieldsExtracted += 1;
        if (value.source === "ai" || value.source === "vision") fieldsByAi += 1;
      }
    }
    for (const field of result.check?.fields ?? []) {
      if (field.outcome !== "missing") fieldsCompared += 1;
      if (field.outcome === "mismatch") discrepancies += 1;
    }
  }
  return {
    enabled: run.ai.enabled,
    model: run.ai.model,
    classified: results.length,
    byMethod,
    averageConfidence: results.length === 0 ? 0 : confidence / results.length,
    lowConfidence: low,
    disagreements: run.summary.disagreements,
    documents,
    fieldsExtracted,
    fieldsByAi,
    fieldsCompared,
    discrepancies,
    humanReview: results.filter((result) => result.status === "NEEDS_REVIEW" && result.review === null).length,
    reviewed: results.filter((result) => result.review !== null).length,
  };
}

export function buildOverview(run: Run, today: Date): Overview {
  const shipments = buildShipments(run);
  const tasks = shipments.map(taskFor).filter((task): task is Task => task !== null);
  // Classifications the AI and the rules disagreed on need a person too.
  for (const result of run.results) {
    if (result.classification.disagreement && result.review === null) {
      tasks.push({
        tier: "followup",
        emailId: result.email.email_id,
        ref: `#${result.email.email_id.replace(/^email_/, "")}`,
        title: "Confirm classification",
        detail: `AI said ${result.classification.aiCategory ?? "?"}, rules said ${result.classification.rulesCategory}. Confirm the category.`,
      });
    }
  }
  const tier = (key: TaskTier) => tasks.filter((task) => task.tier === key);
  const tiers: TierSummary[] = [
    {
      tier: "urgent",
      label: "Urgent",
      headline: "BL/SI mismatch requires review",
      count: tier("urgent").length,
      tasks: tier("urgent").slice(0, 6),
    },
    {
      tier: "due",
      label: "Due next week",
      headline: "Shipping instruction verification",
      count: tier("due").length,
      tasks: tier("due").slice(0, 6),
    },
    {
      tier: "followup",
      label: "Follow-up",
      headline: "Missing attachment / human review",
      count: tier("followup").length,
      tasks: tier("followup").slice(0, 6),
    },
  ];

  const shipmentByEmail = new Map(shipments.map((shipment) => [shipment.emailId, shipment]));
  const search: SearchRow[] = run.results.map((result) => {
    const shipment = shipmentByEmail.get(result.email.email_id);
    return {
      id: result.email.email_id,
      subject: result.email.subject,
      sender: senderName(result.email.from),
      from: result.email.from,
      category: result.classification.category,
      status: result.status,
      priority: result.triage.priority,
      action: result.triage.action,
      refs: [...new Set([...(shipment ? [shipment.ref] : []), ...result.triage.references.map((reference) => reference.value)])],
      route: shipment ? [routeEnd(shipment.pol), routeEnd(shipment.pod)].filter(Boolean).join(" → ") || null : null,
      vessel: shipment?.vessel ?? null,
      consignee: shipment?.consignee ?? null,
      confidence: result.classification.confidence,
      method: result.classification.method,
      statusLabel: statusLabel(result),
      reviewed: result.review !== null,
    };
  });

  const count = (state: ShipmentState) => shipments.filter((shipment) => shipment.state === state && !shipment.reviewed).length;
  return {
    runId: run.id,
    sourceLabel: run.source.label,
    finishedAt: run.finishedAt,
    total: run.results.length,
    counts: {
      shipments: shipments.length,
      urgent: count("urgent"),
      review: count("review"),
      verified: shipments.filter((shipment) => shipment.state === "verified").length,
      prepare: count("prepare"),
      awaiting: count("awaiting"),
      pendingAi: count("review") + run.summary.disagreements,
    },
    tiers,
    plan: planWeek(tasks, today),
    shipments,
    search,
    ai: aiStats(run),
    defectsByField: defectsByField(run),
  };
}

/** Which of the seven fields goes wrong most often, worst first. */
function defectsByField(run: Run): Array<{ field: string; label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const result of run.results) {
    for (const field of result.defectFields) counts.set(field, (counts.get(field) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([field, count]) => ({ field, label: FIELD_LABELS[field as keyof typeof FIELD_LABELS], count }))
    .sort((a, b) => b.count - a.count);
}
