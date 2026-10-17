// Opens the build of an issue in the browser, to try it before approving it: fetches the
// issue's branch into a worktree of its own and starts the dev server there. Nothing is
// installed or built, and your own checkout is left as it is.
//
// Usage: npm run review -- 123          the branch issue/123-… (or the version branch next/0.17.0)
//        npm run review -- 0.17.0
//        npm run review -- 123 --done   remove that worktree again

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const [what, flag] = process.argv.slice(2);
if (!what) {
  console.error('Usage: npm run review -- <issue number or version> [--done]');
  process.exit(1);
}
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const folder = join(tmpdir(), `broadcast-empire-review-${what}`);

if (flag === '--done') {
  if (existsSync(folder)) git('worktree', 'remove', '--force', folder);
  console.log(`Removed ${folder}`);
  process.exit(0);
}

const pattern = /^\d+$/.test(what) ? `refs/heads/issue/${what}-*` : `refs/heads/next/${what}`;
const branch = git('ls-remote', '--heads', 'origin', pattern).split('\n')[0]?.split('\t')[1]?.replace('refs/heads/', '');
if (!branch) {
  console.error(`No branch on GitHub for ${what}.`);
  process.exit(1);
}
git('fetch', 'origin', branch);
if (existsSync(folder)) {
  execFileSync('git', ['checkout', '--detach', 'FETCH_HEAD'], { cwd: folder, stdio: 'inherit' });
} else {
  git('worktree', 'add', '--detach', folder, 'FETCH_HEAD');
  // The packages of this checkout; if the branch changed package.json, run npm ci in the folder instead.
  symlinkSync(join(root, 'node_modules'), join(folder, 'node_modules'));
}
console.log(`${branch} is in ${folder}. Ctrl+C stops it; npm run review -- ${what} --done removes it.`);
spawn('npx', ['vite', '--open'], { cwd: folder, stdio: 'inherit' }).on('exit', (code) => process.exit(code ?? 0));
