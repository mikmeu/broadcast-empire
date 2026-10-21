// A person in the office: the model, how they walk and what they do.

import { Html, useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { bodyFile, type Look } from '../../config/looks';
import type { GameState } from '../../sim/state';
import { ANIMATIONS, CHARACTER_SCALE, SEAT_HEIGHT, characterFor, modelUrl } from '../assets';
import { partOf, restyle } from '../looks';
import { type Person } from '../layout';
import { walkPath } from '../routes';
import { STAFF_MARK } from './Room';
import { World, usePointerCursor } from './frame';
import { type Materials } from './materials';

/** Tiles per second. */
const WALK_SPEED = 3;

/** The models face the viewer (+z); turn 0 means facing north. */
const facing = (turn: number) => Math.PI + (turn * Math.PI) / 2;

/**
 * A copy of a character's model that can be posed on its own, in the colors of a look if one is given: the
 * parts the look recolors get texture coordinates of their own (office/looks.ts).
 */
export function characterCopy(scene: THREE.Object3D, look?: Look): THREE.Object3D {
  const copy = cloneSkinned(scene);
  copy.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    // Skinned meshes move away from their resting box, so never cull them.
    mesh.frustumCulled = false;
    const part = look && partOf(mesh.name);
    const shape = { position: mesh.geometry.getAttribute('position').array, index: mesh.geometry.index?.array ?? null };
    const uv = part && restyle(part, mesh.geometry.getAttribute('uv').array, look, shape);
    if (!uv) return;
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  });
  return copy;
}

/** A look as a word: the same for the same character and colors. */
export const lookKey = (look: Look) => `${look.body}/${look.skin}/${look.hair}/${look.outfit}`;

export function Character({ person, game, look, still, selected, materials, onSelect }: {
  person: Person;
  /** The game, for the way across the floor: the walls, the doors and the furniture are where it has them. */
  game: GameState;
  /** The player's own character has a look; everyone else looks as their name decides. */
  look?: Look;
  still: boolean;
  selected: boolean;
  materials: Materials;
  onSelect?: () => void;
}) {
  const pointer = usePointerCursor(Boolean(onSelect));
  const { scene, animations } = useGLTF(modelUrl(look ? bodyFile(look.body) : characterFor(person.name)));
  const object = useMemo(() => characterCopy(scene, look), [scene, look]);
  const group = useRef<THREE.Group>(null);
  const { actions, mixer } = useAnimations(animations, group);
  const { pace } = useContext(World);
  // A paused game holds everyone in the middle of their step; a fast one hurries them, though not their gestures as much.
  useEffect(() => void (mixer.timeScale = Math.min(pace, 2)), [mixer, pace]);
  // Someone who turns up on the floor starts where they come from, the lift or the entrance, and walks to their place.
  const start = person.from && !still ? person.from : person;
  const path = useRef<[number, number][]>(person.from && !still ? walkPath(game, person.floor, person.from, person) : []);
  const last = useRef(person);
  const [walking, setWalking] = useState(path.current.length > 0);
  // People who come in at the same moment come through the door one after the other.
  const hold = useRef(path.current.length > 0 ? ([...person.id].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 8) * 0.22 : 0);
  /** Through a door, into a lift or out of the building: out of sight until they come back. */
  const [gone, setGone] = useState(Boolean(person.away) && path.current.length === 0);

  // A new place: walk there, unless motion is reduced or this is a different floor's worth of distance.
  useEffect(() => {
    const from = last.current;
    last.current = person;
    if (from === person || still || !group.current) return;
    if (from.x === person.x && from.z === person.z) return;
    const { x, z } = group.current.position;
    path.current = walkPath(game, person.floor, { x, z }, person);
    setWalking(true);
    // The game only says what is in the way; a change in it is no reason to set out.
  }, [person, still]);

  const activity = walking ? 'walk' : person.activity;
  useEffect(() => {
    const playing = ANIMATIONS[activity].flatMap((clip) => actions[clip] ?? []);
    for (const action of playing) {
      action.reset().fadeIn(still ? 0 : 0.2).play();
      action.paused = still;
    }
    return () => playing.forEach((action) => void action.fadeOut(still ? 0 : 0.2));
  }, [actions, activity, still]);

  useFrame((_, delta) => {
    const node = group.current;
    if (!node) return;
    if (hold.current > 0) {
      hold.current -= Math.min(delta, 0.1) * pace;
      node.visible = hold.current <= 0;
      return;
    }
    const next = path.current[0];
    const out = Boolean(person.away) && (!next || still);
    if (out !== gone) setGone(out);
    if (!next || still) {
      if (walking) setWalking(false);
      path.current = [];
      node.position.set(person.x, (person.y ?? 0) + (person.activity === 'sit' ? SEAT_HEIGHT : 0), person.z);
      node.rotation.y = facing(person.turn);
      return;
    }
    const dx = next[0] - node.position.x;
    const dz = next[1] - node.position.z;
    const distance = Math.hypot(dx, dz);
    const step = WALK_SPEED * pace * Math.min(delta, 0.1);
    if (step === 0) return;
    if (distance <= step) {
      node.position.set(next[0], 0, next[1]);
      path.current.shift();
      if (path.current.length === 0) setWalking(false);
      return;
    }
    node.position.x += (dx / distance) * step;
    node.position.z += (dz / distance) * step;
    node.position.y = 0;
    node.rotation.y = Math.atan2(dx, dz);
  });

  const mark = person.role === 'visitor' ? undefined : person.role === 'ceo' ? '★' : STAFF_MARK[person.role];
  return (
    <group ref={group} visible={!gone} position={start === person ? [person.x, (person.y ?? 0) + (person.activity === 'sit' ? SEAT_HEIGHT : 0), person.z] : [start.x, 0, start.z]} rotation={[0, facing(person.turn), 0]}>
      <group scale={CHARACTER_SCALE}>
        <primitive object={object} />
      </group>
      {/* An unseen shape around the person takes the click, so they are easy to hit even while moving. */}
      {onSelect && !gone && (
        <mesh position={[0, 0.6, 0]} onClick={(e) => (e.stopPropagation(), onSelect())} {...pointer}>
          <cylinderGeometry args={[0.38, 0.38, 1.2, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {selected && (
        <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} material={materials.select}>
          <ringGeometry args={[0.42, 0.56, 24]} />
        </mesh>
      )}
      {gone ? null : selected ? (
        <Html position={[0, 1.5, 0]} center className="o3-label selected" zIndexRange={[7, 0]}>
          <strong>{person.name}</strong>
        </Html>
      ) : (
        mark && (
          <Html position={[0, 1.45, 0]} center className="o3-staff" zIndexRange={[5, 0]}>
            <span title={person.name}>{mark}</span>
          </Html>
        )
      )}
    </group>
  );
}
