// The town: the office is an upper floor of its own building, with streets and other buildings around it.

import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { memo, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BUILDINGS, coreFrame, onFloor, westOf, widthOf, type Building, type Rect } from '../../config/office';
import type { GameState } from '../../sim/state';
import { CITY, NATURE, modelUrl } from '../assets';
import { ARROW, PAVEMENT, arrowsOf, carSpots, hidesOffice, lampHides, lampTurn, placedAt, rangeOf, streetLevel, townBlocks, trainAt, type TownBlock } from '../city';
import { type Site } from '../sites';
import { lotOf } from '../parking';
import { lotPathOf, routesOf } from '../street';
import { roadsOf } from '../traffic';
import { layoutOf, touchesGrid, type Layout, type Rect as Area } from '../townLayout';
import { Fountain } from './Fountain';
import { Parking } from './Parking';
import { KERB, kerbGeometry, slabGeometry } from './kerb';
import { StreetLamp } from './StreetLamp';
import { Roads, kerbTop } from './Roads';
import { roadPiecesOf } from '../roadPieces';
import { awningSpots, wallPieces } from '../buildingPieces';
import { BuildingKit } from './BuildingKit';
import { trackStretches } from '../levelCrossing';
import { StreetLife } from './StreetLife';
import { Shape, ViewTurn, World } from './frame';
import { type Materials } from './materials';

// --- The town: the office is an upper floor of its own building, with streets and other buildings around it ---

export const Town = memo(function Town({ floor, seed, site, game, still, materials, decor = 0, showHidden = false }: {
  floor: number;
  seed: number;
  site: Site;
  /** The game whose people come and go; without one the town has only its traffic and its strollers. */
  game?: GameState;
  still: boolean;
  materials: Materials;
  /** For the map editor (#328): counts up when the decor of the layout (houses, trees, lamps, hills, peaks, flat ground) was replaced on the same layout. */
  decor?: number;
  /** For the map editor: also draws what the game leaves out from this side of the view, because it would hide the office. */
  showHidden?: boolean;
}) {
  const depth = streetLevel(floor);
  const viewTurn = useContext(ViewTurn);
  const building = useContext(Shape);
  const layout = layoutOf(site);
  const own = layout.own(building);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const blocks = useMemo(() => townBlocks(site, building), [site, building, decor]);
  const pad = { w: CITY.block.w - CITY.streetWidth, d: CITY.block.d - CITY.streetWidth };
  const tint = materials.city.color;
  // A town laid out by its roads (#218) has open land all round, and its roads laid on it.
  const byRoads = layout.map !== undefined && layout.map.roads.length > 0;
  // The streets are laid with the kit's pieces (#285), a little above the plane or the roads they lie on.
  const roadPlan = useMemo(() => roadPiecesOf(layout), [layout]);
  const roadLevel = (byRoads ? ROAD_Y : 0) + 0.003;
  // The south edge of the floor the terrace stands on: the front of the core when it faces south (in a U the legs reach further), else the building's depth.
  const front = building.core.faces === 's' ? building.core.y + 6 : building.depth;

  return (
    <group>
      <FloorsBelow count={floor - 1} materials={materials} tint={tint} />

      <group position={[0, -depth, 0]}>
        {/* Grass is the base of every map (#327): the streets are asphalt laid on it, and the ground the map paints is laid over that. */}
        <mesh position={[building.w / 2, 0, building.depth / 2]} rotation={[-Math.PI / 2, 0, 0]} material={materials.grass}>
          <planeGeometry args={[400, 400]} />
        </mesh>
        {layout.map && <Asphalt layout={layout} materials={materials} />}
        {layout.map && <FarGround layout={layout} materials={materials} />}
        {layout.map && layout.map.peaks.length > 0 && <Range site={site} materials={materials} decor={decor} showHidden={showHidden} />}
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
          <TownBlockView key={`${block.i}:${block.j}`} block={block} site={site} pad={pad} viewTurn={viewTurn} materials={materials} tint={tint} showHidden={showHidden} />
        ))}
        {layout.map && <PaintedAndPlaced layout={layout} site={site} viewTurn={viewTurn} materials={materials} tint={tint} showHidden={showHidden} />}
        {layout.map && layout.map.walks && <Sidewalks layout={layout} materials={materials} />}
        {byRoads && <RoadsByTheirDrawing layout={layout} materials={materials} />}
        {layout.map && <Roads plan={roadPlan} level={roadLevel} materials={materials} />}
        {layout.map && <RoadMarks layout={layout} bare={roadPlan.bare} level={roadLevel} materials={materials} />}
        <BusStop layout={layout} materials={materials} />
        <Parking building={building} level={game ? game.floorsUnlocked : building.floors} town={layout} materials={materials} />
        <StreetLife key={seed} seed={seed} site={site} game={game} still={still} materials={materials} />
        <Railway layout={layout} train={site.train} still={still} materials={materials} tint={tint} />
      </group>
    </group>
  );
});

/** The land that lies beyond the town: ground that touches the edge of the grid every map has runs on out of sight (#327). */
function FarGround({ layout, materials }: { layout: Layout; materials: Materials }) {
  const far = layout.map!.ground.filter((g) => touchesGrid(g));
  const OUT = 200;
  return (
    <group>
      {far.map((g, n) => {
        const [x0, z0, x1, z1] = [g.x - (g.x <= -140 + 0.01 ? OUT : 0), g.z - (g.z <= -140 + 0.01 ? OUT : 0), g.x + g.w + (g.x + g.w >= 140 - 0.01 ? OUT : 0), g.z + g.d + (g.z + g.d >= 140 - 0.01 ? OUT : 0)];
        return (
          <mesh key={n} position={[(x0 + x1) / 2, g.kind === 'water' ? 0.02 : 0.03, (z0 + z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} material={materials[g.kind === 'concrete' ? 'pavement' : g.kind === 'asphalt' ? 'street' : g.kind]}>
            <planeGeometry args={[x1 - x0, z1 - z0]} />
          </mesh>
        );
      })}
    </group>
  );
}

/** The asphalt under the streets and the railway: what the kit's road pieces and the slabs of the blocks lie over, a little wider than the streets so that no green shows at the rounded corners of a block. */
function Asphalt({ layout, materials }: { layout: Layout; materials: Materials }) {
  const { carriageways } = layout.map!;
  const rail = layout.railway;
  const rects: Area[] = [...carriageways.map((r) => ({ x: r.x - 0.6, z: r.z - 0.6, w: r.w + 1.2, d: r.d + 1.2 })), { x: rail.from, z: rail.z - rail.width / 2, w: rail.length, d: rail.width }];
  return (
    <group>
      {rects.map((r, n) => (
        <mesh key={n} position={[r.x + r.w / 2, 0.002, r.z + r.d / 2]} rotation={[-Math.PI / 2, 0, 0]} material={materials.street}>
          <planeGeometry args={[r.w, r.d]} />
        </mesh>
      ))}
    </group>
  );
}

/** The concrete and asphalt a map paints flat on the ground, and the lamp posts it puts down (#284, #287, #327). The houses and trees are on the blocks. */
function PaintedAndPlaced({ layout, viewTurn, materials, showHidden }: { layout: Layout; site: Site; viewTurn: number; materials: Materials; tint: THREE.Color; showHidden: boolean }) {
  const { ground, roads, lamps, carriageways } = layout.map!;
  const building = useContext(Shape);
  // On the open land of a town laid out by its roads the ground is lower than a pavement.
  const level = roads.length > 0 ? 0.17 : PAVEMENT + 0.01;
  const asphalt = roads.length > 0 ? ROAD_Y : PAVEMENT + 0.01;
  return (
    <group>
      {ground
        .filter((g) => (g.kind === 'concrete' || g.kind === 'asphalt') && !touchesGrid(g))
        .map((r, n) => (
          <mesh key={n} position={[r.x + r.w / 2, r.kind === 'concrete' ? level : asphalt, r.z + r.d / 2]} rotation={[-Math.PI / 2, 0, 0]} material={r.kind === 'concrete' ? materials.pavement : materials.street}>
            <planeGeometry args={[r.w, r.d]} />
          </mesh>
        ))}
      {lamps
        .filter((lamp) => showHidden || !lampHides(lamp, viewTurn, building))
        .map((lamp, n) => (
          <group key={`l${n}`} position={[lamp.x, roads.length > 0 ? level : PAVEMENT, lamp.z]}>
            <StreetLamp materials={materials} turn={lampTurn(lamp, carriageways)} />
          </group>
        ))}
    </group>
  );
}

/** One block of the town: its ground, and what stands on it as far as it does not hide the office from this side. */
const TownBlockView = memo(function TownBlockView({ block, site, pad, viewTurn, materials, tint, showHidden }: { block: TownBlock; site: Site; pad: { w: number; d: number }; viewTurn: number; materials: Materials; tint: THREE.Color; showHidden: boolean }) {
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
      {ground === 'field' &&
        [-1.5, 0.5].map((row) => (
          <mesh key={row} position={[x, height + 0.01, z + (row * d) / 4]} rotation={[-Math.PI / 2, 0, 0]} material={materials.grass}>
            <planeGeometry args={[w, d / 4]} />
          </mesh>
        ))}
      {ground === 'sand' &&
        [-1.6, 0.4, 2].map((dx, n) => <KitModel key={dx} file={CITY.parasols[n % 2]!} position={[block.x + dx, height, block.z + (n - 1) * 1.2]} scale={2 * KIT} tint={tint} />)}
      {/* Foothills: the Nature Kit's slopes and cliffs, in the town's tones. */}
      {/* (Keyed by what they are and where they stand, so that taking one away in the map editor leaves the rest as they are.) */}
      {hill
        ?.filter((piece) => showHidden || !hidesOffice(piece, viewTurn, piece.scale, building))
        .map((piece, n, shown) => (
          <NatureModel key={standing(piece, shown, n)} file={piece.building.file} position={[piece.x, height + NATURE.sink * piece.scale, piece.z]} turn={piece.turn} scale={piece.scale} materials={materials} />
        ))}
      {block.items
        .filter((item) => showHidden || !hidesOffice(item, viewTurn, site.scale, building))
        .map((item, n, shown) => {
          // (The Mini Forest and the Watercraft Pack are drawn at their own size, and a boat floats.)
          const at = placedAt(item.building, site.scale);
          return <KitModel key={standing(item, shown, n)} file={item.building.file} center={[item.building.cx ?? 0, item.building.cz ?? 0]} position={[item.x, at.y, item.z]} turn={item.turn} scale={at.scale} tint={tint} />;
        })}
    </group>
  );
});

/** A key for a thing that stands in town: its model and place, and which of the same at the same place it is. */
function standing(item: { building: { file: string }; x: number; z: number; turn: number }, all: readonly { building: { file: string }; x: number; z: number; turn: number }[], n: number): string {
  const key = `${item.building.file}:${item.x}:${item.z}:${item.turn}`;
  const same = all.slice(0, n).filter((other) => `${other.building.file}:${other.x}:${other.z}:${other.turn}` === key).length;
  return same === 0 ? key : `${key}#${same}`;
}

/**
 * The floors of the office's own building under the one in view, drawn the way
 * the kit draws its buildings: pale walls, a row of windows per storey, a dark
 * band between storeys and awnings over the shop front at street level.
 */
function FloorsBelow({ count, materials, tint }: { count: number; materials: Materials; tint: THREE.Color }) {
  const building = useContext(Shape);
  // The walls on all four faces, in the pieces of the Building Kit (#305), with a doorway in the entrance at street level.
  const walls = useMemo(() => wallPieces(building), [building]);
  const shopFront = useMemo(() => wallPieces(building, { door: true }), [building]);
  const awnings = useMemo(() => awningSpots(building), [building]);

  return (
    <>
      {Array.from({ length: count }, (_, k) => {
        const top = -CITY.streetBelow - k * CITY.perFloor;
        const atStreet = k === count - 1;
        return (
          <group key={k}>
            {/* A box for each wing of the building, a little inside the walls, as their filling. */}
            {building.wings.map((wing, n) => (
              <group key={n}>
                <mesh position={[wing.x + wing.w / 2, top - CITY.perFloor / 2, wing.y + wing.h / 2]} material={materials.facade}>
                  <boxGeometry args={[wing.w - 0.1, CITY.perFloor, wing.h - 0.1]} />
                </mesh>
                <mesh position={[wing.x + wing.w / 2, top - 0.15, wing.y + wing.h / 2]} material={materials.trim}>
                  <boxGeometry args={[wing.w + 0.6, 0.3, wing.h + 0.6]} />
                </mesh>
              </group>
            ))}
            <BuildingKit pieces={atStreet ? shopFront : walls} y={top - CITY.perFloor} high={CITY.perFloor} tones={materials} />
            {/* The awnings over the shop front, every four tiles, never over the door. */}
            {atStreet && awnings.map((spot, n) => {
              const out = 0.25;
              const [dx, dz, turn] = spot.faces === 's' ? [0, out, 0] : spot.faces === 'e' ? [out, 0, 1] : spot.faces === 'n' ? [0, -out, 2] : [-out, 0, 3];
              return <KitModel key={`a${n}`} file={CITY.awning} position={[spot.x + dx, top - 0.75, spot.z + dz]} turn={turn} scale={3 * KIT} tint={tint} />;
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
export function KitModel({ file, position, turn = 0, scale, tint, center = [0, 0], ghost }: {
  file: string;
  position: [number, number, number];
  turn?: number;
  /** One number for all three axes, or one for each of the model's own. */
  scale: number | [number, number, number];
  tint: THREE.Color;
  /** Where the middle of the model is, from its own origin, in its own units: it is put on `position`. */
  center?: [x: number, z: number];
  /** For the map editor's see-through model (#328): every part is drawn in this one material instead. */
  ghost?: THREE.Material;
}) {
  const { scene } = useGLTF(modelUrl(file));
  const object = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) mesh.material = ghost ?? cityMaterial(mesh.material as THREE.Material, tint);
    });
    return copy;
  }, [scene, tint, ghost]);
  return (
    <group position={position} rotation={[0, (turn * Math.PI) / 2, 0]} scale={scale}>
      <primitive object={object} position={[-center[0], 0, -center[1]]} />
    </group>
  );
}

/** A model from the Nature Kit: each of its materials is swapped for the tone of the same name in the theme. */
export function NatureModel({ file, position, turn, scale, materials }: { file: string; position: [number, number, number]; turn: number; scale: number; materials: Materials }) {
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
function Range({ site, materials, decor, showHidden }: { site: Site; materials: Materials; decor: number; showHidden: boolean }) {
  const viewTurn = useContext(ViewTurn);
  const building = useContext(Shape);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const peaks = useMemo(() => rangeOf(site, building), [site, building, decor]);
  // The rock starts this far up a peak; the cap is the same cone, from there to the top.
  const rockFrom = 0.55;
  return (
    <>
      {peaks
        .filter((peak) => showHidden || !hidesOffice({ building: { file: '', w: peak.radius * 2, height: peak.height, d: peak.radius * 2 }, x: peak.x, z: peak.z, turn: 0 }, viewTurn, 1, building))
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
  const routes = routesOf(roads);
  const lot = lotOf(building, layout);
  const east = westOf(building) + widthOf(building) + 1.5;
  const lower = lot.along === 'x' ? 0.03 : 0;
  // A way the map marks `bare` (#339) has no paving. From the lot to the door on the courtyard side is across the green: no path. From a lot on a road
  // along x (#218): along its aisle, away from the road's end, and over to the gate.
  const bare = layout.places.ways ?? {};
  const lotPath = lotPathOf(layout, building, lot);
  const lines: (readonly [number, number][])[] = [
    ...(bare.bus?.bare ? [] : [routes.bus]),
    ...(bare.taxi?.bare ? [] : [routes.taxi]),
    ...(bare.away?.bare ? [] : [routes.walk]),
    ...(lotPath && !bare.lot?.bare ? [lotPath.line] : []),
  ];
  const strips = lines.flatMap((line) => line.slice(1).map((to, i) => [line[i]!, to] as const));
  return (
    <group>
      {/* (Under a lot on a road along x the grass lies a little lower, so that the lot's slab stands clear of it.) */}
      {/* (Its corners are rounded like those of every block since #195. No kerb ring: it would stand across the lot's drive-in.) */}
      <mesh position={[plot.x + plot.w / 2, 0, plot.z + plot.d / 2]} geometry={slabGeometry(plot.w, plot.d, PAVEMENT - lower)} material={materials.grass} />
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

/**
 * The walking paths a map draws by hand (#330) are paved (#339), in every map town, as wide and of the same stuff as the paths to the entrance. A strip
 * stands from the ground to just above the pavement, so that it does not float over the lower open land of a town of roads.
 */
function Sidewalks({ layout, materials }: { layout: Layout; materials: Materials }) {
  const walks = layout.map!.walks ?? [];
  return (
    <group>
      {walks.flatMap((path, k) =>
        path.slice(1).map((to, i) => {
          const from = path[i]!;
          const length = Math.hypot(to.x - from.x, to.z - from.z);
          if (length < 0.01) return null;
          return (
            <mesh key={`${k}:${i}`} position={[(from.x + to.x) / 2, (PAVEMENT + 0.02) / 2, (from.z + to.z) / 2]} rotation={[0, Math.atan2(to.x - from.x, to.z - from.z), 0]} material={materials.pavement}>
              <boxGeometry args={[0.9, PAVEMENT + 0.02, length + 0.9]} />
            </mesh>
          );
        }),
      )}
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
  const { roads } = layout.map!;
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
    </group>
  );
}

/**
 * The dashed line down the middle of every street of a town laid out from a drawing, between its two lanes; the crossings are left bare. The
 * kit's pieces have a line of their own (#285): the dashes are painted only where they do not reach (`bare`). The arrows lie over the kit.
 */
function RoadMarks({ layout, bare, level, materials }: { layout: Layout; bare: Area[]; level: number; materials: Materials }) {
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
    // Only where a dash lies wholly on bare ground.
    const inside = (x: number, z: number) => bare.some((r) => x >= r.x - 0.01 && x <= r.x + r.w + 0.01 && z >= r.z - 0.01 && z <= r.z + r.d + 0.01);
    return out.filter((dash) => (dash.along === 'z' ? inside(dash.x, dash.z - 0.7) && inside(dash.x, dash.z + 0.7) : inside(dash.x - 0.7, dash.z) && inside(dash.x + 0.7, dash.z)));
  }, [layout, bare]);
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
    <>
      <instancedMesh key={dashes.length} ref={mesh} args={[undefined, materials.white, dashes.length]}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <LaneArrows layout={layout} y={Math.max(y, kerbTop(level))} materials={materials} />
    </>
  );
}

/** One arrow flat on the road, pointing to -z: a shaft and a two-sided head, the shape of the lot's arrows (Parking.tsx). */
const arrowGeometry = (() => {
  const l = ARROW.length;
  const w = ARROW.width;
  const shape = new THREE.Shape();
  shape.moveTo(0, l / 2);
  shape.lineTo(w / 2, l / 2 - 0.55);
  shape.lineTo(w / 6, l / 2 - 0.55);
  shape.lineTo(w / 6, -l / 2);
  shape.lineTo(-w / 6, -l / 2);
  shape.lineTo(-w / 6, l / 2 - 0.55);
  shape.lineTo(-w / 2, l / 2 - 0.55);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
})();

/** The white arrows on the one-way streets of Coax City (#235), one instance each. */
function LaneArrows({ layout, y, materials }: { layout: Layout; y: number; materials: Materials }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const arrows = useMemo(() => arrowsOf(layout), [layout]);
  useLayoutEffect(() => {
    const node = mesh.current;
    if (!node) return;
    const frame = new THREE.Object3D();
    arrows.forEach((arrow, n) => {
      frame.position.set(arrow.x, y + 0.002, arrow.z);
      // Laid flat the shape points to -z: turn it to the lane's way.
      const toward = arrow.along === 'z' ? (arrow.direction === 1 ? Math.PI : 0) : arrow.direction === 1 ? -Math.PI / 2 : Math.PI / 2;
      frame.rotation.set(0, toward, 0);
      frame.updateMatrix();
      node.setMatrixAt(n, frame.matrix);
    });
    node.instanceMatrix.needsUpdate = true;
    node.computeBoundingSphere();
  }, [arrows, y]);
  if (arrows.length === 0) return null;
  return <instancedMesh key={arrows.length} ref={mesh} args={[arrowGeometry, materials.white, arrows.length]} />;
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

/** A railway on the ground (0.21.0, #288): the height of its bed of ballast and of the rails on it, in tiles. */
const GROUND_RAIL = { bed: 0.05, rail: 0.08 };

/**
 * The railway in front of the office: by default a deck on pillars with the
 * kit's track on it, and every now and then the yellow train going by. On the
 * ground it is a bed with the track on it, and a flat deck where a road crosses
 * (the barriers are the street's, StreetLife.tsx). With motion reduced no train runs.
 */
function Railway({ layout, train: cars, still, materials, tint }: { layout: Layout; train: readonly string[]; still: boolean; materials: Materials; tint: THREE.Color }) {
  const { height, scale, track, trackLength } = CITY.railway;
  const spots = carSpots(cars);
  const RAILWAY = layout.railway;
  const train = useRef<THREE.Group>(null);
  const piece = trackLength * scale;
  const pieces = Math.ceil(RAILWAY.length / piece);
  const { now } = useContext(World);
  // On the ground (0.21.0, #288): no deck and no pillars, a bed of ballast, the kit's track flattened on it, and a flat deck of its own where a road crosses.
  const ground = RAILWAY.ground === true;
  const crossings = useMemo(() => (ground ? roadsOf(layout).crossings.filter((c) => c.rail).map((c) => ({ x: c.x, half: c.reach.x })) : []), [ground, layout]);
  const stretches = useMemo(() => (ground ? trackStretches(layout, crossings) : []), [ground, layout, crossings]);
  const top = ground ? GROUND_RAIL.bed + GROUND_RAIL.rail : height + 0.1 * scale;

  useFrame(() => {
    const node = train.current;
    if (!node) return;
    const at = still ? null : trainAt(now(), cars, layout);
    node.visible = at !== null;
    if (!at) return;
    node.position.x = at.x;
    node.rotation.y = at.direction > 0 ? 0 : Math.PI;
  });

  if (ground) {
    // The kit's track is `trackLength` units long and 1 wide, and 0.1 high; flattened, and stretched to fit a stretch between two roads.
    const flat = GROUND_RAIL.rail / 0.1;
    return (
      <group position={[0, 0, RAILWAY.z]}>
        <mesh position={[RAILWAY.from + RAILWAY.length / 2, GROUND_RAIL.bed / 2, 0]} material={materials.rock}>
          <boxGeometry args={[RAILWAY.length, GROUND_RAIL.bed, RAILWAY.width]} />
        </mesh>
        {stretches.flatMap((stretch, s) => {
          const count = Math.max(1, Math.round((stretch.to - stretch.from) / piece));
          const each = (stretch.to - stretch.from) / count;
          return Array.from({ length: count }, (_, i) => (
            <KitModel key={`${s}-${i}`} file={track} position={[stretch.from + i * each, GROUND_RAIL.bed + flat, 0]} turn={1} scale={[scale, flat, each / trackLength]} tint={tint} />
          ));
        })}
        {/* Where a road crosses: a flat deck the width of the road, level with the rails, and the two rails let into it. */}
        {crossings.map((crossing, i) => (
          <group key={i} position={[crossing.x, 0, 0]}>
            <mesh position={[0, top / 2 - 0.01, 0]} material={materials.street}>
              <boxGeometry args={[2 * crossing.half, top - 0.02, RAILWAY.width]} />
            </mesh>
            {[-0.8, 0.8].map((z) => (
              <mesh key={z} position={[0, top - 0.005, z]} material={materials.metalMid}>
                <boxGeometry args={[2 * crossing.half, 0.03, 0.14]} />
              </mesh>
            ))}
          </group>
        ))}
        {/* The train points along +x; its front is at the group's origin and the carriages trail behind. */}
        <group ref={train} position={[RAILWAY.from, top, 0]} visible={false}>
          {spots.map(({ file, at }, i) => (
            <KitModel key={`${file}${i}`} file={file} position={[at, 0, 0]} turn={1} scale={scale} tint={tint} />
          ))}
        </group>
      </group>
    );
  }

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
        {spots.map(({ file, at }, i) => (
          <KitModel key={`${file}${i}`} file={file} position={[at, 0, 0]} turn={1} scale={scale} tint={tint} />
        ))}
      </group>
    </group>
  );
}
