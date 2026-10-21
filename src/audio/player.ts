// Plays the game's sounds. Nothing here knows about the game: screens say
// which sound, and one listener on the page gives every button its click.

import { JINGLE_RANK, type Jingle } from './jingles';
import { OFFICE_SOUNDS, type Playing } from './officeSounds';
import { SOUNDS, clickSound, type SoundId } from './sounds';

/** Where the clips are served from. */
const url = (file: string) => `${import.meta.env.BASE_URL}sounds/${file}`;

let context: AudioContext | undefined;
/** The player's sound volume, 0–1. */
let volume = 0.8;
const clips = new Map<string, Promise<AudioBuffer | null>>();
/** The interface sound that started last, so a refusal can take its place. */
let lastClick: { source: AudioBufferSourceNode; at: number } | undefined;

/** Sets the volume of all sounds, 0–100. */
export function setSoundVolume(percent: number): void {
  volume = Math.max(0, Math.min(100, percent)) / 100;
}

/** A clip, fetched and decoded once. Null if it can't be played here. */
function clip(audio: AudioContext, file: string): Promise<AudioBuffer | null> {
  let loading = clips.get(file);
  if (!loading) {
    loading = fetch(url(file))
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(file))))
      .then((data) => audio.decodeAudioData(data))
      // A browser that can't read the clip stays silent; the game works without sound.
      .catch(() => null);
    clips.set(file, loading);
  }
  return loading;
}

/**
 * The page's audio output. Browsers only let it start from a click or a key,
 * which is when every sound in the game is asked for anyway.
 */
function output(): AudioContext | undefined {
  if (typeof AudioContext === 'undefined') return undefined;
  if (!context) {
    context = new AudioContext();
    // Fetch everything now, so no sound is late the first time it is needed.
    for (const sound of Object.values(SOUNDS)) for (const file of sound.files) void clip(context, file);
  }
  if (context.state === 'suspended') void context.resume();
  return context;
}

export function play(id: SoundId): void {
  if (volume <= 0) return;
  const audio = output();
  if (!audio) return;
  const { files, gain } = SOUNDS[id];
  const file = files[Math.floor(Math.random() * files.length)]!;
  const asked = audio.currentTime;
  // A refusal is heard instead of the click of the button that caused it.
  if (id === 'denied' && lastClick && asked - lastClick.at < 0.08) lastClick.source.stop();

  void clip(audio, file).then((buffer) => {
    // A clip that was still loading and comes late would only confuse.
    if (!buffer || audio.currentTime - asked > 0.25) return;
    const source = audio.createBufferSource();
    const level = audio.createGain();
    source.buffer = buffer;
    level.gain.value = gain * volume;
    source.connect(level).connect(audio.destination);
    source.start();
    if (id !== 'denied') lastClick = { source, at: audio.currentTime };
  });
}

/** The jingle that is playing, or played last. */
let jingle: { source: AudioBufferSourceNode; until: number; rank: number } | undefined;
/** Quiet after a jingle before the next may start, in seconds, so a busy week is not one long tune. */
const JINGLE_PAUSE = 1.5;

/**
 * Plays a jingle for something that happened in the game. Only one plays at a
 * time: a more important one takes over, any other is left out.
 */
export function playJingle(id: Jingle): void {
  if (volume <= 0) return;
  const audio = output();
  if (!audio) return;
  const { files, gain } = SOUNDS[id];
  const rank = JINGLE_RANK[id];
  const asked = audio.currentTime;
  void clip(audio, files[0]!).then((buffer) => {
    if (!buffer || audio.currentTime - asked > 1) return;
    if (jingle && audio.currentTime < jingle.until + JINGLE_PAUSE) {
      if (rank <= jingle.rank) return;
      jingle.source.stop();
    }
    const source = audio.createBufferSource();
    const level = audio.createGain();
    source.buffer = buffer;
    level.gain.value = gain * volume;
    source.connect(level).connect(audio.destination);
    source.start();
    jingle = { source, until: audio.currentTime + buffer.duration, rank };
  });
}

// --- The office ---

/** The player's office volume, 0–1. */
let officeVolume = 0.6;
/** How long a loop takes to come in and go out, in seconds. */
const FADE = 1;
/** The most sounds that play once at the same time. */
const MOST_ONCE = 3;

/** Sets the volume of the sounds of the office, 0–100. */
export function setOfficeVolume(percent: number): void {
  officeVolume = Math.max(0, Math.min(100, percent)) / 100;
}

interface Voice {
  source: AudioBufferSourceNode;
  level: GainNode;
  pan: StereoPannerNode;
}

/** The loops that are heard, by sound, and what each is asked for while its clip is still coming. */
const loops = new Map<string, { voice?: Voice; want: Playing }>();
/** The sounds that play once and are still playing, and the moments that have been played lately. */
const onces = new Map<string, { voice: Voice; want: Playing }>();
const played = new Set<string>();

function start(audio: AudioContext, buffer: AudioBuffer, loop: boolean, from: number): Voice {
  const source = audio.createBufferSource();
  const level = audio.createGain();
  const pan = audio.createStereoPanner();
  source.buffer = buffer;
  source.loop = loop;
  level.gain.value = from;
  source.connect(level).connect(pan).connect(audio.destination);
  source.start();
  return { source, level, pan };
}

const loudness = (want: Playing) => want.level * OFFICE_SOUNDS[want.id].gain * officeVolume;

function steer(audio: AudioContext, voice: Voice, want: Playing): void {
  voice.level.gain.setTargetAtTime(loudness(want), audio.currentTime, 0.3);
  voice.pan.pan.setTargetAtTime(want.pan, audio.currentTime, 0.3);
}

function fadeOut(audio: AudioContext, voice: Voice, seconds: number): void {
  voice.level.gain.setTargetAtTime(0, audio.currentTime, seconds / 4);
  voice.source.stop(audio.currentTime + seconds);
}

/**
 * Plays the sounds of the office: `list` is what is heard now (see
 * office/soundscape.ts). A loop comes in and goes out with a fade; a sound that
 * plays once starts when its moment first shows and plays to its end, getting
 * louder, quieter or to the other side while it is still asked for. With
 * `silent` (the game is paused, or the window is hidden) everything fades out.
 */
export function setOfficeSounds(list: readonly Playing[], silent = false): void {
  if (loops.size === 0 && onces.size === 0 && (silent || list.length === 0 || officeVolume <= 0)) return;
  const audio = output();
  if (!audio) return;
  const hear = silent || officeVolume <= 0 ? [] : list;

  const wanted = new Set(hear.filter((p) => p.loop).map((p) => p.key));
  for (const [key, loop] of loops) {
    if (wanted.has(key)) continue;
    if (loop.voice) fadeOut(audio, loop.voice, FADE);
    loops.delete(key);
  }
  if (hear.length === 0) for (const [key, once] of onces) { fadeOut(audio, once.voice, 0.4); onces.delete(key); }

  for (const want of hear) {
    if (want.loop) {
      const had = loops.get(want.key);
      if (had) {
        had.want = want;
        if (had.voice) steer(audio, had.voice, want);
        continue;
      }
      const entry: { voice?: Voice; want: Playing } = { want };
      loops.set(want.key, entry);
      const file = OFFICE_SOUNDS[want.id].files[0];
      // A sound with no clip stays silent; the game works without it.
      if (!file) continue;
      void clip(audio, file).then((buffer) => {
        // It may have been dropped while the clip was coming.
        if (!buffer || loops.get(want.key) !== entry) return;
        entry.voice = start(audio, buffer, true, 0);
        entry.voice.pan.pan.value = entry.want.pan;
        entry.voice.level.gain.setTargetAtTime(loudness(entry.want), audio.currentTime, FADE / 3);
      });
      continue;
    }
    const playing = onces.get(want.key);
    if (playing) {
      playing.want = want;
      steer(audio, playing.voice, want);
    } else if (!played.has(want.key) && onces.size < MOST_ONCE) {
      const files = OFFICE_SOUNDS[want.id].files;
      const file = files[Math.floor(Math.random() * files.length)];
      if (!file) continue;
      played.add(want.key);
      if (played.size > 200) played.delete(played.values().next().value!);
      void clip(audio, file).then((buffer) => {
        if (!buffer || onces.size >= MOST_ONCE) return;
        const voice = start(audio, buffer, false, loudness(want));
        voice.pan.pan.value = want.pan;
        const entry = { voice, want };
        onces.set(want.key, entry);
        voice.source.onended = () => {
          if (onces.get(want.key) === entry) onces.delete(want.key);
        };
      });
    }
  }
}

/** The control a click or a change belongs to, and what marks it. */
function soundOf(target: EventTarget | null): SoundId | null {
  if (!(target instanceof Element)) return null;
  // A control can name its own sound, or "none" when the action it starts makes one.
  const named = target.closest('[data-sound]')?.getAttribute('data-sound');
  if (named) return named in SOUNDS ? (named as SoundId) : null;
  const control = target.closest('button, a[href], input, select, [role="button"], [role="tab"], [role="radio"]');
  if (!control || control.matches(':disabled, [aria-disabled="true"]')) return null;
  return clickSound({
    tag: control.tagName.toLowerCase(),
    type: control.getAttribute('type') ?? undefined,
    role: control.getAttribute('role') ?? undefined,
    classes: [...control.classList],
    label: control.getAttribute('aria-label') ?? undefined,
    inDock: control.closest('.dock') !== null,
  });
}

/**
 * Gives every control on the page its sound: one listener for clicks, and one
 * for lists and sliders, which sound when their value has changed. Returns a
 * function that removes them again.
 */
export function installUiSounds(): () => void {
  const onClick = (e: MouseEvent) => {
    const sound = soundOf(e.target);
    if (sound) play(sound);
  };
  const onChange = (e: Event) => {
    const control = e.target instanceof Element ? e.target : null;
    if (control?.matches('select, input[type="range"]') && control.closest('[data-sound]')?.getAttribute('data-sound') !== 'none') play('select');
  };
  // Capturing, so a control that stops its click from travelling on still sounds.
  document.addEventListener('click', onClick, true);
  document.addEventListener('change', onChange, true);
  return () => {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('change', onChange, true);
  };
}
