// The two people of the story, Uncle Tabby and Penny Cash, as they stand beside
// what they say. Their models are Quaternius's Animated Man and Animated Woman
// (public/models/story, CC0): taller and less blocky than the staff in the
// office, so they read as people from outside it. The colors are the game's own.

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { talking, voiceLevel } from '../audio/voice';
import { SPEAKERS, getLine, type Speaker } from '../config/guide';
import { modelUrl } from './assets';

/** How tall a figure stands in its own scene, whatever size its file has. */
const HEIGHT = 1.7;

/** A part of a model that takes another color than its file gives it: a sleeve or a trouser leg on bare skin. */
type Cover = 'sleeve' | 'leg';

interface Figure {
  file: string;
  /** The clip that plays while they talk. */
  idle: string;
  /** Colors per material name, for a model that has a material per part. */
  tones?: Record<string, string>;
  /**
   * For a model that takes its colors from one small picture in bands, from the
   * top down: the last row of each band (of 32) and its color.
   */
  bands?: readonly (readonly [number, string])[];
  /** The material (or, with bands, the row of the picture) that is bare skin, and what covers it. */
  skin: { material?: string; row?: number; sleeve: string | number; leg?: string | number };
  /** A shirt and a tie showing between the lapels, painted on the front of this material. */
  front?: { material: string; shirt: string; tie: string };
  /**
   * The bones that move while they talk, by their names in the file: the head
   * with the bone that ends it, and each arm as its upper and its lower part,
   * the arm that does most of the talking first.
   */
  bones: { head: string; crown: string; arms: readonly [readonly [string, string], readonly [string, string]] };
  /** Where the mouth is: how far up the head, from its base (0) to its crown (1), and its color. */
  mouth: { up: number; color: string };
}

const FIGURES: Record<Speaker, Figure> = {
  // A newspaper man: navy suit, silver hair and socks nobody dares to mention. The file has him
  // in a T-shirt and shorts, so his arms and legs are painted as sleeves and trouser legs.
  tabby: {
    file: 'story/tabby.glb',
    idle: 'HumanArmature|Man_Idle',
    tones: { Shirt: '#0b2a4f', Pants: '#1f1535', Hair: '#dcd6ee', Skin: '#e7bd91', Socks: '#fbb03b', Eyes: '#2a1745' },
    skin: { material: 'Skin', sleeve: '#0b2a4f', leg: '#1f1535' },
    front: { material: 'Shirt', shirt: '#f7f5ff', tie: '#fbb03b' },
    bones: { head: 'Head', crown: 'Head_end', arms: [['UpperArm.R', 'LowerArm.R'], ['UpperArm.L', 'LowerArm.L']] },
    mouth: { up: 0.19, color: '#7a2f2a' },
  },
  // A consultant in the company's purple, with trousers that don't show the ink.
  penny: {
    file: 'story/penny.glb',
    idle: 'Armature|Idle',
    bands: [[5, '#e7bd91'], [10, '#2a1745'], [16, '#8c3a1e'], [22, '#6631d2'], [27, '#2a1745'], [31, '#fbb03b']],
    skin: { row: 1, sleeve: 18 },
    bones: { head: 'Head', crown: 'HeadTop_End', arms: [['RightArm', 'RightForeArm'], ['LeftArm', 'LeftForeArm']] },
    mouth: { up: 0.2, color: '#7a2f2a' },
  },
};

/**
 * How they move while they talk. The files come with no talking or pointing
 * clip, so the game moves the arms itself, on top of the quiet clip that
 * plays: every angle is a resting part and a slow swing around it, in radians,
 * and all of it fades in and out with the voice. The mouth is a small shape on
 * the face that opens with how loud the voice is at that moment.
 */
const TALK = {
  /** Seconds to go from standing quietly to talking, and back. */
  ease: 0.35,
  /** The arm that talks: the upper arm comes forward a little, the forearm comes up and waves. */
  lead: { upper: [0.3, 0.1, 2.1], lower: [1.15, 0.3, 3.3], sway: [0.22, 1.7] },
  /** The other arm does less, and out of step. */
  other: { upper: [0.12, 0.06, 1.6], lower: [0.45, 0.25, 2.7], sway: [0.1, 1.3] },
  head: { nod: [0.05, 4.1], tilt: [0.04, 2.3] },
  /** The mouth, in shares of how tall the figure stands: wide, how high when wide open, and how far it stands off the face. `closed` is how much of that height is left when it is shut. */
  mouth: { width: 0.034, height: 0.02, off: 0.004, closed: 0.16, quick: 0.5 },
} as const;

/** The name a bone has once the file is loaded: the loader drops what can't be in a name. */
const boneName = (name: string) => name.replace(/[.\s]/g, '');

const RIGHT = new THREE.Vector3(1, 0, 0);
const FRONT = new THREE.Vector3(0, 0, 1);
const turnBy = new THREE.Quaternion();
const parentTurn = new THREE.Quaternion();
const axis = new THREE.Vector3();

/**
 * Turns a bone around an axis of the figure itself (not of the bone, whose own
 * axes differ per file), on top of the pose it has. `frame` is the turn of the
 * figure as a whole.
 */
function turn(bone: THREE.Object3D, around: THREE.Vector3, angle: number, frame: THREE.Quaternion): void {
  if (!bone.parent || angle === 0) return;
  bone.parent.getWorldQuaternion(parentTurn);
  turnBy.setFromAxisAngle(axis.copy(around).applyQuaternion(frame), angle);
  // In the parent's terms: undo the parent's turn, turn, and put the parent's turn back.
  bone.quaternion.premultiply(turnBy.multiply(parentTurn).premultiply(parentTurn.clone().invert()));
}

const PALETTE_ROWS = 32;

/** A palette picture one pixel wide, with the bands where the model's own picture has them. */
function paletteTexture(bands: readonly (readonly [number, string])[]): THREE.DataTexture {
  const data = new Uint8Array(PALETTE_ROWS * 4);
  const color = new THREE.Color();
  for (let row = 0; row < PALETTE_ROWS; row++) {
    const [, hex] = bands.find(([last]) => row <= last) ?? bands[bands.length - 1]!;
    // Kept as written: the texture is marked sRGB below, so the renderer does the conversion.
    color.set(hex).convertLinearToSRGB();
    data.set([Math.round(color.r * 255), Math.round(color.g * 255), Math.round(color.b * 255), 255], row * 4);
  }
  const texture = new THREE.DataTexture(data, 1, PALETTE_ROWS, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Where on the body a point of the resting pose is: both models stand with
 * their arms out to the side, so an arm is whatever lies far from the middle.
 * `side` is 0 at the spine and 1 at the fingertips; `up` is 0 at the soles and 1 at the crown.
 */
const BODY = { armFrom: 0.3, handFrom: 0.86, legTo: 0.5, ankle: 0.07 };
function coverAt(side: number, up: number): Cover | null {
  if (side > BODY.armFrom) return side < BODY.handFrom ? 'sleeve' : null;
  return up < BODY.legTo && up > BODY.ankle ? 'leg' : null;
}

/** The chest of a jacket: how far up from the soles it opens, and how wide the shirt and the tie show. The files face along minus y. */
const CHEST = { from: 0.6, shirt: 0.1, tie: 0.035 };
const FACING = 1;

/**
 * Dresses bare arms and legs: every triangle of skin that lies on an arm or a
 * leg takes the color of the sleeve or the trousers. `paint` gets the corners
 * of the triangle to change.
 */
function dress(geometry: THREE.BufferGeometry, frame: THREE.Box3, isSkin: (corner: number) => boolean, paint: (corner: number, cover: Cover | null) => void): void {
  const position = geometry.getAttribute('position');
  const size = frame.getSize(new THREE.Vector3());
  const center = frame.getCenter(new THREE.Vector3());
  // The files stand along z; the arms lie along whichever of the other two is the wider.
  const wide = size.x > size.y ? 'x' : 'y';
  const point = new THREE.Vector3();
  for (let corner = 0; corner < position.count; corner += 3) {
    let side = 0;
    let up = 0;
    for (let k = 0; k < 3; k++) {
      point.fromBufferAttribute(position, corner + k);
      side += Math.abs(point[wide] - center[wide]) / (size[wide] / 2) / 3;
      up += (point.z - frame.min.z) / size.z / 3;
    }
    const cover = isSkin(corner) ? coverAt(side, up) : null;
    for (let k = 0; k < 3; k++) paint(corner + k, cover);
  }
}

function Model({ who, still }: { who: Speaker; still: boolean }) {
  const figure = FIGURES[who];
  const { scene, animations } = useGLTF(modelUrl(figure.file));
  const invalidate = useThree((s) => s.invalidate);

  const { object, parts } = useMemo(() => {
    const copy = cloneSkinned(scene);
    const palette = figure.bands && paletteTexture(figure.bands);
    const meshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
    copy.traverse((child) => {
      const mesh = child as (typeof meshes)[number];
      if (mesh.isMesh) meshes.push(mesh);
    });
    // The whole body in its resting pose, which the parts are measured against.
    const frame = new THREE.Box3();
    for (const mesh of meshes) {
      mesh.geometry.computeBoundingBox();
      frame.union(mesh.geometry.boundingBox!);
    }
    const tone = new THREE.Color();
    for (const mesh of meshes) {
      // Skinned meshes move away from their resting box, so never cull them.
      mesh.frustumCulled = false;
      const material = mesh.material.clone();
      const own = figure.tones?.[material.name];
      if (own) material.color.set(own);
      if (palette) material.map = palette;
      material.roughness = 1;
      material.metalness = 0;
      mesh.material = material;

      const { skin } = figure;
      if (skin.row !== undefined) {
        // Colors come from the picture: a covered triangle looks at the row of its cover instead.
        const geometry = mesh.geometry.toNonIndexed();
        const uv = geometry.getAttribute('uv');
        const rowOf = (corner: number) => Math.floor(uv.getY(corner) * PALETTE_ROWS);
        const skinRows = figure.bands!.find(([last]) => skin.row! <= last)![0];
        dress(geometry, frame, (corner) => rowOf(corner) <= skinRows, (corner, cover) => {
          const row = cover && skin[cover];
          if (typeof row === 'number') uv.setY(corner, (row + 0.5) / PALETTE_ROWS);
        });
        mesh.geometry = geometry;
      } else if (material.name === skin.material) {
        // Colors come from the material: the skin gets a color per corner, and the material goes white under it.
        const geometry = mesh.geometry.toNonIndexed();
        const colors = new Float32Array(geometry.getAttribute('position').count * 3);
        const bare = material.color.clone();
        dress(geometry, frame, () => true, (corner, cover) => {
          const hex = cover && skin[cover];
          (typeof hex === 'string' ? tone.set(hex) : tone.copy(bare)).toArray(colors, corner * 3);
        });
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        material.color.set('#ffffff');
        material.vertexColors = true;
        mesh.geometry = geometry;
      }
      const { front } = figure;
      if (front && material.name === front.material) {
        // A strip down the chest, on the side the face is on: shirt, with a tie in the middle of it.
        const geometry = mesh.geometry.toNonIndexed();
        const position = geometry.getAttribute('position');
        const colors = new Float32Array(position.count * 3);
        const jacket = material.color.clone();
        const size = frame.getSize(new THREE.Vector3());
        const center = frame.getCenter(new THREE.Vector3());
        const [wide, deep] = size.x > size.y ? (['x', 'y'] as const) : (['y', 'x'] as const);
        const point = new THREE.Vector3();
        for (let corner = 0; corner < position.count; corner += 3) {
          let side = 0;
          let up = 0;
          let depth = 0;
          for (let k = 0; k < 3; k++) {
            point.fromBufferAttribute(position, corner + k);
            side += Math.abs(point[wide] - center[wide]) / (size[wide] / 2) / 3;
            up += (point.z - frame.min.z) / size.z / 3;
            depth += (point[deep] - center[deep]) / 3;
          }
          const chest = depth * FACING < 0 && up > CHEST.from && side < CHEST.shirt;
          const color = chest ? tone.set(side < CHEST.tie ? front.tie : front.shirt) : tone.copy(jacket);
          for (let k = 0; k < 3; k++) color.toArray(colors, (corner + k) * 3);
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        material.color.set('#ffffff');
        material.vertexColors = true;
        mesh.geometry = geometry;
      }
    }
    // Stand it on the ground at a known height: the files come in their own units.
    copy.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(copy);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = HEIGHT / (size.y || 1);
    const holder = new THREE.Group();

    // What moves while they talk: the bones, and a mouth that is put on the face here.
    const bone = (name: string) => copy.getObjectByName(boneName(name)) ?? copy.getObjectByName(name);
    const head = bone(figure.bones.head);
    const crown = bone(figure.bones.crown);
    const arms = figure.bones.arms.map(([upper, lower]) => ({ upper: bone(upper), lower: bone(lower) }));
    let mouth: THREE.Mesh | undefined;
    if (head && crown) {
      const base = head.getWorldPosition(new THREE.Vector3());
      const tall = crown.getWorldPosition(new THREE.Vector3()).y - base.y;
      const at = new THREE.Vector3(base.x, base.y + figure.mouth.up * tall, -Infinity);
      // The face is the part of the head that is furthest forward at that height.
      const point = new THREE.Vector3();
      for (const mesh of meshes) {
        const position = mesh.geometry.getAttribute('position');
        const skinned = mesh as unknown as THREE.SkinnedMesh;
        for (let i = 0; i < position.count; i++) {
          if (skinned.isSkinnedMesh) skinned.getVertexPosition(i, point);
          else point.fromBufferAttribute(position, i);
          point.applyMatrix4(mesh.matrixWorld);
          if (Math.abs(point.y - at.y) < 0.07 * tall && Math.abs(point.x - at.x) < 0.12 * tall) at.z = Math.max(at.z, point.z);
        }
      }
      if (Number.isFinite(at.z)) {
        at.z += TALK.mouth.off * size.y;
        mouth = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: figure.mouth.color }));
        // It hangs on the head, so it goes where the head goes; it is set down facing forward, in the head's own terms.
        const headTurn = head.getWorldQuaternion(new THREE.Quaternion());
        const headSize = head.getWorldScale(new THREE.Vector3());
        mouth.position.copy(head.worldToLocal(at.clone()));
        mouth.quaternion.copy(headTurn.invert());
        mouth.scale.set((TALK.mouth.width * size.y) / headSize.x, (TALK.mouth.height * size.y * TALK.mouth.closed) / headSize.y, 1);
        mouth.userData.open = (TALK.mouth.height * size.y) / headSize.y;
        head.add(mouth);
      }
    }

    copy.position.set(-center.x, -box.min.y, -center.z);
    holder.add(copy);
    holder.scale.setScalar(scale);
    return { object: holder, parts: { head, arms, mouth } };
  }, [scene, figure]);

  const group = useRef<THREE.Group>(null);
  const { actions } = useAnimations(animations, group);
  useEffect(() => {
    const action = actions[figure.idle];
    if (!action) return;
    action.reset().play();
    action.paused = still;
    invalidate();
    return () => void action.stop();
  }, [actions, figure, still, invalidate]);
  // While their own line is heard they talk with their hands, and the mouth goes with the voice. This runs
  // after the clip has set the pose of the frame, and adds to it. With motion reduced the scene is drawn on
  // demand, once the pose is set, and nobody moves.
  const talk = useRef({ amount: 0, open: 0 });
  const frameTurn = useMemo(() => new THREE.Quaternion(), []);
  /** The bones that are moved, each with the pose the clip gave it and the pose it was left in: a bone the clip does not move is put back first, or the turns would add up frame after frame. */
  const moved = useMemo(
    () => [parts.head, ...parts.arms.flatMap((arm) => [arm.upper, arm.lower])].filter((bone): bone is THREE.Object3D => bone !== undefined).map((bone) => ({ bone, base: bone.quaternion.clone(), left: bone.quaternion.clone() })),
    [parts],
  );
  useFrame(({ clock }, delta) => {
    if (still) return;
    const lineId = talking();
    const on = lineId !== undefined && getLine(lineId)?.speaker === who;
    const state = talk.current;
    state.amount = THREE.MathUtils.clamp(state.amount + (on ? delta : -delta) / TALK.ease, 0, 1);
    // The mouth opens at once and closes a little slower, or it flickers.
    const level = on ? voiceLevel() : 0;
    state.open = level > state.open ? level : Math.max(level, state.open - delta / (TALK.ease * TALK.mouth.quick));
    const { mouth } = parts;
    if (mouth) mouth.scale.y = (mouth.userData.open as number) * (TALK.mouth.closed + (1 - TALK.mouth.closed) * state.open);
    for (const part of moved) {
      if (part.bone.quaternion.equals(part.left)) part.bone.quaternion.copy(part.base);
      else part.base.copy(part.bone.quaternion);
    }
    if (state.amount === 0) return;
    const amount = state.amount * state.amount * (3 - 2 * state.amount);
    const t = clock.elapsedTime;
    group.current?.getWorldQuaternion(frameTurn);
    parts.arms.forEach((arm, n) => {
      const move = n === 0 ? TALK.lead : TALK.other;
      // Forward is toward the viewer: the hand comes up in front of the body.
      if (arm.upper) turn(arm.upper, RIGHT, -amount * (move.upper[0] + move.upper[1] * Math.sin(move.upper[2] * t + n)), frameTurn);
      if (arm.lower) {
        turn(arm.lower, RIGHT, -amount * (move.lower[0] + move.lower[1] * Math.sin(move.lower[2] * t + 1 + n)), frameTurn);
        turn(arm.lower, FRONT, amount * move.sway[0] * Math.sin(move.sway[1] * t + 2 * n), frameTurn);
      }
    });
    if (parts.head) {
      turn(parts.head, RIGHT, amount * TALK.head.nod[0] * Math.sin(TALK.head.nod[1] * t), frameTurn);
      turn(parts.head, FRONT, amount * TALK.head.tilt[0] * Math.sin(TALK.head.tilt[1] * t), frameTurn);
    }
    for (const part of moved) part.left.copy(part.bone.quaternion);
  });

  return (
    // Turned a little toward what they are saying, which stands to their right.
    <group ref={group} rotation={[0, 0.35, 0]}>
      <primitive object={object} />
    </group>
  );
}

/** Aims the camera at the part of the figure the frame shows. */
function Framing({ from, to }: { from: number; to: number }) {
  const camera = useThree((s) => s.camera);
  const { height } = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    const middle = (from + to) / 2;
    camera.position.set(0, middle + 0.25, 6);
    camera.lookAt(0, middle, 0);
    camera.zoom = height / (to - from);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, height, from, to, invalidate]);
  return null;
}

/**
 * Uncle Tabby or Penny Cash in a frame of their own: from the waist up beside
 * a few lines of text (`bust`), or nearly whole for the welcome.
 */
export function StoryFigure({ who, still, bust = false }: { who: Speaker; still: boolean; bust?: boolean }) {
  return (
    <Canvas orthographic flat dpr={[1, 2]} frameloop={still ? 'demand' : 'always'} camera={{ near: 0.1, far: 50 }} gl={{ alpha: true }} role="img" aria-label={SPEAKERS[who].name}>
      <Framing from={bust ? 0.95 : 0.35} to={HEIGHT + 0.12} />
      <ambientLight intensity={2.1} />
      <directionalLight position={[-3, 6, 6]} intensity={1.6} />
      <Suspense fallback={null}>
        <Model who={who} still={still} />
      </Suspense>
    </Canvas>
  );
}

for (const figure of Object.values(FIGURES)) useGLTF.preload(modelUrl(figure.file));
