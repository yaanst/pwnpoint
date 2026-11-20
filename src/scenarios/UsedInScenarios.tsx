import { useEffect, useState } from 'preact/hooks';
import type { Vault } from '../storage/vault';
import { scenarioHref } from '../ui/router';
import { type Scenario, scenarioRef, scenariosUsing } from './model';
import { listScenarios } from './repository';

/** "Used in scenarios" line on the finding editor. */
export function UsedInScenarios({
  vault,
  projectId,
  findingId,
}: {
  vault: Vault;
  projectId: string;
  findingId: string;
}) {
  const [using, setUsing] = useState<Scenario[] | null>(null);
  useEffect(() => {
    void listScenarios(vault, projectId).then((all) => setUsing(scenariosUsing(all, findingId)));
  }, [vault, projectId, findingId]);
  if (!using) return null;
  return (
    <p class="muted small-text" data-testid="used-in-scenarios">
      {using.length === 0 ? (
        'Not used in any scenario yet.'
      ) : (
        <>
          Used in scenarios:{' '}
          {using.map((s, i) => (
            <span key={s.id}>
              {i > 0 && ', '}
              <a href={scenarioHref(s.id)}>
                {scenarioRef(s.number)} {s.title || 'Untitled scenario'}
              </a>
            </span>
          ))}
        </>
      )}
    </p>
  );
}
