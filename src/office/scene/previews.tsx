// The pictures of one piece, one town and one character on their own: for the catalog and the character creator.

import { useAnimations, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { bodyFile, type Look } from '../../config/looks';
import { furnitureSpec, buildingFor, coreFrame, coreTurn, type Building, type FurnitureType } from '../../config/office';
import { ANIMATIONS, CHARACTER_SCALE, SEAT_HEIGHT, characterFor, modelUrl, type Spot } from '../assets';
import { streetLevel } from '../city';
import { SITES, type Site } from '../sites';
import { HOUR_SECONDS } from '../traffic';
import { getRegion, type RegionId } from '../../config/world';
import { characterCopy, lookKey } from './Character';
import { FurnitureModel } from './Room';
import { Town } from './Town';
import { RoofSlab } from './cables';
import { Shape, ViewTurn, World, frameOf, useRedraw } from './frame';
import { useMaterials, type Materials } from './materials';

// --- The catalog's picture of one piece ---

/** One piece of furniture on its own, turning slowly so it can be seen from all sides: for the furniture catalog. */
export function FurniturePreview({ type, tier, still, spots, selectedSpot, revision, view, people }: {
  type: FurnitureType;
  tier: number;
  still: boolean;
  /** For the furniture editor: the piece does not turn by itself; it stands as turned, zoomed and moved here (turn in radians, pan in tiles). */
  view?: PreviewView;
  /** For the furniture editor: a person stands at each place for people, in the pose of its activity. */
  people?: boolean;
  /** For the furniture editor: counts up when the piece shown under the same id has changed. */
  revision?: number;
  /** For the furniture editor: the places for people, drawn as discs with an arrow for the way they face. */
  spots?: readonly Spot[];
  selectedSpot?: number;
}) {
  const materials = useMaterials();
  const { w, h, name } = furnitureSpec(type);
  return (
    <Canvas orthographic flat dpr={[1, 2]} frameloop={still ? 'demand' : 'always'} camera={{ near: 0.1, far: 100, position: [10, 10.7, 10] }} role="img" aria-label={`${name}, as it looks in the office`}>
      {/* Wide enough for the piece from any side, and tall enough for the highest ones. */}
      <PreviewRig span={Math.max((w + h) / Math.SQRT2 + 0.6, 2.6)} zoom={view?.zoom} pan={view && [view.x, view.y]} />
      <ambientLight intensity={2.1} />
      <directionalLight position={[-4, 10, 6]} intensity={1.5} />
      <Suspense fallback={null}>
        <Turntable still={still} angle={view?.turn} redraw={[type, tier, materials, spots, selectedSpot, revision, view?.turn, people]}>
          {/* The tiles it takes up. */}
          <mesh position={[0, -0.03, 0]} material={materials.unassigned}>
            <boxGeometry args={[w, 0.06, h]} />
          </mesh>
          <FurnitureModel item={{ id: 'preview', type, x: 0, y: 0, turn: 0, tier, condition: 100, boughtOn: 0 }} origin={[-w / 2, -h / 2]} selected={false} live materials={materials} />
          {spots && <SpotMarkers spots={spots} selected={selectedSpot} tier={tier} origin={[-w / 2, -h / 2]} materials={materials} />}
          {spots && people && (
            <group position={[-w / 2, 0, -h / 2]}>
              {spots.map((spot, i) =>
                spot.tiers && (tier < spot.tiers[0] || tier > spot.tiers[1]) ? null : (
                  <Suspense key={i} fallback={null}>
                    <ExamplePerson spot={spot} name={EXAMPLE_NAMES[i % EXAMPLE_NAMES.length]!} still={still} />
                  </Suspense>
                ),
              )}
            </group>
          )}
        </Turntable>
      </Suspense>
    </Canvas>
  );
}

/** How the editor's picture of a piece is turned, zoomed and moved. */
export interface PreviewView {
  turn: number;
  zoom: number;
  x: number;
  y: number;
}

const EXAMPLE_NAMES = ['Ada Lovelace', 'Tom Baker', 'Mia Chen', 'Sam Okafor'];

/** Someone at a place for people, as they would stand or sit there in the office. */
function ExamplePerson({ spot, name, still }: { spot: Spot; name: string; still: boolean }) {
  const { scene, animations } = useGLTF(modelUrl(characterFor(name)));
  const object = useMemo(() => characterCopy(scene), [scene]);
  const group = useRef<THREE.Group>(null);
  const { actions } = useAnimations(animations, group);
  useRedraw([object, still, spot.activity]);
  useEffect(() => {
    const playing = ANIMATIONS[spot.activity].flatMap((clip) => actions[clip] ?? []);
    for (const action of playing) {
      action.reset().play();
      action.paused = still;
    }
    return () => playing.forEach((action) => void action.stop());
  }, [actions, spot.activity, still, object]);
  return (
    <group position={[spot.at[0], (spot.up ?? 0) + (spot.activity === 'sit' ? SEAT_HEIGHT : 0), spot.at[1]]} rotation={[0, Math.PI + (spot.turn * Math.PI) / 2, 0]}>
      <group ref={group} scale={CHARACTER_SCALE}>
        <primitive object={object} />
      </group>
    </group>
  );
}

/** The places for people of a piece: a disc on the floor (or the step) and an arrow towards the way the person faces. */
function SpotMarkers({ spots, selected, tier, origin, materials }: { spots: readonly Spot[]; selected: number | undefined; tier: number; origin: [x: number, z: number]; materials: Materials }) {
  return (
    <group position={[origin[0], 0, origin[1]]}>
      {spots.map((spot, i) =>
        spot.tiers && (tier < spot.tiers[0] || tier > spot.tiers[1]) ? null : (
          <group key={i} position={[spot.at[0], (spot.up ?? 0) + 0.03, spot.at[1]]} rotation={[0, (spot.turn * Math.PI) / 2, 0]}>
            <mesh material={i === selected ? materials.select : materials.accent}>
              <cylinderGeometry args={[0.2, 0.2, 0.05, 20]} />
            </mesh>
            {/* 0 faces north, which is towards -z. */}
            <mesh position={[0, 0.04, -0.3]} material={i === selected ? materials.select : materials.accent}>
              <boxGeometry args={[0.1, 0.05, 0.3]} />
            </mesh>
          </group>
        ),
      )}
    </group>
  );
}

/**
 * The surroundings of the office in a region, alive: the town with its
 * traffic, its train and the people out for a walk, around the office seen
 * from outside. For choosing the headquarters, before there is a game. It
 * runs on a clock of its own, in the middle of a morning.
 */
export function TownPreview({ region, still }: { region: RegionId; still: boolean }) {
  const materials = useMaterials();
  const world = useMemo(() => {
    const began = performance.now();
    const now = () => (performance.now() - began) / 1000 + 300;
    return { now, hours: () => 2 + now() / HOUR_SECONDS, pace: 1 };
  }, []);
  // The building a company gets in this region, seen from above its roof.
  const building = buildingFor(region);
  const [cx, , cz] = frameOf(building).center;
  /** The housing of the stairs, beside them on the roof. */
  const housing = coreFrame(building).point(3, 2.2);
  return (
    <Canvas orthographic flat dpr={[1, 2]} frameloop={still ? 'demand' : 'always'} camera={{ near: 1, far: 400, position: [100, 100, 100] }} role="img" aria-label={`The surroundings of the office in ${getRegion(region).name}`}>
      <TownRig building={building} />
      <ambientLight intensity={2.1} />
      <directionalLight position={[cx - 6, 22, cz + 9]} intensity={1.5} />
      <World.Provider value={world}>
        <Shape.Provider value={building}>
          <Suspense fallback={null}>
            {/* The roof of the office, with a low wall around it. */}
            <RoofSlab building={building} materials={materials} />
            <mesh position={[housing.x, 0.7, housing.z]} rotation={[0, coreTurn(building).angle, 0]} material={materials.metalMid}>
              <boxGeometry args={[2.4, 1.3, 2]} />
            </mesh>
            <Town key={region} floor={building.floors + 1} seed={PREVIEW_SEED} site={SITES[region]} still={still} materials={materials} />
          </Suspense>
        </Shape.Provider>
      </World.Provider>
    </Canvas>
  );
}

/** How the map editor's picture of a town is turned (in quarter turns), zoomed and moved (right and up on the screen, in tiles). */
export interface MapView {
  turn: number;
  zoom: number;
  x: number;
  y: number;
}

/**
 * The town of a map being drawn (0.21.0, #284), as the game draws it: the town round the office, alive, turned, zoomed and moved
 * with the buttons beside it. `site` is the look it borrows and names the draft's map (`PREVIEW_MAP`); the town is built again when `revision` changes.
 */
export function MapPreview({ site, building, revision, view, still }: { site: Site; building: Building; revision: number; view: MapView; still: boolean }) {
  const materials = useMaterials();
  const world = useMemo(() => {
    const began = performance.now();
    const now = () => (performance.now() - began) / 1000 + 300;
    return { now, hours: () => 2 + now() / HOUR_SECONDS, pace: 1 };
  }, []);
  const [cx, , cz] = frameOf(building).center;
  const housing = coreFrame(building).point(3, 2.2);
  return (
    <Canvas orthographic flat dpr={[1, 2]} frameloop={still ? 'demand' : 'always'} camera={{ near: 1, far: 600, position: [100, 100, 100] }} role="img" aria-label="The town you are drawing, as the game draws it">
      <MapRig building={building} view={view} />
      <ambientLight intensity={2.1} />
      <directionalLight position={[cx - 6, 22, cz + 9]} intensity={1.5} />
      <World.Provider value={world}>
        <Shape.Provider value={building}>
          <ViewTurn.Provider value={((view.turn % 4) + 4) % 4}>
            <Suspense fallback={null}>
              <RoofSlab building={building} materials={materials} />
              <mesh position={[housing.x, 0.7, housing.z]} rotation={[0, coreTurn(building).angle, 0]} material={materials.metalMid}>
                <boxGeometry args={[2.4, 1.3, 2]} />
              </mesh>
              <Town key={revision} floor={building.floors + 1} seed={PREVIEW_SEED} site={site} still={still} materials={materials} />
            </Suspense>
          </ViewTurn.Provider>
        </Shape.Provider>
      </World.Provider>
    </Canvas>
  );
}

/** The camera of the map editor's picture: the slant of the game's, on the diagonal a quarter turn brings to the next corner (as `Rig` in Office3D). */
function MapRig({ building, view }: { building: Building; view: MapView }) {
  const camera = useThree((s) => s.camera);
  const { width, height } = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    const [cx, , cz] = frameOf(building).center;
    const a = (view.turn * Math.PI) / 2 + Math.PI / 4;
    const at: [number, number, number] = [cx - 2 + Math.cos(a) * view.x - Math.sin(a) * view.y, -streetLevel(building.floors + 1) / 2, cz + 9 - Math.sin(a) * view.x - Math.cos(a) * view.y];
    const distance = 60 * Math.SQRT2;
    camera.position.set(at[0] + Math.sin(a) * distance, at[1] + 60, at[2] + Math.cos(a) * distance);
    camera.lookAt(...at);
    camera.zoom = (Math.min(width / 54, height / 38) / Math.max(1, frameOf(building).scale * 0.8)) * view.zoom;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, width, height, invalidate, building, view]);
  return null;
}

/** The town of the preview: always the same one, so a region looks the same each time it is shown. */
const PREVIEW_SEED = 1970;

/** The camera of the preview: the same slant as in the game, far enough back for the streets around the office, and still. */
function TownRig({ building }: { building: Building }) {
  const camera = useThree((s) => s.camera);
  const { width, height } = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    // A little in front of the office, where the beach, the lake or the fields are.
    const [cx, , cz] = frameOf(building).center;
    const at: [number, number, number] = [cx - 2, -streetLevel(building.floors + 1) / 2, cz + 9];
    camera.position.set(at[0] + 60, at[1] + 60, at[2] + 60);
    camera.lookAt(...at);
    // A bigger building (the U of the capital) is seen from further back, so that all of it shows.
    camera.zoom = Math.min(width / 54, height / 38) / Math.max(1, frameOf(building).scale * 0.8);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, width, height, invalidate, building]);
  return null;
}

/** The player's own character on its own, standing and looking around: for the character creator. */
export function LookPreview({ look, still }: { look: Look; still: boolean }) {
  const materials = useMaterials();
  return (
    <Canvas orthographic flat dpr={[1, 2]} frameloop={still ? 'demand' : 'always'} camera={{ near: 0.1, far: 100, position: [3.2, 3.4, 9] }} role="img" aria-label="Your character">
      <PreviewRig span={1.75} at={0.56} />
      <ambientLight intensity={2.1} />
      <directionalLight position={[-4, 10, 6]} intensity={1.5} />
      <Suspense fallback={null}>
        <mesh position={[0, -0.04, 0]} material={materials.unassigned}>
          <cylinderGeometry args={[0.62, 0.62, 0.08, 40]} />
        </mesh>
        {/* A new look is a new model: starting afresh keeps its pose tied to the bones that are shown. */}
        <PreviewCharacter key={lookKey(look)} look={look} still={still} />
      </Suspense>
    </Canvas>
  );
}

function PreviewCharacter({ look, still }: { look: Look; still: boolean }) {
  const { scene, animations } = useGLTF(modelUrl(bodyFile(look.body)));
  const object = useMemo(() => characterCopy(scene, look), [scene, look]);
  const group = useRef<THREE.Group>(null);
  const { actions } = useAnimations(animations, group);
  useRedraw([object, still]);
  useEffect(() => {
    const playing = ANIMATIONS.idle.flatMap((clip) => actions[clip] ?? []);
    for (const action of playing) {
      action.reset().play();
      action.paused = still;
    }
    return () => playing.forEach((action) => void action.stop());
  }, [actions, still, object]);
  return (
    <group ref={group} scale={CHARACTER_SCALE}>
      <primitive object={object} />
    </group>
  );
}

/** `zoom` closes in on the picture; `pan` moves it right and up on the screen, in tiles. */
function PreviewRig({ span, at = 0.7, zoom = 1, pan }: { span: number; at?: number; zoom?: number; pan?: [x: number, y: number] }) {
  const camera = useThree((s) => s.camera);
  const { width, height } = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const base = useRef(camera.position.clone());
  const [px, py] = pan ?? [0, 0];
  useLayoutEffect(() => {
    camera.position.copy(base.current);
    camera.lookAt(0, at, 0);
    if (px !== 0 || py !== 0) {
      // Slide the camera across the picture, keeping the way it looks.
      camera.updateMatrixWorld();
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      camera.position.addScaledVector(right, -px).addScaledVector(up, -py);
    }
    camera.zoom = (Math.min(width, height) / span) * zoom;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, width, height, span, at, zoom, px, py, invalidate]);
  return null;
}

/** Turns what stands on it; with motion reduced it stands still, seen from the front. With an `angle` it stands turned that far and never moves by itself. */
function Turntable({ still, angle, redraw, children }: { still: boolean; angle?: number; redraw: unknown[]; children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  useRedraw(redraw);
  useFrame((_, elapsed) => {
    if (!group.current) return;
    if (angle !== undefined) group.current.rotation.y = angle;
    else if (!still) group.current.rotation.y += Math.min(elapsed, 0.05) * 0.5;
  });
  return <group ref={group}>{children}</group>;
}
