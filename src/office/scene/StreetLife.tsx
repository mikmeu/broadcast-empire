// The traffic and the people in the street, and the lights that rule them.

import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { bodyFile, type Look } from '../../config/looks';
import type { GameState } from '../../sim/state';
import { ANIMATIONS, CITY, CHARACTER_SCALE, characterFor, modelUrl } from '../assets';
import { PAVEMENT } from '../city';
import { type Site } from '../sites';
import { createTraffic, lightFor, placeOf, signalsOf, stepTraffic, vehiclesIn, type Traffic, type VehicleKind } from '../traffic';
import { createStreet, stepStreet, stepVans, strollerAt, strollers, type Street } from '../street';
import { CEO_ID, tripsOf, vanTripsOf, type Trip, type VanTrip } from '../day';
import { OFFICE_DAY } from '../../config/world';
import { audienceBlocks, talkGuests } from '../layout';
import { asideFor, easeAside, placedAside } from '../aside';
import { characterCopy } from './Character';
import { Shape, World } from './frame';
import { type Materials } from './materials';

/** How many vehicles of each kind can be on screen at once; what the traffic holds beyond that is not drawn. */
const POOL: Record<VehicleLook, number> = { car: 70, taxi: 20, van: 22, truck: 16, bus: 8, news: 6 };

/** What a vehicle is drawn as: its kind, or the company's news van (0.20.0). */
type VehicleLook = VehicleKind | 'news';

const KINDS = Object.keys(POOL) as VehicleLook[];

const none = <T,>(fill: () => T): Record<VehicleLook, T> => ({ car: fill(), taxi: fill(), van: fill(), truck: fill(), bus: fill(), news: fill() });

/**
 * The shapes of a vehicle, pointing along +x. The first one is the body, which takes the vehicle's own color.
 * The news van has its own stripe material, the color of the company's channel.
 */
function vehicleShapes(look: VehicleLook, materials: Materials, stripe: THREE.Material): { at: [number, number, number]; size: [number, number, number]; material: THREE.Material }[] {
  const kind: VehicleKind = look === 'news' ? 'van' : look;
  const { length, width } = CITY.vehicles[kind];
  const chassis = { at: [0, 0.28, 0] as [number, number, number], size: [length - 0.2, 0.16, width] as [number, number, number], material: materials.metalDark };
  if (kind === 'bus') {
    // After the designer's photo of a bus: white above a blue skirt, a long band of dark windows, a tall
    // windscreen with the destination over it, and two doors on the side of the kerb.
    return [
      { at: [0, 0.7, 0], size: [length, 0.4, width - 0.04], material: materials.white },
      chassis,
      { at: [0, 0.42, 0], size: [length + 0.02, 0.2, width], material: materials.glass },
      { at: [-0.1, 0.96, 0], size: [length - 0.5, 0.3, width], material: materials.metalDark },
      { at: [0, 1.17, 0], size: [length, 0.12, width - 0.04], material: materials.white },
      { at: [length / 2 - 0.02, 0.88, 0], size: [0.08, 0.5, width - 0.1], material: materials.metalDark },
      { at: [length / 2, 1.17, 0], size: [0.06, 0.1, 0.56], material: materials.lamp },
      { at: [0.95, 0.72, width / 2], size: [0.42, 0.72, 0.04], material: materials.metalDark },
      { at: [-0.35, 0.72, width / 2], size: [0.42, 0.72, 0.04], material: materials.metalDark },
    ];
  }
  if (kind === 'truck') {
    return [
      { at: [length / 2 - 0.4, 0.62, 0], size: [0.8, 0.56, width - 0.06], material: materials.white },
      chassis,
      { at: [length / 2 - 0.1, 0.76, 0], size: [0.22, 0.24, width - 0.14], material: materials.glass },
      { at: [-0.42, 0.82, 0], size: [length - 0.9, 0.9, width], material: materials.metal },
    ];
  }
  if (look === 'news') {
    // A white van with a stripe in the channel's color along both sides, and on the roof a mast with a flat
    // dish on it (a wide, thin head with a rim, and a small feed standing over it), seen well from the town's camera.
    return [
      { at: [0, 0.66, 0], size: [length, 0.66, width - 0.04], material: materials.white },
      chassis,
      { at: [length / 2 - 0.12, 0.8, 0], size: [0.26, 0.28, width - 0.1], material: materials.glass },
      { at: [-0.18, 0.6, 0], size: [length - 0.6, 0.12, width], material: stripe },
      { at: [-0.2, 1.12, 0], size: [0.07, 0.26, 0.07], material: materials.metalDark },
      { at: [-0.2, 1.28, 0], size: [0.56, 0.05, 0.56], material: materials.metal },
      { at: [-0.2, 1.32, 0], size: [0.4, 0.05, 0.4], material: materials.metalMid },
      { at: [-0.2, 1.42, 0], size: [0.05, 0.16, 0.05], material: materials.metalDark },
    ];
  }
  if (kind === 'van') {
    return [
      { at: [0, 0.66, 0], size: [length, 0.66, width - 0.04], material: materials.white },
      chassis,
      { at: [length / 2 - 0.12, 0.8, 0], size: [0.26, 0.28, width - 0.1], material: materials.glass },
    ];
  }
  const car = [
    { at: [0, 0.5, 0] as [number, number, number], size: [length, 0.36, width - 0.06] as [number, number, number], material: kind === 'taxi' ? materials.lamp : materials.white },
    chassis,
    { at: [-0.1, 0.82, 0] as [number, number, number], size: [0.8, 0.3, 0.66] as [number, number, number], material: materials.glass },
  ];
  // A taxi is yellow and carries a sign on its roof.
  return kind === 'taxi' ? [...car, { at: [-0.1, 1.03, 0], size: [0.22, 0.12, 0.4], material: materials.metalDark }] : car;
}

/** The traffic and the people in the street of a game, as they are now. */
interface Life {
  traffic: Traffic;
  street: Street;
  /** The game's time they were last moved on to, in seconds. */
  at: number;
}

/**
 * Everything that moves in the street: the traffic (traffic.ts) and the
 * people (street.ts), moved on together with the game's time. They stand
 * still while the game is paused; with motion reduced the traffic is shown
 * as it stands and nobody walks.
 */
export function StreetLife({ seed, site, game, still, materials }: { seed: number; site: Site; game?: GameState; still: boolean; materials: Materials }) {
  const { now, hours } = useContext(World);
  const building = useContext(Shape);
  const life = useRef<Life | null>(null);
  const plan = useRef<{ game: GameState | undefined; day: number; trips: Trip[]; vans: VanTrip[] } | null>(null);

  const step = () => {
    const time = now();
    const clock = hours();
    const since = life.current ? time - life.current.at : -1;
    // A new game, a loaded one or a long gap: fill the streets afresh instead of catching up.
    if (!life.current || since < 0 || since > 3) {
      life.current = { traffic: createTraffic(seed, clock, site.traffic, building, site.front === 'water'), street: createStreet(strollers(seed, site.strollers, building)), at: time };
    } else if (since > 0) {
      const day = Math.floor(clock / OFFICE_HOURS + 1e-9);
      if (!plan.current || plan.current.game !== game || plan.current.day !== day) {
        plan.current = { game, day, trips: game ? tripsOf(game, day, audienceBlocks(game), talkGuests(game)) : [], vans: game ? vanTripsOf(game, day) : [] };
      }
      const { trips, vans } = plan.current;
      stepTraffic(life.current.traffic, since, clock);
      stepStreet(life.current.street, life.current.traffic, trips, day * OFFICE_HOURS, clock, since);
      // The company's news vans (0.20.0).
      stepVans(life.current.street, life.current.traffic, vans, day * OFFICE_HOURS, clock);
      life.current.at = time;
    }
  };
  // Before anything is drawn, so that what is drawn is where things are now.
  useLayoutEffect(() => void (life.current ?? step()));
  useFrame(() => !still && step(), -1);

  return (
    <>
      <Vehicles life={life} still={still} materials={materials} stripe={game?.channels[0]?.logo.color} />
      <Signals life={life} still={still} materials={materials} />
      {!still && <Pedestrians life={life} seed={seed} count={site.strollers} look={game?.look} />}
    </>
  );
}

/** The most traffic lights a town has room for: one before each crossing for every lane that comes up to it. */
const MOST_SIGNALS = 240;

/**
 * A traffic light: a post, a box on it facing the drivers (`box` is its
 * width, height and depth), and the lamp that is lit: high for red, low for green.
 */
const SIGNAL = { post: [0.08, 1.1, 0.08], box: [0.28, 0.62, 0.16], lamp: [0.18, 0.17, 0.05], lamps: { red: 1.5, amber: 1.3, green: 1.1 } } as const;

/**
 * The traffic lights at the crossings (traffic.ts), drawn as one set of
 * shapes for all of them. The lamps change with the lights every frame;
 * the posts only when the town is filled afresh.
 */
function Signals({ life, still, materials }: { life: RefObject<Life | null>; still: boolean; materials: Materials }) {
  const posts = useRef<THREE.InstancedMesh>(null);
  const boxes = useRef<THREE.InstancedMesh>(null);
  const lamps = useRef<THREE.InstancedMesh>(null);
  const placed = useRef<{ traffic: Traffic; signals: ReturnType<typeof signalsOf> } | null>(null);
  // The lamps glow in the palette's own colors, whatever the light in the scene.
  const lit = useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    const color = (token: string) => new THREE.Color(css.getPropertyValue(token).trim() || '#ffffff');
    return { red: color('--red'), amber: color('--orange'), green: color('--green') };
  }, []);
  const lampMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff' }), []);
  const frame = useMemo(() => new THREE.Object3D(), []);

  const draw = () => {
    const traffic = life.current?.traffic;
    if (!traffic || !posts.current || !boxes.current || !lamps.current) return;
    if (placed.current?.traffic !== traffic) {
      const signals = signalsOf(traffic).slice(0, MOST_SIGNALS);
      placed.current = { traffic, signals };
      signals.forEach((signal, n) => {
        frame.rotation.set(0, signal.angle, 0);
        frame.position.set(signal.x, SIGNAL.post[1] / 2, signal.z);
        frame.updateMatrix();
        posts.current!.setMatrixAt(n, frame.matrix);
        frame.position.set(signal.x, SIGNAL.lamps.amber, signal.z);
        frame.updateMatrix();
        boxes.current!.setMatrixAt(n, frame.matrix);
      });
      for (const mesh of [posts.current, boxes.current, lamps.current]) mesh.count = signals.length;
      posts.current.instanceMatrix.needsUpdate = true;
      boxes.current.instanceMatrix.needsUpdate = true;
    }
    const { signals } = placed.current;
    signals.forEach((signal, n) => {
      const light = lightFor(traffic, signal.id, signal.axis) ?? 'green';
      // On the face towards the drivers: the box faces the way the angle points.
      const ahead = { x: Math.cos(signal.angle), z: -Math.sin(signal.angle) };
      const out = SIGNAL.box[2] / 2 + 0.02;
      frame.rotation.set(0, signal.angle, 0);
      frame.position.set(signal.x + ahead.x * out, SIGNAL.lamps[light], signal.z + ahead.z * out);
      frame.updateMatrix();
      lamps.current!.setMatrixAt(n, frame.matrix);
      lamps.current!.setColorAt(n, lit[light]);
    });
    lamps.current.instanceMatrix.needsUpdate = true;
    if (lamps.current.instanceColor) lamps.current.instanceColor.needsUpdate = true;
  };
  useLayoutEffect(draw);
  useFrame(() => !still && draw());

  return (
    <>
      <instancedMesh ref={posts} args={[undefined, materials.metalDark, MOST_SIGNALS]} count={0}>
        <boxGeometry args={SIGNAL.post} />
      </instancedMesh>
      <instancedMesh ref={boxes} args={[undefined, materials.metalDark, MOST_SIGNALS]} count={0}>
        <boxGeometry args={[SIGNAL.box[2], SIGNAL.box[1], SIGNAL.box[0]]} />
      </instancedMesh>
      <instancedMesh ref={lamps} args={[undefined, lampMaterial, MOST_SIGNALS]} count={0}>
        <boxGeometry args={[SIGNAL.lamp[2], SIGNAL.lamp[1], SIGNAL.lamp[0]]} />
      </instancedMesh>
    </>
  );
}

/** How many hours a day at the office has. */
const OFFICE_HOURS = OFFICE_DAY.to - OFFICE_DAY.from;

/** The vehicles, drawn from a fixed set of shapes that are placed anew every frame. */
function Vehicles({ life, still, materials, stripe }: { life: RefObject<Life | null>; still: boolean; materials: Materials; stripe?: string }) {
  const nodes = useRef<Record<VehicleLook, (THREE.Group | null)[]>>(none(() => []));
  const bodies = useRef<Record<VehicleLook, (THREE.Mesh | null)[]>>(none(() => []));
  const shown = useRef<Record<VehicleLook, number>>(none(() => 0));
  // The news van's stripe: one material, in the color of the company's first channel, or the palette's accent without one.
  const stripeMaterial = useMemo(() => new THREE.MeshLambertMaterial({ flatShading: true }), []);
  useLayoutEffect(() => {
    stripeMaterial.color.copy(materials.accent.color);
    if (stripe) stripeMaterial.color.set(stripe);
  },[stripeMaterial, stripe, materials]);
  const shapes = useMemo(() => Object.fromEntries(KINDS.map((look) => [look, vehicleShapes(look, materials, stripeMaterial)])) as Record<VehicleLook, ReturnType<typeof vehicleShapes>>, [materials, stripeMaterial]);

  const draw = () => {
    const traffic = life.current?.traffic;
    if (!traffic) return;
    const count = none(() => 0);
    for (const vehicle of vehiclesIn(traffic)) {
      const look: VehicleLook = vehicle.news ? 'news' : vehicle.kind;
      const n = count[look]++;
      const node = nodes.current[look][n];
      if (!node) continue;
      const at = placeOf(traffic, vehicle);
      node.visible = true;
      node.position.set(at.x, 0, at.z);
      node.rotation.y = at.angle;
      const body = bodies.current[look][n];
      if (body && look !== 'taxi' && look !== 'bus' && look !== 'news') body.material = materials[vehicle.tone];
    }
    // The cars in the company's parking lot (0.20.0), driving in, parked and backing out.
    for (const car of traffic.lot.cars) {
      const look: VehicleLook = car.news ? 'news' : car.kind;
      const n = count[look]++;
      const node = nodes.current[look][n];
      if (!node) continue;
      node.visible = true;
      // Up the ramp of the drive-in onto the lot, which lies as high as the pavement.
      node.position.set(car.x, PAVEMENT * Math.min(1, Math.max(0, car.x - traffic.lot.ground.street - 0.5)), car.z);
      node.rotation.y = car.angle;
      const body = bodies.current[look][n];
      if (body && look !== 'news') body.material = materials[car.tone];
    }
    for (const look of KINDS) {
      for (let n = count[look]; n < shown.current[look]; n++) nodes.current[look][n]!.visible = false;
      shown.current[look] = Math.min(count[look], POOL[look]);
    }
  };
  useLayoutEffect(draw);
  useFrame(() => !still && draw());

  return (
    <>
      {KINDS.flatMap((look) =>
        Array.from({ length: POOL[look] }, (_, n) => (
          <group key={`${look}${n}`} ref={(node) => void (nodes.current[look][n] = node)} visible={false}>
            {shapes[look].map((shape, i) => (
              <mesh key={i} ref={i === 0 ? (mesh) => void (bodies.current[look][n] = mesh) : undefined} position={shape.at} material={shape.material}>
                <boxGeometry args={shape.size} />
              </mesh>
            ))}
          </group>
        )),
      )}
    </>
  );
}

/** Someone in the street as the view draws them. */
interface Passer {
  id: string;
  name: string;
  x: number;
  z: number;
  angle: number;
  moving: boolean;
}

/**
 * The people in the street: those on their way to the office or home, and
 * the strollers. Who is there changes now and then; where each of them is
 * changes every frame, so that is handed to the figures without drawing the
 * list again.
 */
function Pedestrians({ life, seed, count, look }: { life: RefObject<Life | null>; seed: number; count: number; look?: Look }) {
  const { now } = useContext(World);
  const building = useContext(Shape);
  const walking = useMemo(() => strollers(seed, count, building), [seed, count, building]);
  const passers = useRef(new Map<string, Passer>());
  /** How far each one is to their right of their way, stepping aside for someone who comes the other way (aside.ts). */
  const asides = useRef(new Map<string, number>());
  const [keys, setKeys] = useState<string[]>([]);

  useFrame((_, delta) => {
    const street = life.current?.street;
    if (!street) return;
    const map = new Map<string, Passer>();
    for (const walker of street.walkers) if (walker.delay <= 0) map.set(walker.key, { id: walker.id, name: walker.name, x: walker.x, z: walker.z, angle: walker.angle, moving: walker.moving });
    const time = now();
    // Those who cross a street are kept by the street (street.ts); the others are where the time puts them.
    walking.forEach((stroller, n) => stroller.across || map.set(`stroller-${n}`, { id: '', name: stroller.name, moving: true, ...strollerAt(stroller, time) }));
    for (const c of street.crossers) map.set(`stroller-${c.n}`, { id: '', name: c.name, x: c.x, z: c.z, angle: c.angle, moving: c.moving });
    const walkingNow = [...map.values()].filter((p) => p.moving);
    const moved = new Map<string, { x: number; z: number }>();
    for (const [key, passer] of map) {
      const target = passer.moving ? asideFor(passer, walkingNow.filter((other) => other !== passer)) : 0;
      const aside = easeAside(asides.current.get(key) ?? 0, target, delta);
      asides.current.set(key, aside);
      moved.set(key, placedAside(passer, aside));
    }
    for (const [key, at] of moved) Object.assign(map.get(key)!, at);
    for (const key of asides.current.keys()) if (!map.has(key)) asides.current.delete(key);
    passers.current = map;
    if (map.size !== keys.length || keys.some((key) => !map.has(key))) setKeys([...map.keys()]);
  });

  return (
    <>
      {keys.map((key) => (
        <Figure key={key} get={() => passers.current.get(key)} look={passers.current.get(key)?.id === CEO_ID ? look : undefined} />
      ))}
    </>
  );
}

/** One person in the street, walking or standing where `get` says they are. */
function Figure({ get, look }: { get: () => Passer | undefined; look?: Look }) {
  const name = useRef(get()?.name ?? '');
  const { scene, animations } = useGLTF(modelUrl(look ? bodyFile(look.body) : characterFor(name.current)));
  const object = useMemo(() => characterCopy(scene, look), [scene, look]);
  const group = useRef<THREE.Group>(null);
  const { actions, mixer } = useAnimations(animations, group);
  const { pace } = useContext(World);
  useEffect(() => void (mixer.timeScale = Math.min(pace, 2)), [mixer, pace]);
  const moving = useRef<boolean | null>(null);

  useFrame(() => {
    const node = group.current;
    const passer = get();
    if (!node) return;
    node.visible = passer !== undefined;
    if (!passer) return;
    node.position.set(passer.x, PAVEMENT, passer.z);
    node.rotation.y = passer.angle;
    if (passer.moving === moving.current) return;
    for (const clip of ANIMATIONS[moving.current ? 'walk' : 'idle']) actions[clip]?.fadeOut(0.15);
    for (const clip of ANIMATIONS[passer.moving ? 'walk' : 'idle']) actions[clip]?.reset().fadeIn(0.15).play();
    moving.current = passer.moving;
  });

  return (
    <group ref={group} visible={false}>
      <group scale={CHARACTER_SCALE}>
        <primitive object={object} />
      </group>
    </group>
  );
}
