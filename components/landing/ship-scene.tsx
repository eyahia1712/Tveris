import { cn } from "@/lib/utils";

/**
 * The hero scene: a container ship under way, drawn as one SVG and animated
 * with CSS only (no WebGL, no canvas), so it costs almost nothing to run and
 * holds still for anyone who asks for reduced motion.
 *
 * The cargo is the story: every box is a document the desk handles, and the
 * stacks carry the three signals the product reports — verified (green), needs
 * a person (saffron), differs (red). Boxes are drawn with a top face, so the
 * stacks read as solid rather than flat.
 */
export function ShipScene({ className }: { className?: string }) {
  return (
    <div className={cn("xv-scene relative w-full overflow-hidden", className)} aria-hidden>
      {/* The artwork keeps its own proportions: nothing of the ship is cropped. */}
      {/* Full width at its own proportions, with a ceiling on very wide screens:
          the crop takes empty sky off the top, never the ship. */}
      <svg viewBox="0 0 1200 430" className="block h-full w-full" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="xv-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FBFAF6" />
            <stop offset="60%" stopColor="#FDF1D6" />
            <stop offset="100%" stopColor="#FFE6A6" />
          </linearGradient>
          <linearGradient id="xv-sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#15384C" />
            <stop offset="100%" stopColor="#081A25" />
          </linearGradient>
          <radialGradient id="xv-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFC300" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#FFC300" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="1200" height="302" fill="url(#xv-sky)" />
        <circle cx="988" cy="96" r="132" fill="url(#xv-glow)" />
        <circle cx="988" cy="96" r="40" fill="#FFC300" />

        <g className="xv-drift-slow" opacity="0.8">
          <Cloud x={150} y={64} scale={0.82} />
          <Cloud x={560} y={44} scale={0.58} />
          <Cloud x={1350} y={64} scale={0.82} />
          <Cloud x={1760} y={44} scale={0.58} />
        </g>

        {/* The port on the horizon, small and far behind the ship. */}
        <g className="xv-drift-port" opacity="0.2" fill="#0A1F2C">
          <g transform="translate(40 302) scale(0.5)">
            <Cranes />
          </g>
          <g transform="translate(1240 302) scale(0.5)">
            <Cranes />
          </g>
        </g>

        <rect y="298" width="1200" height="132" fill="url(#xv-sea)" />

        <g className="xv-drift-far" opacity="0.3">
          <g transform="translate(150 286) scale(0.26)">
            <SmallShip />
          </g>
          <g transform="translate(1350 286) scale(0.26)">
            <SmallShip />
          </g>
        </g>

        <Waves y={298} fill="#1D4A61" opacity={0.9} className="xv-wave-back" />

        <g className="xv-bob">
          <g transform="translate(262 42) scale(0.74)">
            <Ship />
          </g>
        </g>

        <Waves y={356} fill="#15384C" opacity={0.96} className="xv-wave-mid" />
        <Waves y={394} fill="#0C2635" opacity={1} className="xv-wave-front" />
      </svg>
    </div>
  );
}

function Cloud({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} fill="#FFFFFF" opacity="0.9">
      <ellipse cx="0" cy="0" rx="58" ry="16" />
      <ellipse cx="34" cy="-10" rx="32" ry="14" />
      <ellipse cx="-32" cy="-5" rx="26" ry="11" />
    </g>
  );
}

function Cranes() {
  return (
    <g>
      {[0, 170, 340, 510, 680, 850].map((offset) => (
        <g key={offset} transform={`translate(${offset} -96)`}>
          <rect x="0" y="0" width="7" height="96" />
          <rect x="58" y="0" width="7" height="96" />
          <rect x="-28" y="-10" width="120" height="10" />
          <rect x="-28" y="-52" width="9" height="44" />
          <path d="M-28 -52 L112 -36 L112 -26 L-28 -42 Z" />
        </g>
      ))}
    </g>
  );
}

/** Container colours: the three signals Tveris reports, plus steel and paper. */
const CARGO = ["#0E7A4B", "#FFC300", "#CE2C2C", "#1F4E66", "#E7E4DA", "#0E7A4B", "#1F4E66", "#FFC300", "#CE2C2C"];

/** One box: front face, a lighter top face for depth, and corrugation ribs. */
function Box({ y, colour }: { y: number; colour: string }) {
  return (
    <g transform={`translate(0 ${y})`}>
      <path d="M0 0 L14 -9 L88 -9 L74 0 Z" fill={colour} opacity="0.72" />
      <rect x="0" y="0" width="74" height="19" fill={colour} />
      {[10, 24, 38, 52, 64].map((rib) => (
        <line key={rib} x1={rib} y1="3.5" x2={rib} y2="15.5" stroke="#081A25" strokeOpacity="0.16" />
      ))}
      <rect x="0" y="0" width="74" height="19" fill="none" stroke="#081A25" strokeOpacity="0.3" />
    </g>
  );
}

function Stack({ x, rows, seed }: { x: number; rows: number; seed: number }) {
  return (
    <g transform={`translate(${x} 0)`}>
      {Array.from({ length: rows }, (_, row) => (
        <Box key={row} y={-row * 20} colour={CARGO[(seed + row * 4) % CARGO.length] as string} />
      ))}
    </g>
  );
}

function Ship() {
  return (
    <g>
      {/* Deck cargo: seven stacks, tallest amidships. */}
      <g transform="translate(70 300)">
        <Stack x={0} rows={3} seed={0} />
        <Stack x={80} rows={5} seed={2} />
        <Stack x={160} rows={4} seed={5} />
        <Stack x={240} rows={6} seed={1} />
        <Stack x={320} rows={5} seed={7} />
        <Stack x={400} rows={4} seed={3} />
        <Stack x={480} rows={3} seed={6} />
      </g>

      {/* Accommodation block and funnel, aft. */}
      <g transform="translate(572 214)">
        <path d="M0 0 L16 -10 L108 -10 L92 0 Z" fill="#FFFFFF" opacity="0.8" />
        <rect x="0" y="0" width="92" height="86" fill="#F4F2EC" stroke="#081A25" strokeOpacity="0.25" />
        {[10, 30, 50, 70].map((row) => (
          <g key={row}>
            <rect x="10" y={row} width="18" height="10" fill="#1F4E66" opacity="0.85" />
            <rect x="36" y={row} width="18" height="10" fill="#1F4E66" opacity="0.85" />
            <rect x="62" y={row} width="18" height="10" fill="#1F4E66" opacity="0.85" />
          </g>
        ))}
        {/* Funnel, wearing the brand: red swoosh on ink. */}
        <g transform="translate(26 -46)">
          <path d="M0 0 L10 -7 L50 -7 L40 0 Z" fill="#2A2A27" />
          <rect x="0" y="0" width="40" height="46" fill="#111110" />
          <path d="M5 14 C 12 5, 28 4, 36 9 C 26 7, 14 10, 5 19 Z" fill="#E3261C" />
        </g>
        <rect x="86" y="-72" width="3" height="72" fill="#111110" />
        <rect x="70" y="-74" width="34" height="3" fill="#111110" />
      </g>

      {/* Hull: deck line, side, and the red boot-top at the waterline. */}
      <path d="M26 300 L676 300 L700 322 L684 360 C 664 378, 126 380, 80 360 L34 326 Z" fill="#14140F" />
      <path d="M26 300 L676 300 L700 322 L34 322 Z" fill="#23231D" />
      <path d="M34 336 L692 336 L690 348 L38 348 Z" fill="#E3261C" opacity="0.92" />
      <text
        x="150"
        y="332"
        fill="#FAF9F5"
        fontSize="30"
        fontStyle="italic"
        fontWeight="800"
        letterSpacing="-0.5"
        fontFamily="var(--font-logo), var(--font-sans), sans-serif"
      >
        Tveris
      </text>

      {/* Bow wake and wash. */}
      <g className="xv-foam">
        <ellipse cx="702" cy="366" rx="54" ry="10" fill="#FFFFFF" opacity="0.45" />
        <ellipse cx="640" cy="374" rx="110" ry="8" fill="#FFFFFF" opacity="0.2" />
        <ellipse cx="150" cy="372" rx="80" ry="7" fill="#FFFFFF" opacity="0.16" />
      </g>
    </g>
  );
}

function SmallShip() {
  return (
    <g fill="#0A1F2C">
      <rect x="40" y="-26" width="220" height="20" />
      <rect x="90" y="-44" width="40" height="18" />
      <rect x="150" y="-40" width="34" height="14" />
      <path d="M20 -6 L300 -6 L288 14 L38 14 Z" />
    </g>
  );
}

/**
 * One band of swell: a wide repeating wave that slides sideways forever. The
 * path is drawn far wider than the canvas, so the loop has no visible seam.
 */
function Waves({
  y,
  fill,
  opacity,
  className,
}: {
  y: number;
  fill: string;
  opacity: number;
  className: string;
}) {
  const crest = (offset: number) =>
    `M${offset} 0 C ${offset + 50} -14, ${offset + 150} -14, ${offset + 200} 0 C ${offset + 250} 14, ${offset + 350} 14, ${offset + 400} 0`;
  return (
    <g transform={`translate(0 ${y})`} opacity={opacity}>
      <g className={className}>
        <path
          d={`${crest(-400)} ${crest(0)} ${crest(400)} ${crest(800)} ${crest(1200)} ${crest(1600)} L2000 220 L-400 220 Z`}
          fill={fill}
        />
      </g>
    </g>
  );
}
