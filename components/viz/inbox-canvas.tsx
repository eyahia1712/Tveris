"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { InboxMark, QUEUE_COLOR, QueueMark } from "@/components/brand/queue-marks";
import { Icon, type IconName } from "@/components/icons";
import type { Category } from "@/lib/domain/types";
import type { EdgeKind, GraphNode, InboxGraph, Tone } from "@/lib/viz/inbox-graph";
import { nodeRadius } from "@/lib/viz/layout";
import { cn } from "@/lib/utils";

import { useGraphLayout } from "./use-graph-layout";

/**
 * The inbox map. SVG hairlines underneath, HTML nodes on top, both inside one
 * transformed layer so pan and zoom move them together. One ink for every
 * edge; colour appears only where it means something (red differs, green
 * matches, amber needs a person).
 */

type View = { x: number; y: number; k: number };

/** Where the reader left the camera, per inbox, for the life of the tab. */
const VIEWS = new Map<string, View>();

const EDGE_STYLE: Record<EdgeKind, { lo: number; hi: number; width: number; dash?: string }> = {
  spoke: { lo: 0.45, hi: 0.8, width: 1.6 },
  branch: { lo: 0.4, hi: 0.72, width: 1.4 },
  leaf: { lo: 0.26, hi: 0.6, width: 1.1 },
  feeds: { lo: 0.34, hi: 0.65, width: 1.2, dash: "4 3" },
  verdict: { lo: 0.4, hi: 0.7, width: 1.4 },
  field: { lo: 0.34, hi: 0.65, width: 1.2, dash: "2 3" },
};

const TONE_STROKE: Partial<Record<Tone, string>> = {
  bad: "var(--signal-bad)",
  ok: "var(--signal-ok)",
  warn: "var(--signal-warn)",
};

export const HUB_ICONS: Record<Category, IconName> = {
  BL_COMPARISON: "DocumentText",
  SI_REQUEST: "Ship",
  INVOICE_QUERY: "ReceiptText",
  GENERAL: "Notification",
  SPAM: "ShieldCross",
};

/**
 * A colour per queue, so the five families are told apart at a glance. The
 * three check signals (red differs, amber needs a person, green matches) keep
 * their meaning and override the queue hue wherever they apply.
 */
export const CATEGORY_COLOR: Record<Category, string> = {
  BL_COMPARISON: QUEUE_COLOR.BL_COMPARISON.base,
  SI_REQUEST: QUEUE_COLOR.SI_REQUEST.base,
  INVOICE_QUERY: QUEUE_COLOR.INVOICE_QUERY.base,
  GENERAL: QUEUE_COLOR.GENERAL.base,
  SPAM: QUEUE_COLOR.SPAM.base,
};

/** The colour a node is drawn in: signal first, then its queue. */
function nodeColor(node: GraphNode): string {
  // A hub always wears its queue's colour, whatever is inside it.
  if (node.kind === "hub" && node.category !== undefined) return CATEGORY_COLOR[node.category];
  if (node.tone === "bad") return "var(--signal-bad)";
  if (node.tone === "warn") return "var(--signal-warn)";
  if (node.tone === "ok") return "var(--signal-ok)";
  if (node.category !== undefined) return CATEGORY_COLOR[node.category];
  return "var(--foreground)";
}

const TONE_FILL: Record<Tone, string> = {
  bad: "border-bad/45 bg-[color-mix(in_srgb,var(--signal-bad)_9%,white)] text-bad",
  ok: "border-ok/40 bg-[color-mix(in_srgb,var(--signal-ok)_8%,white)] text-ok",
  warn: "border-warn/45 bg-[color-mix(in_srgb,var(--signal-warn)_9%,white)] text-warn",
  neutral: "border-border bg-card text-foreground",
  muted: "border-border bg-surface text-muted-foreground",
};


export interface InboxCanvasProps {
  graph: InboxGraph;
  scope: string;
  selectedId: string | null;
  onSelect(node: GraphNode | null): void;
  onToggle(node: GraphNode): void;
  /** Extra room kept free at the bottom (a dock) when fitting. */
  bottomInset?: number;
  /** Room covered on the right (the inspector) when fitting. */
  rightInset?: number;
  className?: string;
}

export function InboxCanvas({ graph, scope, selectedId, onSelect, onToggle, bottomInset = 0, rightInset = 0, className }: InboxCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // The camera follows the layout (auto-fit) until the reader moves it; from
  // then on their view is kept, per inbox, for the life of the tab.
  const [userView, setUserView] = useState<View | null>(() => VIEWS.get(scope) ?? null);
  const [hovered, setHovered] = useState<string | null>(null);
  const layout = useGraphLayout(graph, size, scope);
  const { positions } = layout;

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) return;
      const { width, height } = entry.contentRect;
      setSize({ width: Math.round(width), height: Math.round(Math.max(0, height - bottomInset)) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [bottomInset]);

  const byId = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph]);

  const fit = useCallback((): View | null => {
    if (positions.size === 0 || size.width === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [id, point] of positions) {
      const node = byId.get(id);
      const r = (node ? nodeRadius(node) : 8) + 26; // room for labels
      minX = Math.min(minX, point.x - r);
      minY = Math.min(minY, point.y - r);
      maxX = Math.max(maxX, point.x + r);
      maxY = Math.max(maxY, point.y + r);
    }
    const pad = 32;
    const usable = Math.max(240, size.width - (size.width > 900 ? rightInset : 0));
    const k = Math.min(
      1.4,
      Math.max(0.3, Math.min((usable - pad * 2) / (maxX - minX), (size.height - pad * 2) / (maxY - minY))),
    );
    return {
      k,
      x: usable / 2 - ((minX + maxX) / 2) * k,
      y: size.height / 2 - ((minY + maxY) / 2) * k,
    };
  }, [positions, size, byId, rightInset]);

  const autoView = useMemo(() => fit(), [fit]);
  const view: View = useMemo(() => userView ?? autoView ?? { x: 0, y: 0, k: 1 }, [userView, autoView]);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
    if (userView !== null) VIEWS.set(scope, userView);
  }, [view, userView, scope]);

  const takeView = useCallback((next: View) => setUserView(next), []);

  const resetView = useCallback(() => {
    VIEWS.delete(scope);
    setUserView(null);
  }, [scope]);

  // Wheel zoom around the pointer (non-passive, so the page does not scroll).
  useEffect(() => {
    const element = containerRef.current;
    if (element === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      setUserView((previous) => {
        const current = previous ?? viewRef.current;
        const k = Math.min(2.6, Math.max(0.3, current.k * Math.exp(-event.deltaY * 0.0015)));
        const ratio = k / current.k;
        return { k, x: px - (px - current.x) * ratio, y: py - (py - current.y) * ratio };
      });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onSelect(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSelect]);

  // Background pan.
  const pan = useRef<{ startX: number; startY: number; view: View; moved: boolean } | null>(null);
  const onBackgroundDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    pan.current = { startX: event.clientX, startY: event.clientY, view, moved: false };
  };
  const onBackgroundMove = (event: React.PointerEvent) => {
    const state = pan.current;
    if (state === null) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.moved && Math.hypot(dx, dy) < 3) return;
    state.moved = true;
    takeView({ ...state.view, x: state.view.x + dx, y: state.view.y + dy });
  };
  const onBackgroundUp = () => {
    if (pan.current !== null && !pan.current.moved) onSelect(null);
    pan.current = null;
  };

  // Hover lineage: the hovered node, its ancestors and its whole subtree.
  const lit = useMemo(() => {
    const focus = hovered ?? selectedId;
    if (focus === null || !byId.has(focus)) return null;
    const set = new Set<string>([focus]);
    let cursor = byId.get(focus)?.parentId;
    while (cursor !== undefined) {
      set.add(cursor);
      cursor = byId.get(cursor)?.parentId;
    }
    const children = new Map<string, string[]>();
    for (const node of graph.nodes) {
      if (node.parentId === undefined) continue;
      children.set(node.parentId, [...(children.get(node.parentId) ?? []), node.id]);
    }
    const stack = [focus];
    while (stack.length > 0) {
      const id = stack.pop()!;
      for (const child of children.get(id) ?? []) {
        if (!set.has(child)) {
          set.add(child);
          stack.push(child);
        }
      }
    }
    // Documents feed the verdict: light them with it.
    for (const edge of graph.edges) {
      if (edge.kind === "feeds" && set.has(edge.to)) set.add(edge.from);
    }
    return set;
  }, [hovered, selectedId, byId, graph]);

  const toGraph = (clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - view.x) / view.k, y: (clientY - rect.top - view.y) / view.k };
  };

  const hoveredNode = hovered === null ? null : byId.get(hovered) ?? null;
  const hoveredPoint = hovered === null ? undefined : positions.get(hovered);

  return (
    <div
      ref={containerRef}
      className={cn("xv-dotgrid relative h-full w-full touch-none overflow-hidden select-none", className)}
      onPointerDown={onBackgroundDown}
      onPointerMove={onBackgroundMove}
      onPointerUp={onBackgroundUp}
      onPointerCancel={onBackgroundUp}
      role="application"
      aria-label="Inbox map. Drag to pan, scroll to zoom, click a node to open it."
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
      >
        <svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width={1} height={1} aria-hidden>
          {graph.edges.map((edge) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (from === undefined || to === undefined) return null;
            const style = EDGE_STYLE[edge.kind];
            const on = lit === null || (lit.has(edge.from) && lit.has(edge.to));
            const toned = edge.kind === "field" || edge.kind === "verdict" ? TONE_STROKE[edge.tone] : undefined;
            return (
              <line
                key={edge.id}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={toned ?? "var(--hairline)"}
                strokeOpacity={lit === null ? style.lo : on ? style.hi : style.lo * 0.35}
                strokeWidth={style.width / Math.sqrt(view.k)}
                strokeDasharray={style.dash}
              />
            );
          })}
        </svg>

        {graph.nodes.map((node) => {
          const point = positions.get(node.id);
          if (point === undefined) return null;
          return (
            <CanvasNode
              key={node.id}
              node={node}
              x={point.x}
              y={point.y}
              selected={node.id === selectedId}
              dimmed={lit !== null && !lit.has(node.id)}
              pinned={layout.pinned.has(node.id)}
              onHover={setHovered}
              onActivate={() => {
                onSelect(node);
                if (node.kind === "group" || node.kind === "email") onToggle(node);
              }}
              onDragStart={() => layout.beginDrag(node.id)}
              onDragMove={(clientX, clientY) => layout.dragTo(node.id, toGraph(clientX, clientY))}
              onDragEnd={() => layout.endDrag(node.id)}
              onRelease={() => layout.release(node.id)}
            />
          );
        })}
      </div>

      {hoveredNode !== null && hoveredPoint !== undefined && hoveredNode.kind !== "inbox" ? (
        <HoverCard
          node={hoveredNode}
          left={Math.min(Math.max(hoveredPoint.x * view.k + view.x, 160), Math.max(160, size.width - rightInset - 160))}
          top={hoveredPoint.y * view.k + view.y}
          offset={nodeRadius(hoveredNode) * view.k}
        />
      ) : null}

      <div className="xv-no-print absolute top-3 right-3 flex flex-col border border-border bg-card" onPointerDown={(event) => event.stopPropagation()}>
        <CanvasButton label="Zoom in" icon="Add" onClick={() => takeView(zoomAround(view, size, 1.25))} />
        <CanvasButton label="Zoom out" icon="Minus" onClick={() => takeView(zoomAround(view, size, 0.8))} />
        <CanvasButton label="Fit the map" icon="Maximize4" onClick={resetView} />
      </div>
    </div>
  );
}

function zoomAround(view: View, size: { width: number; height: number }, factor: number): View {
  const k = Math.min(2.6, Math.max(0.3, view.k * factor));
  const ratio = k / view.k;
  const cx = size.width / 2;
  const cy = size.height / 2;
  return { k, x: cx - (cx - view.x) * ratio, y: cy - (cy - view.y) * ratio };
}

function CanvasButton({ label, icon, onClick }: { label: string; icon: IconName; onClick(): void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="xv-focus grid size-9 place-items-center border-b border-border text-muted-foreground transition-colors last:border-b-0 hover:bg-surface hover:text-foreground"
    >
      <Icon name={icon} size={15} />
    </button>
  );
}

interface CanvasNodeProps {
  node: GraphNode;
  x: number;
  y: number;
  selected: boolean;
  dimmed: boolean;
  pinned: boolean;
  onHover(id: string | null): void;
  onActivate(): void;
  onDragStart(): void;
  onDragMove(clientX: number, clientY: number): void;
  onDragEnd(): void;
  onRelease(): void;
}

function CanvasNode({ node, x, y, selected, dimmed, pinned, onHover, onActivate, onDragStart, onDragMove, onDragEnd, onRelease }: CanvasNodeProps) {
  const press = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const size = nodeRadius(node) * 2;

  const onPointerDown = (event: React.PointerEvent) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    press.current = { x: event.clientX, y: event.clientY, dragging: false };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const state = press.current;
    if (state === null) return;
    if (!state.dragging) {
      if (Math.hypot(event.clientX - state.x, event.clientY - state.y) < 4 || node.kind === "inbox") return;
      state.dragging = true;
      onDragStart();
    }
    onDragMove(event.clientX, event.clientY);
  };
  const onPointerUp = (event: React.PointerEvent) => {
    event.stopPropagation();
    const state = press.current;
    press.current = null;
    if (state === null) return;
    if (state.dragging) onDragEnd();
    else onActivate();
  };

  return (
    <div
      className={cn("absolute top-0 left-0 transition-opacity duration-200", dimmed && "opacity-30")}
      style={{ transform: `translate(${x}px, ${y}px)` }}
    >
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (pinned) onRelease();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onActivate();
          }
        }}
        onPointerEnter={() => onHover(node.id)}
        onPointerLeave={() => onHover(null)}
        onFocus={() => onHover(node.id)}
        onBlur={() => onHover(null)}
        aria-label={ariaLabel(node)}
        aria-expanded={node.kind === "group" || node.kind === "email" ? Boolean(node.expanded) : undefined}
        aria-pressed={selected}
        className={cn(
          "xv-node xv-focus absolute top-0 left-0 grid cursor-pointer place-items-center",
          nodeSkin(node),
          selected && "ring-2 ring-accent ring-offset-2 ring-offset-[var(--paper)]",
          pinned && "outline outline-1 outline-offset-2 outline-dashed outline-foreground/30",
        )}
        style={{
          width: size,
          height: size,
          transform: "translate(-50%, -50%)",
          ...(node.kind === "email" ? { backgroundColor: nodeColor(node) } : {}),
          ...(node.kind === "hub" || node.kind === "group" ? { borderColor: nodeColor(node), color: nodeColor(node) } : {}),
        }}
      >
        <NodeFace node={node} />
      </button>
      <NodeLabel node={node} size={size} selected={selected} />
    </div>
  );
}

function nodeSkin(node: GraphNode): string {
  switch (node.kind) {
    case "inbox":
      return "rounded-full border border-foreground/80 bg-foreground text-white shadow-[0_0_0_6px_var(--paper),0_0_0_7px_var(--line)]";
    case "hub":
      return "rounded-full border-2 bg-card shadow-[0_2px_10px_rgb(11_27_40/12%)]";
    case "group":
      return cn("rounded-full border-2 bg-card", node.expanded && "shadow-[0_0_0_3px_rgb(255_255_255/90%)]");
    case "email":
      return cn("rounded-full", node.expanded && "ring-2 ring-foreground/60 ring-offset-1 ring-offset-[var(--paper)]");
    case "doc":
      return cn("border", node.tone === "warn" ? "border-dashed border-warn/70 bg-card text-warn" : "border-border bg-surface text-foreground");
    case "verdict":
      return cn("rounded-full border-2", TONE_FILL[node.tone]);
    case "field":
      return cn("border", TONE_FILL[node.tone]);
    case "action":
      return cn("border", node.tone === "bad" ? TONE_FILL.bad : node.tone === "warn" ? TONE_FILL.warn : "border-accent/50 bg-card text-accent-ink");
  }
}

function NodeFace({ node }: { node: GraphNode }) {
  switch (node.kind) {
    case "inbox":
      return (
        <span className="flex flex-col items-center leading-none">
          <InboxMark size={20} />
          <span className="mt-1 font-mono text-[13px] font-medium">{node.count}</span>
        </span>
      );
    case "hub":
      return (
        <>
          <QueueMark category={node.category!} size={26} />
          <span className="absolute -top-1 -left-1 min-w-[18px] bg-foreground px-1 font-mono text-[10px] leading-[16px] text-white">
            {node.count}
          </span>
        </>
      );
    case "group":
      return <span className="font-mono text-[12px] font-medium" style={{ color: nodeColor(node) }}>{node.count}</span>;
    case "doc":
      return <span className="font-mono text-[10px] font-semibold tracking-wide">{node.label}</span>;
    case "verdict":
      return (
        <Icon
          name={node.tone === "ok" ? "TickCircle" : node.tone === "bad" ? "CloseCircle" : "Warning2"}
          size={20}
          variant="Bold"
        />
      );
    case "field":
      return <Icon name={node.tone === "ok" ? "TickCircle" : node.tone === "bad" ? "CloseCircle" : "Warning2"} size={13} variant="Bold" />;
    case "action":
      return <Icon name="Flash" size={15} variant="Bold" />;
    case "email":
      return null;
  }
}

function NodeLabel({ node, size, selected }: { node: GraphNode; size: number; selected: boolean }) {
  if (node.kind === "email" && !selected) return null;
  const text =
    node.kind === "email"
      ? `#${node.label}`
      : node.kind === "hub" || node.kind === "inbox"
        ? node.label
        : node.label;
  return (
    <span
      className={cn(
        "pointer-events-none absolute left-0 -translate-x-1/2 text-center whitespace-nowrap",
        node.kind === "hub" || node.kind === "inbox"
          ? "xv-micro xv-micro-sm text-foreground"
          : node.kind === "field" || node.kind === "doc"
            ? "text-[10px] leading-3 text-muted-foreground"
            : "xv-micro xv-micro-sm text-muted-foreground",
        node.tone === "bad" && node.kind !== "hub" && "text-bad",
      )}
      style={{ top: size / 2 + 5 }}
    >
      {text}
    </span>
  );
}

function ariaLabel(node: GraphNode): string {
  switch (node.kind) {
    case "inbox":
      return `${node.label}: ${node.count} emails`;
    case "hub":
      return `${node.label}: ${node.count} emails`;
    case "group":
      return `${node.label}: ${node.count} emails. ${node.expanded ? "Close" : "Open"} group.`;
    case "email":
      return `Email ${node.label}: ${node.sublabel ?? ""}`;
    default:
      return `${node.label}${node.sublabel ? `: ${node.sublabel}` : ""}`;
  }
}

function HoverCard({ node, left, top, offset }: { node: GraphNode; left: number; top: number; offset: number }) {
  return (
    <div
      className="pointer-events-none absolute z-10 w-max max-w-[300px] border border-border bg-card px-3 py-2 shadow-[0_8px_24px_rgb(11_27_40/10%)]"
      style={{ left, top: top - offset - 10, transform: "translate(-50%, -100%)" }}
    >
      <p className="xv-micro xv-micro-sm text-muted-foreground">
        {node.kind === "email" ? `Email #${node.label}` : node.kind === "group" ? `${node.count} emails` : node.kind}
      </p>
      <p className={cn("mt-0.5 line-clamp-3 text-[13px] leading-snug font-medium", node.tone === "bad" && "text-bad")}>
        {node.kind === "email" ? node.sublabel : node.label}
      </p>
      {node.kind !== "email" && node.sublabel ? (
        <p className="mt-0.5 line-clamp-3 text-[12px] leading-snug text-muted-foreground">{node.sublabel}</p>
      ) : null}
    </div>
  );
}
