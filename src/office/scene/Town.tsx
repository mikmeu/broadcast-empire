// The town: the office is an upper floor of its own building, with streets and other buildings around it.

import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useContext, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BUILDINGS, coreFrame, onFloor, westOf, widthOf, type Building, type Rect } from '../../config/office';
import type { GameState } from '../../sim/state';
import { CITY, NATURE, modelUrl } from '../assets';
import { PAVEMENT, hidesOffice, lampHides, rangeOf, streetLevel, townBlocks, trainAt, type TownBlock } from '../city';
import { type Ground, type Site } from '../sites';
import { lotOf } from '../parking';
import { placesOf, roundZ, routesOf } from '../street';
import { roadsOf } from '../traffic';
import { layoutOf, type Layout } from '../townLayout';
import { Fountain } from './Fountain';
import { Parking } from './Parking';
import { KERB, kerbGeometry, slabGeometry } from './kerb';
import { StreetLamp } from './StreetLamp';
import { StreetLife } from './StreetLife';
import { Shape, ViewTurn, World } from './frame';
import { type Materials } from './materials';

// --- The town: the office is an upper floor of its own building, with streets and other buildings around it ---

export function Town({ floor, seed, site, game, still, materials }: {
  floor: number;
  seed: number;
  site: Site;
  /** The game whose people come and go; without one the town has only its traffic and its strollers. */
  game?: GameState;
  still: boolean;
  materials: Materials;
}) {
  const depth = streetLevel(floor);
  const viewTurn = useContext(ViewTurn);
  const building = useContext(Shape);
  const layout = layoutOf(site);
  const own = layout.own(building);
  const blocks = useMemo(() => townBlocks(seed, site, building), [seed, site, building]);
  const pad = { w: CITY.block.w - CITY.streetWidth, d: CITY.block.d - CITY.streetWidth };
  const tint = materials.city.color;
  // How far the town's blocks reach, for the land beyond them.
  const edge = { west: layout.from.x, east: layout.from.x + layout.length.x, north: layout.from.z, south: layout.from.z + layout.length.z + (site.front ? 2 * CITY.block.d : 0) };
  const beyond = (key: string, tone: Ground, x: number, z: number, w: number, d: number, y = 0.03) => (
    <mesh key={key} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]} material={materials[tone]}>
      <planeGeometry args={[w, d]} />
    </mesh>
  );
  // By the water: the shore along the last street and the water behind it, both as wide as the eye can see.
  const lastStreet = layout.from.z + layout.length.z;
  const shore = !layout.map && site.shore && { from: lastStreet + CITY.streetWidth / 2, to: lastStreet + CITY.block.d };
  // A town laid out from a drawing has its beach and water in the drawing; the sea goes on beyond the last of it.
  const seaEnd = layout.map && layout.map.water.length > 0 ? Math.max(...layout.map.water.map((r) => r.z + r.d)) : edge.south;
  // A town laid out by its roads (#218) has open land all round, and its roads and driveways laid on it.
  const byRoads = layout.map !== undefined && layout.map.roads.length > 0;
  // The south edge of the floor the terrace stands on: the front of the core when it faces south (in a U the legs reach further), else the building's depth.
  const front = building.core.faces === 's' ? building.core.y + 6 : building.depth;

  return (
    <group>
      <FloorsBelow count={floor - 1} materials={materials} tint={tint} />

      <group position={[0, -depth, 0]}>
        <mesh position={[building.w / 2, 0, building.depth / 2]} rotation={[-Math.PI / 2, 0, 0]} material={materials.street}>
          <planeGeometry args={[400, 400]} />
        </mesh>
        {/* Where the town is not all town, the land goes on beyond its last streets. */}
        {site.far && !byRoads && beyond('north', site.far, building.w / 2, edge.north - 100.5, 400, 200)}
        {site.far && !byRoads && beyond('west', site.far, edge.west - 100.5, building.depth / 2, 200, 400)}
        {site.far && byRoads && beyond('open', site.far, building.w / 2, building.depth / 2, 400, 400)}
        {site.hills && <Range seed={seed} site={site} materials={materials} />}
        {site.front && beyond('south', site.front, building.w / 2, (shore ? shore.to : seaEnd) + 100, 400, 200, 0.02)}
        {shore && [edge.west - 100, edge.east + 100].map((x) => beyond(`shore${x}`, site.shore!, x, (shore.from + shore.to) / 2, 200, shore.to - shore.from, 0.04))}
        {layout.map ? (
          <CompanyGround layout={layout} building={building} materials={materials} />
        ) : (
          <mesh position={[own.x + own.w / 2, PAVEMENT / 2, own.z + own.d / 2]} material={materials.pavement}>
            <boxGeometry args={[own.w - CITY.streetWidth, PAVEMENT, own.d - CITY.streetWidth]} />
          </mesh>
        )}
        {/* A terrace on the pavement in front of the office; the U has its courtyard instead. */}
        {building.courtyard && <Courtyard area={building.courtyard} layout={layout} materials={materials} tint={tint} />}
        {!building.courtyard && [2.5, 6.5, 13.5, 17.5, 21.5, 25.5].filter((x) => x < building.w && onFloor(building, x, front - 1) && !onFloor(building, x, front) && !(building.core.faces === 's' && Math.abs(x - coreFrame(building).point(0, 5.5).x) < 2)).map((x, n) => (
          <KitModel key={x} file={CITY.parasols[n % 2]!} position={[x, PAVEMENT, front + 0.65]} scale={2 * KIT} tint={tint} />
        ))}
        {blocks.map((block) => (
          <TownBlockView key={`${block.i}:${block.j}`} block={block} site={site} pad={pad} viewTurn={viewTurn} materials={materials} tint={tint} />
        ))}
        {byRoads && <RoadsByTheirDrawing layout={layout} materials={materials} />}
        {layout.map && <RoadMarks layout={layout} materials={materials} />}
        <BusStop layout={layout} materials={materials} />
        <Parking building={building} level={game ? game.floorsUnlocked : building.floors} town={layout} materials={materials} />
        <StreetLife key={seed} seed={seed} site={site} game={game} still={still} materials={materials} />
        <Railway layout={layout} train={site.train} still={still} materials={materials} tint={tint} />
      </group>
    </group>
  );
}

/** One block of the town: its ground, and what stands on it as far as it does not hide the office from this side. */
function TownBlockView({ block, site, pad, viewTurn, materials, tint }: { block: TownBlock; site: Site; pad: { w: number; d: number }; viewTurn: number; materials: Materials; tint: THREE.Color }) {
  const { ground, hill } = block;
  // Open land runs on into the blocks beside it; a built block has a pavement of its own; a cell of a town laid out from a drawing is paved from kerb to kerb.
  const { x, z, w, d } = block.land ?? block.rect ?? { x: block.x, z: block.z, ...pad };
  // Water and sand lie lower than a pavement; a field is striped with rows of another crop.
  const height = ground === 'water' ? 0.06 : ground === 'sand' ? 0.12 : block.land ? 0.16 : PAVEMENT;
  const building = useContext(Shape);
  // A pavement has rounded corners and a kerb (open land that runs on into its neighbours, water, sand and fields are left as they are); a strip down the middle of a dual carriageway is grass inside its kerb.
  const paved = !block.land && ground !== 'water' && ground !== 'sand' && ground !== 'field';
  const rise = block.median ? 0.05 : 0;
  const slab = useMemo(() => (paved ? slabGeometry(w, d, height + rise) : null), [paved, w, d, height, rise]);
  const kerb = useMemo(() => (paved ? kerbGeometry(w, d, height + KERB.rise + rise) : null), [paved, w, d, height, rise]);
  return (
    <group>
      {slab ? (
        <mesh position={[x, 0, z]} geometry={slab} material={block.median ? materials.grass : materials[ground]} />
      ) : (
        <mesh position={[x, height / 2, z]} material={materials[ground]}>
          <boxGeometry args={[w, height, d]} />
        </mesh>
      )}
      {kerb && <mesh position={[x, 0, z]} geometry={kerb} material={materials.facade} />}
      {block.lamps
        ?.filter((lamp) => !lampHides(lamp, viewTurn, building))
        .map((lamp, n) => (
          <group key={`l${n}`} position={[lamp.x, height, lamp.z]}>
            <StreetLamp materials={materials} />
          </group>
        ))}
      {/* Alleyways: asphalt strips on the pavement, with no traffic. */}
      {block.alleys?.map((alley, n) => (
        <mesh key={n} position={[alley.x, height + 0.01, alley.z]} rotation={[-Math.PI / 2, 0, 0]} material={materials.street}>
          <planeGeometry args={[alley.w, alley.d]} />
        </mesh>
      ))}
      {ground === 'field' &&
        [-1.5, 0.5].map((row) => (
          <mesh key={row} position={[x, height + 0.01, z + (row * d) / 4]} rotation={[-Math.PI / 2, 0, 0]} material={materials.grass}>
            <planeGeometry args={[w, d / 4]} />
          </mesh>
        ))}
      {ground === 'sand' &&
        [-1.6, 0.4, 2].map((dx, n) => <KitModel key={dx} file={CITY.parasols[n % 2]!} position={[block.x + dx, height, block.z + (n - 1) * 1.2]} scale={2 * KIT} tint={tint} />)}
      {/* Foothills: the Nature Kit's slopes and cliffs, in the town's tones. */}
      {hill
        ?.filter((piece) => !hidesOffice(piece, viewTurn, piece.scale, building))
        .map((piece, n) => (
          <NatureModel key={n} file={piece.building.file} position={[piece.x, height + NATURE.sink * piece.scale, piece.z]} turn={piece.turn} scale={piece.scale} materials={materials} />
        ))}
      {block.items
        .filter((item) => !hidesOffice(item, viewTurn, site.scale, building))
        .map((item, n) => (
          <KitModel key={n} file={item.building.file} center={[item.building.cx ?? 0, item.building.cz ?? 0]} position={[item.x, PAVEMENT, item.z]} turn={item.turn} scale={site.scale} tint={tint} />
        ))}
    </group>
  );
}

/**
 * The floors of the office's own building under the one in view, drawn the way
 * the kit draws its buildings: pale walls, a row of windows per storey, a dark
 * band between storeys and awnings over the shop front at street level.
 */
function FloorsBelow({ count, materials, tint }: { count: number; materials: Materials; tint: THREE.Color }) {
  const building = useContext(Shape);
  const single = building.wings.length === 1;

  return (
    <>
      {Array.from({ length: count }, (_, k) => {
        const top = -CITY.streetBelow - k * CITY.perFloor;
        const atStreet = k === count - 1;
        return (
          <group key={k}>
            {/* A box for each wing of the building; the windows face south and east, where the view looks from. */}
            {building.wings.map((wing, n) => {
              const front = wing.y + wing.h + 0.2;
              const side = wing.x + wing.w + 0.2;
              const across = Array.from({ length: Math.floor(wing.w / 2) }, (_, i) => wing.x + 1 + i * 2);
              const along = Array.from({ length: Math.floor(wing.h / 2.2) }, (_, i) => wing.y + 1.1 + i * 2.2);
              // The awnings over the shop front: in the standard building at the places they have always been; in a wing of the U, every four tiles.
              const awnings = single ? [-3, 3, 7, 13, 17, 21, 25].filter((x) => x < building.w) : Array.from({ length: Math.floor((wing.w - 2) / 4) }, (_, i) => wing.x + 3 + i * 4);
              return (
                <group key={n}>
                  <mesh position={[wing.x + wing.w / 2, top - CITY.perFloor / 2, wing.y + wing.h / 2]} material={materials.facade}>
                    <boxGeometry args={[wing.w + 0.4, CITY.perFloor, wing.h + 0.4]} />
                  </mesh>
                  <mesh position={[wing.x + wing.w / 2, top - 0.15, wing.y + wing.h / 2]} material={materials.trim}>
                    <boxGeometry args={[wing.w + 0.6, 0.3, wing.h + 0.6]} />
                  </mesh>
                  {across.map((x) => (
                    <mesh key={`f${x}`} position={[x, top - (atStreet ? 1.9 : 1.6), front]} material={materials.glass}>
                      <boxGeometry args={[1.3, atStreet ? 1.9 : 1.5, 0.12]} />
                    </mesh>
                  ))}
                  {along.map((z) => (
                    <mesh key={`s${z}`} position={[side, top - (atStreet ? 1.9 : 1.6), z]} material={materials.glass}>
                      <boxGeometry args={[0.12, atStreet ? 1.9 : 1.5, 1.4]} />
                    </mesh>
                  ))}
                  {atStreet && awnings.map((x) => (
                    <KitModel key={`a${x}`} file={CITY.awning} position={[x, top - 0.75, front + 0.05]} scale={3 * KIT} tint={tint} />
                  ))}
                </group>
              );
            })}
          </group>
        );
      })}
    </>
  );
}

/** Where trees stand in a courtyard with no lot, as fractions of its width and depth, and which tree. */
const COURTYARD_TREES: readonly [x: number, z: number, large: boolean][] = [
  [0.38, 0.2, true], [0.62, 0.12, false], [0.86, 0.22, true],
  [0.38, 0.82, false], [0.62, 0.88, true], [0.86, 0.8, false],
  [0.98, 0.5, true],
];

/** Where trees stand on the green of the lot's courtyard, as fractions of its length and as which edge of it: clear of the fountain. */
const GREEN_TREES: readonly [x: number, edge: -1 | 1, large: boolean][] = [
  [0.06, -1, true], [0.16, 1, false], [0.3, -1, false], [0.34, 1, true], [0.66, -1, true], [0.72, 1, false], [0.86, -1, false], [0.94, 1, true],
];
/** How high the green lies over the pavement. */
const GREEN_RAISE = 0.05;
/** The things that stand with the kit (awnings, parasols, trees on the greens) are drawn as much larger as the kit is: it was 3 until 0.20.0, and is 6. */
const KIT = CITY.scale / 3;

/**
 * The courtyard of the U: paved, and where the lot is in it (a town laid out from
 * a drawing) a green between the parking strips, with trees along it and the fountain.
 */
function Courtyard({ area, layout, materials, tint }: { area: Rect; layout: Layout; materials: Materials; tint: THREE.Color }) {
  const yard = layout.map?.courtyard;
  const green = yard?.green[0];
  return (
    <group>
      <mesh position={[area.x + area.w / 2, PAVEMENT / 2, area.y + area.h / 2]} material={materials.pavement}>
        <boxGeometry args={[area.w, PAVEMENT, area.h]} />
      </mesh>
      {yard && green ? (
        <>
          <mesh position={[green.x + green.w / 2, PAVEMENT + GREEN_RAISE / 2, green.z + green.d / 2]} material={materials.grass}>
            <boxGeometry args={[green.w, GREEN_RAISE, green.d]} />
          </mesh>
          {GREEN_TREES.map(([fx, edge, large], n) => (
            <KitModel key={n} file={large ? 'suburban/tree-large.glb' : 'suburban/tree-small.glb'} position={[green.x + fx * green.w, PAVEMENT + GREEN_RAISE, green.z + green.d / 2 + (edge * green.d) / 3]} scale={(large ? 2.2 : 1.8) * KIT} tint={tint} />
          ))}
          {yard.fountain && (
            <group position={[yard.fountain.x, PAVEMENT + GREEN_RAISE, yard.fountain.z]}>
              <Fountain materials={materials} />
            </group>
          )}
        </>
      ) : (
        COURTYARD_TREES.map(([fx, fz, large], n) => (
          <KitModel key={n} file={large ? 'suburban/tree-large.glb' : 'suburban/tree-small.glb'} position={[area.x + fx * area.w, PAVEMENT, area.y + fz * area.h]} scale={(large ? 2.2 : 1.8) * KIT} tint={tint} />
        ))
      )}
    </group>
  );
}

/** The kit's buildings share one painted texture; a tint over it brings them into the palette. */
const cityMaterials = new Map<string, THREE.MeshLambertMaterial>();

function cityMaterial(source: THREE.Material, tint: THREE.Color): THREE.MeshLambertMaterial {
  const map = (source as THREE.MeshStandardMaterial).map ?? null;
  const key = `${map?.uuid}:${tint.getHexString()}`;
  let material = cityMaterials.get(key);
  if (!material) {
    material = new THREE.MeshLambertMaterial({ map, color: tint });
    cityMaterials.set(key, material);
  }
  return material;
}

/** A model from the City Kit, standing on the given point. */
function KitModel({ file, position, turn = 0, scale, tint, center = [0, 0] }: {
  file: string;
  position: [number, number, number];
  turn?: number;
  scale: number;
  tint: THREE.Color;
  /** Where the middle of the model is, from its own origin, in its own units: it is put on `position`. */
  center?: [x: number, z: number];
}) {
  const { scene } = useGLTF(modelUrl(file));
  const object = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) mesh.material = cityMaterial(mesh.material as THREE.Material, tint);
    });
    return copy;
  }, [scene, tint]);
  return (
    <group position={position} rotation={[0, (turn * Math.PI) / 2, 0]} scale={scale}>
      <primitive object={object} position={[-center[0], 0, -center[1]]} />
    </group>
  );
}

/** A model from the Nature Kit: each of its materials is swapped for the tone of the same name in the theme. */
function NatureModel({ file, position, turn, scale, materials }: { file: string; position: [number, number, number]; turn: number; scale: number; materials: Materials }) {
  const { scene } = useGLTF(modelUrl(file));
  const object = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) mesh.material = materials[NATURE.tones[(mesh.material as THREE.Material).name] ?? 'rock'];
    });
    return copy;
  }, [scene, materials]);
  return (
    <group position={position} rotation={[0, (turn * Math.PI) / 2, 0]} scale={scale}>
      <primitive object={object} />
    </group>
  );
}

/**
 * The range behind the town: faceted cones in rows, green at the foot and rock
 * above, each row higher than the one in front. A peak that would hide the
 * office from a turned view is left out, as a building is.
 */
function Range({ seed, site, materials }: { seed: number; site: Site; materials: Materials }) {
  const viewTurn = useContext(ViewTurn);
  const building = useContext(Shape);
  const peaks = useMemo(() => rangeOf(seed, site, building), [seed, site, building]);
  // The rock starts this far up a peak; the cap is the same cone, from there to the top.
  const rockFrom = 0.55;
  return (
    <>
      {peaks
        .filter((peak) => !hidesOffice({ building: { file: '', w: peak.radius * 2, height: peak.height, d: peak.radius * 2 }, x: peak.x, z: peak.z, turn: 0 }, viewTurn, 1, building))
        .map((peak, n) => (
          <group key={n} position={[peak.x, 0, peak.z]} rotation={[0, peak.angle, 0]}>
            <mesh position={[0, peak.height / 2, 0]} material={materials.plant}>
              <coneGeometry args={[peak.radius, peak.height, peak.sides, 1]} />
            </mesh>
            <mesh position={[0, peak.height * (rockFrom + (1 - rockFrom) / 2), 0]} material={materials.rock}>
              <coneGeometry args={[peak.radius * (1 - rockFrom) * 1.02, peak.height * (1 - rockFrom) * 1.01, peak.sides, 1]} />
            </mesh>
          </group>
        ))}
    </>
  );
}

/**
 * The company's own ground in a town laid out from a drawing, until the U is
 * built: the box of the U is grass, and a longer building reaches over the
 * street east of it. Paths of paving run where people walk: from the stops
 * and from behind the office to the entrance, and from the lot.
 */
function CompanyGround({ layout, building, materials }: { layout: Layout; building: Building; materials: Materials }) {
  const { plot } = layout.map!;
  const roads = roadsOf(layout);
  const places = placesOf(roads);
  const routes = routesOf(roads);
  const lot = lotOf(building, layout);
  const east = westOf(building) + widthOf(building) + 1.5;
  const lower = lot.along === 'x' ? 0.03 : 0;
  const lines: (readonly [number, number][])[] = [
    routes.bus,
    routes.taxi,
    routes.walk,
    // From the lot to the door on the courtyard side is across the green: no path. From a lot on a road along x (#218): along its aisle, away from the road's end, and over to the gate.
    ...(places.round && lot.strips.length > 0 ? [[[lot.x0, roundZ(building, lot.z1 + 0.2)], [places.round[0], roundZ(building, lot.z1 + 0.2)], places.round, places.gate] as [number, number][]] : lot.strips.length > 0 ? [] : lot.along === 'x' ? [[[lot.x0 - 0.3, (lot.aisle.x0 + lot.aisle.x1) / 2], [places.gate[0], (lot.aisle.x0 + lot.aisle.x1) / 2], places.gate] as [number, number][]] : [[places.gate, [places.gate[0], lot.walkZ], [lot.x0 - 0.1, lot.walkZ]] as [number, number][]]),
  ];
  const strips = lines.flatMap((line) => line.slice(1).map((to, i) => [line[i]!, to] as const));
  return (
    <group>
      {/* (Under a lot on a road along x the grass lies a little lower, so that the lot's slab stands clear of it.) */}
      <mesh position={[plot.x + plot.w / 2, (PAVEMENT - lower) / 2, plot.z + plot.d / 2]} material={materials.grass}>
        <boxGeometry args={[plot.w, PAVEMENT - lower, plot.d]} />
      </mesh>
      {east > plot.x + plot.w && (
        <mesh position={[(plot.x + plot.w + east) / 2, PAVEMENT / 2, (plot.z + building.depth + 1.5) / 2]} material={materials.pavement}>
          <boxGeometry args={[east - plot.x - plot.w, PAVEMENT, building.depth + 1.5 - plot.z]} />
        </mesh>
      )}
      {strips.map(([from, to], n) => {
        const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
        if (length < 0.01) return null;
        return (
          <mesh key={n} position={[(from[0] + to[0]) / 2, PAVEMENT + 0.01, (from[1] + to[1]) / 2]} rotation={[0, Math.atan2(to[0] - from[0], to[1] - from[1]), 0]} material={materials.pavement}>
            <boxGeometry args={[0.9, 0.02, length + 0.9]} />
          </mesh>
        );
      })}
    </group>
  );
}

/** How far above the open land the roads of a town laid out by its roads lie: above the water too, where they cross it. */
const ROAD_Y = 0.07;

/**
 * The roads of a town laid out by its roads (#218), each over its own length: asphalt from end to end, the ends beside another
 * road reaching to its far kerb, and those at the edge of the drawing running on out of sight. A road over a river is a flat bridge.
 * The driveways are paved strips with no traffic.
 */
function RoadsByTheirDrawing({ layout, materials }: { layout: Layout; materials: Materials }) {
  const { roads, driveways } = layout.map!;
  const edge = layout.edge!;
  const half = layout.streetWidth / 2;
  const out = 60;
  return (
    <group>
      {roads.map((road, n) => {
        const [low, high] = road.along === 'x' ? [edge.x, edge.x + edge.w] : [edge.z, edge.z + edge.d];
        const from = road.from! - (Math.abs(road.from! - low) < 0.01 ? out : half);
        const to = road.to! + (Math.abs(road.to! - high) < 0.01 ? out : half);
        const [w, d] = road.along === 'x' ? [to - from, layout.streetWidth] : [layout.streetWidth, to - from];
        const [x, z] = road.along === 'x' ? [(from + to) / 2, road.at] : [road.at, (from + to) / 2];
        return (
          <mesh key={n} position={[x, ROAD_Y, z]} rotation={[-Math.PI / 2, 0, 0]} material={materials.street}>
            <planeGeometry args={[w, d]} />
          </mesh>
        );
      })}
      {driveways.map((r, n) => (
        <mesh key={`d${n}`} position={[r.x + r.w / 2, ROAD_Y, r.z + r.d / 2]} rotation={[-Math.PI / 2, 0, 0]} material={materials.street}>
          <planeGeometry args={[r.w, r.d]} />
        </mesh>
      ))}
    </group>
  );
}

/** The dashed line down the middle of every street of a town laid out from a drawing, between its two lanes; the crossings are left bare. */
function RoadMarks({ layout, materials }: { layout: Layout; materials: Materials }) {
  // (A road laid on the open land lies a little above it, the dashes above that.)
  const y = layout.map && layout.map.roads.length > 0 ? ROAD_Y + 0.004 : 0.014;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dashes = useMemo(() => {
    const out: { x: number; z: number; along: 'x' | 'z' }[] = [];
    const streets = layout.streets(BUILDINGS.standard);
    const gap = layout.streetWidth / 2 + 0.5;
    const [dash, rest] = [1.4, 1.4];
    for (const street of streets) {
      if (street.along === 'x' && Math.abs(street.at - layout.railway.z) < 0.01) continue;
      // The roads that cross it or end on it (a road with ends of its own is crossed only by the ones that reach it).
      const across = streets.filter((other) => other.along !== street.along && (street.from === undefined || (other.at >= street.from - gap && other.at <= (street.to ?? Infinity) + gap)) && (other.from === undefined || (street.at >= other.from - gap && street.at <= (other.to ?? Infinity) + gap))).map((other) => other.at);
      const [from, to] = street.from !== undefined ? [street.from, street.to!] : street.along === 'z' ? [layout.from.z, layout.from.z + layout.length.z] : [layout.from.x, layout.from.x + layout.length.x];
      for (let at = from + dash / 2; at < to - dash / 2; at += dash + rest) {
        if (across.some((line) => Math.abs(line - at) < gap + dash / 2)) continue;
        out.push(street.along === 'z' ? { x: street.at, z: at, along: 'z' } : { x: at, z: street.at, along: 'x' });
      }
    }
    return out;
  }, [layout]);
  useLayoutEffect(() => {
    const node = mesh.current;
    if (!node) return;
    const frame = new THREE.Object3D();
    dashes.forEach((dash, n) => {
      frame.position.set(dash.x, y, dash.z);
      frame.scale.set(dash.along === 'z' ? 0.12 : 1.4, 0.02, dash.along === 'z' ? 1.4 : 0.12);
      frame.updateMatrix();
      node.setMatrixAt(n, frame.matrix);
    });
    node.instanceMatrix.needsUpdate = true;
    node.computeBoundingSphere();
  }, [dashes, y]);
  return (
    <instancedMesh key={dashes.length} ref={mesh} args={[undefined, materials.white, dashes.length]}>
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
}

/** The bus stop on the pavement beside the reception's street: a glass shelter with a bench, and a sign on a pole. Its back is to the office's side. */
function BusStop({ layout, materials }: { layout: Layout; materials: Materials }) {
  const { busStop } = roadsOf(layout);
  const { x, z } = busStop.wait;
  // The shelter is modelled for a street to the south of it, with the pavement north of the lane.
  const turn = layout.stops.bus.along === 'x' ? (busStop.wait.z < busStop.z ? 0 : Math.PI) : busStop.wait.x > busStop.x ? -Math.PI / 2 : Math.PI / 2;
  return (
    <group position={[x, PAVEMENT, z]} rotation={[0, turn, 0]}>
      <mesh position={[0, 0.6, -0.3]} material={materials.glass}>
        <boxGeometry args={[1.8, 1.2, 0.06]} />
      </mesh>
      <mesh position={[0, 1.24, -0.08]} material={materials.metalDark}>
        <boxGeometry args={[2, 0.08, 0.56]} />
      </mesh>
      <mesh position={[0, 0.26, -0.16]} material={materials.wood}>
        <boxGeometry args={[1.4, 0.08, 0.26]} />
      </mesh>
      <mesh position={[1.25, 0.8, 0.12]} material={materials.metalMid}>
        <boxGeometry args={[0.07, 1.6, 0.07]} />
      </mesh>
      <mesh position={[1.25, 1.5, 0.12]} material={materials.lamp}>
        <boxGeometry args={[0.42, 0.3, 0.09]} />
      </mesh>
    </group>
  );
}

/**
 * The elevated railway in front of the office: a deck on pillars with the
 * kit's track on it, and every now and then the yellow train going by.
 * With motion reduced no train runs.
 */
function Railway({ layout, train: cars, still, materials, tint }: { layout: Layout; train: readonly string[]; still: boolean; materials: Materials; tint: THREE.Color }) {
  const { height, scale, track, trackLength, carLength } = CITY.railway;
  const RAILWAY = layout.railway;
  const train = useRef<THREE.Group>(null);
  const piece = trackLength * scale;
  const pieces = Math.ceil(RAILWAY.length / piece);
  const { now } = useContext(World);

  useFrame(() => {
    const node = train.current;
    if (!node) return;
    const at = still ? null : trainAt(now(), cars.length, layout);
    node.visible = at !== null;
    if (!at) return;
    node.position.x = at.x;
    node.rotation.y = at.direction > 0 ? 0 : Math.PI;
  });

  return (
    <group position={[0, 0, RAILWAY.z]}>
      <mesh position={[RAILWAY.from + RAILWAY.length / 2, height - 0.2, 0]} material={materials.trim}>
        <boxGeometry args={[RAILWAY.length, 0.4, 2.1]} />
      </mesh>
      {/* No road runs under the line: each block gets a paved strip, and a pillar in the middle of it, clear of the cross streets. */}
      {RAILWAY.strips.map((strip, i) => (
        <group key={i} position={[(strip.from + strip.to) / 2, 0, 0]}>
          <mesh position={[0, PAVEMENT / 2, 0]} material={materials.pavement}>
            <boxGeometry args={[strip.to - strip.from, PAVEMENT, RAILWAY.width + 0.02]} />
          </mesh>
          <mesh position={[0, (height - 0.4) / 2, 0]} material={materials.facade}>
            <boxGeometry args={[0.5, height - 0.4, 0.5]} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: pieces }, (_, i) => (
        <KitModel key={i} file={track} position={[RAILWAY.from + i * piece, height + CITY.railway.trackDrop * scale, 0]} turn={1} scale={scale} tint={tint} />
      ))}
      {/* The train points along +x; its front is at the group's origin and the carriages trail behind. */}
      <group ref={train} position={[RAILWAY.from, height + 0.1 * scale, 0]} visible={false}>
        {cars.map((file, i) => (
          <KitModel key={`${file}${i}`} file={file} position={[-(i + 0.5) * carLength * scale, 0, 0]} turn={1} scale={scale} tint={tint} />
        ))}
      </group>
    </group>
  );
}
