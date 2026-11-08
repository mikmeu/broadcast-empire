// A street lamp post for the town: the City Kit (Roads)'s curved lamp (#285), a thin pole whose arm bends out over the street, drawn as high as
// `LAMP_HEIGHT` in the dark metal of the palette, with a small head under the end of its arm in the lamp colour that lights at night. It stands
// on y = 0 with its origin at its foot, and its arm reaches towards -z: `turn` swings it round to the nearer kerb.

import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { ROADS, modelUrl } from '../assets';
import { LAMP_HEIGHT } from '../city';
import { type Materials } from './materials';

/** How much larger than the kit's own the lamp is drawn. */
const SIZE = LAMP_HEIGHT / ROADS.lamp.height;

export function StreetLamp({ materials, turn = 0 }: { materials: Materials; turn?: number }) {
  const { scene } = useGLTF(modelUrl(ROADS.lamp.file));
  const geometry = useMemo(() => {
    let found: THREE.BufferGeometry | null = null;
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!found && mesh.isMesh) found = mesh.geometry;
    });
    return found ?? new THREE.BufferGeometry();
  }, [scene]);
  return (
    <group rotation={[0, turn, 0]}>
      <mesh geometry={geometry} scale={SIZE} material={materials.metalDark} />
      {/* The head, lit at night: under the end of the arm, where the kit has its bulb. */}
      <mesh position={[0, LAMP_HEIGHT - 0.08, -ROADS.lamp.arm * 0.75 * SIZE]} material={materials.lamp}>
        <boxGeometry args={[0.2, 0.06, 0.34]} />
      </mesh>
    </group>
  );
}

useGLTF.preload(modelUrl(ROADS.lamp.file));
