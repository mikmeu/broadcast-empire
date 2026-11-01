// The traffic and the people in the street, and the lights that rule them.

import { useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { bodyFile, type Look } from '../../config/looks';
import type { GameState } from '../../sim/state';
import { ANIMATIONS, CARS, CHARACTER_SCALE, ROADS, characterFor, modelUrl, type Tone } from '../assets';
import { PAVEMENT } from '../city';
import { type Site } from '../sites';
import { layoutOf } from '../townLayout';
import { createTraffic, lightFor, placeOf, signalsOf, stepTraffic, vehiclesIn, type Traffic } from '../traffic';
import { createStreet, stepStreet, stepVans, strollerAt, strollers, type Street } from '../street';
import { CEO_ID, tripsOf, vanTripsOf, type Trip, type VanTrip } from '../day';
import { OFFICE_DAY } from '../../config/world';
import { audienceBlocks, talkGuests } from '../layout';
import { asideFor, easeAside, placedAside } from '../aside';
import { characterCopy } from './Character';
import { Shape, World } from './frame';
import { type Materials } from './materials';
import { LOOKS, lookOf, lookParts, modelOf, type ModelName, type Parts, type PartName, type VehicleLook } from './vehicleModels';

/**
 * How many vehicles of each look can be on screen at once; what the traffic holds beyond that is not drawn. The three cars of the kit each have the
 * room of all cars, as which one a car is follows its colour.
 */
const POOL: Record<VehicleLook, number> = { sedan: 70, suv: 70, hatchback: 70, taxi: 20, van: 22, truck: 16, bus: 8, news: 6 };

const none = <T,>(fill: () => T): Record<VehicleLook, T> => Object.fromEntries(LOOKS.map((look) => [look, fill()])) as Record<VehicleLook, T>;

const MODELS = Object.keys(CARS.models) as ModelName[];
const MODEL_URLS = MODELS.map((model) => modelUrl(CARS.models[model].file));

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
      const layout = layoutOf(site);
      // (The barriers of level crossings close for the train that is drawn: it runs on the world's clock, 0.21.0.)
      life.current = { traffic: createTraffic(seed, clock, site.traffic, building, site.front === 'water', layout, { cars: site.train, at: time }), street: createStreet(strollers(seed, site.strollers, building, layout)), at: time };
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
      {!still && <Pedestrians life={life} seed={seed} count={site.strollers} site={site} look={game?.look} />}
    </>
  );
}

/** The most traffic lights a town has room for: one before each crossing for every lane that comes up to it. */
const MOST_SIGNALS = 240;

/**
 * A traffic light: the City Kit (Roads)'s (#285), a post with its head of three lamps facing the drivers, drawn `size` times its own height
 * (the head ends as high as the box did before: 1.6 tiles), and the lamp that is lit, ours because it changes: high for red, low for green.
 * The kit faces -x, and its head stands `out` in front of the post.
 */
const SIGNAL = { size: 1.6 / ROADS.light.height, lamp: [0.15, 0.12, 0.05] } as const;
const LIT = { red: ROADS.light.lamps.red * SIGNAL.size, amber: ROADS.light.lamps.amber * SIGNAL.size, green: ROADS.light.lamps.green * SIGNAL.size } as const;

/**
 * The traffic lights at the crossings (traffic.ts), drawn as one set of
 * shapes for all of them. The lamps change with the lights every frame;
 * the posts only when the town is filled afresh.
 */
function Signals({ life, still, materials }: { life: RefObject<Life | null>; still: boolean; materials: Materials }) {
  const posts = useRef<THREE.InstancedMesh>(null);
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
  const { scene } = useGLTF(modelUrl(ROADS.light.file));
  const geometry = useMemo(() => {
    let found: THREE.BufferGeometry | null = null;
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!found && mesh.isMesh) found = mesh.geometry;
    });
    return found ?? new THREE.BufferGeometry();
  }, [scene]);

  const draw = () => {
    const traffic = life.current?.traffic;
    if (!traffic || !posts.current || !lamps.current) return;
    if (placed.current?.traffic !== traffic) {
      const signals = signalsOf(traffic).slice(0, MOST_SIGNALS);
      placed.current = { traffic, signals };
      signals.forEach((signal, n) => {
        // The head faces the drivers: the way the angle points.
        frame.rotation.set(0, signal.angle + Math.PI, 0);
        frame.position.set(signal.x, 0, signal.z);
        frame.scale.setScalar(SIGNAL.size);
        frame.updateMatrix();
        posts.current!.setMatrixAt(n, frame.matrix);
      });
      frame.scale.setScalar(1);
      for (const mesh of [posts.current, lamps.current]) mesh.count = signals.length;
      posts.current.instanceMatrix.needsUpdate = true;
    }
    const { signals } = placed.current;
    signals.forEach((signal, n) => {
      const light = lightFor(traffic, signal.id, signal.axis) ?? 'green';
      // On the face towards the drivers: the box faces the way the angle points.
      const ahead = { x: Math.cos(signal.angle), z: -Math.sin(signal.angle) };
      const out = ROADS.light.out * SIGNAL.size + 0.02;
      frame.rotation.set(0, signal.angle, 0);
      frame.position.set(signal.x + ahead.x * out, LIT[light], signal.z + ahead.z * out);
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
      <instancedMesh ref={posts} args={[geometry, materials.metalDark, MOST_SIGNALS]} count={0} />
      <instancedMesh ref={lamps} args={[undefined, lampMaterial, MOST_SIGNALS]} count={0}>
        <boxGeometry args={[SIGNAL.lamp[2], SIGNAL.lamp[1], SIGNAL.lamp[0]]} />
      </instancedMesh>
    </>
  );
}

/** How many hours a day at the office has. */
const OFFICE_HOURS = OFFICE_DAY.to - OFFICE_DAY.from;

/** The material of a part of a look: the palette's, except the body of a car, van or truck, which is white and takes the colour of each vehicle. */
function materialOf(look: VehicleLook, part: PartName, materials: Materials, paint: THREE.Material, stripe: THREE.Material): THREE.Material {
  if (part === 'stripe') return stripe;
  if (part === 'body') return look === 'taxi' ? materials.lamp : look === 'bus' || look === 'news' ? materials.white : paint;
  return materials[part === 'dark' ? 'metalDark' : part];
}

/**
 * The vehicles, drawn from the Car Kit's models (vehicleModels.ts): one instanced mesh for each part of each look, so that the hundred
 * vehicles of a town cost about twenty draw calls. They are placed anew every frame; the matrix of a vehicle is the same for all its parts.
 */
function Vehicles({ life, still, materials, stripe }: { life: RefObject<Life | null>; still: boolean; materials: Materials; stripe?: string }) {
  const meshes = useRef<Record<VehicleLook, Partial<Record<PartName, THREE.InstancedMesh | null>>>>(none(() => ({})));
  const frame = useMemo(() => new THREE.Object3D(), []);
  // The news van's stripe: one material, in the color of the company's first channel, or the palette's accent without one.
  const stripeMaterial = useMemo(() => new THREE.MeshLambertMaterial({ flatShading: true }), []);
  // The body of the vehicles that take a colour: white, tinted by each vehicle's own through the instance colour.
  const paint = useMemo(() => new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), []);
  useLayoutEffect(() => {
    stripeMaterial.color.copy(materials.accent.color);
    if (stripe) stripeMaterial.color.set(stripe);
  }, [stripeMaterial, stripe, materials]);
  const models = useGLTF(MODEL_URLS);
  const parts = useMemo(
    () =>
      Object.fromEntries(
        LOOKS.map((look) => {
          const model = modelOf(look);
          return [look, lookParts(look, model ? models[MODELS.indexOf(model)]!.scene : null)];
        }),
      ) as Record<VehicleLook, Parts>,
    [models],
  );

  const draw = () => {
    const traffic = life.current?.traffic;
    if (!traffic) return;
    const count = none(() => 0);
    const place = (look: VehicleLook, x: number, y: number, z: number, angle: number, tone: Tone) => {
      const n = count[look]++;
      if (n >= POOL[look]) return;
      frame.position.set(x, y, z);
      frame.rotation.y = angle;
      frame.updateMatrix();
      for (const mesh of Object.values(meshes.current[look])) mesh?.setMatrixAt(n, frame.matrix);
      if (look !== 'taxi' && look !== 'bus' && look !== 'news') meshes.current[look].body?.setColorAt(n, materials[tone].color);
    };
    for (const vehicle of vehiclesIn(traffic)) {
      const at = placeOf(traffic, vehicle);
      place(lookOf(vehicle), at.x, 0, at.z, at.angle, vehicle.tone);
    }
    // The cars in the company's parking lot (0.20.0), driving in, parked and backing out.
    for (const car of traffic.lot.cars) {
      // Up the ramp of the drive-in onto the lot, which lies as high as the pavement.
      // (How far it is from the street's middle line, across the street: along x for a street along z, along z for one along x.)
      const across = traffic.lot.ground.along === 'z' ? car.x : car.z;
      const height = PAVEMENT * Math.min(1, Math.max(0, traffic.lot.ground.side * (across - traffic.lot.ground.street) - traffic.roads.half + 0.5));
      place(lookOf(car), car.x, height, car.z, car.angle, car.tone);
    }
    for (const look of LOOKS) {
      for (const mesh of Object.values(meshes.current[look])) {
        if (!mesh) continue;
        mesh.count = Math.min(count[look], POOL[look]);
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  };
  useLayoutEffect(draw);
  useFrame(() => !still && draw());

  // Not culled: three.js keeps the bounding sphere of an instanced mesh from its first frame, and the vehicles move out of it.
  return (
    <>
      {LOOKS.flatMap((look) =>
        (Object.entries(parts[look]) as [PartName, THREE.BufferGeometry][]).map(([part, geometry]) => (
          <instancedMesh
            key={`${look}-${part}`}
            ref={(mesh) => void (meshes.current[look][part] = mesh)}
            args={[geometry, materialOf(look, part, materials, paint, stripeMaterial), POOL[look]]}
            count={0}
            frustumCulled={false}
          />
        )),
      )}
    </>
  );
}

for (const url of MODEL_URLS) useGLTF.preload(url);

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
function Pedestrians({ life, seed, count, site, look }: { life: RefObject<Life | null>; seed: number; count: number; site: Site; look?: Look }) {
  const { now } = useContext(World);
  const building = useContext(Shape);
  const walking = useMemo(() => strollers(seed, count, building, layoutOf(site)), [seed, count, building, site]);
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
