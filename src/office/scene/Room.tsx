// A room with its walls and furniture, and the models they are drawn from.

import { Html, useGLTF } from '@react-three/drei';
import { Suspense, useContext, useMemo } from 'react';
import * as THREE from 'three';
import { CLEANLINESS } from '../../config/balance';
import { FLOOR, FURNITURE, ROOM_TYPE_NAMES, wallsOf, type RoomLayout, type RoomType } from '../../config/office';
import { footprint, isBroken, isFurnished } from '../../sim/office';
import type { Furniture, Id, RentedRoom, Role, Show } from '../../sim/state';
import { FURNITURE_ASSETS, MATERIAL_TONES, MODELS, MODEL_SCALE, modelUrl, type ModelId, type Part, type Tone } from '../assets';
import { partsAt } from '../layout';
import { Shape, WALL, usePointerCursor } from './frame';
import { type Materials, type Surface } from './materials';

/** Letter on the tag of a support staff member at work in a room. */
export const STAFF_MARK: Partial<Record<Role, string>> = { cleaner: 'C', technician: 'T', maintenance: 'M' };

export function Room({ layout, room, selected, selectedFurnitureId, interactive, faded, liftedId, note, onAir, materials, onSelect, onSelectFurniture }: {
  layout: RoomLayout;
  room: RentedRoom | undefined;
  selected: boolean;
  selectedFurnitureId: Id | null;
  interactive: boolean;
  /** The room is being given another shape: its walls and its label are left out while the new ones are drawn. */
  faded?: boolean;
  /** The piece that was picked up to be moved: it is left out where it stood. */
  liftedId?: Id;
  /** A line under the room's name: how many of its workplaces are taken. */
  note?: string;
  /** The shows going out from this room right now. */
  onAir: Show[];
  materials: Materials;
  onSelect: () => void;
  onSelectFurniture: (id: Id) => void;
}) {
  const { x, y: z, w, h: d } = layout;
  const surface: Surface = room?.type ?? 'unassigned';
  const dirt = room ? 1 - Math.min(1, room.cleanliness / CLEANLINESS.cleanEnough) : 0;
  // A room is called after its kind; one from an older game has a letter, and says its kind under it.
  const named = Boolean(room?.type && layout.name.startsWith(ROOM_TYPE_NAMES[room.type as RoomType]));
  const label = layout.fixed
    ? room && !isFurnished(room) ? 'Needs a desk' : null
    : !room?.type ? 'Choose a kind' : named ? null : ROOM_TYPE_NAMES[room.type as RoomType];
  const pointer = usePointerCursor(interactive);

  return (
    <group>
      <mesh
        position={[x + w / 2, 0.01, z + d / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={materials[surface]}
        receiveShadow
        onClick={interactive ? (e) => (e.stopPropagation(), onSelect()) : undefined}
        {...pointer}
      >
        <planeGeometry args={[w, d]} />
      </mesh>
      {/* Dirt builds up as a film over the room. */}
      {dirt > 0 && (
        <mesh position={[x + w / 2, 0.02, z + d / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[w, d]} />
          <meshBasicMaterial color={materials.dirt.color} transparent opacity={dirt * 0.45} depthWrite={false} />
        </mesh>
      )}
      {!layout.fixed && !faded && <Walls layout={layout} materials={materials} selected={selected} />}

      {room?.furniture.filter((item) => item.id !== liftedId).map((item) => (
        <Suspense key={item.id} fallback={null}>
          <FurnitureModel
            item={item}
            origin={[x + item.x, z + item.y]}
            selected={item.id === selectedFurnitureId}
            live={onAir.length > 0}
            materials={materials}
            onSelect={interactive ? () => (onSelect(), onSelectFurniture(item.id)) : undefined}
          />
        </Suspense>
      ))}

      <Html position={[x + w / 2, selected ? 1.1 : 0.9, z + 0.1]} center className={selected ? 'o3-label selected' : 'o3-label'} zIndexRange={[6, 0]} style={faded ? { display: 'none' } : undefined}>
        {/* The name can be clicked like the room, and it is what Penny's ring goes around when she asks for the room. */}
        <div className={interactive ? 'o3-label-body pickable' : 'o3-label-body'} data-guide={`room-${layout.id}`} onClick={interactive ? onSelect : undefined}>
          <strong>{layout.name}</strong>
          {label && <span>{label}</span>}
          {note && <span>{note}</span>}
          {onAir.length > 0 && <span className="o3-on-air">On air · {onAir.map((show) => show.name).join(', ')}</span>}
          {room?.issue && <span className="o3-issue" title={`The ${room.issue.kind} has failed`}>! {room.issue.kind} failed</span>}
        </div>
      </Html>
    </group>
  );
}

/**
 * The walls of a room, cut low so the rooms stay visible, with a gap where its
 * door is. A wall that is an outer wall of the building is left to the
 * building, which draws those (see `OuterWalls`).
 */
function Walls({ layout, materials, selected }: { layout: RoomLayout; materials: Materials; selected: boolean }) {
  const building = useContext(Shape);
  const material = selected ? materials.select : materials.wall;
  const height = selected ? WALL.low + 0.08 : WALL.low;
  const outer = ([x1, z1, , z2]: [number, number, number, number]) => (z1 === z2 ? z1 === 0 || z1 === FLOOR.h : x1 === building.w);
  return (
    <group>
      {wallsOf(layout).filter((wall) => !outer(wall)).map(([x1, z1, x2, z2], n) => (
        <mesh key={n} position={[(x1 + x2) / 2, height / 2, (z1 + z2) / 2]} material={material} castShadow receiveShadow>
          <boxGeometry args={[x2 - x1 + WALL.thick, height, z2 - z1 + WALL.thick]} />
        </mesh>
      ))}
    </group>
  );
}

export function FurnitureModel({ item, origin, selected, live, materials, onSelect }: {
  item: Furniture;
  origin: [x: number, z: number];
  selected: boolean;
  /** Whether a show is going out from the room: on-air lights and camera lamps are lit. */
  live: boolean;
  materials: Materials;
  onSelect?: () => void;
}) {
  const spec = FURNITURE[item.type];
  const size = footprint(item.type, item.turn);
  const broken = isBroken(item);
  const pointer = usePointerCursor(Boolean(onSelect));
  // Off the air, everything that glows red is dark.
  const shown = useMemo(() => (live ? materials : { ...materials, onAir: materials.metalDark }), [live, materials]);
  return (
    <group
      position={[origin[0], 0, origin[1]]}
      onClick={onSelect ? (e) => (e.stopPropagation(), onSelect()) : undefined}
      {...pointer}
    >
      {/* The parts are laid out unturned, then turned as a whole about the middle of the tiles they cover. */}
      <group position={[size.w / 2, 0, size.h / 2]} rotation={[0, ((item.turn + (FURNITURE_ASSETS[item.type].angle ?? 0)) * Math.PI) / 2, 0]}>
        <group position={[-spec.w / 2, 0, -spec.h / 2]}>
          {partsAt(item.type, item.tier).map((part, i) => (
            <PartMesh key={i} part={part} materials={shown} />
          ))}
        </group>
      </group>
      {selected && (
        <mesh position={[size.w / 2, 0.035, size.h / 2]} rotation={[-Math.PI / 2, 0, 0]} material={materials.select}>
          <planeGeometry args={[size.w - 0.06, size.h - 0.06]} />
        </mesh>
      )}
      {broken && (
        <group position={[size.w / 2, 1.7, size.h / 2]} rotation={[0, Math.PI / 4, 0]}>
          {[1, -1].map((side) => (
            <mesh key={side} rotation={[0, 0, (side * Math.PI) / 4]} material={materials.bad}>
              <boxGeometry args={[0.7, 0.14, 0.14]} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

export function PartMesh({ part, materials }: { part: Part; materials: Materials }) {
  const [x, y, z] = part.at;
  const turn: [number, number, number] = [0, ((part.turn ?? 0) * Math.PI) / 2, 0];
  if ('model' in part) {
    return (
      <group position={[x, y, z]} rotation={turn} scale={part.size ?? 1}>
        <Model id={part.model} tones={part.tones} materials={materials} />
      </group>
    );
  }
  const lean: [number, number, number] = [THREE.MathUtils.degToRad(part.tilt ?? 0), 0, THREE.MathUtils.degToRad(part.roll ?? 0)];
  if ('parts' in part) {
    return (
      <group position={[x, y, z]} rotation={turn}>
        <group rotation={lean}>
          {part.parts.map((child, i) => (
            <PartMesh key={i} part={child} materials={materials} />
          ))}
        </group>
      </group>
    );
  }
  // A shape leans about its own middle, then turns where it stands.
  const height = 'box' in part ? part.box[1] : part.cylinder[1];
  return (
    <group position={[x, y + height / 2, z]} rotation={turn}>
      <mesh rotation={lean} material={materials[part.tone]} castShadow receiveShadow>
        {'box' in part ? (
          <boxGeometry args={part.box} />
        ) : (
          <cylinderGeometry args={[part.cylinder[2] ?? part.cylinder[0], part.cylinder[0], part.cylinder[1], 14]} />
        )}
      </mesh>
    </group>
  );
}

/** A model from the registry, tinted with the theme's colors and centred on its footprint, standing on the floor. */
function Model({ id, tones, materials }: { id: ModelId; tones?: Record<string, Tone>; materials: Materials }) {
  const { scene } = useGLTF(modelUrl(MODELS[id]));
  const object = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const tint = (m: THREE.Material) => materials[tones?.[m.name] ?? MATERIAL_TONES[m.name] ?? 'white'];
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(tint) : tint(mesh.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    const box = new THREE.Box3().setFromObject(copy);
    const center = box.getCenter(new THREE.Vector3());
    copy.position.set(-center.x, -box.min.y, -center.z);
    return copy;
  }, [scene, materials, tones]);
  return (
    <group scale={MODEL_SCALE}>
      <primitive object={object} />
    </group>
  );
}
