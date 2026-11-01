// The streets of the town, laid with the pieces of Kenney's City Kit (Roads) (#285): one instanced mesh for each kind of piece, so that the
// hundreds of pieces of a town cost a handful of draw calls. The plane (or the roads) the town has under them stays: what the kit cannot cover shows it.

import { useGLTF } from '@react-three/drei';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ROADS, modelUrl } from '../assets';
import type { PieceKind, RoadPlan } from '../roadPieces';
import { type Materials } from './materials';

/** How high a kit piece's road lies over the ground it stands on, and the paving at its sides: the kit's own heights, flattened. */
export const roadTop = (level: number) => level + ROADS.top * ROADS.flat;
export const kerbTop = (level: number) => level + ROADS.kerbTop * ROADS.flat;

/**
 * A piece's geometry in three groups, by the swatch of the kit's colour map each face is painted with: the asphalt, the paving of the kerb and the
 * line. The kit's own grey is not used; the town's colours are (asphalt `street`, kerb `facade`, line `white`), in either theme.
 */
export function byTone(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geometry = source.clone();
  const index = geometry.index;
  const uv = geometry.getAttribute('uv');
  if (!index || !uv) return geometry;
  const tones: number[][] = [[], [], []];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    // The colour map is 8 swatches across and 4 down: the paving is the one at (3, 2), the line the one at (3, 3).
    const cell = [Math.floor(uv.getX(a) * 8), Math.floor(uv.getY(a) * 4)];
    tones[cell[0] === 3 && cell[1] === 2 ? 1 : cell[0] === 3 && cell[1] === 3 ? 2 : 0]!.push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
  }
  geometry.setIndex(tones.flat());
  geometry.clearGroups();
  let start = 0;
  tones.forEach((list, n) => {
    if (list.length > 0) geometry.addGroup(start, list.length, n);
    start += list.length;
  });
  return geometry;
}

const KINDS = Object.keys(ROADS.pieces) as PieceKind[];

function PieceMesh({ kind, plan, level, materials }: { kind: PieceKind; plan: RoadPlan; level: number; materials: Materials }) {
  const { scene } = useGLTF(modelUrl(ROADS.pieces[kind]));
  const geometry = useMemo(() => {
    let found: THREE.BufferGeometry | null = null;
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!found && mesh.isMesh) found = mesh.geometry;
    });
    return byTone(found ?? new THREE.BufferGeometry());
  }, [scene]);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const pieces = useMemo(() => plan.pieces.filter((piece) => piece.kind === kind), [plan, kind]);
  useLayoutEffect(() => {
    const node = mesh.current;
    if (!node) return;
    const frame = new THREE.Object3D();
    pieces.forEach((piece, n) => {
      frame.position.set(piece.x, level, piece.z);
      frame.rotation.set(0, (piece.turn * Math.PI) / 2, 0);
      frame.scale.set(piece.length, ROADS.flat, piece.width);
      frame.updateMatrix();
      node.setMatrixAt(n, frame.matrix);
    });
    node.instanceMatrix.needsUpdate = true;
    node.computeBoundingSphere();
  }, [pieces, level]);
  if (pieces.length === 0) return null;
  return <instancedMesh key={`${pieces.length}`} ref={mesh} args={[geometry, [materials.street, materials.facade, materials.white], pieces.length]} />;
}

/** The streets of a town, laid with the kit's pieces on the ground at `level`. */
export function Roads({ plan, level, materials }: { plan: RoadPlan; level: number; materials: Materials }) {
  return (
    <group>
      {KINDS.map((kind) => (
        <PieceMesh key={kind} kind={kind} plan={plan} level={level} materials={materials} />
      ))}
    </group>
  );
}

for (const file of Object.values(ROADS.pieces)) useGLTF.preload(modelUrl(file));
