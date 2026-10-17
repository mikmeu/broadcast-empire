// Builds the game's website into website/dist: plain HTML pages, a sitemap and robots.txt.
//
// Usage: npm run website                  build the site
//        npm run website -- --installers  also copy the installers from release/ into the site,
//                                         when site.json has them on the site itself
//
// When the installers are on GitHub (the release v<version>), the links and sizes come from
// that release; set GITHUB_TOKEN to ask GitHub more often than its limit for strangers.
//
// The pages are in website/pages, the frame around them in website/layout.html, and their
// addresses, titles and descriptions in website/site.json. The version comes from package.json,
// the changelog from CHANGELOG.md, and the Media page from whatever is in website/media.

import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TitleArt } from '../src/ui/TitleArt';

interface Page {
  file: string;
  /** The address under the site: '' for the home page, 'download/' for a folder. */
  path: string;
  nav?: string;
  heading?: string;
  title: string;
  description: string;
  /** Not in the menu or the sitemap, and not for search engines. */
  hidden?: boolean;
}

interface Site {
  url: string;
  name: string;
  /** Where the installers are: a folder of the site, or a full address elsewhere. */
  downloads: string;
  installers: Record<string, string>;
  pages: Page[];
}

interface Picture {
  file: string;
  title?: string;
  caption?: string;
}

const at = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const read = (path: string) => readFileSync(at(path), 'utf8');
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const site = JSON.parse(read('website/site.json')) as Site;
const { version } = JSON.parse(read('package.json')) as { version: string };
// src/version.ts gets the number from the bundler; here it comes straight from package.json.
(globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ = version;
const { STAGE } = await import('../src/version');

// ---- The changelog

interface Version {
  /** '0.10.0', or the whole heading where there is no number. */
  name: string;
  date: string;
  html: string;
}

/** Bold, code and links of one line of CHANGELOG.md. Request numbers and links into the project are dropped. */
function inline(text: string): string {
  return escape(text.replace(/\s*\((?:R|#)\d+(?:, (?:R|#)\d+)*\)/g, ''))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, (_, label: string, href: string) => (/^https?:/.test(href) ? `<a href="${href}" rel="noopener">${label}</a>` : label));
}

/** The body of one version: paragraphs, lists, and a bold line by itself as a small heading. */
function blocks(lines: string[]): string {
  const out: string[] = [];
  let list: string[] = [];
  const endList = () => {
    if (list.length > 0) out.push(`<ul>\n${list.map((item) => `  <li>${item}</li>`).join('\n')}\n</ul>`);
    list = [];
  };
  for (const line of lines) {
    const heading = /^\*\*([^*]+)\*\*$/.exec(line);
    if (line.startsWith('- ')) {
      list.push(inline(line.slice(2)));
      continue;
    }
    endList();
    if (heading) out.push(`<h3>${inline(heading[1]!)}</h3>`);
    else if (line.trim() !== '') out.push(`<p>${inline(line)}</p>`);
  }
  endList();
  return out.join('\n');
}

function changelog(): Version[] {
  const [, ...sections] = read('CHANGELOG.md').split(/^## /m);
  return sections.map((section) => {
    const [heading = '', ...lines] = section.split('\n');
    const date = /\(([^)]+)\)\s*$/.exec(heading)?.[1] ?? '';
    const name = /^\d+\.\d+\.\d+/.exec(heading)?.[0] ?? heading.trim();
    return { name, date, html: blocks(lines) };
  });
}

const versions = changelog();
const latest = versions.find((v) => v.name === version);
if (!latest) throw new Error(`CHANGELOG.md has no section for version ${version}, the one in package.json.`);

const anchor = (v: Version) => `v${v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
const numbered = (v: Version) => /^\d/.test(v.name);
const titleOf = (v: Version) => (numbered(v) ? `Version ${v.name}` : v.name);
const when = (v: Version) => (v.date ? ` <span class="when">${v.date}</span>` : '');

const latestHtml = `<article class="window version" id="${anchor(latest)}">\n<h2>${titleOf(latest)}${when(latest)}</h2>\n${latest.html}\n</article>`;
const olderHtml = versions
  .filter((v) => v !== latest)
  .map((v) => `<details class="window version" id="${anchor(v)}">\n<summary>${titleOf(v)}${when(v)}</summary>\n${v.html}\n</details>`)
  .join('\n');

// ---- The installers

const megabytes = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;
const downloads = site.downloads.replace('{version}', version);
const elsewhere = /^https?:/.test(downloads);

interface Asset {
  name: string;
  size: number;
  browser_download_url: string;
}

/** The files of this version's release when the installers are on GitHub, as GitHub names them; null when there is no such release yet. */
const onGitHub = /github\.com\/[^/]+\/[^/]+\/releases\//.test(downloads);

async function releaseAssets(): Promise<Asset[] | null> {
  const repo = /github\.com\/([^/]+\/[^/]+)\/releases\//.exec(downloads)?.[1];
  if (!repo) return null;
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/tags/v${version}`, {
    headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub said ${response.status} about the release v${version} of ${repo}.`);
  return ((await response.json()) as { assets: Asset[] }).assets;
}

const assets = await releaseAssets();

function installer(system: string, root: string) {
  const file = site.installers[system]!.replace('{version}', version);
  const built = at(`release/${file}`);
  // GitHub turns the spaces in a file's name into dots when it is uploaded.
  const asset = assets?.find((a) => a.name === file || a.name === file.replaceAll(' ', '.'));
  const bytes = asset?.size ?? (existsSync(built) ? statSync(built).size : null);
  return {
    file,
    built: existsSync(built) ? built : null,
    online: asset !== undefined,
    url: asset?.browser_download_url ?? `${elsewhere ? '' : root}${downloads}${encodeURIComponent(onGitHub ? file.replaceAll(' ', '.') : file)}`,
    size: bytes === null ? '' : ` · ${megabytes(bytes)}`,
  };
}

// ---- The Media page

/** Width and height of a PNG, from its header. */
function sizeOf(path: string): string {
  if (!path.endsWith('.png')) return '';
  const header = readFileSync(path).subarray(16, 24);
  return ` width="${header.readUInt32BE(0)}" height="${header.readUInt32BE(4)}"`;
}

/** 'the-office-at-night.png' → 'The office at night' */
function named(file: string): string {
  const words = file.replace(/\.\w+$/, '').replace(/[-_]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Every picture and video in website/media: those in media.json first, in its order, then the rest by name. */
function gallery(root: string): string {
  const listed = JSON.parse(read('website/media/media.json')) as Picture[];
  const files = readdirSync(at('website/media')).filter((file) => /\.(png|jpe?g|webp|gif|mp4|webm)$/i.test(file));
  const missing = listed.filter((p) => !files.includes(p.file));
  if (missing.length > 0) throw new Error(`website/media/media.json names files that are not there: ${missing.map((p) => p.file).join(', ')}`);
  const rest = files.filter((file) => !listed.some((p) => p.file === file)).sort();
  const all: Picture[] = [...listed, ...rest.map((file) => ({ file }))];

  const figures = all.map((p, i) => {
    const title = p.title ?? named(p.file);
    const src = `${root}media/${encodeURIComponent(p.file)}`;
    const caption = `<figcaption><strong>${escape(title)}</strong>${p.caption ? escape(p.caption) : ''}</figcaption>`;
    if (/\.(mp4|webm)$/i.test(p.file)) return `<figure><video controls preload="metadata" src="${src}"></video>${caption}</figure>`;
    const lazy = i < 3 ? '' : ' loading="lazy"';
    return `<figure><a href="${src}"><img src="${src}"${sizeOf(at(`website/media/${p.file}`))}${lazy} alt="${escape(p.caption ?? title)}" /></a>${caption}</figure>`;
  });
  return `<div class="gallery">\n${figures.join('\n')}\n</div>`;
}

// ---- The pages

/** Puts the values in for every {{name}} of a text; a name it does not know is a mistake in the page. */
function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{([\w.]+)\}\}/g, (_, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`Nothing is known for {{${name}}}.`);
    return value;
  });
}

const dist = at('website/dist');
const layout = read('website/layout.html');
const art = renderToStaticMarkup(createElement(TitleArt));
const today = new Date().toISOString().slice(0, 10);
const addressOf = (page: Page) => `${site.url}/${page.path}`;

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const page of site.pages) {
  // A page that is not found is shown at any address, so its links start at the top of the site.
  const folder = page.path.endsWith('/') || page.path === '';
  const root = folder ? '../'.repeat(page.path.split('/').length - 1) : '/';
  const home = page.path === '';

  const values: Record<string, string> = {
    root,
    site: site.url,
    stage: STAGE,
    version,
    date: latest.date,
    heading: page.heading ?? site.name,
    'changelog.latest': latestHtml,
    'changelog.older': olderHtml,
  };
  for (const system of Object.keys(site.installers)) {
    const { file, url, size } = installer(system, root);
    Object.assign(values, { [`${system}.file`]: escape(file), [`${system}.url`]: url, [`${system}.size`]: size });
  }
  if (page.file === 'media.html') values.gallery = gallery(root);

  // What stands in the sky above a page comes before the line <!-- page -->; without it, the page's heading does.
  const [first = '', second] = read(`website/pages/${page.file}`).split(/^<!-- page -->\n/m);
  const hero = second === undefined ? '<div class="wrap page-head"><h1>{{heading}}</h1></div>' : first;
  const content = second ?? first;

  const nav = site.pages
    .filter((p) => !p.hidden)
    .map((p) => `<a href="${root}${p.path}"${p === page ? ' aria-current="page"' : ''}>${p.nav ?? p.heading}</a>`)
    .join('\n          ');

  const structured = home
    ? `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'VideoGame',
        name: site.name,
        description: page.description,
        url: addressOf(page),
        image: `${site.url}/assets/share.png`,
        genre: ['Simulation', 'Tycoon'],
        gamePlatform: ['macOS', 'Windows', 'Linux'],
        operatingSystem: 'macOS, Windows, Linux',
        applicationCategory: 'Game',
        softwareVersion: version,
        author: { '@type': 'Person', name: 'Mike van der Meulen', url: 'https://mvdm.media' },
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      })}</script>`
    : '';

  const html = fill(layout, {
    ...values,
    title: escape(page.title),
    description: escape(page.description),
    canonical: addressOf(page),
    robots: page.hidden ? '<meta name="robots" content="noindex" />' : '',
    structured,
    class: home ? 'home' : 'page',
    art: home ? art : '',
    nav,
    hero: fill(hero, values),
    content: fill(content, values).trim(),
  });

  const target = folder ? `${dist}/${page.path}index.html` : `${dist}/${page.path}`;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html);
}

// ---- Everything that is not a page

cpSync(at('website/assets'), `${dist}/assets`, { recursive: true });
cpSync(at('website/media'), `${dist}/media`, { recursive: true, filter: (source) => !source.endsWith('media.json') });
copyFileSync(at('build/icon.svg'), `${dist}/assets/icon.svg`);
copyFileSync(at('build/icon.png'), `${dist}/assets/icon.png`);
mkdirSync(`${dist}/assets/fonts`, { recursive: true });
for (const font of ['fjalla-one/files/fjalla-one-latin-400-normal', ...[300, 400, 600].map((weight) => `assistant/files/assistant-latin-${weight}-normal`)]) {
  copyFileSync(at(`node_modules/@fontsource/${font}.woff2`), `${dist}/assets/fonts/${font.split('/').pop()}.woff2`);
}

const listed = site.pages.filter((page) => !page.hidden);
writeFileSync(
  `${dist}/sitemap.xml`,
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${listed
    .map((page) => `  <url><loc>${addressOf(page)}</loc><lastmod>${today}</lastmod></url>`)
    .join('\n')}\n</urlset>\n`,
);
writeFileSync(`${dist}/robots.txt`, `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`);

// ---- The installers themselves

const installers = Object.keys(site.installers).map((system) => installer(system, ''));
const notBuilt = installers.filter((i) => !i.built).map((i) => i.file);
if (process.argv.includes('--installers')) {
  if (elsewhere) throw new Error(`The installers are at ${downloads} (website/site.json), not on the site itself: nothing to copy.`);
  if (notBuilt.length > 0) throw new Error(`Not in release/ yet: ${notBuilt.join(', ')}. Build them first (npm run dist:mac, dist:win, dist:linux).`);
  mkdirSync(`${dist}/${downloads}`, { recursive: true });
  for (const { file, built } of installers) copyFileSync(built!, `${dist}/${downloads}${file}`);
}

console.log(`Wrote ${dist}: ${site.pages.length} pages for ${STAGE} ${version}, at ${site.url}`);
if (elsewhere) {
  const missing = installers.filter((i) => !i.online).map((i) => i.file);
  if (assets === null) console.log(`Warning: there is no release v${version} at ${downloads} yet, so the download buttons lead nowhere until there is.`);
  else if (missing.length > 0) console.log(`Warning: the release v${version} lacks ${missing.join(', ')}.`);
} else {
  if (notBuilt.length > 0) console.log(`No size on the Download page for what is not in release/: ${notBuilt.join(', ')}`);
  if (!process.argv.includes('--installers')) console.log(`The download links point to ${downloads} on the site; add --installers to copy the installers there.`);
}
