// The map of Etheria. It only draws: what each region shows and what a click
// does is up to the screen that uses it.

import type { ReactNode } from 'react';
import { BEYOND_PATH, MAP_SIZE, REGION_LABELS, REGION_PATHS } from '../config/map';
import { REGIONS, type RegionId } from '../config/world';

interface Props {
  selected: RegionId | null;
  onSelect: (regionId: RegionId) => void;
  /** One short line under each region's name. */
  caption: (regionId: RegionId) => ReactNode;
}

export function EtheriaMap({ selected, onSelect, caption }: Props) {
  return (
    <svg className="etheria-map" viewBox={`0 0 ${MAP_SIZE.width} ${MAP_SIZE.height}`} role="group" aria-label="Map of Etheria">
      <rect className="map-sea" width={MAP_SIZE.width} height={MAP_SIZE.height} />
      <path className="map-beyond" d={BEYOND_PATH} />

      {REGIONS.map((region) => (
        <path
          key={region.id}
          className={`map-region ${region.id}${region.id === selected ? ' selected' : ''}`}
          d={REGION_PATHS[region.id]}
          role="button"
          tabIndex={0}
          aria-label={region.name}
          aria-pressed={region.id === selected}
          onClick={() => onSelect(region.id)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(region.id))}
        />
      ))}
      {/* The selected outline is drawn again on top so its neighbours don't cover half of it. */}
      {selected && <path className="map-outline" d={REGION_PATHS[selected]} />}

      {REGIONS.map((region) => {
        const { x, y } = REGION_LABELS[region.id];
        return (
          <g key={region.id} className="map-label">
            <text className="map-name" x={x} y={y}>{region.name}</text>
            <text className="map-caption" x={x} y={y + 16}>{caption(region.id)}</text>
          </g>
        );
      })}
      <text className="map-small" x="640" y="40">THE SEA</text>
    </svg>
  );
}
