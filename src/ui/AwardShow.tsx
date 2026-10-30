import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { playJingle } from '../audio/player';
import { hush, speak } from '../audio/voice';
import { getLine, PRESENTERS } from '../config/guide';
import { AWARD_NAMES } from '../sim/awards';
import { PLAYER, type AwardNight, type Nominee } from '../sim/state';
import { ceremonySteps, pauseAfter, type CeremonyStep } from './ceremony';
import { CONFETTI } from './confetti';
import { Tag } from './components';
import { Icon } from './Icon';
import { AwardCards } from './screens/MilestonesScreen';
import { useGameStore } from './store';

// The stage is a 3D scene of its own, loaded when the first night is watched.
const AwardStage = lazy(() => import('../office/AwardStage').then((m) => ({ default: m.AwardStage })));

const systemReducesMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The awards night (0.20.0), over a paused game: two presenters on a stage name each award, read out the
 * nominees and open the envelope, and the night ends on the list of winners. “Watch the awards night” in the
 * settings turns the stage off, and the player can skip to the list at any time. The winners are already
 * chosen by the game (sim/awards.ts); this only shows them.
 */
export function AwardShow() {
  const ceremony = useGameStore((s) => s.ceremony);
  const watch = useGameStore((s) => s.settings.awardShow);
  const night = useGameStore((s) => s.game?.awards.past.find((n) => n.year === ceremony?.year));
  const close = useGameStore((s) => s.closeCeremony);
  // A night that is not in the game (a save from before it, say) has nothing to show.
  useEffect(() => {
    if (ceremony && !night) close();
  }, [ceremony, night, close]);
  if (!ceremony || !night) return null;
  return watch ? <Show key={night.year} night={night} resume={ceremony.resume} /> : <Results night={night} resume={ceremony.resume} />;
}

function Show({ night, resume }: { night: AwardNight; resume: boolean }) {
  const steps = useMemo(() => ceremonySteps(night), [night]);
  const [at, setAt] = useState(0);
  const step: CeremonyStep | undefined = steps[at];
  const still = useGameStore((s) => s.settings.reduceMotion) || systemReducesMotion();
  const first = useRef<HTMLButtonElement>(null);

  // Each step moves on by itself: when its line has been said, or when its card has been up long enough.
  useEffect(() => {
    if (!step) return;
    let live = true;
    let timer: number | undefined;
    const wait = (ms: number) => {
      timer = window.setTimeout(() => live && setAt((n) => n + 1), ms);
    };
    if (step.kind === 'winner') playJingle('win');
    if (step.lineId) speak(step.lineId, (heard) => live && wait(pauseAfter(step.lineId!, heard)));
    else wait(step.hold ?? 0);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [step]);
  // Whoever is talking when the night is over, or closed, is stopped.
  useEffect(() => hush, []);
  useEffect(() => first.current?.focus({ preventScroll: true }), []);

  const goOn = () => {
    hush();
    setAt((n) => n + 1);
  };
  const skip = () => {
    hush();
    setAt(steps.length);
  };

  if (!step) return <Results night={night} resume={resume} />;
  const presenter = PRESENTERS[step.who];
  // Only a spoken line is written out; the cards of the nominees and the winner speak for themselves.
  const line =step.lineId ? getLine(step.lineId) : undefined;
  const name = step.category ? AWARD_NAMES[step.category] : `The ${night.year} Media Times Awards`;
  const ours = step.winner?.ownerId === PLAYER;
  return (
    <div className="overlay award-show" role="dialog" aria-modal="true" aria-labelledby="award-title" onKeyDown={(e) => e.key === 'Escape' && skip()}>
      {step.kind === 'winner' && !still && (
        <div className="confetti" aria-hidden="true" key={at}>
          {CONFETTI.map((style, i) => <i key={i} style={style} />)}
        </div>
      )}
      <div className="award-stage">
        <Suspense fallback={null}>
          <AwardStage talking={step.lineId ? step.who : undefined} still={still} reveal={step.kind === 'winner'} />
        </Suspense>
      </div>
      <div className="award-card" key={at}>
        <p className="award-title" id="award-title">
          <Icon name="milestones" size={22} /> <strong>{name}</strong>
          <span className="muted small">{step.category ? `The ${night.year} Media Times Awards` : 'Presented by Lotta Glitter and Sonny Sparkle'}</span>
        </p>
        {step.kind === 'winner' && step.winner ? (
          <WinnerCard winner={step.winner} ours={ours} />
        ) : (
          (step.kind === 'nominees' || step.kind === 'envelope') && step.nominees && <Nominees nominees={step.nominees} />
        )}
        {line && (
          <p className="award-say" id="award-say">
            <strong>{presenter.name}</strong>
            <span>{line.say}</span>
          </p>
        )}
        <div className="row">
          <button ref={first} className="primary" onClick={goOn}>Go on</button>
          <button className="link" onClick={skip}>Skip to the results</button>
          <span className="muted small award-page">{at + 1} / {steps.length}</span>
        </div>
      </div>
    </div>
  );
}

function Nominees({ nominees }: { nominees: readonly Nominee[] }) {
  return (
    <ul className="award-nominees award-list">
      {nominees.map((n) => (
        <li key={`${n.channelId}-${n.showName}-${n.hostName}`}>
          <span>{n.hostName ?? `“${n.showName}”`}</span>
          <span className="muted small">{n.hostName !== null ? `“${n.showName}”, ` : ''}{n.channelName}</span>
          {n.ownerId === PLAYER && <Tag>Yours</Tag>}
        </li>
      ))}
    </ul>
  );
}

function WinnerCard({ winner, ours }: { winner: Nominee; ours: boolean }) {
  return (
    <div className={ours ? 'award-winner ours' : 'award-winner'}>
      <Icon name="quality" size={40} />
      <strong>{winner.hostName ?? `“${winner.showName}”`}</strong>
      <span className="muted">{winner.hostName !== null ? `“${winner.showName}”, ` : ''}{winner.channelName}</span>
      {ours && <Tag tone="good">Yours</Tag>}
    </div>
  );
}

/** The end of the night, whether it was watched, skipped or turned off: every award, its nominees and its winner. */
function Results({ night, resume }: { night: AwardNight; resume: boolean }) {
  const close = useGameStore((s) => s.closeCeremony);
  const still = useGameStore((s) => s.settings.reduceMotion) || systemReducesMotion();
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus({ preventScroll: true }), []);
  const wins = night.nominees.filter((n) => n.won && n.ownerId === PLAYER).length;
  return (
    <div className="overlay award-show results" role="dialog" aria-modal="true" aria-labelledby="award-title" onKeyDown={(e) => e.key === 'Escape' && close()}>
      {wins > 0 && !still && (
        <div className="confetti" aria-hidden="true">
          {CONFETTI.map((style, i) => <i key={i} style={style} />)}
        </div>
      )}
      <div className="overlay-card award-results">
        <Icon name="milestones" size={56} />
        <h2 id="award-title">The {night.year} Media Times Awards</h2>
        <p>{wins === 0 ? 'None of the awards went to you this time.' : wins === 1 ? 'One award went to you.' : `${wins} awards went to you.`}</p>
        <AwardCards nominees={night.nominees} />
        <div className="row">
          <button ref={first} className="primary" onClick={close}>{resume ? 'Continue' : 'Close'}</button>
          {resume && <span className="muted small">The game waits until then.</span>}
        </div>
      </div>
    </div>
  );
}
