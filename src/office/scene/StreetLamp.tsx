// A street lamp post for the town: a round foot, a thin pole, an arm that bends over it and a small glowing head on top, in the dark metal and the lamp colour that lights at night. About 0.6 across and 2.4 tall, standing on y = 0 with its origin in the middle of its foot. The head sits above the pole's centre and the arm reaches out the same way both sides, so the post needs no turning. Five meshes, nothing moves.

import { LAMP_HEIGHT } from '../city';
import { type Materials } from './materials';

export function StreetLamp({ materials }: { materials: Materials }) {
  return (
    <group>
      {/* Round foot and the thin pole. */}
      <mesh position={[0, 0.06, 0]} material={materials.metalDark}>
        <cylinderGeometry args={[0.2, 0.26, 0.12, 12]} />
      </mesh>
      <mesh position={[0, 1.1, 0]} material={materials.metalDark}>
        <cylinderGeometry args={[0.04, 0.06, 2.0, 8]} />
      </mesh>
      {/* The arm bends over the top of the pole, both ways, and a collar holds the head. */}
      <mesh position={[0, 2.12, 0]} material={materials.metalDark}>
        <boxGeometry args={[0.6, 0.05, 0.05]} />
      </mesh>
      <mesh position={[0, 2.16, 0]} material={materials.metalDark}>
        <cylinderGeometry args={[0.1, 0.07, 0.06, 8]} />
      </mesh>
      {/* The head, lit at night. */}
      <mesh position={[0, LAMP_HEIGHT - 0.1, 0]} material={materials.lamp}>
        <cylinderGeometry args={[0.1, 0.14, 0.2, 8]} />
      </mesh>
    </group>
  );
}
