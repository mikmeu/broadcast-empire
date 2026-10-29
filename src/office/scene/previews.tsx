// The pictures of one piece, one town and one character on their own: for the catalog and the character creator.

import { useAnimations, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { bodyFile, type Look } from '../../config/looks';
import { FURNITURE, buildingFor, coreFrame, coreTurn, type Building, type FurnitureType } from '../../config/office';
import { ANIMATIONS, CHARACTER_SCALE, modelUrl } from '../assets';
import { streetLevel } from '../city';
import { SITES } from '../sites';
import { HOUR_SECONDS } from '../traffic';
import { getRegion, type RegionId } from '../../config/world';
import { characterCopy, lookKey } from './Character';
import { FurnitureModel } from './Room';
import { Town } from './Town';
import { RoofSlab } from './cables';
import { Shape, World, frameOf, useRedraw } from './frame';
import { useMaterials } from './materials';

// --- The catalog's picture of one piece ---

/** One piece of furniture on its own, turning slowly so it can be seen from all sides: for the furniture catalog. */
export function FurniturePreview({ type, tier, still }: { type: FurnitureType; tier: number; still: boolean }) {
  const materials = useMaterials();
  const { w, h, name } = FURNITURE[type];
  return (
    <Canvas orthographic flat dpr={[1, 2]} frameloop={still ? 'demand' : 'always'} camera={{ near: 0.1, far: 100, position: [10, 10.7, 10] }} role="img" aria-label={`${name}, as it looks in the office`}>
      {/* Wide enough for the piece from any side, and tall enough for the highest ones. */}
      <PreviewRig span={Math.max((w + h) / Math.SQRT2 + 0.6, 2.6)} />
      <ambientLight intensity={2.1} />
      <directionalLight position={[-4, 10, 6]} intensity={1.5} />
      <Suspense fallback={null}>
        <Turntable still={still} redraw={[type, tier, materials]}>
          {/* The tiles it takes up. */}
          <mesh position={[0, -0.03, 0]} material={materials.unassigned}>
            <boxGeometry args={[w, 0.06, h]} />
          </mesh>
          <FurnitureModel item={{ id: 'preview', type, x: 0, y: 0, turn: 0, tier, condition: 100, boughtOn: 0 }} origin={[-w / 2, -h / 2]} selected={false} live materials={materials} />
        </Turntable>
      </Suspense>
    </Canvas>
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

function PreviewRig({ span, at = 0.7 }: { span: number; at?: number }) {
  const camera = useThree((s) => s.camera);
  const { width, height } = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    camera.lookAt(0, at, 0);
    camera.zoom = Math.min(width, height) / span;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, width, height, span, at, invalidate]);
  return null;
}

/** Turns what stands on it; with motion reduced it stands still, seen from the front. */
function Turntable({ still, redraw, children }: { still: boolean; redraw: unknown[]; children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  useRedraw(redraw);
  useFrame((_, elapsed) => {
    if (!still && group.current) group.current.rotation.y += Math.min(elapsed, 0.05) * 0.5;
  });
  return <group ref={group}>{children}</group>;
}
