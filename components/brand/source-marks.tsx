/**
 * Marks for the places mail and intelligence come from. Drawn here rather
 * than pulled from a CDN so they render offline, stay crisp at any size, and
 * carry each service's own colours instead of a grey glyph.
 */

export function GmailMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 36" aria-hidden>
      <path d="M4 34h8V18L2 10v20a4 4 0 0 0 2 4Z" fill="#4285F4" />
      <path d="M36 34h8a4 4 0 0 0 4-4V10l-10 8v16Z" fill="#34A853" />
      <path d="M36 4v14l12-9V6a4 4 0 0 0-6.4-3.2L36 4Z" fill="#FBBC04" />
      <path d="M12 34V18l12 9 12-9v16H12Z" fill="#FFFFFF" />
      <path d="M0 6v3l12 9V4L6.4 2.8A4 4 0 0 0 0 6Z" fill="#C5221F" />
      <path d="M12 4v14l12 9 12-9V4L24 13 12 4Z" fill="#EA4335" />
    </svg>
  );
}

/** The sample inbox: paper documents stacked, in the product's own colours. */
export function SampleInboxMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <rect x="6" y="6" width="28" height="34" rx="2" fill="#FFFFFF" stroke="#0B1B28" strokeWidth="2" />
      <rect x="14" y="14" width="28" height="34" rx="2" fill="#FFC300" stroke="#0B1B28" strokeWidth="2" />
      <path d="M20 24h16M20 31h16M20 38h10" stroke="#3D2E00" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** Claude: the Anthropic sunburst, in its own terracotta. */
export function ClaudeMark({ size = 28 }: { size?: number }) {
  const rays = Array.from({ length: 12 }, (_, index) => (index * 360) / 12);
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      {rays.map((angle) => (
        <rect
          key={angle}
          x="22.6"
          y="4"
          width="2.8"
          height="16"
          rx="1.4"
          fill="#D97757"
          transform={`rotate(${angle} 24 24)`}
        />
      ))}
      <circle cx="24" cy="24" r="6" fill="#D97757" />
    </svg>
  );
}

/** Outlook: the Microsoft blue envelope panel. */
export function OutlookMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <rect x="20" y="10" width="24" height="28" rx="2" fill="#0F6CBD" />
      <path d="M20 16h24v20a2 2 0 0 1-2 2H22a2 2 0 0 1-2-2V16Z" fill="#28A8EA" />
      <path d="M20 16 32 25l12-9v-4a2 2 0 0 0-2-2H22a2 2 0 0 0-2 2v4Z" fill="#0F6CBD" />
      <rect x="2" y="6" width="26" height="36" rx="3" fill="#0364B8" />
      <ellipse cx="15" cy="24" rx="7.5" ry="9" fill="#FFFFFF" />
      <ellipse cx="15" cy="24" rx="4" ry="5.5" fill="#0364B8" />
    </svg>
  );
}
