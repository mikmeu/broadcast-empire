// The voice-over script as a document (design/voice-over.md), built from the
// tutorial's lines so the two can't drift apart: `npm run voice-over` writes
// the file, and a test fails when it is out of date.

import { FAREWELL, HINTS, LINES, OFFER, SPEAKERS, STEPS, TV_STEPS, WELCOME, type Line } from './guide';

/** Where the recordings go, one per line, named after the line's id. */
export const VOICE_FOLDER = 'public/voice';

/**
 * The lines that wait for a recording: `new` ones have none yet, `changed`
 * ones have a recording of words they no longer say. Neither is heard in the
 * game until its file is in the folder and its name is taken off this list;
 * the words are on screen meanwhile. A test holds this list against the folder.
 */
export const TO_RECORD: Record<string, 'new' | 'changed'> = { awards: 'new', streaming: 'new', 'music-post': 'new','music-library': 'new', 'music-records': 'new', security: 'new', 'social-media': 'new' };

const words = (lines: readonly Line[]) => lines.reduce((sum, line) => sum + line.say.split(/\s+/).length, 0);
/** Speaking time at an unhurried 140 words a minute. */
const minutes = (lines: readonly Line[]) => `about ${Math.max(1, Math.round(words(lines) / 140))} min`;

function entry(line: Line, number: number): string {
  const waits = TO_RECORD[line.id];
  const note = waits === 'new' ? '  \n**To record: a new line.**' : waits === 'changed' ? '  \n**To record again: the words have changed.**' : '';
  return [`### ${number}. ${line.title}`, '', `File: \`${line.id}.mp3\`${line.when ? `  \nSaid: ${line.when}` : ''}${note}`, '', `> ${line.say}`, ''].join('\n');
}

function section(title: string, intro: string, lines: readonly Line[], from: number): string {
  return [`## ${title}`, '', `${intro} ${lines.length} line${lines.length === 1 ? '' : 's'}, ${words(lines)} words, ${minutes(lines)}.`, '', ...lines.map((line, i) => entry(line, from + i))].join('\n');
}

export function voiceOverScript(): string {
  const tabby = LINES.filter((line) => line.speaker === 'tabby');
  const penny = LINES.filter((line) => line.speaker === 'penny');
  return [
    '# Voice-over script',
    '',
    'Everything Uncle Tabby and Penny Cash say in the tutorial, in the order a player hears it. This file is written by `npm run voice-over` from `src/config/guide.ts`; change a line there, not here.',
    '',
    '## How to use it',
    '',
    `- **One recording per line**, named after the line: \`tabby-welcome.mp3\`, \`studio.mp3\` and so on. The file name is under each title. They go in \`${VOICE_FOLDER}/\`.`,
    '- **The text on screen is the text below, word for word.** If you change a word while recording, tell me and I change the line to match.',
    '- **Only the quoted text is spoken.** The numbered how-to list a step shows under it is read, not heard.',
    '- **Nothing names the player or the company**, and no line has a figure that could change with the game’s balance, so a recording stays right.',
    `- **${LINES.length} lines in all**: ${tabby.length} for ${SPEAKERS.tabby.name} (${words(tabby)} words, ${minutes(tabby)}) and ${penny.length} for ${SPEAKERS.penny.name} (${words(penny)} words, ${minutes(penny)}).`,
    '',
    '## To record',
    '',
    Object.keys(TO_RECORD).length === 0
      ? 'Nothing: every line has its recording.'
      : `${Object.keys(TO_RECORD).length} lines wait for a recording. Until a file is in, the line is shown and not heard: ${LINES.filter((line) => TO_RECORD[line.id]).map((line) => `\`${line.id}.mp3\` (${TO_RECORD[line.id] === 'new' ? 'new' : 'new words'})`).join(', ')}. Each is marked below.`,
    '',
    '## The two voices',
    '',
    `- **${SPEAKERS.tabby.name}** (${SPEAKERS.tabby.role}). A newspaper man who has just won an argument that took him years: warm, loud, in a hurry, fond of you and fonder of his money.`,
    `- **${SPEAKERS.penny.name}** (${SPEAKERS.penny.role}). Dry and quick. She states things once and trusts you to keep up. The jokes are told with a straight face; she is on your side, and it shows most when things go wrong.`,
    '',
    section(`${SPEAKERS.tabby.name}: the welcome`, 'Played when a new game starts, one after the other; the player presses a button between them and can skip them.', WELCOME, 1),
    section(`${SPEAKERS.penny.name}: the question`, 'After the welcome she asks whether she is wanted. The second line is what she says when she is sent away, then or later.', [OFFER, FAREWELL], 1),
    section(`${SPEAKERS.penny.name}: the first weeks`, 'One line per step, said when the step before it is done.', STEPS, 1),
    section(`${SPEAKERS.penny.name}: hints`, 'Each is said once, the first time it matters. A game does not have to reach all of them.', HINTS, 1),
    section(`${SPEAKERS.penny.name}: television`, 'One line per step, for a player who says yes when her hint “Television” offers to walk them through it.', TV_STEPS, 1),
  ].join('\n');
}
