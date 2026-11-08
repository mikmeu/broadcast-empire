import { useState } from 'react';
import { Empty, Panel } from '../components';
import { VansScreen } from './VansScreen';

/** The tabs of the Garage. The delivery van is a place kept for a later version: nothing is bought there yet. */
const TABS = {
  vans: { label: 'News vans' },
  delivery: { label: 'Delivery van' },
};
type Tab = keyof typeof TABS;

/** The company's vehicles, bought and managed in one window (0.21.0, #261). The tab is not saved. */
export function GarageScreen() {
  const [tab, setTab] = useState<Tab>('vans');
  return (
    <>
      <div className="segmented window-sections" role="tablist" aria-label="Garage">
        {(Object.keys(TABS) as Tab[]).map((id) => (
          <button key={id} role="tab" data-guide={`garage-tab-${id}`} aria-selected={id === tab} className={id === tab ? 'active' : undefined} onClick={() => setTab(id)}>
            {TABS[id].label}
          </button>
        ))}
      </div>
      {tab === 'vans' ? (
        <VansScreen />
      ) : (
        <Panel title="Delivery van">
          <Empty>Nothing here yet. The delivery van comes in a later version.</Empty>
        </Panel>
      )}
    </>
  );
}
