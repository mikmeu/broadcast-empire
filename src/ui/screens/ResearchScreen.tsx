import { RESEARCH } from '../../config/balance';
import { DECADES, TECHS, TECH_CATEGORIES, type Tech, type TechCategory } from '../../config/tech';
import { openDecade, research } from '../../sim/actions';
import { toCalendarDate } from '../../sim/calendar';
import { employeesWithDesk } from '../../sim/office';
import { departmentPower } from '../../sim/staff';
import type { GameState } from '../../sim/state';
import { decadeBlocker, decadeCost, decadeOf, decadeOpen, ownsTech, researchBlocker, researchCost } from '../../sim/tech';
import { useState } from 'react';
import { Empty, Panel, Tag } from '../components';
import { Icon } from '../Icon';
import { formatCount } from '../format';
import { useGame, useGameStore } from '../store';

export function ResearchScreen() {
  const game = useGame();
  const desks = employeesWithDesk(game);
  const researchers = game.employees.filter((e) => e.role === 'researcher');
  const perDay = departmentPower(game, 'researcher', desks);
  const [category, setCategory] = useState<TechCategory>('genres');

  return (
    <div className="stack">
      <Panel title="Research and development" help="research">
        <dl className="facts">
          <dt>Research points</dt>
          <dd>{formatCount(game.researchPoints)}</dd>
          <dt>Per day</dt>
          <dd>
            {perDay.toFixed(1)} from {researchers.length} researcher{researchers.length === 1 ? '' : 's'}
          </dd>
        </dl>
        {researchers.length === 0 && <Empty>Hire R&D staff on the Staff screen to earn research points.</Empty>}
        <p className="muted small">
          Rivals adopt each technology in its historical year. You can research it up to {RESEARCH.maxYearsEarly} years
          earlier, at {Math.round(RESEARCH.earlyCostPerYear * 100)}% extra cost per year early, once you have opened its
          decade with research points. New studio equipment and
          workstations are bought at the best tier you’ve researched; upgrade old equipment on the Office screen.
        </p>
      </Panel>
      <Panel title="Research trajectory">
        <div className="segmented tech-tabs" role="tablist" aria-label="Kind of technology">
          {TECH_CATEGORIES.map((c) => (
            <button key={c.id} role="tab" aria-selected={c.id === category} className={c.id === category ? 'active' : undefined} onClick={() => setCategory(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
        <div className="tech-tree">
          <div className="tech-heads" aria-hidden="true">
            {TECH_CATEGORIES.map((c) => (
              <span key={c.id}>{c.name}</span>
            ))}
          </div>
          {DECADES.map((decade) => (
            <DecadeRow key={decade} game={game} decade={decade} category={category} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

/** A decade of the tree: its header, with the button that opens it while it is closed, and a cell for each kind of technology. */
function DecadeRow({ game, decade, category }: { game: GameState; decade: number; category: TechCategory }) {
  const run = useGameStore((s) => s.run);
  const year = toCalendarDate(game.day).year;
  const closed = !decadeOpen(game, decade);
  const blocker = decadeBlocker(game, decade);

  return (
    <section className={`tech-decade${closed ? ' closed' : ''}`}>
      <h3>
        The {decade}s
        {decadeOf(year) === decade && <Tag tone="warning">Rivals are here</Tag>}
      </h3>
      {closed && (
        <button className="primary tech-open" disabled={blocker !== null} title={blocker ?? undefined} onClick={() => run((s) => openDecade(s, decade))}>
          Reach the {decade}s · {formatCount(decadeCost(decade))} RP
        </button>
      )}
      <div className="tech-row">
        {TECH_CATEGORIES.map((c) => (
          <div key={c.id} className={`tech-cell${c.id === category ? ' active' : ''}`}>
            {TECHS.filter((t) => t.category === c.id && decadeOf(t.year) === decade).map((tech) => (
              <TechNode key={tech.id} game={game} tech={tech} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

/** A card in the tree: green once researched, purple while it can be researched, pale and locked before that. */
function TechNode({ game, tech }: { game: GameState; tech: Tech }) {
  const run = useGameStore((s) => s.run);
  const year = toCalendarDate(game.day).year;
  const owned = ownsTech(game, tech.id);
  const blocker = researchBlocker(game, tech);
  const cost = researchCost(tech, year);
  const opensIn = tech.year - RESEARCH.maxYearsEarly;
  const closedDecade = year < tech.year && !decadeOpen(game, decadeOf(tech.year));
  const state = owned ? 'done' : year < opensIn || closedDecade ? 'locked' : 'open';

  return (
    <>
      <span className={`tech-link ${state}`} aria-hidden="true" />
      <article className={`tech-node ${state}`}>
        <span className="tech-name">{tech.name}</span>
        <span className="small">{tech.description}</span>
        {state === 'done' && <span className="tech-pill">researched</span>}
        {state === 'locked' && (
          <>
            <Icon name="locked" size={20} label="Locked" />
            <span className="tech-pill">{year < opensIn ? `from ${opensIn}` : `open the ${decadeOf(tech.year)}s`}</span>
          </>
        )}
        {state === 'open' && (
          <>
            <button className="primary" disabled={blocker !== null} title={blocker ?? undefined} onClick={() => run((s) => research(s, tech.id))}>
              Research · {formatCount(cost)} RP
            </button>
            {year >= tech.year ? <Tag tone="warning">Rivals have it</Tag> : <span className="small">{tech.year - year} year{tech.year - year === 1 ? '' : 's'} early · rivals in {tech.year}</span>}
          </>
        )}
      </article>
    </>
  );
}
