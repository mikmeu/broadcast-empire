// The barriers of the level crossings (0.21.0, #288): a post on the right of each lane before the track, an arm that comes down across the road
// 2 seconds after the barrier closes and goes up in 1 when it opens (it counts as closed for the traffic from the first moment), and two red lamps on the
// arm that flash while it is down. Drawn as instances, beside the traffic lights (StreetLife.tsx). The shapes are barrierParts.ts's.

import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { barrierOf, barriersOf, type Traffic } from '../traffic';
import { type Materials } from './materials';
import { ARM_PIVOT, BARRIER, armBoxes, lampBoxes, postBoxes } from './barrierParts';
import { withBoxes, type Box, type PartName, type Parts } from './vehicleModels';

/** The most barriers a town has room for: a post for each lane that comes up to a level crossing. */
const MOST_BARRIERS = 64;

/** How long the arm takes to come down and to go up again, in seconds. */
export const ARM_SECONDS = { down: 2, up: 1 };
/** How long a lamp is lit, and dark, in the flashing, in seconds. */
const FLASH = 0.5;

/** 0 with the arm up, 1 with it down, `seconds` after the barrier changed. */
export function armDown(closed: boolean, seconds: number): number {
  const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  return closed ? ease(seconds / ARM_SECONDS.down) : 1 - ease(seconds / ARM_SECONDS.up);
}

/** The shapes are modelled with their lamps and face on +z; the barrier is put with its arm to the driver's left, so its face to the drivers is -z. */
const facing = (boxes: Box[]): Box[] => boxes.map((box) => ({ ...box, at: [box.at[0], box.at[1], -box.at[2]] }));

const PARTS: PartName[] = ['body', 'stripe', 'metal', 'metalMid', 'dark'];

/** The barriers of the town, as the traffic has them. With motion reduced no train runs and the arms stay up. */
export function Barriers({ life, still, materials }: { life: RefObject<{ traffic: Traffic } | null>; still: boolean; materials: Materials }) {
  const posts = useMemo<Parts>(() => withBoxes({}, facing(postBoxes())), []);
  const arms = useMemo<Parts>(() => withBoxes({}, facing(armBoxes(BARRIER.length))), []);
  const lampSpots = useMemo(() => lampBoxes().map((lamp) => ({ at: [lamp.at[0] - ARM_PIVOT[0], lamp.at[1] - ARM_PIVOT[1], -(lamp.at[2] - ARM_PIVOT[2])] as const, size: lamp.size })), []);
  const red = useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    return new THREE.Color(css.getPropertyValue('--red').trim() || '#d33a2c');
  }, []);
  const stripe = useMemo(() => new THREE.MeshLambertMaterial({ color: red, flatShading: true }), [red]);
  const lampMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff' }), []);
  const lit = useMemo(() => ({ on: red.clone().lerp(new THREE.Color('#ffffff'), 0.25), off: red.clone().multiplyScalar(0.3) }), [red]);
  const postMeshes = useRef<Partial<Record<PartName, THREE.InstancedMesh | null>>>({});
  const armMeshes = useRef<Partial<Record<PartName, THREE.InstancedMesh | null>>>({});
  const lamps = useRef<THREE.InstancedMesh>(null);
  const placed = useRef<{ traffic: Traffic; barriers: ReturnType<typeof barriersOf> } | null>(null);
  const frame = useMemo(() => new THREE.Object3D(), []);
  const local = useMemo(() => new THREE.Object3D(), []);

  const material = (part: PartName) => (part === 'stripe' ? stripe : part === 'body' ? materials.white : part === 'dark' ? materials.metalDark : materials[part === 'metalMid' ? 'metalMid' : 'metal']);

  const draw = () => {
    const traffic = life.current?.traffic;
    if (!traffic) return;
    if (placed.current?.traffic !== traffic) {
      const barriers = barriersOf(traffic).slice(0, MOST_BARRIERS);
      placed.current = { traffic, barriers };
      barriers.forEach((barrier, n) => {
        frame.position.set(barrier.x, 0, barrier.z);
        frame.rotation.set(0, barrier.angle, 0);
        frame.scale.set(1, 1, 1);
        frame.updateMatrix();
        for (const mesh of Object.values(postMeshes.current)) mesh?.setMatrixAt(n, frame.matrix);
      });
      for (const mesh of Object.values(postMeshes.current)) {
        if (!mesh) continue;
        mesh.count = barriers.length;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    const { barriers } = placed.current;
    const flash = Math.floor(traffic.time / FLASH);
    barriers.forEach((barrier, n) => {
      const state = barrierOf(traffic, barrier.id);
      const down = still || !state ? 0 : armDown(state.closed, state.for);
      // The arm turns about the top of the post: from raised to flat across the road, as long as the barrier is closing.
      frame.position.set(barrier.x, ARM_PIVOT[1], barrier.z);
      frame.rotation.set(0, barrier.angle, (1 - down) * BARRIER.arm.up, 'YXZ');
      frame.scale.set(barrier.reach / BARRIER.length, 1, 1);
      frame.updateMatrix();
      for (const mesh of Object.values(armMeshes.current)) mesh?.setMatrixAt(n, frame.matrix);
      // The lamps ride on the arm and flash in turn while the barrier is closed, from the moment it is.
      const flashing = !still && state?.closed === true;
      lampSpots.forEach((spot, k) => {
        local.position.set(...spot.at);
        local.scale.set(1, 1, 1);
        local.rotation.set(0, 0, 0);
        local.updateMatrix();
        const matrix = frame.matrix.clone().multiply(local.matrix);
        lamps.current!.setMatrixAt(n * lampSpots.length + k, matrix);
        lamps.current!.setColorAt(n * lampSpots.length + k, flashing && (flash + k) % 2 === 0 ? lit.on : lit.off);
      });
    });
    for (const mesh of Object.values(armMeshes.current)) {
      if (!mesh) continue;
      mesh.count = barriers.length;
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (lamps.current) {
      lamps.current.count = barriers.length * lampSpots.length;
      lamps.current.instanceMatrix.needsUpdate = true;
      if (lamps.current.instanceColor) lamps.current.instanceColor.needsUpdate = true;
    }
  };
  useLayoutEffect(draw);
  useFrame(() => !still && draw());

  // (Not culled: the bounding sphere of an instanced mesh is kept from its first frame, and these are placed after it.)
  return (
    <>
      {PARTS.flatMap((part) => [
        posts[part] && <instancedMesh key={`post-${part}`} ref={(mesh) => void (postMeshes.current[part] = mesh)} args={[posts[part], material(part), MOST_BARRIERS]} count={0} frustumCulled={false} />,
        arms[part] && <instancedMesh key={`arm-${part}`} ref={(mesh) => void (armMeshes.current[part] = mesh)} args={[arms[part], material(part), MOST_BARRIERS]} count={0} frustumCulled={false} />,
      ])}
      <instancedMesh ref={lamps} args={[undefined, lampMaterial, MOST_BARRIERS * lampSpots.length]} count={0} frustumCulled={false}>
        <boxGeometry args={lampSpots[0]!.size} />
      </instancedMesh>
    </>
  );
}
