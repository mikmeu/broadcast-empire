import { creditedSources } from '../audio/officeSounds';

/** The game's website: downloads, the changelog and a form for what players think. */
export const WEBSITE = 'https://broadcastempire.online';

/** A link out of the game: in the desktop app it opens in the system's browser. */
function Out({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/**
 * Who made the game and whose free work it is built from, on the main menu
 * and in the Settings. The website's thank-you page says the same at more length.
 */
export function Credits() {
  return (
    <div className="credits">
      <dl>
        <dt>Game</dt>
        <dd>
          Mike van der Meulen, <Out href="https://mvdm.media">mvdm.media</Out>
        </dd>
        <dt>Art style</dt>
        <dd>Christian den Oude</dd>
      </dl>
      <h3>Thanks to</h3>
      <dl>
        <dt>
          <Out href="https://kenney.nl">Kenney</Out>
        </dt>
        <dd>The furniture, the people, three city kits and the train; the sounds of the buttons and the furniture, the jingles, and the cursors.</dd>
        <dt>
          <Out href="https://quaternius.com">Quaternius</Out>
        </dt>
        <dd>The figures of Uncle Tabby and Penny Cash, and of Lotta Glitter and Sonny Sparkle, the hosts of the awards night.</dd>
        <dt>
          <Out href="https://elevenlabs.io">ElevenLabs</Out>
        </dt>
        <dd>Their voices, which are made with AI.</dd>
        <dt>Office sounds</dt>
        <dd>
          The sounds of the rooms and the town come from freesound.org, many of them under CC0. Under a Creative Commons licence:
          <ul>
            {creditedSources().map(({ id, source }) => (
              <li key={`${id}${source.url}`}>
                <Out href={source.url}>{source.title}</Out> by {source.author}, {source.license}
              </li>
            ))}
          </ul>
        </dd>
        <dt>Typefaces</dt>
        <dd>Fjalla One by Sorkin Type and Assistant, both under the SIL Open Font License.</dd>
        <dt>Software</dt>
        <dd>React, three.js, React Three Fiber, Zustand, Recharts, Electron, Vite and TypeScript.</dd>
      </dl>
      <p>
        News, downloads and a form for what you think of the game: <Out href={WEBSITE}>broadcastempire.online</Out>
      </p>
    </div>
  );
}
