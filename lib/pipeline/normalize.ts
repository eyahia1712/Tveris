import type { FieldKey } from "@/lib/domain/types";

/**
 * Turning printed values into comparable ones. The rule for every field: a
 * formatting difference must never become a mismatch (131,058 KG equals
 * 131058; "SINGAPORE, SINGAPORE (SGSIN)" equals "SINGAPORE"), and a blank
 * must never be guessed (N/A, TBA, ____MT and ??? are MISSING, not values).
 */

const PLACEHOLDER_WORDS =
  /^(n\/?a|na|tba|tbc|tbd|tba\/tbc|nil|none|null|unknown|pending|to be advised|to be confirmed|not applicable|see attached|as per si)$/i;

/** Unit words that can trail a blank ("____MT", "??? MTS"). */
const UNIT_WORDS = /\b(mts?|kgs?|kilos?|tons?|tonnes?|lbs?|x|containers?|cntrs?|units?)\b/gi;

export function isPlaceholder(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined) return true;
  const text = raw.trim();
  if (text === "") return true;
  if (PLACEHOLDER_WORDS.test(text)) return true;
  // Strip unit words and see whether anything real is left: "____MT",
  // "_______ MTS", "??? MTS", "--", "..." are blanks the customer never filled.
  // Underscores are word characters to \b, so they go first: "____MT" -> " MT".
  const stripped = text
    .replace(/_+/g, " ")
    .replace(UNIT_WORDS, "")
    .replace(/[\s?.\-–—*#/]+/g, "");
  return stripped === "";
}

/** The first line of a party block: the name, without the address. */
export function partyName(raw: string): string {
  const firstLine = raw.split(/\r?\n/)[0] ?? "";
  // Spreadsheets pack "NAME | address; address" into one cell.
  const name = firstLine.split(/\s+\|\s+|\s*;\s*/)[0] ?? "";
  return name.replace(/\s+/g, " ").trim();
}

export function normalizeParty(raw: string): string {
  return partyName(raw)
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[.,'"`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A UN/LOCODE in brackets at the end: "(CNNTG)". Codes are not compared. */
const TRAILING_LOCODE = /\s*\(\s*[A-Z]{2}\s?[A-Z0-9]{3}\s*\)\s*$/;

export function portName(raw: string): string {
  const firstLine = raw.split(/\r?\n/)[0] ?? "";
  return firstLine.replace(TRAILING_LOCODE, "").replace(/\s+/g, " ").trim();
}

/**
 * Canonical port for comparison. The bracketed UN/LOCODE is dropped on
 * purpose: in this data a wrong port keeps the SI's code, so comparing codes
 * would hide real discrepancies, and a missing code is only formatting.
 */
export function normalizePort(raw: string): string {
  const parts = portName(raw)
    .toUpperCase()
    .split(",")
    .map((part) => part.replace(/[^A-Z0-9/() ]/g, " ").replace(/\s+/g, " ").trim())
    .filter((part) => part !== "");
  // "SINGAPORE, SINGAPORE" and "SINGAPORE" are the same port.
  const deduped: string[] = [];
  for (const part of parts) {
    if (deduped[deduped.length - 1] !== part) deduped.push(part);
  }
  return deduped.join(", ");
}

/**
 * Two ports are the same when their canonical forms agree, or when one side
 * omits the country and the cities agree ("NANTONG" vs "NANTONG, CHINA").
 */
export function samePort(a: string, b: string): boolean {
  const left = normalizePort(a);
  const right = normalizePort(b);
  if (left === right) return true;
  const squash = (value: string) => value.replace(/[^A-Z0-9]/g, "");
  if (squash(left) === squash(right)) return true;
  const leftParts = left.split(", ");
  const rightParts = right.split(", ");
  if (leftParts.length === 1 || rightParts.length === 1) {
    return squash(leftParts[0] ?? "") === squash(rightParts[0] ?? "");
  }
  return false;
}

const NUMBER_WORDS: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8,
  NINE: 9, TEN: 10, ELEVEN: 11, TWELVE: 12, THIRTEEN: 13, FOURTEEN: 14,
  FIFTEEN: 15, SIXTEEN: 16, SEVENTEEN: 17, EIGHTEEN: 18, NINETEEN: 19,
  TWENTY: 20,
};

/**
 * Number of containers: "6 x 40'HC" -> 6, "3 x 20'GP + 2 x 40'HC" -> 5,
 * "SIX (6) CONTAINERS" -> 6. Null when no count can be read.
 */
export function parseContainerCount(raw: string): number | null {
  const text = raw.toUpperCase();
  const multiplied = [...text.matchAll(/(\d+)\s*[X×*]\s*\d{2}/g)];
  if (multiplied.length > 0) {
    return multiplied.reduce((sum, match) => sum + Number(match[1]), 0);
  }
  const bracketed = text.match(/\((\d+)\)/);
  if (bracketed) return Number(bracketed[1]);
  const leading = text.match(/^\s*(\d+)\b/);
  if (leading) return Number(leading[1]);
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) return value;
  }
  const any = text.match(/\b(\d+)\b/);
  return any ? Number(any[1]) : null;
}

/** Parse "131,058", "131.058,5", "131058.00" into a number. */
export function parseLooseNumber(token: string): number | null {
  const cleaned = token.replace(/\s/g, "");
  if (!/\d/.test(cleaned)) return null;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  let normalized = cleaned;
  if (hasComma && hasDot) {
    // The later separator is the decimal one.
    const decimal = cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".") ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    normalized = cleaned.split(thousands).join("").replace(decimal, ".");
  } else if (hasComma) {
    normalized = /^\d{1,3}(,\d{3})+$/.test(cleaned)
      ? cleaned.replace(/,/g, "")
      : cleaned.replace(",", ".");
  } else if (hasDot) {
    normalized = /^\d{1,3}(\.\d{3}){2,}$/.test(cleaned)
      ? cleaned.replace(/\./g, "")
      : cleaned;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/**
 * Gross weight in kilograms. Understands KG/KGS (default), MT/TONS and LBS.
 * A single dotted group like "131.058 KG" reads as thousands: a six-container
 * shipment does not weigh 131 kg.
 */
export function parseWeightKg(raw: string): number | null {
  const text = raw.toUpperCase();
  const match = text.match(/\d[\d.,\s]*\d|\d/);
  if (!match) return null;
  const token = match[0].trim();
  const unitText = text.slice((match.index ?? 0) + match[0].length);
  const isTonnes = /\b(MT|MTS|TON|TONS|TONNE|TONNES)\b/.test(unitText);
  const isPounds = /\b(LB|LBS|POUNDS?)\b/.test(unitText);
  let value = parseLooseNumber(token);
  if (value === null) return null;
  if (!isTonnes && !isPounds && /^\d{1,3}\.\d{3}$/.test(token)) {
    value = Number(token.replace(".", ""));
  }
  if (isTonnes) value *= 1000;
  if (isPounds) value *= 0.45359237;
  return Math.round(value * 1000) / 1000;
}

/** Two weights agree within 1 kg or 0.01%, whichever is larger (rounding). */
export function sameWeight(a: number, b: number): boolean {
  const tolerance = Math.max(1, Math.max(Math.abs(a), Math.abs(b)) * 0.0001);
  return Math.abs(a - b) <= tolerance;
}

export function normalizeValue(
  field: FieldKey,
  raw: string,
): string | number | null {
  if (isPlaceholder(raw)) return null;
  switch (field) {
    case "shipper":
    case "consignee":
    case "notify_party": {
      const name = normalizeParty(raw);
      return isPlaceholder(name) ? null : name;
    }
    case "port_of_loading":
    case "port_of_discharge": {
      const port = normalizePort(raw);
      return isPlaceholder(port) ? null : port;
    }
    case "container_count":
      return parseContainerCount(raw);
    case "gross_weight_kg":
      return parseWeightKg(raw);
  }
}

/** The printable form of a value: the party name, the port, the count ... */
export function displayValue(field: FieldKey, raw: string): string {
  switch (field) {
    case "shipper":
    case "consignee":
    case "notify_party":
      return partyName(raw);
    case "port_of_loading":
    case "port_of_discharge":
      return (raw.split(/\r?\n/)[0] ?? "").trim();
    default:
      return raw.replace(/\s+/g, " ").trim();
  }
}

export function sameValue(
  field: FieldKey,
  a: string | number,
  b: string | number,
  rawA: string,
  rawB: string,
): boolean {
  switch (field) {
    case "port_of_loading":
    case "port_of_discharge":
      return samePort(rawA, rawB);
    case "gross_weight_kg":
      return typeof a === "number" && typeof b === "number" && sameWeight(a, b);
    case "container_count":
      return a === b;
    default:
      return a === b;
  }
}
