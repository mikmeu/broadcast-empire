// The stage of the awards night (issue #130): a curtain, a floor, a podium with the
// little gold trophy on it, two spotlights, and the two hosts, Lotta Glitter on the
// left and Sonny Sparkle on the right. One canvas that fills the box around it.
// Everything but the hosts is simple shapes in the game's palette (design/style.md);
// there are no shadow maps and only two lights, so it runs on a weak machine.

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Presenter } from '../config/guide';
import { Model } from './StoryFigure';

const COLORS = {
  curtain: '#3c199b',
  curtainFold: '#6631d2',
  valance: '#452a65',
  floor: '#b0a2f2',
  floorEdge: '#6631d2',
  podium: '#452a65',
  podiumTop: '#e5dcff',
  gold: '#fbb03b',
  goldLight: '#fcee21',
  beam: '#fff8cc',
  back: '#2a1745',
};

/** Where things stand, in the stage's own units (a figure is 1.7 tall). */
const STAGE = { hostX: 1.75, hostZ: 0.25, width: 7, depth: 3.4, curtainZ: -1.7 };
/** What the camera must always show: the width across the hosts and the height from the floor to above their heads. */
const FRAME = { width: 5.4, height: 2.75, fov: 30, lookY: 1.05 };

/** Aims the camera so both hosts fit whatever the shape of the box is. */
function Framing() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const { width, height } = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    const tan = Math.tan((FRAME.fov * Math.PI) / 360);
    const aspect = width / Math.max(height, 1);
    const distance = Math.max(FRAME.height / (2 * tan), FRAME.width / (2 * tan * aspect));
    camera.fov = FRAME.fov;
    camera.position.set(0, FRAME.lookY + 0.35, distance);
    camera.lookAt(0, FRAME.lookY, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, width, height, invalidate]);
  return null;
}

/** The curtain: folds as upright boards of two purples, a valance across the top. */
function Curtain() {
  const folds = 16;
  const span = STAGE.width + 2;
  return (
    <group position={[0, 0, STAGE.curtainZ]}>
      <mesh position={[0, 2, -0.12]}>
        <boxGeometry args={[span, 4.2, 0.05]} />
        <meshStandardMaterial color={COLORS.back} />
      </mesh>
      {Array.from({ length: folds }, (_, i) => (
        <mesh key={i} position={[(i - (folds - 1) / 2) * (span / folds), 1.95, i % 2 ? 0.07 : 0]}>
          <boxGeometry args={[span / folds + 0.01, 3.9, 0.12]} />
          <meshStandardMaterial color={i % 2 ? COLORS.curtainFold : COLORS.curtain} />
        </mesh>
      ))}
      <mesh position={[0, 3.85, 0.12]}>
        <boxGeometry args={[span, 0.4, 0.3]} />
        <meshStandardMaterial color={COLORS.valance} />
      </mesh>
      <mesh position={[0, 3.62, 0.3]}>
        <boxGeometry args={[span, 0.07, 0.05]} />
        <meshStandardMaterial color={COLORS.gold} />
      </mesh>
    </group>
  );
}

function Floor() {
  return (
    <group>
      <mesh position={[0, -0.1, 0]}>
        <boxGeometry args={[STAGE.width, 0.2, STAGE.depth]} />
        <meshStandardMaterial color={COLORS.floor} />
      </mesh>
      {/* the gold rim at the front edge */}
      <mesh position={[0, -0.03, STAGE.depth / 2 + 0.01]}>
        <boxGeometry args={[STAGE.width, 0.07, 0.04]} />
        <meshStandardMaterial color={COLORS.gold} />
      </mesh>
      {/* a runner of the deeper purple between the hosts */}
      <mesh position={[0, 0.002, 0.25]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.5, STAGE.depth - 0.4]} />
        <meshStandardMaterial color={COLORS.floorEdge} />
      </mesh>
    </group>
  );
}

/** The gold cup: a base, a stem, a bowl, two handles and a star. It turns slowly while the winner is announced. */
function Trophy({ still, reveal }: { still: boolean; reveal: boolean }) {
  const cup = useRef<THREE.Group>(null);
  const gold = useRef<THREE.MeshStandardMaterial>(null);
  const glow = useRef<THREE.Mesh>(null);
  const level = useRef(0);
  const invalidate = useThree((s) => s.invalidate);
  const apply = (lit: number) => {
    if (gold.current) {
      gold.current.emissiveIntensity = lit * 1.1;
      gold.current.emissive.set(COLORS.goldLight);
    }
    if (glow.current) {
      glow.current.visible = lit > 0.02;
      glow.current.scale.setScalar(0.6 + lit * 0.7);
      (glow.current.material as THREE.MeshBasicMaterial).opacity = lit * 0.22;
    }
  };
  useLayoutEffect(() => {
    if (still) {
      level.current = reveal ? 1 : 0;
      apply(level.current);
      invalidate();
    }
  });
  useFrame(({ clock }, delta) => {
    if (still) return;
    level.current = THREE.MathUtils.clamp(level.current + (reveal ? delta : -delta) / 0.5, 0, 1);
    const pulse = reveal ? 0.85 + 0.15 * Math.sin(clock.elapsedTime * 6) : 1;
    apply(level.current * pulse);
    if (cup.current) cup.current.rotation.y += delta * (0.4 + level.current * 2.2);
  });
  return (
    <group position={[0, 1.03, 0]} scale={1.4}>
      <mesh ref={glow} position={[0, 0.22, -0.05]} visible={false}>
        <circleGeometry args={[0.5, 24]} />
        <meshBasicMaterial color={COLORS.goldLight} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <group ref={cup}>
        <mesh position={[0, 0.03, 0]}>
          <cylinderGeometry args={[0.12, 0.14, 0.06, 16]} />
          <meshStandardMaterial ref={gold} color={COLORS.gold} roughness={0.4} metalness={0.2} />
        </mesh>
        <mesh position={[0, 0.13, 0]}>
          <cylinderGeometry args={[0.025, 0.04, 0.14, 12]} />
          <meshStandardMaterial color={COLORS.gold} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.13, 0.04, 0.2, 16]} />
          <meshStandardMaterial color={COLORS.gold} roughness={0.4} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.14, 0.3, 0]} rotation={[0, 0, side > 0 ? -Math.PI / 2 : Math.PI / 2]}>
            <torusGeometry args={[0.05, 0.014, 8, 14, Math.PI]} />
            <meshStandardMaterial color={COLORS.gold} roughness={0.4} />
          </mesh>
        ))}
        <mesh position={[0, 0.5, 0]}>
          <octahedronGeometry args={[0.07]} />
          <meshStandardMaterial color={COLORS.goldLight} roughness={0.5} emissive={COLORS.goldLight} emissiveIntensity={0.15} />
        </mesh>
      </group>
    </group>
  );
}

/** A podium between the hosts, with the trophy on top. */
function Podium({ still, reveal }: { still: boolean; reveal: boolean }) {
  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.8, 1, 0.5]} />
        <meshStandardMaterial color={COLORS.podium} />
      </mesh>
      <mesh position={[0, 1.01, 0]}>
        <boxGeometry args={[0.92, 0.04, 0.62]} />
        <meshStandardMaterial color={COLORS.podiumTop} />
      </mesh>
      <mesh position={[0, 0.8, 0.255]}>
        <boxGeometry args={[0.5, 0.08, 0.01]} />
        <meshStandardMaterial color={COLORS.gold} />
      </mesh>
      <mesh position={[0, 0.3, 0.255]}>
        <boxGeometry args={[0.5, 0.08, 0.01]} />
        <meshStandardMaterial color={COLORS.gold} />
      </mesh>
      <Trophy still={still} reveal={reveal} />
    </group>
  );
}

/** A beam of light from above: an open cone with a pool on the floor. It brightens on the one who talks, and flares for the winner. */
function Spotlight({ x, lit, flare, still }: { x: number; lit: boolean; flare: boolean; still: boolean }) {
  const beam = useRef<THREE.MeshBasicMaterial>(null);
  const pool = useRef<THREE.MeshBasicMaterial>(null);
  const cone = useRef<THREE.Mesh>(null);
  const level = useRef(0.5);
  const invalidate = useThree((s) => s.invalidate);
  const target = (flare ? 1 : lit ? 0.75 : 0.45) as number;
  const apply = (value: number, extra: number) => {
    if (beam.current) beam.current.opacity = 0.05 + value * 0.14 + extra * 0.08;
    if (pool.current) pool.current.opacity = 0.1 + value * 0.16 + extra * 0.06;
    cone.current?.scale.set(1 + extra * 0.25, 1, 1 + extra * 0.25);
  };
  useLayoutEffect(() => {
    if (still) {
      level.current = target;
      apply(target, flare ? 1 : 0);
      invalidate();
    }
  });
  useFrame(({ clock }, delta) => {
    if (still) return;
    level.current += (target - level.current) * Math.min(1, delta * 6);
    apply(level.current, flare ? 0.5 + 0.5 * Math.sin(clock.elapsedTime * 7) : 0);
  });
  const height = 4.1;
  return (
    <group position={[x, 0, STAGE.hostZ]}>
      <mesh ref={cone} position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.1, 0.95, height, 24, 1, true]} />
        <meshBasicMaterial ref={beam} color={COLORS.beam} transparent opacity={0.1} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.95, 32]} />
        <meshBasicMaterial ref={pool} color={COLORS.beam} transparent opacity={0.25} depthWrite={false} />
      </mesh>
      {/* the lamp */}
      <mesh position={[0, height + 0.05, 0]}>
        <cylinderGeometry args={[0.16, 0.2, 0.22, 14]} />
        <meshStandardMaterial color={COLORS.back} />
      </mesh>
    </group>
  );
}

/**
 * The awards night's stage: Lotta Glitter (left) and Sonny Sparkle (right) either side of a
 * podium with the trophy. `talking` is who is speaking, whose spotlight is brightest; `reveal`
 * is true while the winner is announced (trophy and spotlights flare); `still` is reduced
 * motion: the scene is drawn on demand and nothing moves.
 */
export function AwardStage({ talking, still, reveal }: { talking: Presenter | undefined; still: boolean; reveal: boolean }) {
  const hostTurn = useMemo(() => ({ lotta: 0.4, sonny: -0.4 }), []);
  return (
    <Canvas
      flat
      dpr={[1, 2]}
      frameloop={still ? 'demand' : 'always'}
      camera={{ fov: FRAME.fov, near: 0.1, far: 60 }}
      gl={{ alpha: true }}
      style={{ width: '100%', height: '100%', display: 'block' }}
      role="img"
      aria-label="The awards stage, with Lotta Glitter and Sonny Sparkle either side of the trophy"
    >
      <Framing />
      <ambientLight intensity={2.1} />
      <directionalLight position={[-2, 6, 6]} intensity={1.6} />
      <Curtain />
      <Floor />
      <Podium still={still} reveal={reveal} />
      <Spotlight x={-STAGE.hostX} lit={talking === 'lotta'} flare={reveal} still={still} />
      <Spotlight x={STAGE.hostX} lit={talking === 'sonny'} flare={reveal} still={still} />
      <Suspense fallback={null}>
        <group position={[-STAGE.hostX, 0, STAGE.hostZ]}>
          <Model who="lotta" still={still} turned={hostTurn.lotta} />
        </group>
        <group position={[STAGE.hostX, 0, STAGE.hostZ]}>
          <Model who="sonny" still={still} turned={hostTurn.sonny} />
        </group>
      </Suspense>
    </Canvas>
  );
}
