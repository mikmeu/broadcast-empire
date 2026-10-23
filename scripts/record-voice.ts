// Records tutorial lines with ElevenLabs into public/voice/<id>.mp3.
//
// Usage: npm run record-voice                 every line on TO_RECORD (src/config/voiceOver.ts)
//        npm run record-voice -- mcr clock    these lines only
//        npm run record-voice -- --again hosts    a line that has a recording already (only at Mike's word)
//        npm run record-voice -- --dry        say what would be recorded and how many characters
//
// Needs ELEVENLABS_API_KEY and paid credits: Penny and Uncle Tabby are library voices, which the
// free plan lets only the website use. Without credits, record the lines there. The voices, the model and the settings are the ones the recorded
// lines were made with, so new lines sound the same; ELEVENLABS_VOICE_PENNY, ELEVENLABS_VOICE_TABBY (and
// ELEVENLABS_VOICE_LOTTA and ELEVENLABS_VOICE_SONNY, which the awards night needs: they have no default),
// ELEVENLABS_MODEL and ELEVENLABS_SETTINGS (JSON, e.g. {"stability":0.5}) change them.
// It takes nothing off TO_RECORD: do that by hand, then npm run voice-over.

import { existsSync, writeFileSync } from 'node:fs';
import { LINES, type Presenter, type Speaker } from '../src/config/guide';
import { TO_RECORD, VOICE_FOLDER } from '../src/config/voiceOver';

const API = 'https://api.elevenlabs.io/v1';
const args = process.argv.slice(2);
const again = args.includes('--again');
const dry = args.includes('--dry');
const ids = args.filter((arg) => !arg.startsWith('--'));

const wanted = ids.length > 0 ? ids : Object.keys(TO_RECORD);
const unknown = wanted.filter((id) => !LINES.some((line) => line.id === id));
if (unknown.length > 0) {
  console.error(`No such line: ${unknown.join(', ')}`);
  process.exit(1);
}
const lines = LINES.filter((line) => wanted.includes(line.id));
const file = (id: string) => new URL(`../${VOICE_FOLDER}/${id}.mp3`, import.meta.url);
const recorded = lines.filter((line) => existsSync(file(line.id)) && !TO_RECORD[line.id]);
if (recorded.length > 0 && !again) {
  console.error(`These have a recording already; add --again only if Mike asked: ${recorded.map((line) => line.id).join(', ')}`);
  process.exit(1);
}
const characters = lines.reduce((sum, line) => sum + line.say.length, 0);
console.log(`${lines.length} line${lines.length === 1 ? '' : 's'}, ${characters} characters: ${lines.map((line) => line.id).join(', ')}`);
if (dry || lines.length === 0) process.exit(0);

const key = process.env.ELEVENLABS_API_KEY;
// Lotta and Sonny (the awards night) have no voice until Mike picks them: set ELEVENLABS_VOICE_LOTTA and ELEVENLABS_VOICE_SONNY.
const voices: Record<Speaker | Presenter, string | undefined> = {
  penny: process.env.ELEVENLABS_VOICE_PENNY ?? 'ji8lGJ0ZLrpJ5KY4NwOd',
  tabby: process.env.ELEVENLABS_VOICE_TABBY ?? 'WzVKtqQpTUUQ2JNx8YxI',
  lotta: process.env.ELEVENLABS_VOICE_LOTTA,
  sonny: process.env.ELEVENLABS_VOICE_SONNY,
};
const unvoiced = [...new Set(lines.map((line) => line.speaker))].filter((who) => !voices[who]);
if (unvoiced.length > 0) {
  console.error(`No voice set for ${unvoiced.join(', ')}: set ELEVENLABS_VOICE_${unvoiced.map((who) => who.toUpperCase()).join(' and ELEVENLABS_VOICE_')}.`);
  process.exit(1);
}
if (!key) {
  console.error('Set ELEVENLABS_API_KEY.');
  process.exit(1);
}
const headers = { 'xi-api-key': key, 'Content-Type': 'application/json' };

const subscription = await fetch(`${API}/user/subscription`, { headers });
if (subscription.ok) {
  const { character_count: used, character_limit: limit } = (await subscription.json()) as { character_count: number; character_limit: number };
  console.log(`ElevenLabs: ${limit - used} of ${limit} characters left this month.`);
  if (limit - used < characters) {
    console.error('Not enough characters left for these lines; record fewer.');
    process.exit(1);
  }
}

const model = process.env.ELEVENLABS_MODEL ?? 'eleven_v4';
const settings = process.env.ELEVENLABS_SETTINGS ? JSON.parse(process.env.ELEVENLABS_SETTINGS) : { stability: 0.5 };
for (const line of lines) {
  const response = await fetch(`${API}/text-to-speech/${voices[line.speaker]}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: line.say, model_id: model, voice_settings: settings }),
  });
  if (response.status === 402) {
    console.error(`${line.id}: ElevenLabs wants a paid plan or credits for this voice. Record it in the ElevenLabs website instead, as ${VOICE_FOLDER}/${line.id}.mp3.`);
    process.exit(1);
  }
  if (!response.ok) {
    console.error(`${line.id}: ElevenLabs answered ${response.status}: ${await response.text()}`);
    process.exit(1);
  }
  writeFileSync(file(line.id), Buffer.from(await response.arrayBuffer()));
  console.log(`Recorded ${VOICE_FOLDER}/${line.id}.mp3`);
}
