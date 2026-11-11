// The tests of what a change touches, as the pipeline's developer runs them on the server:
// `npm run test:related -- <the files you changed>`.
//
// `vitest related` alone stopped builds that worked (#371, #402): a change to a file most of the
// game imports pulls in some 1,600 tests, the long ones too, and on a busy server some run out of
// time. So this leaves out the long tests (GitHub Actions runs them when game logic changes), gives
// each test more time, and runs a file again on its own when its only failures were timeouts. Only
// a failure that stays counts, and the verdict at the end says which is which.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { cpus, loadavg, tmpdir } from 'node:os';
import { join, relative } from 'node:path';

interface Assertion { fullName: string; status: string; failureMessages: string[] }
interface FileResult { name: string; status: string; message?: string; assertionResults: Assertion[] }

const TIMED_OUT = /(Test|Hook) timed out in \d+ms/;
const vitest = join('node_modules', '.bin', 'vitest');
const cores = cpus().length;
const dir = mkdtempSync(join(tmpdir(), 'test-related-'));

/** Runs vitest with the dots on screen and the results in a file, and reads them back (null if there are none). */
function vitestRun(args: string[], name: string): FileResult[] | null {
  const out = join(dir, `${name}.json`);
  spawnSync(vitest, [...args, '--passWithNoTests', '--reporter=dot', '--reporter=json', `--outputFile.json=${out}`], { stdio: 'inherit' });
  try {
    return (JSON.parse(readFileSync(out, 'utf8')) as { testResults: FileResult[] }).testResults;
  } catch {
    return null;
  }
}

const failures = (file: FileResult) => file.assertionResults.filter((a) => a.status === 'failed');
/** A file that failed only by running out of time; one that would not load has no failed tests to show. */
const onlyTimedOut = (file: FileResult) =>
  failures(file).length > 0 && failures(file).every((a) => a.failureMessages.every((m) => TIMED_OUT.test(m)));
const short = (path: string) => relative(process.cwd(), path);
const firstLine = (text: string) => (text.trim().split('\n')[0] ?? '').slice(0, 300);

const changed = process.argv.slice(2);
if (changed.length === 0) {
  console.error('Name the files you changed: npm run test:related -- src/sim/control.ts');
  process.exit(2);
}
const load = loadavg()[0] ?? 0;
if (load > cores / 2) console.log(`The machine is busy (load ${load.toFixed(1)} on ${cores} cores): tests run slower. Run nothing else alongside.\n`);

const results = vitestRun(
  ['related', ...changed, '--run', '--exclude', '**/*.long.test.ts', `--maxWorkers=${Math.max(1, Math.floor(cores / 2))}`, '--testTimeout=30000'],
  'related',
);
if (!results) {
  console.log('\n== Verdict: vitest gave no results (see its output above). ==');
  process.exit(1);
}

const passed = results.reduce((n, f) => n + f.assertionResults.filter((a) => a.status === 'passed').length, 0);
const failed = results.filter((f) => f.status === 'failed');
const timedOut = failed.filter(onlyTimedOut);
const broken = failed.filter((f) => !onlyTimedOut(f));

// Again, one file at a time and with all the time it needs: what fails now is not the machine.
const again = timedOut.length
  ? vitestRun(['run', ...timedOut.map((f) => short(f.name)), '--fileParallelism=false', '--testTimeout=120000'], 'again') ?? []
  : [];
const brokenAgain = timedOut.filter((f) => again.find((g) => g.name === f.name)?.status !== 'passed');

const lines = ['', `== Verdict for ${results.length} test files (the long tests are left out: GitHub Actions runs them) ==`, `Passed: ${passed} tests.`];
const passedAlone = timedOut.filter((f) => !brokenAgain.includes(f));
if (passedAlone.length) {
  lines.push(`Timed out with the others, passed on their own (not a failure): ${passedAlone.map((f) => short(f.name)).join(', ')}.`);
}
for (const file of [...broken, ...brokenAgain.map((f) => again.find((g) => g.name === f.name) ?? f)]) {
  lines.push(`FAILED ${short(file.name)}`);
  if (failures(file).length === 0) lines.push(`  ${firstLine(file.message ?? 'did not run (see the output above)')}`);
  for (const a of failures(file)) lines.push(`  ${a.fullName}: ${firstLine(a.failureMessages[0] ?? '')}`);
}
const real = broken.length + brokenAgain.length;
lines.push(real ? `${real} file(s) failed.` : 'Nothing failed.');
console.log(lines.join('\n'));

rmSync(dir, { recursive: true, force: true });
process.exit(real ? 1 : 0);
