import { MILESTONE_LIST } from '../../config/milestones';
import { FEATURES, UNLOCKS } from '../../config/unlocks';
import { isUnlocked } from '../../sim/unlocks';
import { Panel, Tag } from '../components';
import { Icon } from '../Icon';
import { formatDate, formatMoney } from '../format';
import { useGame } from '../store';

export function MilestonesScreen() {
  const game = useGame();
  const reached = new Map(game.milestones.map((m) => [m.id, m.day]));

  return (
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
        There is no finish line: the game runs until 2030 and these mark how far you’ve come. Some of them open something
        new: the lock shows what.
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
  );
}
