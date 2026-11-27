// The runner of `npm run simulate -- --sweep` (0.23.0, #441): a pool of child processes, each playing one game
// with `scripts/simulate.ts … --json <file>`. Separate processes, not threads: the map in use is module state,
// and each game stays as deterministic as a single run. See simulate.ts for the options.

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { leaveOutProblem } from '../src/sim/bots';
import { channelSummary, lateMoneySummary, paybackSummary, summarise, summaryTable, type GameRecord } from '../src/sim/sweep';

/** A rough time of one whole game, in minutes, for the estimate before a sweep starts. */
const MINUTES_PER_GAME = 4;
/** More games than this need --yes: a sweep is for the server, not a laptop. */
const GAMES_WITHOUT_YES = 20;

export interface SweepOptions {
  bots: string[];
  difficulties: string[];
  regions: string[];
  /** Features to leave out (#442): besides each full game, one game per feature the bot plays. */
  without?: string[];
  /** Start at home (#429): the first licence is in the headquarters region. */
  atHome?: boolean;
  seeds: number[];
  years: number;
  jobs?: number;
  out?: string;
  yes: boolean;
  botNames: string[];
}

const commit = (): string => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};

function readGames(dir: string): GameRecord[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as GameRecord);
}

/** Sums up a folder of games, against an earlier folder if given. */
export function summariseFolder(dir: string, baselineDir?: string): string {
  const games = readGames(dir);
  if (games.length === 0) throw new Error(`No games in ${dir}.`);
  const baseline = baselineDir ? readGames(baselineDir) : [];
  const channels = channelSummary(games);
  const extra = [channels, lateMoneySummary(games), paybackSummary(games)].filter(Boolean).map((t) => `\n\n${t}`).join('');
  const text = summaryTable(summarise(games, baseline), baseline.length > 0) + extra;
  console.log(text);
  return text;
}

export async function runSweep(options: SweepOptions): Promise<void> {
  for (const bot of options.bots) if (!options.botNames.includes(bot)) throw new Error(`Unknown bot "${bot}". Use: ${options.botNames.join(', ')}`);
  if (options.seeds.length === 0 || options.seeds.some((s) => !Number.isFinite(s))) throw new Error('--seeds is a list of numbers, like 1,2,3.');
  for (const feature of options.without ?? []) {
    // An unknown name is a mistake; a bot that never plays the feature just plays no game without it.
    if (leaveOutProblem(feature, options.bots[0] ?? '')?.startsWith('Unknown')) throw new Error(leaveOutProblem(feature, options.bots[0]!)!);
  }
  const out = options.out ?? join('sweeps', commit());
  const jobs = Math.max(1, options.jobs ?? cpus().length - 1);
  // The full game keeps its name, so a finished folder can have --without added and only the new games are played (#442).
  const games = options.bots.flatMap((bot) =>
    options.difficulties.flatMap((difficulty) =>
      options.regions.flatMap((region) =>
        options.seeds.flatMap((seed) =>
          [undefined, ...(options.without ?? []).filter((feature) => leaveOutProblem(feature, bot) === null)].map((without) => ({
            bot, difficulty, region, seed, without,
            file: join(out, `${bot}-${difficulty}-${region}-${seed}${options.atHome ? '-athome' : ''}${without ? `-without-${without}` : ''}.json`),
          })),
        ),
      ),
    ),
  );
  const todo = games.filter((g) => !existsSync(g.file));
  const minutes = Math.round((todo.length * MINUTES_PER_GAME * (options.years / 60)) / jobs);
  console.log(`${games.length} games, ${games.length - todo.length} already in ${out}; ${todo.length} to play, ${jobs} at a time, roughly ${minutes} minutes.`);
  if (todo.length > GAMES_WITHOUT_YES && !options.yes) {
    throw new Error(`That is more than ${GAMES_WITHOUT_YES} games: a sweep is for the server or GitHub Actions. Add --yes to play them here.`);
  }
  mkdirSync(out, { recursive: true });

  let next = 0;
  let finished = games.length - todo.length;
  const failed: string[] = [];
  const worker = async () => {
    while (next < todo.length) {
      const g = todo[next++]!;
      const label = `${g.bot} ${g.difficulty} ${g.region}${options.atHome ? ' at home' : ''} seed ${g.seed}${g.without ? ` without ${g.without}` : ''}`;
      const started = Date.now();
      const code = await new Promise<number | null>((resolve) => {
        const args = ['tsx', 'scripts/simulate.ts', '--bot', g.bot, '--difficulty', g.difficulty, '--region', g.region, '--seed', String(g.seed), '--years', String(options.years), '--yearly', '--json', g.file, ...(options.atHome ? ['--at-home'] : []), ...(g.without ? ['--without', g.without] : [])];
        const child = spawn('npx', args, { stdio: 'ignore' });
        child.on('close', resolve);
        child.on('error', () => resolve(1));
      });
      finished++;
      if (code !== 0 || !existsSync(g.file)) {
        failed.push(label);
        console.log(`${finished}/${games.length}, ${label}: FAILED`);
        continue;
      }
      const game = JSON.parse(readFileSync(g.file, 'utf8')) as GameRecord;
      const took = Math.round((Date.now() - started) / 1000);
      console.log(`${finished}/${games.length}, ${label}, ${Math.floor(took / 60)}m${String(took % 60).padStart(2, '0')}s${game.bankrupt ? `, bankrupt ${game.bankrupt.month}` : ''}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, todo.length) }, worker));

  if (failed.length > 0) console.log(`\n${failed.length} games failed: ${failed.join('; ')}. Run the same command again to play only those.`);
  if (readdirSync(out).some((f) => f.endsWith('.json'))) writeFileSync(join(out, 'summary.md'), `${summariseFolder(out)}\n`);
}
