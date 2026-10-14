import { RESEARCH } from '../../config/balance';
import { TECHS, type Tech } from '../../config/tech';
import { research } from '../../sim/actions';
import { toCalendarDate } from '../../sim/calendar';
import { employeesWithDesk } from '../../sim/office';
import { departmentPower } from '../../sim/staff';
import type { GameState } from '../../sim/state';
import { ownsTech, researchBlocker, researchCost } from '../../sim/tech';
import { Empty, Panel, Tag } from '../components';
import { Icon } from '../Icon';
import { formatCount } from '../format';
import { useGame, useGameStore } from '../store';

const DECADES = [1970, 1980, 1990, 2000, 2010, 2020];

export function ResearchScreen() {
  const game = useGame();
  const desks = employeesWithDesk(game);
  const researchers = game.employees.filter((e) => e.role === 'researcher');
  const perDay = departmentPower(game, 'researcher', desks);

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
          earlier, at {Math.round(RESEARCH.earlyCostPerYear * 100)}% extra cost per year early. New studio equipment and
          workstations are bought at the best tier you’ve researched; upgrade old equipment on the Office screen.
        </p>
      </Panel>
      <Panel title="Research trajectory">
        <div className="tech-tree">
          {DECADES.map((decade) => (
            <section key={decade} className="tech-column">
              <h3>The {decade}s</h3>
              {TECHS.filter((t) => t.year >= decade && t.year < decade + 10).map((tech) => (
                <TechNode key={tech.id} game={game} tech={tech} />
              ))}
            </section>
          ))}
        </div>
      </Panel>
    </div>
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
  const state = owned ? 'done' : year < opensIn ? 'locked' : 'open';

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
            <span className="tech-pill">from {opensIn}</span>
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
