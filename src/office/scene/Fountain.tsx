// A round stone fountain for the green in the courtyard of the U-shaped office: a basin with a rim, a column with two bowls and a jet on top. About 3.4 across and 1.4 tall, standing on y = 0 with its origin in the middle of its base. Nine meshes, nothing moves.

import { useMemo } from 'react';
import * as THREE from 'three';
import { type Materials } from './materials';

const SIDES = 20;
/** The basin: outer radius, how thick the rim is, how high it stands, and how deep the water lies below its top. */
const BASIN = { r: 1.7, wall: 0.2, h: 0.45, sink: 0.08 };

export function Fountain({ materials }: { materials: Materials }) {
  // The basin wall and its floor as one turned profile (outside, over the rim, down the inside, across the floor).
  const basin = useMemo(() => {
    const { r, wall, h } = BASIN;
    const profile = [[0, 0], [r, 0], [r, h], [r - wall, h], [r - wall, 0.2], [0, 0.2]].map(([x, y]) => new THREE.Vector2(x, y));
    return new THREE.LatheGeometry(profile, SIDES);
  }, []);
  const water = BASIN.h - BASIN.sink;
  return (
    <group>
      {/* Basin, rim and the water in it. */}
      <mesh geometry={basin} material={materials.rock} />
      <mesh position={[0, water - 0.01, 0]} material={materials.water}>
        <cylinderGeometry args={[BASIN.r - BASIN.wall + 0.01, BASIN.r - BASIN.wall + 0.01, 0.02, SIDES]} />
      </mesh>
      {/* Plinth, column and the lower bowl, with water standing in it. */}
      <mesh position={[0, 0.3, 0]} material={materials.facade}>
        <cylinderGeometry args={[0.38, 0.45, 0.2, 12]} />
      </mesh>
      <mesh position={[0, 0.65, 0]} material={materials.rock}>
        <cylinderGeometry args={[0.16, 0.2, 0.5, 10]} />
      </mesh>
      <mesh position={[0, 0.98, 0]} material={materials.facade}>
        <cylinderGeometry args={[0.8, 0.22, 0.16, SIDES]} />
      </mesh>
      <mesh position={[0, 1.065, 0]} material={materials.water}>
        <cylinderGeometry args={[0.72, 0.72, 0.02, SIDES]} />
      </mesh>
      {/* Upper stem and bowl, and the jet. */}
      <mesh position={[0, 1.2, 0]} material={materials.rock}>
        <cylinderGeometry args={[0.08, 0.1, 0.22, 8]} />
      </mesh>
      <mesh position={[0, 1.34, 0]} material={materials.water}>
        <coneGeometry args={[0.2, 0.12, 10]} />
      </mesh>
      <mesh position={[0, 1.36, 0]} material={materials.water}>
        <cylinderGeometry args={[0.025, 0.05, 0.08, 6]} />
      </mesh>
    </group>
  );
}
