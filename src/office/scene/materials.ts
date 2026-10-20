// Colors: read from the theme tokens, so the 3D view follows light and dark.

import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { type Tone } from '../assets';

// --- Colors: read from the theme tokens, so the 3D view follows light and dark ---

const TONE_TOKENS: Record<Tone, string> = {
  wood: '--o3-wood',
  woodDark: '--o3-wood-dark',
  fabric: '--o3-fabric',
  fabricDark: '--o3-fabric-dark',
  white: '--o3-white',
  plant: '--o3-plant',
  metal: '--o3-metal',
  metalMid: '--o3-metal-mid',
  metalDark: '--o3-metal-dark',
  lamp: '--o3-lamp',
  onAir: '--o3-on-air',
  accent: '--o3-accent',
  street: '--o3-street',
  pavement: '--o3-pavement',
  facade: '--o3-facade',
  trim: '--o3-trim',
  glass: '--o3-glass',
  grass: '--o3-grass',
  sand: '--o3-sand',
  water: '--o3-water',
  field: '--o3-field',
};

const SURFACE_TOKENS = {
  base: '--o3-base',
  wall: '--o3-wall',
  backWall: '--o3-wall-back',
  corridor: '--fp-corridor',
  vacant: '--fp-hatch',
  unassigned: '--fp-floor',
  office: '--fp-office',
  managementOffice: '--fp-management',
  ceoOffice: '--fp-ceo',
  radioStudio: '--fp-radio',
  radioTalkStudio: '--fp-talk',
  tvTalkStudio: '--fp-tv',
  tvGameStudio: '--fp-tv',
  tvSoapStudio: '--fp-tv',
  tvNewsStudio: '--fp-tv',
  tvSitcomStudio: '--fp-tv',
  tvKidsStudio: '--fp-tv',
  tvRealityStudio: '--fp-tv',
  writersRoom: '--fp-writers',
  editingRoom: '--fp-control',
  dressingRoom: '--fp-ceo',
  audioRoom: '--fp-radio',
  meetingRoom: '--fp-management',
  postRoom: '--fp-library',
  workshop: '--fp-management',
  controlRoom: '--fp-control',
  masterControl: '--fp-control',
  library: '--fp-library',
  canteen: '--fp-canteen',
  toilets: '--fp-toilets',
  reception: '--fp-reception',
  dirt: '--fp-dirt',
  select: '--o3-select',
  city: '--o3-city',
  good: '--good',
  bad: '--negative',
} satisfies Record<string, string>;

export type Surface = keyof typeof SURFACE_TOKENS;

export type Materials = Record<Tone | Surface, THREE.MeshLambertMaterial>;

function readColors(): Record<string, string> {
  const css = getComputedStyle(document.documentElement);
  return Object.fromEntries(Object.entries({ ...TONE_TOKENS, ...SURFACE_TOKENS }).map(([key, token]) => [key, css.getPropertyValue(token).trim()]));
}

/** One shared flat material per color; rebuilt when the color scheme changes (the root element's data-theme). */
export function useMaterials(): Materials {
  const [colors, setColors] = useState(readColors);
  useEffect(() => {
    const scheme = new MutationObserver(() => setColors(readColors()));
    scheme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => scheme.disconnect();
  }, []);
  return useMemo(
    () => Object.fromEntries(Object.entries(colors).map(([key, color]) => [key, new THREE.MeshLambertMaterial({ color, flatShading: true })])) as Materials,
    [colors],
  );
}
