import type { Category } from "@/lib/domain/types";

/**
 * A mark per queue, drawn like the source marks: two tones, a clear silhouette
 * at 20px, and its own colour. These are what the map's hubs wear, so a queue
 * is recognised by shape as well as by hue.
 */

/**
 * One colour per queue, all of them far from the three signals: red only ever
 * means "differs", amber "needs a person", green "matches".
 */
export const QUEUE_COLOR: Record<Category, { base: string; tint: string }> = {
  BL_COMPARISON: { base: "#1D4ED8", tint: "#C7D7FB" },
  SI_REQUEST: { base: "#7C3AED", tint: "#DDD0FB" },
  INVOICE_QUERY: { base: "#0891B2", tint: "#BFE6F1" },
  GENERAL: { base: "#475569", tint: "#D3D9E2" },
  SPAM: { base: "#94A3B8", tint: "#E2E8F0" },
};

/** Two documents side by side: the SI checked against the draft BL. */
export function DocumentCheckMark({ size = 22 }: { size?: number }) {
  const { base, tint } = QUEUE_COLOR.BL_COMPARISON;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="2.5" width="11" height="15" rx="1.5" fill={tint} />
      <rect x="7.5" y="5" width="13" height="16.5" rx="1.5" fill="#FFFFFF" stroke={base} strokeWidth="1.6" />
      <path d="M10.5 10h7M10.5 13.5h7M10.5 17h4" stroke={base} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** A ship: a new shipping instruction on its way to the carrier. */
export function SiRequestMark({ size = 22 }: { size?: number }) {
  const { base, tint } = QUEUE_COLOR.SI_REQUEST;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="7" y="5" width="6" height="5" rx="1" fill={tint} />
      <rect x="13" y="7" width="5" height="3" rx="1" fill={tint} />
      <path d="M2.5 12.5h19l-2.2 5.2a2 2 0 0 1-1.8 1.2H6.5a2 2 0 0 1-1.8-1.2Z" fill={base} />
      <path d="M2 20.5c1.8 0 1.8 1.2 3.6 1.2s1.8-1.2 3.6-1.2 1.8 1.2 3.6 1.2 1.8-1.2 3.6-1.2 1.8 1.2 3.6 1.2" stroke={base} strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** A receipt: billing questions, charges and credit notes. */
export function InvoiceMark({ size = 22 }: { size?: number }) {
  const { base, tint } = QUEUE_COLOR.INVOICE_QUERY;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M4.5 2.5h15v19l-2.5-1.6-2.5 1.6-2.5-1.6-2.5 1.6L7 20.4 4.5 21.5Z" fill={tint} />
      <path d="M4.5 2.5h15v19l-2.5-1.6-2.5 1.6-2.5-1.6-2.5 1.6L7 20.4 4.5 21.5Z" fill="none" stroke={base} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke={base} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** A bell: notices, reports and robot updates. */
export function GeneralMark({ size = 22 }: { size?: number }) {
  const { base, tint } = QUEUE_COLOR.GENERAL;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M5 17.5c1.3-1.3 1.6-2.4 1.6-4.6V11a5.4 5.4 0 1 1 10.8 0v1.9c0 2.2.3 3.3 1.6 4.6Z" fill={tint} stroke={base} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9.6 20a2.6 2.6 0 0 0 4.8 0" stroke={base} strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** A shield with a slash: quarantined mail. */
export function SpamMark({ size = 22 }: { size?: number }) {
  const { base, tint } = QUEUE_COLOR.SPAM;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2.2 20 5v6.4c0 4.6-3.2 8.4-8 10.4-4.8-2-8-5.8-8-10.4V5Z" fill={tint} stroke={base} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m9 9 6 6m0-6-6 6" stroke={base} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** The inbox itself: an envelope, in the brand's ink and saffron. */
export function InboxMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="2.2" y="4.5" width="19.6" height="15" rx="2" fill="#FFC300" />
      <path d="M2.8 6 12 13.2 21.2 6" fill="none" stroke="#3D2E00" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.8 18.4 9 12.4M21.2 18.4 15 12.4" fill="none" stroke="#3D2E00" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

export function QueueMark({ category, size = 22 }: { category: Category; size?: number }) {
  switch (category) {
    case "BL_COMPARISON":
      return <DocumentCheckMark size={size} />;
    case "SI_REQUEST":
      return <SiRequestMark size={size} />;
    case "INVOICE_QUERY":
      return <InvoiceMark size={size} />;
    case "GENERAL":
      return <GeneralMark size={size} />;
    case "SPAM":
      return <SpamMark size={size} />;
  }
}
