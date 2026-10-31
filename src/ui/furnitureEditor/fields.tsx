// The small fields the forms of the furniture editor are made of.

import type { ReactNode } from 'react';

/** A number. A half-typed one (empty, "-") is left alone until it is a number. */
export function Num({ label, value, onChange, step = 0.05, min, max }: { label: string; value: number; onChange: (value: number) => void; step?: number; min?: number; max?: number }) {
  return (
    <label className="fe-field">
      <span className="small">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const n = e.target.valueAsNumber;
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    </label>
  );
}

/** One choice from a list. */
export function Pick<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void }) {
  return (
    <label className="fe-field">
      <span className="small">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([id, name]) => (
          <option key={id} value={id}>{name}</option>
        ))}
      </select>
    </label>
  );
}

/** A group of fields on one row. */
export const Fields = ({ children }: { children: ReactNode }) => <div className="fe-fields">{children}</div>;

/** The “only at some tiers” switch and its two numbers, for a part or a place. */
export function Tiers({ tiers, onChange }: { tiers: [number, number] | undefined; onChange: (tiers: [number, number] | undefined) => void }) {
  return (
    <Fields>
      <label className="fe-field fe-check">
        <input type="checkbox" checked={tiers !== undefined} onChange={(e) => onChange(e.target.checked ? [1, 3] : undefined)} />
        <span className="small">Only at some tiers</span>
      </label>
      {tiers && (
        <>
          <Num label="From tier" value={tiers[0]} step={1} min={1} max={3} onChange={(from) => onChange([Math.round(from), Math.max(Math.round(from), tiers[1])])} />
          <Num label="To tier" value={tiers[1]} step={1} min={1} max={3} onChange={(to) => onChange([tiers[0], Math.max(tiers[0], Math.round(to))])} />
        </>
      )}
    </Fields>
  );
}
