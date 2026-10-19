import { employeesWithDesk } from '../../sim/office';
import { shortOnAir } from '../../sim/staffing';
import { isUnlocked, lockedReason } from '../../sim/unlocks';
import { Icon } from '../Icon';
import { useOnAir } from '../onAir';
import { useGame, useGameStore } from '../store';
import { ChannelScreen } from './ChannelScreen';
import { ContentScreen } from './ContentScreen';
import { RatingsScreen } from './RatingsScreen';
import { ScheduleScreen } from './ScheduleScreen';
import { StaffingScreen } from './StaffingScreen';

/** The menu of the window. A channel's schedule is a page of Channels, opened from the channel. */
const SECTIONS = {
  channels: { label: 'Channels', Screen: ChannelScreen },
  content: { label: 'Content', Screen: ContentScreen },
  ratings: { label: 'Ratings', Screen: RatingsScreen },
  staffing: { label: 'Staffing', Screen: StaffingScreen },
};
const MENU = Object.keys(SECTIONS) as (keyof typeof SECTIONS)[];

/** Everything that goes out on the air, in one window: the channels with their schedules and shows, bought content, the ratings and who makes the shows. */
export function BroadcastScreen() {
  const game = useGame();
  const contentOpen = isUnlocked(game, 'content');
  const notify = useGameStore((s) => s.notify);
  const { section, show } = useOnAir();
  // A section that is not open yet falls back to the first one.
  const current = section === 'content' && !contentOpen ? 'channels' : section;
  const Screen = current === 'schedule' ? ScheduleScreen : SECTIONS[current].Screen;
  const short = shortOnAir(game, employeesWithDesk(game)).length > 0;
  return (
    <>
      <div className="segmented window-sections" role="tablist" aria-label="Broadcasting">
        {MENU.map((id) =>
          id === 'content' && !contentOpen ? (
            // The content market is for television: it opens with the first TV license.
            <button key={id} role="tab" aria-selected={false} aria-disabled="true" className="locked" data-sound="denied" title={lockedReason('content')} onClick={() => notify(lockedReason('content'))}>
              <Icon name="locked" size={13} /> {SECTIONS[id].label}
            </button>
          ) : (
            // A schedule belongs to Channels.
            <button key={id} role="tab" data-guide={`section-${id}`} aria-selected={id === current || (id === 'channels' && current === 'schedule')} className={id === current || (id === 'channels' && current === 'schedule') ? 'active' : undefined} onClick={() => show(id)}>
              {SECTIONS[id].label}
              {id === 'staffing' && short && <span className="dot" role="img" aria-label="A show on the air is short of producers" />}
            </button>
          ),
        )}
      </div>
      <Screen />
    </>
  );
}
