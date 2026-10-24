import {
  CATEGORIES,
  CATEGORY_LABELS,
  FIELD_LABELS,
  REVIEW_REASON_LABELS,
  type Category,
  type EmailResult,
  type FieldKey,
  type Run,
} from "@/lib/domain/types";
import { PRIORITY_ORDER } from "@/lib/pipeline/triage";
import { senderName, shortId } from "@/lib/utils";

/**
 * The inbox as a tree the canvas can draw:
 *
 *   inbox (centre)
 *     -> five category hubs on a pentagon
 *       -> groups inside a category (Mismatch / Needs review / Clear, or the
 *          kind of request: "Missing GR", "Cancel invoice", a customer ...)
 *         -> emails (shown when the group is opened)
 *           -> for a document check: SI + BL -> verdict -> the seven fields
 *
 * Pure data: no positions, no React. Every node carries `atMs`, the moment in
 * the run it came to exist, so the replay can grow the map in order.
 */

export type NodeKind = "inbox" | "hub" | "group" | "email" | "doc" | "verdict" | "field" | "action";
export type Tone = "neutral" | "ok" | "bad" | "warn" | "muted";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  sublabel?: string;
  tone: Tone;
  count?: number;
  category?: Category;
  emailId?: string;
  field?: FieldKey;
  /** The hub this node hangs from (for layout wedges and hover). */
  hubId?: string;
  parentId?: string;
  /** Tree depth below the inbox: hub 1, group 2, email 3 ... */
  depth: number;
  atMs: number;
  /** Is this node's own branch open (groups, emails)? */
  expanded?: boolean;
  /** Urgent emails are drawn slightly larger. */
  urgent?: boolean;
  /** For a group: its emails, most urgent first. */
  memberIds?: string[];
}

export type EdgeKind = "spoke" | "branch" | "leaf" | "feeds" | "verdict" | "field";

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  tone: Tone;
}

export interface InboxGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphState {
  /** Groups whose emails are shown. */
  openGroups: ReadonlySet<string>;
  /** Emails whose documents/fields are shown. */
  openEmails: ReadonlySet<string>;
  /** Hide categories (legend filter). */
  hiddenCategories?: ReadonlySet<Category>;
}

export const HUB_ORDER: Category[] = [
  "BL_COMPARISON",
  "SI_REQUEST",
  "INVOICE_QUERY",
  "GENERAL",
  "SPAM",
];

export interface GroupKey {
  key: string;
  label: string;
  tone: Tone;
  /** Lower sorts first around the hub. */
  rank: number;
}

/** Which group an email belongs to inside its category. */
export function groupOf(result: EmailResult): GroupKey {
  const category = result.classification.category;
  const body = result.email.body;
  switch (category) {
    case "BL_COMPARISON":
      if (result.status === "MISMATCH") return { key: "mismatch", label: "Mismatch", tone: "bad", rank: 0 };
      if (result.status === "NEEDS_REVIEW") return { key: "review", label: "Needs review", tone: "warn", rank: 1 };
      return { key: "clear", label: "No mismatch", tone: "ok", rank: 2 };
    case "INVOICE_QUERY":
      if (/\bcancel\b/i.test(body)) return { key: "cancel", label: "Cancel invoice", tone: "neutral", rank: 0 };
      if (/\bGR\b/.test(body)) return { key: "gr", label: "Missing GR", tone: "neutral", rank: 1 };
      if (/\bD&D\b|detention|demurrage/i.test(body)) return { key: "dnd", label: "D&D charges", tone: "neutral", rank: 2 };
      return { key: "charges", label: "Charge queries", tone: "neutral", rank: 3 };
    case "SI_REQUEST": {
      const pod = body.match(/^\s*POD\s*:\s*(.+)$/im)?.[1];
      const country = pod?.split(",").pop()?.trim().toUpperCase();
      return country
        ? { key: `pod-${country.toLowerCase().replace(/[^a-z]+/g, "-")}`, label: `To ${titleCase(country)}`, tone: "neutral", rank: 5 }
        : { key: "other", label: "New SIs", tone: "neutral", rank: 9 };
    }
    case "GENERAL":
      if (/\b(send|share|provide)\b.*\bdraft (BL|B\/L)\b/i.test(body)) {
        return { key: "bl-requests", label: "Draft BL requests", tone: "neutral", rank: 0 };
      }
      if (/automated notification|no action required/i.test(body)) {
        return { key: "robots", label: "Robot notices", tone: "muted", rank: 3 };
      }
      if (/berthing|update summary|loading completed|outstanding BL/i.test(body)) {
        return { key: "reports", label: "Ops reports", tone: "muted", rank: 1 };
      }
      return { key: "notices", label: "Notices", tone: "muted", rank: 2 };
    case "SPAM":
      return { key: "quarantine", label: "Quarantined", tone: "muted", rank: 0 };
  }
}

function titleCase(text: string): string {
  return text.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export const hubId = (category: Category) => `hub:${category}`;
export const groupId = (category: Category, key: string) => `group:${category}:${key}`;
export const emailNodeId = (emailId: string) => `email:${emailId}`;

function emailTone(result: EmailResult): Tone {
  if (result.failure !== null) return "bad";
  if (result.classification.category === "BL_COMPARISON") {
    if (result.status === "MISMATCH") return "bad";
    if (result.status === "NEEDS_REVIEW") return "warn";
    return "ok";
  }
  if (result.classification.disagreement) return "warn";
  if (result.classification.category === "SPAM") return "muted";
  return "neutral";
}

const FIELD_ORDER: FieldKey[] = [
  "shipper",
  "consignee",
  "notify_party",
  "port_of_loading",
  "port_of_discharge",
  "container_count",
  "gross_weight_kg",
];

export function buildInboxGraph(run: Run, state: GraphState): InboxGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const hidden = state.hiddenCategories ?? new Set<Category>();

  nodes.push({
    id: "inbox",
    kind: "inbox",
    label: run.source.kind === "gmail" ? "Mailbox" : "Inbox",
    sublabel: run.source.label,
    tone: "neutral",
    count: run.results.length,
    depth: 0,
    atMs: 0,
  });

  // Group results: category -> group key -> results (most urgent first).
  const byCategory = new Map<Category, Map<string, { group: GroupKey; results: EmailResult[] }>>();
  for (const category of CATEGORIES) byCategory.set(category, new Map());
  for (const result of run.results) {
    const groups = byCategory.get(result.classification.category)!;
    const group = groupOf(result);
    const entry = groups.get(group.key) ?? { group, results: [] };
    entry.results.push(result);
    groups.set(group.key, entry);
  }

  for (const category of HUB_ORDER) {
    if (hidden.has(category)) continue;
    const groups = byCategory.get(category)!;
    const all = [...groups.values()].flatMap((entry) => entry.results);
    const hub = hubId(category);
    const firstAt = all.reduce((min, result) => Math.min(min, result.doneAtMs), Number.POSITIVE_INFINITY);
    const hubTone: Tone =
      category === "BL_COMPARISON" && all.some((result) => result.status === "MISMATCH")
        ? "bad"
        : category === "SPAM"
          ? "muted"
          : "neutral";
    nodes.push({
      id: hub,
      kind: "hub",
      label: CATEGORY_LABELS[category],
      tone: hubTone,
      count: all.length,
      category,
      hubId: hub,
      parentId: "inbox",
      depth: 1,
      atMs: Number.isFinite(firstAt) ? firstAt : 0,
    });
    edges.push({ id: `inbox->${hub}`, from: "inbox", to: hub, kind: "spoke", tone: "neutral" });

    // SI requests split by destination country can get long: keep the six
    // biggest destinations and fold the rest into "Other destinations".
    let entries = [...groups.values()].sort(
      (a, b) => a.group.rank - b.group.rank || b.results.length - a.results.length,
    );
    if (category === "SI_REQUEST" && entries.length > 6) {
      const kept = entries.slice(0, 5);
      const rest = entries.slice(5);
      kept.push({
        group: { key: "other", label: "Other destinations", tone: "neutral", rank: 9 },
        results: rest.flatMap((entry) => entry.results),
      });
      entries = kept;
    }

    for (const { group, results } of entries) {
      const gid = groupId(category, group.key);
      const open = state.openGroups.has(gid);
      const sorted = [...results].sort(
        (a, b) =>
          PRIORITY_ORDER[a.triage.priority] - PRIORITY_ORDER[b.triage.priority]
          || a.email.email_id.localeCompare(b.email.email_id),
      );
      nodes.push({
        id: gid,
        kind: "group",
        label: group.label,
        tone: group.tone,
        count: results.length,
        category,
        hubId: hub,
        parentId: hub,
        depth: 2,
        atMs: sorted.reduce((min, result) => Math.min(min, result.doneAtMs), Number.POSITIVE_INFINITY),
        expanded: open,
        memberIds: sorted.map((result) => result.email.email_id),
      });
      edges.push({ id: `${hub}->${gid}`, from: hub, to: gid, kind: "branch", tone: group.tone === "bad" ? "bad" : "neutral" });
      if (!open) continue;

      for (const result of sorted) {
        addEmail(result, gid, hub, category, state, nodes, edges);
      }
    }
  }

  return { nodes, edges };
}

function addEmail(
  result: EmailResult,
  parent: string,
  hub: string,
  category: Category,
  state: GraphState,
  nodes: GraphNode[],
  edges: GraphEdge[],
): void {
  const id = emailNodeId(result.email.email_id);
  const open = state.openEmails.has(result.email.email_id);
  const tone = emailTone(result);
  nodes.push({
    id,
    kind: "email",
    label: shortId(result.email.email_id),
    sublabel: `${senderName(result.email.from)}: ${result.email.subject}`,
    tone,
    category,
    emailId: result.email.email_id,
    hubId: hub,
    parentId: parent,
    depth: 3,
    atMs: result.doneAtMs,
    expanded: open,
    urgent: result.triage.priority === "critical" || result.triage.priority === "high",
  });
  edges.push({ id: `${parent}->${id}`, from: parent, to: id, kind: "leaf", tone: tone === "bad" ? "bad" : "neutral" });
  if (!open) return;

  const at = result.doneAtMs;
  const check = result.check;
  if (check === null) {
    const actionId = `${id}:action`;
    nodes.push({
      id: actionId,
      kind: "action",
      label: "Next action",
      sublabel: result.triage.action,
      tone: result.triage.priority === "critical" ? "bad" : result.triage.priority === "high" ? "warn" : "neutral",
      emailId: result.email.email_id,
      hubId: hub,
      parentId: id,
      depth: 4,
      atMs: at,
    });
    edges.push({ id: `${id}->${actionId}`, from: id, to: actionId, kind: "verdict", tone: "neutral" });
    return;
  }

  const verdictId = `${id}:verdict`;
  const verdictTone: Tone = check.status === "OK" ? "ok" : check.status === "MISMATCH" ? "bad" : "warn";
  nodes.push({
    id: verdictId,
    kind: "verdict",
    label: check.status === "OK" ? "Clear" : check.status === "MISMATCH" ? `${check.defectFields.length} differ` : "Review",
    sublabel:
      check.status === "NEEDS_REVIEW" && check.reviewReason !== null
        ? REVIEW_REASON_LABELS[check.reviewReason]
        : check.summary,
    tone: verdictTone,
    emailId: result.email.email_id,
    hubId: hub,
    parentId: id,
    depth: 5,
    atMs: at,
  });

  for (const doc of check.documents.slice(0, 3)) {
    const docId = `${id}:doc:${doc.path}`;
    const role = doc.kind === "SI" || doc.kind === "BL" ? doc.kind : doc.claimedRole ?? "DOC";
    nodes.push({
      id: docId,
      kind: "doc",
      label: role,
      sublabel: doc.fileName,
      tone: !doc.readable ? "warn" : doc.kind === "SI" || doc.kind === "BL" ? "neutral" : "warn",
      emailId: result.email.email_id,
      hubId: hub,
      parentId: id,
      depth: 4,
      atMs: at,
    });
    edges.push({ id: `${id}->${docId}`, from: id, to: docId, kind: "leaf", tone: "neutral" });
    edges.push({ id: `${docId}->${verdictId}`, from: docId, to: verdictId, kind: "feeds", tone: "neutral" });
  }
  if (check.documents.length === 0) {
    edges.push({ id: `${id}->${verdictId}`, from: id, to: verdictId, kind: "verdict", tone: verdictTone });
  }

  const comparisons = new Map(check.fields.map((comparison) => [comparison.field, comparison]));
  for (const field of FIELD_ORDER) {
    const comparison = comparisons.get(field);
    if (comparison === undefined) continue;
    const fieldId = `${id}:field:${field}`;
    const fieldTone: Tone = comparison.outcome === "match" ? "ok" : comparison.outcome === "mismatch" ? "bad" : "warn";
    nodes.push({
      id: fieldId,
      kind: "field",
      label: FIELD_LABELS[field],
      sublabel: comparison.note,
      tone: fieldTone,
      field,
      emailId: result.email.email_id,
      hubId: hub,
      parentId: verdictId,
      depth: 6,
      atMs: at,
    });
    edges.push({ id: `${verdictId}->${fieldId}`, from: verdictId, to: fieldId, kind: "field", tone: fieldTone });
  }
}

/** Nodes and edges that exist at replay time t (ms since the run started). */
export function visibleAt(graph: InboxGraph, t: number | null): InboxGraph {
  if (t === null) return graph;
  const nodes = graph.nodes.filter((node) => node.atMs <= t);
  const ids = new Set(nodes.map((node) => node.id));
  return { nodes, edges: graph.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)) };
}

/** The default map: every hub and group, with the urgent groups opened. */
export function defaultOpenGroups(run: Run): Set<string> {
  // The document check, opened: mismatch, needs review and no mismatch side by
  // side. Every other queue stays folded until the reader opens it.
  const open = new Set<string>();
  const checks = run.results.filter((result) => result.classification.category === "BL_COMPARISON");
  if (checks.some((result) => result.status === "MISMATCH")) open.add(groupId("BL_COMPARISON", "mismatch"));
  if (checks.some((result) => result.status === "NEEDS_REVIEW")) open.add(groupId("BL_COMPARISON", "review"));
  if (checks.some((result) => result.status !== "MISMATCH" && result.status !== "NEEDS_REVIEW")) {
    open.add(groupId("BL_COMPARISON", "clear"));
  }
  return open;
}
