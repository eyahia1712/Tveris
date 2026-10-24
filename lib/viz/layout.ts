import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

import { HUB_ORDER, type GraphEdge, type GraphNode, type InboxGraph, type NodeKind } from "@/lib/viz/inbox-graph";

/**
 * Force layout for the inbox tree. Every node gets a HOME first (a place that
 * makes the structure readable) and the forces only settle the details:
 *
 *   - the inbox is pinned at the centre;
 *   - the five category hubs sit on a regular pentagon (stretched a little to
 *     the viewport's aspect so the map fills a wide screen);
 *   - a hub's groups fan out on a wedge beyond it, along the hub's own ray;
 *   - an open group's emails form a sunflower cluster further out;
 *   - an open email's documents, verdict and fields grow outward again.
 *
 * Homes keep the picture stable when nodes arrive and leave, so opening one
 * group never reshuffles the rest of the map.
 */

export interface LayoutNode extends SimulationNodeDatum {
  id: string;
  kind: NodeKind;
  homeX: number;
  homeY: number;
  radius: number;
}

type LayoutLink = SimulationLinkDatum<LayoutNode> & { kind: GraphEdge["kind"] };

export interface Size {
  width: number;
  height: number;
}

export interface Layout {
  simulation: Simulation<LayoutNode, LayoutLink>;
  positions(): Map<string, { x: number; y: number }>;
}

export function nodeRadius(node: GraphNode): number {
  switch (node.kind) {
    case "inbox":
      return 40;
    case "hub":
      return 30;
    case "group":
      return 19;
    case "email":
      return node.expanded ? 10 : node.urgent ? 8 : 7;
    case "doc":
      return 14;
    case "verdict":
      return 22;
    case "field":
      return 12;
    case "action":
      return 16;
  }
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function hubRing(size: Size): { radius: number; stretch: number } {
  const short = Math.min(size.width, size.height);
  return {
    radius: Math.min(320, Math.max(175, short * 0.32)),
    stretch: Math.min(1.7, Math.max(1, size.width / Math.max(1, size.height))),
  };
}

export function computeHomes(graph: InboxGraph, size: Size): Map<string, { x: number; y: number; angle: number }> {
  const cx = size.width / 2;
  const cy = size.height / 2;
  const { radius, stretch } = hubRing(size);
  const homes = new Map<string, { x: number; y: number; angle: number }>();
  const at = (angle: number, distance: number, from = { x: cx, y: cy }) => ({
    x: from.x + Math.cos(angle) * distance * stretch,
    y: from.y + Math.sin(angle) * distance,
    angle,
  });

  homes.set("inbox", { x: cx, y: cy, angle: 0 });

  const children = new Map<string, GraphNode[]>();
  for (const node of graph.nodes) {
    if (node.parentId === undefined) continue;
    const list = children.get(node.parentId) ?? [];
    list.push(node);
    children.set(node.parentId, list);
  }

  for (const hub of graph.nodes.filter((node) => node.kind === "hub")) {
    // Fixed slots: a category keeps its seat even when another is filtered out.
    const slot = HUB_ORDER.indexOf(hub.category!);
    const hubAngle = -Math.PI / 2 + (slot * 2 * Math.PI) / HUB_ORDER.length;
    homes.set(hub.id, at(hubAngle, radius));

    const groups = children.get(hub.id) ?? [];
    const spread = groups.length <= 1 ? 0 : Math.min(0.56, 1.5 / (groups.length - 1));
    groups.forEach((group, index) => {
      const angle = hubAngle + (index - (groups.length - 1) / 2) * spread;
      const groupHome = at(angle, radius + 150 + (groups.length > 4 ? 60 : 0));
      homes.set(group.id, groupHome);

      const emails = children.get(group.id) ?? [];
      if (emails.length === 0) return;
      const spacing = 16;
      const clusterRadius = spacing * Math.sqrt(emails.length + 1) * 1.1;
      const clusterCentre = at(angle, radius + 230 + (groups.length > 4 ? 60 : 0) + clusterRadius);
      emails.forEach((email, k) => {
        const r = spacing * Math.sqrt(k + 0.5);
        const theta = k * GOLDEN + angle;
        homes.set(email.id, {
          x: clusterCentre.x + Math.cos(theta) * r,
          y: clusterCentre.y + Math.sin(theta) * r,
          angle,
        });

        // An open email grows its detail beyond the cluster's outer edge.
        const details = children.get(email.id) ?? [];
        if (details.length === 0) return;
        const edge = at(angle, clusterRadius + 70, clusterCentre);
        const docs = details.filter((node) => node.kind === "doc");
        const verdict = details.find((node) => node.kind === "verdict" || node.kind === "action");
        docs.forEach((doc, d) => {
          const offset = (d - (docs.length - 1) / 2) * 0.55;
          homes.set(doc.id, at(angle + offset, 10, edge));
        });
        if (verdict !== undefined) {
          const verdictHome = at(angle, 90, edge);
          homes.set(verdict.id, verdictHome);
          // Seven fields on an arc wide enough for their labels to breathe.
          const fields = children.get(verdict.id) ?? [];
          fields.forEach((field, f) => {
            const offset = (f - (fields.length - 1) / 2) * 0.42;
            homes.set(field.id, at(angle + offset, 150, verdictHome));
          });
        }
      });
    });
  }
  return homes;
}

const LINK_DISTANCE: Record<GraphEdge["kind"], number> = {
  spoke: 200,
  branch: 110,
  leaf: 40,
  feeds: 70,
  verdict: 80,
  field: 140,
};

const HOME_PULL: Record<NodeKind, number> = {
  inbox: 1,
  hub: 0.6,
  group: 0.4,
  email: 0.3,
  doc: 0.35,
  verdict: 0.35,
  field: 0.3,
  action: 0.35,
};

const CHARGE: Record<NodeKind, number> = {
  inbox: -500,
  hub: -520,
  group: -260,
  email: -26,
  doc: -90,
  verdict: -120,
  field: -140,
  action: -90,
};

export function createLayout(
  graph: InboxGraph,
  size: Size,
  pinned: ReadonlyMap<string, { x: number; y: number }> = new Map(),
): Layout {
  const homes = computeHomes(graph, size);
  const nodes: LayoutNode[] = graph.nodes.map((node) => {
    const home = homes.get(node.id) ?? { x: size.width / 2, y: size.height / 2, angle: 0 };
    const pin = pinned.get(node.id);
    const layoutNode: LayoutNode = {
      id: node.id,
      kind: node.kind,
      homeX: pin?.x ?? home.x,
      homeY: pin?.y ?? home.y,
      radius: nodeRadius(node),
      x: pin?.x ?? home.x,
      y: pin?.y ?? home.y,
    };
    if (node.kind === "inbox") {
      layoutNode.fx = size.width / 2;
      layoutNode.fy = size.height / 2;
    } else if (pin !== undefined) {
      layoutNode.fx = pin.x;
      layoutNode.fy = pin.y;
    }
    return layoutNode;
  });
  const ids = new Set(nodes.map((node) => node.id));
  const links: LayoutLink[] = graph.edges
    .filter((edge) => ids.has(edge.from) && ids.has(edge.to))
    .map((edge) => ({ source: edge.from, target: edge.to, kind: edge.kind }));

  const { radius } = hubRing(size);
  const simulation = forceSimulation<LayoutNode, LayoutLink>(nodes)
    .force(
      "link",
      forceLink<LayoutNode, LayoutLink>(links)
        .id((node) => node.id)
        .distance((link) => (link.kind === "spoke" ? radius : LINK_DISTANCE[link.kind]))
        .strength((link) => (link.kind === "leaf" ? 0.04 : link.kind === "spoke" ? 0.2 : 0.3)),
    )
    .force("charge", forceManyBody<LayoutNode>().strength((node) => CHARGE[node.kind]).distanceMax(320))
    // Field nodes carry a label under them: give them room for it.
    .force("collide", forceCollide<LayoutNode>().radius((node) => (node.kind === "field" ? 30 : node.kind === "email" ? node.radius + 5 : node.radius + 4)).strength(1))
    .force("x", forceX<LayoutNode>((node) => node.homeX).strength((node) => HOME_PULL[node.kind]))
    .force("y", forceY<LayoutNode>((node) => node.homeY).strength((node) => HOME_PULL[node.kind]))
    .alphaDecay(0.045)
    .velocityDecay(0.45);

  return {
    simulation,
    positions() {
      const map = new Map<string, { x: number; y: number }>();
      for (const node of simulation.nodes()) map.set(node.id, { x: node.x ?? 0, y: node.y ?? 0 });
      return map;
    },
  };
}
