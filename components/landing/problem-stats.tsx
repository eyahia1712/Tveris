"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The problem in four numbers, in the style of the Nexa landing page. Each box
 * draws its own small picture when it scrolls into view; the source sits
 * underneath, in small print. Every number comes from the 520-email test inbox.
 */

function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => entry?.isIntersecting && setSeen(true), { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, seen };
}

function useCount(target: number, run: boolean, ms = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!run) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, run, ms]);
  return value;
}

/** The five queues of the test inbox, one dot per ~10 emails. */
const QUEUES = [
  { label: "Doc check", count: 129, color: "#3d63dd" },
  { label: "SI request", count: 125, color: "#8b5cf6" },
  { label: "Invoice", count: 75, color: "#2ea3bf" },
  { label: "General", count: 151, color: "#5a6b7e" },
  { label: "Spam", count: 40, color: "#e3261c" },
];
const DOTS = QUEUES.flatMap((queue) => Array.from({ length: Math.round(queue.count / 10) }, () => queue.color));

/** One field, written four ways across real SI and BL layouts. */
const LABELS = ["Port of Loading", "Load Port", "POL", "装货港"];

export function ProblemStats() {
  const { ref, seen } = useInView<HTMLDivElement>();
  const emails = useCount(1000, seen);
  const mismatch = useCount(36, seen);
  const fields = useCount(7, seen, 700);
  const spam = useCount(40, seen);

  return (
    <div ref={ref} className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Box source="A documentation desk's shared mailbox">
        <p className="font-mono text-[40px] leading-none font-semibold">
          {emails.toLocaleString("en")}
          <span className="text-[22px] text-[var(--ink-3)]">/day</span>
        </p>
        <p className="mt-3 text-[14px] leading-snug text-[var(--ink-2)]">emails in one inbox, five kinds of work mixed together</p>
        <div className="mt-5 grid grid-cols-13 gap-1" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }} aria-hidden>
          {DOTS.map((color, index) => (
            <span
              key={index}
              className="aspect-square rounded-full transition-all duration-500"
              style={{ background: seen ? color : "var(--stone)", transform: seen ? "scale(1)" : "scale(0.4)", transitionDelay: `${index * 14}ms` }}
            />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-[var(--ink-3)]">each dot ≈ 10 emails, coloured by queue</p>
      </Box>

      <Box source="Tveris test inbox · 129 SI vs BL checks">
        <div className="flex items-center gap-4">
          <Ring value={seen ? 0.36 : 0} />
          <div>
            <p className="font-mono text-[40px] leading-none font-semibold text-[var(--brand-red)]">{mismatch}%</p>
            <p className="mt-2 text-[14px] leading-snug text-[var(--ink-2)]">of draft bills of lading differ from their instruction</p>
          </div>
        </div>
        <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-[var(--stone)]">
          <span className="h-full transition-[width] duration-1000 ease-out" style={{ width: seen ? "48.8%" : "0%", background: "#0e7a4b" }} />
          <span className="h-full transition-[width] duration-1000 ease-out" style={{ width: seen ? "35.7%" : "0%", background: "#ce2c2c" }} />
          <span className="h-full transition-[width] duration-1000 ease-out" style={{ width: seen ? "15.5%" : "0%", background: "#b36b00" }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-[var(--ink-2)]">
          <span>63 clear</span>
          <span>46 mismatch</span>
          <span>20 unclear</span>
        </div>
      </Box>

      <Box source="Real SI and BL layouts in the test inbox">
        <p className="font-mono text-[40px] leading-none font-semibold">
          {fields}
          <span className="text-[22px] text-[var(--ink-3)]"> fields</span>
        </p>
        <p className="mt-3 text-[14px] leading-snug text-[var(--ink-2)]">checked by eye, each written a different way</p>
        <div className="mt-5 flex flex-wrap gap-1.5">
          {LABELS.map((label, index) => (
            <span
              key={label}
              className="rounded-full border border-[var(--hairline-warm)] bg-[var(--paper-warm)] px-2.5 py-1 font-mono text-[11.5px] transition-all duration-500"
              style={{ opacity: seen ? 1 : 0, transform: seen ? "translateY(0)" : "translateY(8px)", transitionDelay: `${300 + index * 160}ms` }}
            >
              {label}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-[var(--ink-3)]">
          = <b className="font-mono text-[var(--ink-deep)]">one</b> field
        </p>
      </Box>

      <Box source="Tveris test inbox · spam and phishing quarantined">
        <p className="font-mono text-[40px] leading-none font-semibold">
          <span className="text-[var(--brand-red)]">1</span>
          <span className="text-[22px] text-[var(--ink-3)]"> in </span>13
        </p>
        <p className="mt-3 text-[14px] leading-snug text-[var(--ink-2)]">emails is spam or phishing, sitting next to real orders</p>
        <div className="mt-5 flex h-4 overflow-hidden rounded-full bg-[var(--stone)]">
          <span
            className="h-full rounded-full transition-[width] duration-1000 ease-out"
            style={{ width: seen ? `${(40 / 520) * 100}%` : "0%", background: "linear-gradient(90deg,#FFC300,#E3261C)" }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-[var(--ink-2)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#e3261c]" /> {spam} spam
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[var(--stone)]" /> 480 real
          </span>
        </div>
      </Box>
    </div>
  );
}

function Box({ children, source }: { children: React.ReactNode; source: string }) {
  return (
    <article className="group flex flex-col rounded-2xl border border-[var(--hairline-warm)] bg-white p-6 text-[var(--ink-deep)] shadow-[0_14px_34px_-24px_rgb(0_0_0/45%)] transition-transform duration-300 hover:-translate-y-1">
      <div className="flex-1">{children}</div>
      <p className="mt-5 text-[11px] text-[var(--ink-3)]">{source}</p>
    </article>
  );
}

function Ring({ value }: { value: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 80 80" className="size-20 shrink-0 -rotate-90" aria-hidden>
      <circle cx="40" cy="40" r={r} fill="none" stroke="var(--stone)" strokeWidth="10" />
      <circle
        cx="40"
        cy="40"
        r={r}
        fill="none"
        stroke="#ce2c2c"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value)}
        style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)" }}
      />
    </svg>
  );
}
