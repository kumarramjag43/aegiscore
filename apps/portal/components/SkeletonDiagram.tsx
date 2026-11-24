"use client";

import { useState } from "react";

type NodeId = "core" | "code" | "contract" | "codemedic" | "lexguard";

interface DiagramNode {
  x: number;
  y: number;
  w: number;
  h: number;
  accent: string;
  title: string;
  subtitle: string;
}

const NODES: Record<NodeId, DiagramNode> = {
  core: { x: 24, y: 140, w: 262, h: 190, accent: "#8b5cf6", title: "aegis-core", subtitle: "the skeleton" },
  code: {
    x: 372,
    y: 48,
    w: 246,
    h: 126,
    accent: "#22d3ee",
    title: "code-security",
    subtitle: "detectors · repairs · presets",
  },
  contract: {
    x: 372,
    y: 296,
    w: 246,
    h: 126,
    accent: "#fbbf24",
    title: "contract-fraud",
    subtitle: "signals · clauses · counter-draft",
  },
  codemedic: {
    x: 700,
    y: 48,
    w: 256,
    h: 126,
    accent: "#22d3ee",
    title: "CodeMedic AI",
    subtitle: "DevSecOps console · :3001",
  },
  lexguard: {
    x: 700,
    y: 296,
    w: 256,
    h: 126,
    accent: "#fbbf24",
    title: "LexGuard AI",
    subtitle: "legal & finance desk · :3002",
  },
};

const EDGES: { id: string; from: NodeId; to: NodeId; d: string }[] = [
  { id: "e-core-code", from: "core", to: "code", d: "M286,203 C330,203 330,111 372,111" },
  { id: "e-core-contract", from: "core", to: "contract", d: "M286,267 C330,267 330,359 372,359" },
  { id: "e-code-app", from: "code", to: "codemedic", d: "M618,111 L700,111" },
  { id: "e-contract-app", from: "contract", to: "lexguard", d: "M618,359 L700,359" },
];

/** Which nodes stay lit when one node is hovered. */
const FOCUS: Record<NodeId, NodeId[]> = {
  core: ["core", "code", "contract", "codemedic", "lexguard"],
  code: ["core", "code", "codemedic"],
  contract: ["core", "contract", "lexguard"],
  codemedic: ["core", "code", "codemedic"],
  lexguard: ["core", "contract", "lexguard"],
};

const STAGES = [
  ["1", "Scan"],
  ["2", "Critique"],
  ["3", "Heal"],
  ["4", "Verify"],
] as const;

export interface SkeletonDiagramProps {
  codemedicUrl: string;
  lexguardUrl: string;
}

/**
 * Hand-drawn SVG map of the submission: one core, two packs, two products.
 * Hovering a node collapses the graph to its dependency path, which is the
 * whole argument for the Skeleton Crew category in one gesture.
 */
export function SkeletonDiagram({ codemedicUrl, lexguardUrl }: SkeletonDiagramProps) {
  const [focus, setFocus] = useState<NodeId | null>(null);
  const lit = focus ? new Set<NodeId>(FOCUS[focus]) : null;

  const isLit = (id: NodeId) => !lit || lit.has(id);
  const edgeLit = (edge: { from: NodeId; to: NodeId }) => isLit(edge.from) && isLit(edge.to);

  const openApp = (id: NodeId) => {
    if (id === "codemedic") window.open(codemedicUrl, "_blank", "noopener,noreferrer");
    else if (id === "lexguard") window.open(lexguardUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="glass p-4 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[10.5px] uppercase tracking-[0.18em] text-slate-500">Live architecture</span>
        <span className="text-[10.5px] text-slate-600">hover or tap a node to isolate its path</span>
        <div className="ml-auto flex items-center gap-3 text-[10px] text-slate-500">
          <Legend color="#8b5cf6" label="core" />
          <Legend color="#22d3ee" label="DevSecOps" />
          <Legend color="#fbbf24" label="legal & finance" />
        </div>
      </div>

      <svg viewBox="0 30 980 400" role="img" aria-label="AegisCore architecture: one core feeds two domain packs which power two apps" className="w-full">
        <defs>
          <linearGradient id="coreGlow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.06" />
          </linearGradient>
          <marker id="arrow-cyan" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" fill="#22d3ee" />
          </marker>
          <marker id="arrow-amber" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" fill="#fbbf24" />
          </marker>
          <filter id="softGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {EDGES.map((edge) => (
          <path
            key={edge.id}
            d={edge.d}
            fill="none"
            stroke={edgeLit(edge) ? NODES[edge.to].accent : "#1f2937"}
            strokeWidth={edgeLit(edge) ? 1.8 : 1.2}
            strokeOpacity={edgeLit(edge) ? 0.85 : 0.45}
            markerEnd={edgeLit(edge) ? `url(#${NODES[edge.to].accent === "#fbbf24" ? "arrow-amber" : "arrow-cyan"})` : undefined}
            className={edgeLit(edge) ? "flow-line" : undefined}
          />
        ))}

        {/* core */}
        <g
          role="button"
          tabIndex={0}
          aria-label="aegis-core skeleton"
          onMouseEnter={() => setFocus("core")}
          onMouseLeave={() => setFocus(null)}
          onFocus={() => setFocus("core")}
          onBlur={() => setFocus(null)}
          className="cursor-pointer outline-none"
          opacity={isLit("core") ? 1 : 0.35}
        >
          <rect x={24} y={140} width={262} height={190} rx={16} fill="url(#coreGlow)" stroke="#8b5cf6" strokeOpacity={0.65} />
          <rect x={24} y={140} width={4} height={190} rx={2} fill="#8b5cf6" />
          <text x={44} y={172} fill="#f8fafc" fontSize={17} fontFamily="ui-monospace, monospace" fontWeight={600}>
            aegis-core
          </text>
          <text x={44} y={191} fill="#94a3b8" fontSize={11}>
            one pipeline · zero domain code
          </text>
          {STAGES.map(([index, label], position) => {
            const chipX = 44 + (position % 2) * 118;
            const chipY = 208 + Math.floor(position / 2) * 44;
            return (
              <g key={label}>
                <rect x={chipX} y={chipY} width={106} height={32} rx={8} fill="#0b1120" stroke="#312e81" />
                <text x={chipX + 10} y={chipY + 20} fill="#c7d2fe" fontSize={10.5} fontFamily="ui-monospace, monospace">
                  {index} · {label}
                </text>
              </g>
            );
          })}
          <text x={44} y={318} fill="#7c3aed" fontSize={10} fontFamily="ui-monospace, monospace">
            scan → critique → heal → verify
          </text>
        </g>

        {(["code", "contract", "codemedic", "lexguard"] as const).map((id) => {
          const node = NODES[id];
          const clickable = id === "codemedic" || id === "lexguard";
          return (
            <g
              key={id}
              role={clickable ? "link" : "button"}
              tabIndex={0}
              aria-label={`${node.title} — ${node.subtitle}`}
              onMouseEnter={() => setFocus(id)}
              onMouseLeave={() => setFocus(null)}
              onFocus={() => setFocus(id)}
              onBlur={() => setFocus(null)}
              onClick={() => openApp(id)}
              onKeyDown={(event) => {
                if (event.key === "Enter") openApp(id);
              }}
              className={clickable ? "cursor-pointer outline-none" : "cursor-help outline-none"}
              opacity={isLit(id) ? 1 : 0.35}
            >
              <rect
                x={node.x}
                y={node.y}
                width={node.w}
                height={node.h}
                rx={14}
                fill="#0a0f1a"
                stroke={isLit(id) ? node.accent : "#1f2937"}
                strokeOpacity={isLit(id) ? 0.75 : 0.6}
                filter={focus === id ? "url(#softGlow)" : undefined}
              />
              <rect x={node.x} y={node.y} width={3.5} height={node.h} rx={2} fill={node.accent} opacity={0.85} />
              <text x={node.x + 18} y={node.y + 40} fill="#f1f5f9" fontSize={14} fontWeight={600}>
                {node.title}
              </text>
              <text x={node.x + 18} y={node.y + 60} fill="#8b98ab" fontSize={10.5}>
                {node.subtitle}
              </text>
              {clickable ? (
                <text x={node.x + 18} y={node.y + 96} fill={node.accent} fontSize={10.5} fontFamily="ui-monospace, monospace">
                  launch live app ↗
                </text>
              ) : (
                <text x={node.x + 18} y={node.y + 96} fill="#5b6779" fontSize={10.5} fontFamily="ui-monospace, monospace">
                  domain pack
                </text>
              )}
            </g>
          );
        })}

      </svg>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
