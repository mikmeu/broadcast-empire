import { isUnlocked, lockedReason } from '../../sim/unlocks';
import { Icon } from '../Icon';
import { useGame, useGameStore } from '../store';
import { ChannelScreen } from './ChannelScreen';
import { ContentScreen } from './ContentScreen';
import { RatingsScreen } from './RatingsScreen';
import { ScheduleScreen } from './ScheduleScreen';
import { ShowsScreen } from './ShowsScreen';

const SECTIONS = {
  channels: { label: 'Channels', Screen: ChannelScreen },
  shows: { label: 'Shows', Screen: ShowsScreen },
  schedule: { label: 'Schedule', Screen: ScheduleScreen },
  content: { label: 'Content', Screen: ContentScreen },
  ratings: { label: 'Ratings', Screen: RatingsScreen },
};
export type BroadcastSection = keyof typeof SECTIONS;

/** Everything that goes out on the air, in one window: channels, shows, the schedule, bought content and the ratings. */
export function BroadcastScreen({ section, onSection }: { section: BroadcastSection; onSection: (section: BroadcastSection) => void }) {
  const contentOpen = isUnlocked(useGame(), 'content');
  const notify = useGameStore((s) => s.notify);
  // A section that is not open yet falls back to the first one.
  const { Screen } = SECTIONS[section === 'content' && !contentOpen ? 'channels' : section];
  return (
    <>
      <div className="segmented window-sections" role="tablist" aria-label="Broadcasting">
        {(Object.keys(SECTIONS) as BroadcastSection[]).map((id) =>
          id === 'content' && !contentOpen ? (
            // The content market is for television: it opens with the first TV license.
            <button key={id} role="tab" aria-selected={false} aria-disabled="true" className="locked" data-sound="denied" title={lockedReason('content')} onClick={() => notify(lockedReason('content'))}>
              <Icon name="locked" size={13} /> {SECTIONS[id].label}
            </button>
          ) : (
            <button key={id} role="tab" data-guide={`section-${id}`} aria-selected={id === section} className={id === section ? 'active' : undefined} onClick={() => onSection(id)}>
              {SECTIONS[id].label}
            </button>
          ),
        )}
      </div>
      <Screen />
    </>
  );
}
