// Plays the game's sounds. Nothing here knows about the game: screens say
// which sound, and one listener on the page gives every button its click.

import { JINGLE_RANK, type Jingle } from './jingles';
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
