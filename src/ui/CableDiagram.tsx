import type { ChainKind } from '../sim/control';
import type { DiagramLayout, DiagramPoint } from './cableLayout';

const COLOUR = { live: 'var(--good)', cut: 'var(--negative)', idle: 'var(--text-muted)' } as const;

/** The little picture of a point: a camera, a mixer with sliders, a mast, a dish. */
function Symbol({ kind, x, y }: { kind: ChainKind; x: number; y: number }) {
  const line = { stroke: 'var(--text)', strokeWidth: 1.5, fill: 'none' };
  switch (kind) {
    case 'camera':
      return (
        <g transform={`translate(${x} ${y})`} {...line}>
          <rect x={0} y={3} width={12} height={9} />
          <path d="M12 6 L17 3 L17 12 L12 9 Z" />
        </g>
      );
    case 'video':
    case 'audio':
    case 'mcr':
      return (
        <g transform={`translate(${x} ${y})`} {...line}>
          <rect x={0} y={1} width={17} height={13} />
          <path d="M4 3 V12 M8.5 3 V12 M13 3 V12" />
          <path d="M2.5 6 H5.5 M7 9 H10 M11.5 5 H14.5" strokeWidth={2.5} />
        </g>
      );
    case 'studio':
      return (
        <g transform={`translate(${x} ${y})`} {...line}>
          <rect x={5} y={1} width={7} height={9} rx={3.5} />
          <path d="M2 7 Q2 14 8.5 14 Q15 14 15 7 M8.5 14 V16" />
        </g>
      );
    case 'antenna':
      return (
        <g transform={`translate(${x} ${y})`} {...line}>
          <path d="M8.5 15 V4 M4 15 H13 M4 8 Q2 5 4 2 M13 8 Q15 5 13 2" />
          <circle cx={8.5} cy={3} r={1.5} />
        </g>
      );
    case 'dish':
      return (
        <g transform={`translate(${x} ${y})`} {...line}>
          <path d="M2 4 Q4 14 14 13 Z" />
          <path d="M8 9 L13 3 M6 15 H12" />
        </g>
      );
  }
}

function PointBox({ p }: { p: DiagramPoint }) {
  return (
    <g>
      <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={4} fill="var(--surface)" stroke="var(--border)" strokeWidth={1.5} strokeDasharray={p.missing ? '4 3' : undefined} />
      <Symbol kind={p.kind} x={p.x + p.w / 2 - 8.5} y={p.y + 2} />
      <text x={p.x + p.w / 2} y={p.y + p.h - 5} textAnchor="middle" fontSize={9} fill={p.missing ? 'var(--text-muted)' : 'var(--text)'}>
        {p.label}
      </text>
    </g>
  );
}

/** The cables drawn floor by floor, from the sources up to the antenna and the dish (0.22.0). It only shows; nothing in it is clicked. */
export function CableDiagram({ layout }: { layout: DiagramLayout }) {
  return (
    <div className="cable-diagram">
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width} height={layout.height} role="img" aria-label="Where the cables go, floor by floor">
        {layout.bands.map((b) => (
          <g key={b.floor ?? 'roof'}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill="var(--surface-sunk)" stroke="var(--border)" />
            <text x={b.x + 6} y={b.y + 12} fontSize={10} fontWeight={700} fill="var(--text-muted)">
              {b.label}
            </text>
          </g>
        ))}
        {layout.rooms.map((r) => (
          <g key={r.id}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={3} fill="none" stroke="var(--border)" strokeWidth={1} />
            <text x={r.x + 4} y={r.y + 10} fontSize={9} fill="var(--text-muted)">
              {r.name}
            </text>
          </g>
        ))}
        {layout.lines.map((l) => (
          <polyline key={l.key} points={l.path.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke={COLOUR[l.status]} strokeWidth={2} strokeLinejoin="round" />
        ))}
        {layout.points.map((p) => (
          <PointBox key={p.id} p={p} />
        ))}
      </svg>
    </div>
  );
}
