"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { InboxGraph } from "@/lib/viz/inbox-graph";
import { createLayout, type Layout, type Size } from "@/lib/viz/layout";

type Point = { x: number; y: number };

/**
 * Drops survive switching views (the Graph view unmounts when you open the
 * Queue): they live per inbox for the life of the tab, not in component state.
 */
const DROPS = new Map<string, Map<string, Point>>();

function dropsFor(scope: string): Map<string, Point> {
  let drops = DROPS.get(scope);
  if (drops === undefined) {
    drops = new Map();
    DROPS.set(scope, drops);
  }
  return drops;
}

export interface GraphLayout {
  positions: Map<string, Point>;
  pinned: ReadonlySet<string>;
  beginDrag(id: string): void;
  dragTo(id: string, point: Point): void;
  endDrag(id: string): void;
  release(id: string): void;
}

export function useGraphLayout(graph: InboxGraph, size: Size, scope: string): GraphLayout {
  const [positions, setPositions] = useState<Map<string, Point>>(() => new Map());
  const [pinned, setPinned] = useState<ReadonlySet<string>>(() => new Set(dropsFor(scope).keys()));
  const [releases, setReleases] = useState(0);
  const layoutRef = useRef<Layout | null>(null);
  const positionsRef = useRef(positions);
  const graphRef = useRef(graph);
  const lastNodeSet = useRef<string | null>(null);

  const topology = useMemo(
    () =>
      JSON.stringify([
        graph.nodes.map((node) => `${node.id}|${node.kind}|${node.expanded ? 1 : 0}`),
        graph.edges.length,
      ]),
    [graph],
  );

  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  useEffect(() => {
    if (size.width === 0 || size.height === 0) return;
    const current = graphRef.current;
    const drops = dropsFor(scope);
    const layout = createLayout(current, size, drops);
    layoutRef.current = layout;
    const previous = positionsRef.current;
    const parentOf = new Map(current.nodes.map((node) => [node.id, node.parentId]));

    for (const node of layout.simulation.nodes()) {
      if (node.kind === "inbox" || drops.has(node.id)) continue;
      const known = previous.get(node.id);
      if (known !== undefined) {
        node.x = known.x;
        node.y = known.y;
        continue;
      }
      // A new node grows out of its parent instead of flying in from its home.
      if (previous.size > 0) {
        const parent = parentOf.get(node.id);
        const anchor = parent === undefined ? undefined : previous.get(parent);
        if (anchor !== undefined) {
          node.x = anchor.x + (Math.random() - 0.5) * 16;
          node.y = anchor.y + (Math.random() - 0.5) * 16;
        }
      }
    }

    let frame: number | null = null;
    const publish = () => {
      frame = null;
      const next = layout.positions();
      positionsRef.current = next;
      setPositions(next);
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(publish);
    };
    layout.simulation.on("tick.react", schedule);
    schedule();

    const nodeSet = current.nodes.map((node) => node.id).join(",");
    if (lastNodeSet.current !== null && lastNodeSet.current !== nodeSet) {
      layout.simulation.alpha(0.55).restart();
    }
    lastNodeSet.current = nodeSet;

    return () => {
      layout.simulation.on("tick.react", null);
      layout.simulation.stop();
      if (frame !== null) cancelAnimationFrame(frame);
      if (layoutRef.current === layout) layoutRef.current = null;
    };
    // `topology` captures the graph shape; `graphRef` supplies the data.
  }, [topology, size.width, size.height, scope, releases]); // eslint-disable-line react-hooks/exhaustive-deps

  const controls = useMemo(() => {
    const find = (id: string) => layoutRef.current?.simulation.nodes().find((node) => node.id === id);
    return {
      beginDrag(id: string) {
        const node = find(id);
        if (node === undefined || node.kind === "inbox") return;
        node.fx = node.x;
        node.fy = node.y;
        layoutRef.current?.simulation.alphaTarget(0.2).restart();
      },
      dragTo(id: string, point: Point) {
        const node = find(id);
        if (node === undefined || node.kind === "inbox") return;
        node.fx = point.x;
        node.fy = point.y;
      },
      endDrag(id: string) {
        layoutRef.current?.simulation.alphaTarget(0);
        const node = find(id);
        if (node === undefined || typeof node.fx !== "number" || typeof node.fy !== "number") return;
        const drops = dropsFor(scope);
        drops.set(id, { x: node.fx, y: node.fy });
        setPinned(new Set(drops.keys()));
      },
      release(id: string) {
        const drops = dropsFor(scope);
        if (!drops.delete(id)) return;
        setPinned(new Set(drops.keys()));
        setReleases((count) => count + 1);
      },
    };
  }, [scope]);

  return { positions, pinned, ...controls };
}
