// The character creator: choose one of the characters and the colors of its
// skin, hair and clothes, with the result standing beside the choices.

import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { BODY_IDS, FEATURES, FEATURE_COLORS, FEATURE_NAMES, SWATCHES, cleanLook, colorOf, type Look } from '../config/looks';
import { useGameStore } from './store';

// The 3D view brings a large library with it, so it is only loaded when shown.
const LookPreview = lazy(() => import('../office/Office3D').then((m) => ({ default: m.LookPreview })));

const systemReducesMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Shows what is inside it a moment after it is asked to. A 3D view takes its
 * time to be put away; this keeps a new one from being built in the same
 * breath, which React warns about.
 */
export function Later({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), 30);
    return () => clearTimeout(timer);
  }, []);
  return shown ? <>{children}</> : null;
}

export function LookEditor({ look, onChange }: { look: Look; onChange: (look: Look) => void }) {
  const still = useGameStore((s) => s.settings.reduceMotion) || systemReducesMotion();
  const index = BODY_IDS.indexOf(look.body);
  // Another character keeps the colors that were chosen, and its own for the rest.
  const step = (by: number) => onChange(cleanLook({ ...look, body: BODY_IDS[(index + by + BODY_IDS.length) % BODY_IDS.length]! }));

  return (
    <div className="look-editor">
      <div className="look-stage">
        <div className="look-picture">
          <Later>
            <Suspense fallback={<span className="muted small">Getting dressed…</span>}>
              <LookPreview look={look} still={still} />
            </Suspense>
          </Later>
        </div>
        <div className="look-bodies" role="group" aria-label="Character">
          <button type="button" onClick={() => step(-1)} aria-label="Previous character" title="Previous character">‹</button>
          <span className="small" aria-live="polite">
            Character {index + 1} of {BODY_IDS.length}
          </span>
          <button type="button" onClick={() => step(1)} aria-label="Next character" title="Next character">›</button>
        </div>
      </div>
      <div className="look-colors">
        {FEATURES.map((feature) => {
          const chosen = colorOf(look, feature);
          return (
            <div key={feature} className="look-feature">
              <span className="small" id={`look-${feature}`}>{FEATURE_NAMES[feature]}</span>
              <div className="look-swatches" role="radiogroup" aria-labelledby={`look-${feature}`}>
                {FEATURE_COLORS[feature].map((id) => (
                  <button
                    type="button"
                    key={id}
                    role="radio"
                    aria-checked={id === chosen}
                    aria-label={SWATCHES[id].name}
                    title={SWATCHES[id].name}
                    className={id === chosen ? 'look-swatch active' : 'look-swatch'}
                    style={{ background: SWATCHES[id].color }}
                    onClick={() => onChange(cleanLook({ ...look, [feature]: id }))}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
