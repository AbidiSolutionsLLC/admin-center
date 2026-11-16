// First-admin setup checklist (elevation 5.7, ON-8): derived from live data; skippable; gone when complete.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle } from 'lucide-react';
import type { SetupProgress } from '@/types';

const SKIP_KEY = 'karbexa-admin:setup-checklist-skipped';
const readSkipped = () => {
  try { return window.localStorage.getItem(SKIP_KEY) === '1'; } catch { return false; }
};

export const SetupChecklist: React.FC<{ progress?: SetupProgress }> = ({ progress }) => {
  const [skipped, setSkipped] = useState(readSkipped);
  const items = progress?.checklist;
  if (!items || items.length === 0 || items.every((i) => i.done) || skipped) return null;
  const done = items.filter((i) => i.done).length;

  const skip = () => {
    try { window.localStorage.setItem(SKIP_KEY, '1'); } catch { /* per-viewer convenience only */ }
    setSkipped(true);
  };

  return (
    <section aria-label="Setup checklist" data-testid="setup-checklist" className="rounded-card border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-section text-ink">Get your organisation ready</h2>
          <p className="text-table text-ink-secondary">{done} of {items.length} steps done</p>
        </div>
        <button type="button" onClick={skip} className="text-table text-ink-secondary hover:text-ink">Skip for now</button>
      </div>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-2 text-body" data-testid={`checklist-${i.key}`} data-done={i.done}>
            {i.done ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> : <Circle className="h-4 w-4 text-ink-muted" aria-hidden />}
            {i.done ? <span className="text-ink-secondary line-through">{i.label}</span> : <Link to={i.href} className="text-primary hover:underline">{i.label}</Link>}
          </li>
        ))}
      </ul>
    </section>
  );
};
