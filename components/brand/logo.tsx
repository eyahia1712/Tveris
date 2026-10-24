import { cn } from "@/lib/utils";

/**
 * The Tveris wordmark: a bold italic humanist lowercase with a single red
 * swoosh riding over the first letter, a capital T.
 */
export function TverisLogo({
  size = 28,
  className,
  inverted = false,
}: {
  size?: number;
  className?: string;
  inverted?: boolean;
}) {
  return (
    <span
      className={cn("relative inline-block leading-none select-none", inverted ? "text-white" : "text-[#1a1a1a]", className)}
      style={{ fontSize: size, paddingTop: "0.34em" }}
      aria-label="Tveris"
      role="img"
    >
      <svg
        viewBox="0 0 100 32"
        className="absolute"
        style={{ left: "0.01em", top: "0.0em", width: "0.78em", height: "0.3em" }}
        aria-hidden
      >
        {/* A crescent: thick on the left, tapering to a point on the right. */}
        <path d="M1 31 C 14 6, 60 -4, 99 12 C 64 7, 32 12, 13 31 Z" fill="var(--brand-red)" />
      </svg>
      <span
        aria-hidden
        style={{
          fontFamily: "var(--font-logo), var(--font-sans), sans-serif",
          fontStyle: "italic",
          fontWeight: 800,
          letterSpacing: "-0.03em",
        }}
      >
        Tveris
      </span>
    </span>
  );
}
