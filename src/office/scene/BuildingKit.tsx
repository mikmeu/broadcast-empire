// The outside of the office drawn with the pieces of Kenney's Building Kit (#305): one instanced mesh for each part of each kind of piece, so
// that the long walls of the Hills and Fields buildings, repeated on every floor, cost a handful of draw calls.

import { useGLTF } from '@react-three/drei';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BUILDING_KIT, modelUrl } from '../assets';
import type { WallKind, WallPiece } from '../buildingPieces';
import { listsBySwatch } from './swatches';

/** The three tones a piece is painted in: the wall, the frame of a window or doorway, and the glass. Each is a material of the theme. */
export interface KitTones {
  facade: THREE.Material;
  trim: THREE.Material;
  glass: THREE.Material;
}

type Tone = keyof KitTones;

/** A kit model as geometries with the tone each is painted in: the glass (a material of its own) and the colour map's faces cut by their swatch. */
export function partsOf(scene: THREE.Object3D): { geometry: THREE.BufferGeometry; tone: Tone }[] {
  scene.updateMatrixWorld(true);
  const parts: { geometry: THREE.BufferGeometry; tone: Tone }[] = [];
  const { across, down, trim } = BUILDING_KIT.swatches;
  scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const placed = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    if ((mesh.material as THREE.Material).name === 'glass') {
      parts.push({ geometry: placed, tone: 'glass' });
      return;
    }
    const lists = listsBySwatch(placed, (column) => ((trim as readonly number[]).includes(column) ? 1 : 0), 2, across, down);
    (['facade', 'trim'] as const).forEach((tone, n) => {
      if (lists[n]!.length === 0) return;
      const geometry = placed.clone();
      geometry.setIndex(lists[n]!);
      parts.push({ geometry, tone });
    });
  });
  return parts;
}

function KindMesh({ kind, pieces, y, high, tones, shadow }: { kind: WallKind; pieces: WallPiece[]; y: number; high: number; tones: KitTones; shadow: boolean }) {
  const { scene } = useGLTF(modelUrl(BUILDING_KIT.pieces[kind].file));
  const parts = useMemo(() => partsOf(scene), [scene]);
  const mine = useMemo(() => pieces.filter((piece) => piece.kind === kind), [pieces, kind]);
  if (mine.length === 0) return null;
  return (
    <>
      {parts.map((part, n) => (
        <PartMesh key={`${n}:${mine.length}`} geometry={part.geometry} material={tones[part.tone]} pieces={mine} kind={kind} y={y} high={high} shadow={shadow} />
      ))}
    </>
  );
}

function PartMesh({ geometry, material, pieces, kind, y, high, shadow }: { geometry: THREE.BufferGeometry; material: THREE.Material; pieces: WallPiece[]; kind: WallKind; y: number; high: number; shadow: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const node = mesh.current;
    if (!node) return;
    const frame = new THREE.Object3D();
    const length = BUILDING_KIT.pieces[kind].length;
    const up = high / BUILDING_KIT.height;
    pieces.forEach((piece, n) => {
      frame.position.set(piece.x, y, piece.z);
      frame.rotation.set(0, (piece.turn * Math.PI) / 2, 0);
      // A post is thinner than it comes, so that it stays inside the 0.2 the old boxes reached out; a wall is stretched along its run.
      frame.scale.set(kind === 'post' ? 0.8 : 1, up, kind === 'post' ? 0.8 : piece.span / length);
      frame.updateMatrix();
      node.setMatrixAt(n, frame.matrix);
    });
    node.instanceMatrix.needsUpdate = true;
    node.computeBoundingSphere();
  }, [pieces, kind, y, high]);
  return <instancedMesh ref={mesh} args={[geometry, material, pieces.length]} castShadow={shadow} receiveShadow={shadow} />;
}

const KINDS = Object.keys(BUILDING_KIT.pieces) as WallKind[];

/** Pieces of the outside standing on `y`, stretched to be `high` tiles tall. */
export function BuildingKit({ pieces, y, high, tones, shadow = false }: { pieces: WallPiece[]; y: number; high: number; tones: KitTones; shadow?: boolean }) {
  return (
    <group>
      {KINDS.map((kind) => (
        <KindMesh key={kind} kind={kind} pieces={pieces} y={y} high={high} tones={tones} shadow={shadow} />
      ))}
    </group>
  );
}

for (const { file } of Object.values(BUILDING_KIT.pieces)) useGLTF.preload(modelUrl(file));
