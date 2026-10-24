import {
  FIELD_KEYS,
  type ExtractedValue,
  type FieldKey,
  type FieldMap,
} from "@/lib/domain/types";
import { displayValue, isPlaceholder, normalizeValue } from "@/lib/pipeline/normalize";

/**
 * Field extraction by MEANING, not by header text. Every document family in
 * the inbox labels the seven fields differently ("Port of Loading", "Load
 * Port", "POL", "PORT OF LOADING (装货港)"); each label is reduced to a
 * canonical key first, then matched against these patterns.
 */
const LABEL_PATTERNS: Array<[FieldKey, RegExp]> = [
  ["notify_party", /^(also )?notify( party| parties)?( ?\/ ?intermediate consignee)?$/],
  ["consignee", /^(consignee|consigned to|to the order of|to order of|to order)$/],
  ["shipper", /^(shipper|shipper ?\/ ?exporter|shipper ?\/ ?consignor|consignor|exporter)$/],
  ["port_of_loading", /^(port of loading|port of load|load port|loading port|pol)$/],
  [
    "port_of_discharge",
    /^(port of discharge|port of discharging|discharge port|discharging port|pod)$/,
  ],
  [
    "container_count",
    /^(total )?(container count|containers|no\.? of containers( or packages)?|number of containers|total no\.? of containers|qty of containers|container qty|cntr count|containers? total)$/,
  ],
  // "Gross Weightnn(KGS)": a PDF font turned 毛重 into junk letters.
  ["gross_weight_kg", /^(total )?(gross (weight|wt)[a-z]{0,3}\.?|g\.? ?w\.?)( kgs?)?$/],
];

/** "Port of Loading (POL)" -> "port of loading"; drops CJK and brackets. */
export function canonicalLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/[^a-z0-9/. ]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[ .]+$/, "")
    .trim();
}

export function fieldForLabel(label: string): FieldKey | null {
  const key = canonicalLabel(label);
  if (key === "") return null;
  for (const [field, pattern] of LABEL_PATTERNS) {
    if (pattern.test(key)) return field;
  }
  return null;
}

/**
 * Lines with no colon ("Shipper APRIL FINE PAPER TRADING", as PDF text comes
 * out) are split on a known label prefix. Longest phrases first, so "Notify
 * Party" wins over "Notify" and "Port of Discharge (POD)" keeps its bracket.
 */
const PREFIX_LABELS = [
  "notify party/intermediate consignee",
  "shipper (principal or seller)",
  "consignee (non-negotiable)",
  "port of discharge (pod)",
  "port of loading (pol)",
  "no. of containers or packages",
  "total gross weight (kg)",
  "gross weight (kgs)",
  "gross weight (kg)",
  "gross wt (kgs)",
  "no. of containers",
  "number of containers",
  "total containers",
  "container count",
  "port of discharge",
  "port of loading",
  "shipper/exporter",
  "to the order of",
  "discharge port",
  "gross weight",
  "notify party",
  "load port",
  "consignee",
  "shipper",
  "notify",
  "pol",
  "pod",
].sort((a, b) => b.length - a.length);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

const PREFIX_REGEX = new RegExp(
  `^(${PREFIX_LABELS.map(escapeRegExp).join("|")})(\\s*\\([^)]*\\))*(?=\\s|$)`,
  "i",
);

/**
 * PDF text sometimes glues the label to its value ("Intermediate
 * ConsigneeCERIEX"). Accept that only where the case changes at the seam
 * (label ends lower-case, value starts upper-case), so real words are never cut.
 */
const GLUED_PREFIX_REGEX = new RegExp(
  `^(${PREFIX_LABELS.filter((label) => label.length >= 7).map(escapeRegExp).join("|")})(?=[A-Z0-9])`,
  "i",
);

function gluedPrefix(line: string): string | null {
  const match = line.match(GLUED_PREFIX_REGEX);
  if (!match) return null;
  const label = match[0];
  const last = label[label.length - 1] ?? "";
  const next = line[label.length] ?? "";
  return /[a-z)]/.test(last) && /[A-Z0-9]/.test(next) ? label : null;
}

export interface LabelledLine {
  label: string;
  value: string;
  hadColon: boolean;
}

/** Split one line into label and value, or null when it carries no label. */
export function splitLabelled(line: string): LabelledLine | null {
  if (/^\s/.test(line)) return null; // an indented continuation line
  const trimmed = line.trim();
  if (trimmed === "") return null;
  const colon = trimmed.indexOf(":");
  if (colon > 0 && colon <= 60) {
    const label = trimmed.slice(0, colon);
    if (fieldForLabel(label) !== null) {
      return { label: label.trim(), value: trimmed.slice(colon + 1).trim(), hadColon: true };
    }
  }
  // The longer reading wins: "Notify Party/Intermediate ConsigneeCERIEX"
  // must not split after "Notify".
  const spaced = trimmed.match(PREFIX_REGEX)?.[0] ?? null;
  const glued = gluedPrefix(trimmed);
  const prefix = glued !== null && (spaced === null || glued.length > spaced.length) ? glued : spaced;
  if (prefix) {
    const label = prefix;
    const rest = trimmed.slice(label.length).replace(/^\s*[:\-–]?\s*/, "");
    if (fieldForLabel(label) !== null) {
      return { label: label.trim(), value: rest.trim(), hadColon: false };
    }
  }
  return null;
}

function isLabelLine(line: string): boolean {
  return splitLabelled(line) !== null;
}

/** Build an extracted value from printed text (parser, vision or a person). */
export function makeValue(
  field: FieldKey,
  raw: string,
  label: string | null,
  evidence: string | null,
  source: ExtractedValue["source"] = "parser",
): ExtractedValue {
  const missing = isPlaceholder(raw);
  const normalized = missing ? null : normalizeValue(field, raw);
  return {
    raw: missing ? (raw.trim() === "" ? null : raw.trim()) : displayValue(field, raw),
    normalized,
    evidence: evidence?.trim() ?? null,
    label,
    source,
    missing: missing || normalized === null,
  };
}

/** Container IDs (ISO 6346: 4 letters + 7 digits), used when no count line. */
const CONTAINER_ID = /\b[A-Z]{3}[UJZ]\d{7}\b|\b[A-Z]{4}\d{7}\b/g;

/**
 * Extract the seven fields from a document's lines. Only the FIRST value per
 * field is used, except that a "TOTAL ..." line beats an earlier per-row one.
 */
export function extractFields(lines: string[]): FieldMap {
  const fields: FieldMap = {};
  const totals = new Set<FieldKey>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const parsed = splitLabelled(line);
    if (parsed === null) continue;
    const field = fieldForLabel(parsed.label);
    if (field === null) continue;

    let value = parsed.value;
    let evidence = line;
    // "Label" alone on its line, value on the next (tables, some PDFs). A
    // "Label:" with nothing after it is a BLANK, never a borrowed next line.
    if (value === "" && !parsed.hadColon) {
      const next = lines[index + 1];
      if (next !== undefined && next.trim() !== "" && !isLabelLine(next)) {
        value = next.trim();
        evidence = `${line.trim()} ${next.trim()}`;
      }
    }

    const isTotal = /^total\b/i.test(parsed.label);
    const existing = fields[field];
    if (existing !== undefined && !(isTotal && !totals.has(field))) continue;
    fields[field] = makeValue(field, value, parsed.label, evidence);
    if (isTotal) totals.add(field);
  }

  if (fields.container_count === undefined) {
    const ids = new Set<string>();
    for (const line of lines) {
      for (const match of line.toUpperCase().matchAll(CONTAINER_ID)) ids.add(match[0]);
    }
    if (ids.size > 0) {
      fields.container_count = {
        raw: `${ids.size} (counted container numbers)`,
        normalized: ids.size,
        evidence: [...ids].join(", "),
        label: "container list",
        source: "parser",
        missing: false,
      };
    }
  }

  return fields;
}

export function countFound(fields: FieldMap): number {
  return FIELD_KEYS.filter((key) => fields[key] !== undefined).length;
}
