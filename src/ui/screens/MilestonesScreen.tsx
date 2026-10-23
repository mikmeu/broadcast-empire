import { AWARDS } from '../../config/balance';
import { MILESTONE_LIST } from '../../config/milestones';
import { FEATURES, UNLOCKS } from '../../config/unlocks';
import { AWARD_CATEGORIES, AWARD_NAMES, nextAwardsYear } from '../../sim/awards';
import { toDay } from '../../sim/calendar';
import { milestoneReward } from '../../sim/milestones';
import { PLAYER, type GameState, type Nominee } from '../../sim/state';
import { isUnlocked } from '../../sim/unlocks';
import { Panel, Tag } from '../components';
import { Icon } from '../Icon';
import { formatDate, formatMoney } from '../format';
import { useGame } from '../store';

export function MilestonesScreen() {
  const game = useGame();
  const reached = new Map(game.milestones.map((m) => [m.id, m.day]));

  return (
    <>
      <Panel
        title="Milestones"
        help="milestones"
        actions={
          <span className="muted">
            {reached.size} of {MILESTONE_LIST.length} reached · {formatMoney(game.dividendsPaid)} paid to the owners
            {isUnlocked(game, 'events') && ` · ${game.prestige} prestige`}
          </span>
        }
      >
        <p className="muted small">
          There is no finish line: the game runs until 2030 and these mark how far you’ve come. Uncle Tabby sends money for
          most of them, and some open something new: the lock shows what.
        </p>
        <ul className="milestones">
          {MILESTONE_LIST.map((m) => {
            const day = reached.get(m.id);
            return (
              <li key={m.id} className={day !== undefined ? 'milestone reached' : 'milestone'}>
                <span className="milestone-mark" aria-hidden="true"><Icon name="quality" size={20} /></span>
                <div>
                  <div className="milestone-name">{m.name}</div>
                  <div className="muted small">{m.description}</div>
                  {milestoneReward(game, m.id) > 0 && (
                    <div className="milestone-opens">
                      <Icon name="euro" size={13} /> Uncle Tabby {day !== undefined ? 'sent' : 'sends'} {formatMoney(milestoneReward(game, m.id))}
                    </div>
                  )}
                  {FEATURES.filter((feature) => UNLOCKS[feature].milestones.includes(m.id)).map((feature) => (
                    <div key={feature} className={isUnlocked(game, feature) ? 'milestone-opens open' : 'milestone-opens'}>
                      <Icon name={isUnlocked(game, feature) ? 'check' : 'locked'} size={13} /> {isUnlocked(game, feature) ? 'Opened' : 'Opens'} {UNLOCKS[feature].name}: {UNLOCKS[feature].opens}
                    </div>
                  ))}
                </div>
                {day !== undefined ? <Tag tone="good">{formatDate(day).slice(4)}</Tag> : <span className="muted small">Not yet</span>}
              </li>
            );
          })}
        </ul>
      </Panel>
      <Awards game={game} />
    </>
  );
}

/**
 * The radio and TV awards: this year's nominees once they are out, then the
 * nights that have been, newest first. One card per award, so that a narrow
 * window still reads.
 */
function Awards({ game }: { game: GameState }) {
  const nominations = game.awards.nominations;
  const past = [...game.awards.past].reverse();
  const coming = nextAwardsYear(game.day);
  return (
    <Panel title="Media Times Awards" help="awards">
      <p className="muted small">
        Every {AWARDS.everyYears} years the business picks its best radio and TV show and its best radio and TV host. A
        nomination brings prestige; a win brings more, and fame for a host.
      </p>
      {nominations ? (
        <>
          <h3 className="awards-night">The {coming} nominees · the winners on {formatDate(toDay(coming, AWARDS.nightMonth, 1)).slice(4)}</h3>
          <AwardCards nominees={nominations} />
        </>
      ) : (
        <p className="small">
          The next awards: nominations on {formatDate(toDay(coming, AWARDS.nominationMonth, 1)).slice(4)}, the night on{' '}
          {formatDate(toDay(coming, AWARDS.nightMonth, 1)).slice(4)}.
        </p>
      )}
      {past.map((night) => (
        <div key={night.year}>
          <h3 className="awards-night">{night.year}</h3>
          <AwardCards nominees={night.nominees} />
        </div>
      ))}
    </Panel>
  );
}

/** One card per award; the winners are marked, and the player's own in the colour of a milestone reached. */
export function AwardCards({ nominees }: { nominees: readonly Nominee[] }) {
  return (
    <ul className="milestones">
      {AWARD_CATEGORIES.filter((category) => nominees.some((n) => n.category === category)).map((category) => {
        const up = nominees.filter((n) => n.category === category);
        const ours = up.some((n) => n.won && n.ownerId === PLAYER);
        return (
          <li key={category} className={ours ? 'milestone reached' : 'milestone'}>
            <span className="milestone-mark" aria-hidden="true"><Icon name="quality" size={20} /></span>
            <div>
              <div className="milestone-name">{AWARD_NAMES[category]}</div>
              <ul className="award-nominees">
                {up.map((n) => (
                  <li key={`${n.channelId}-${n.showName}-${n.hostName}`} className={n.won ? 'won' : undefined}>
                    <span>{n.hostName ?? `“${n.showName}”`}</span>
                    <span className="muted small">{n.hostName !== null ? `“${n.showName}”, ` : ''}{n.channelName}</span>
                    {n.ownerId === PLAYER && <Tag>Yours</Tag>}
                    {n.won && <Tag tone="good">Winner</Tag>}
                  </li>
                ))}
              </ul>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
