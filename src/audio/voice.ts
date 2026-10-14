// The voices of the tutorial. Every line of Uncle Tabby and Penny Cash (config/guide.ts) has a recording
// in public/voice, named after the line; design/voice-over.md is the script. A line without a recording is
// simply not heard. One line is said at a time: a new one takes over from the one before.

import { TO_RECORD } from '../config/voiceOver';

/** The recording of a line, as it is called in public/voice. */
export const voiceFile = (lineId: string) => `${lineId}.mp3`;

const url = (lineId: string) => `${import.meta.env.BASE_URL}voice/${voiceFile(lineId)}`;

let context: AudioContext | undefined;
/** The player's voice volume, 0–1. */
let volume = 1;
/** The line that is being said, or is still on its way, with what plays it. */
let current: { lineId: string; source?: AudioBufferSourceNode; level?: GainNode } | undefined;
/** Listens in on the voice, before its volume: for the mouth of whoever is talking. */
let meter: AnalyserNode | undefined;
let samples: Uint8Array<ArrayBuffer> | undefined;

/** Sets the volume of the voices, 0–100, also for a line that is being said. */
export function setVoiceVolume(percent: number): void {
  volume = Math.max(0, Math.min(100, percent)) / 100;
  if (current?.level) current.level.gain.value = volume;
  if (volume <= 0) hush();
}

/** The line that is being said right now, if any. */
export const speaking = (): string | undefined => current?.lineId;

/** The line that can be heard right now: unlike `speaking`, not one whose recording is still on its way. */
export const talking = (): string | undefined => (current?.source ? current.lineId : undefined);

/** How loud the voice is at this moment, 0–1, whatever its volume is set to: 0 between words and when nobody talks. */
export function voiceLevel(): number {
  if (!current?.source || !meter || !samples) return 0;
  meter.getByteTimeDomainData(samples);
  let sum = 0;
  for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
  // Speech is quiet in these terms: a loud vowel is about a quarter of full scale.
  return Math.min(1, Math.sqrt(sum / samples.length) * 4);
}

/** Stops whoever is talking. */
export function hush(): void {
  try {
    current?.source?.stop();
  } catch {
    // It had ended by itself.
  }
  current = undefined;
}

/** Says a line of the tutorial aloud, in place of whatever was being said. */
export function speak(lineId: string): void {
  hush();
  // A line that waits for its recording is not said: an old recording would say other words than are on screen.
  if (TO_RECORD[lineId]) return;
  if (volume <= 0 || typeof AudioContext === 'undefined') return;
  context ??= new AudioContext();
  // Browsers only let sound start after a click or a key; every line follows one.
  if (context.state === 'suspended') void context.resume();
  const audio = context;
  const line: NonNullable<typeof current> = { lineId };
  current = line;
  void fetch(url(lineId))
    .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(lineId))))
    .then((data) => audio.decodeAudioData(data))
    .then((buffer) => {
      // Something else was said, or she was hushed, while this one was on its way.
      if (current !== line) return;
      const source = audio.createBufferSource();
      const level = audio.createGain();
      source.buffer = buffer;
      level.gain.value = volume;
      if (!meter) {
        meter = audio.createAnalyser();
        meter.fftSize = 256;
        samples = new Uint8Array(meter.fftSize);
      }
      source.connect(meter);
      source.connect(level).connect(audio.destination);
      source.onended = () => {
        if (current === line) current = undefined;
      };
      source.start();
      Object.assign(line, { source, level });
    })
    // No recording for this line, or a browser that can't play it: the words are on screen.
    .catch(() => {
      if (current === line) current = undefined;
    });
}
