import { FIELD_LABELS, type DocumentCheck, type ExtractedValue, type FieldComparison } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/**
 * SI vs BL, side by side. The SI is the reference, so it comes first; a
 * differing row is red on both sides, a blank value is amber, and every value
 * shows where it came from (the source line, or who typed it).
 */
export function FieldTable({ check, compact = false }: { check: DocumentCheck; compact?: boolean }) {
  if (check.fields.length === 0) return null;
  return (
    <div className="overflow-x-auto border border-border bg-card">
      <table className="w-full min-w-[420px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-border bg-surface">
            <th className="xv-micro xv-micro-sm w-[30%] px-3 py-2 font-medium text-muted-foreground">Field</th>
            <th className="xv-micro xv-micro-sm px-3 py-2 font-medium text-muted-foreground">SI (reference)</th>
            <th className="xv-micro xv-micro-sm px-3 py-2 font-medium text-muted-foreground">Draft BL</th>
          </tr>
        </thead>
        <tbody>
          {check.fields.map((row) => (
            <FieldRow key={row.field} row={row} compact={compact} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FieldRow({ row, compact }: { row: FieldComparison; compact: boolean }) {
  const tone = row.outcome === "mismatch" ? "bad" : row.outcome === "missing" ? "warn" : "ok";
  return (
    <tr className={cn("border-b border-border align-top last:border-b-0", row.outcome === "mismatch" && "bg-[color-mix(in_srgb,var(--signal-bad)_5%,white)]")}>
      <td className="px-3 py-2">
        <span className="flex items-center gap-2">
          <span
            className={cn("inline-block size-2 shrink-0 rounded-full", tone === "bad" ? "bg-bad" : tone === "warn" ? "bg-warn" : "bg-ok")}
            aria-hidden
          />
          <span className="font-medium">{FIELD_LABELS[row.field]}</span>
        </span>
        <span className={cn("sr-only")}>{row.outcome}</span>
      </td>
      <ValueCell value={row.si} tone={row.outcome === "mismatch" ? "bad" : row.si?.missing || row.si === null ? "warn" : null} compact={compact} />
      <ValueCell value={row.bl} tone={row.outcome === "mismatch" ? "bad" : row.bl?.missing || row.bl === null ? "warn" : null} compact={compact} />
    </tr>
  );
}

function ValueCell({ value, tone, compact }: { value: ExtractedValue | null; tone: "bad" | "warn" | null; compact: boolean }) {
  if (value === null) {
    return <td className="px-3 py-2 text-warn italic">not found</td>;
  }
  return (
    <td className="px-3 py-2">
      <span className={cn("font-mono text-[12.5px] break-words", tone === "bad" && "font-semibold text-bad", tone === "warn" && "text-warn")}>
        {value.missing ? (value.raw === null ? "blank" : `"${value.raw}"`) : value.raw}
      </span>
      {!compact ? (
        <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
          {value.source === "human"
            ? value.evidence
            : value.source === "vision"
              ? "Read from the scan by Claude vision"
              : value.source === "ai"
                ? `Mapped by Claude${value.label ? ` (${value.label})` : ""}`
                : value.label
                  ? `Label: ${value.label}`
                  : null}
        </span>
      ) : null}
    </td>
  );
}
