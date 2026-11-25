import { useEffect, useState } from 'preact/hooks';
import type { Finding } from '../findings/model';
import { trackSave } from '../findings/pendingSaves';
import type { Vault } from '../storage/vault';
import { recommendationHref } from '../ui/router';
import { type Recommendation, recommendationRef, sortForPlan } from './model';
import { createRecommendation, listRecommendations, setLinked } from './repository';

/** In the finding editor: the recommendations that address this finding, link and unlink. */
export function LinkedRecommendations({ vault, finding }: { vault: Vault; finding: Finding }) {
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [choice, setChoice] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    void listRecommendations(vault, finding.projectId).then((l) => setRecs(sortForPlan(l)));
  }, [vault, finding.projectId]);

  if (!recs) return null;
  const linked = recs.filter((r) => r.findingIds.includes(finding.id));
  const others = recs.filter((r) => !r.findingIds.includes(finding.id));

  const link = async (r: Recommendation, on: boolean) => {
    const saved = await trackSave(setLinked(vault, r, finding.id, on));
    setRecs(recs.map((x) => (x.id === saved.id ? saved : x)));
    setChoice('');
    setMessage(`${recommendationRef(r)} ${on ? 'linked' : 'unlinked'}.`);
  };

  return (
    <fieldset class="field">
      <legend>Linked recommendations</legend>
      <p class="hint">
        Remediation actions from the project's recommendations. One recommendation can address
        several findings.
      </p>
      {linked.length > 0 && (
        <ul class="plain-list" data-testid="linked-recommendations">
          {linked.map((r) => (
            <li key={r.id}>
              <a href={recommendationHref(r.id)}>
                <span class="ref">{recommendationRef(r)}</span>{' '}
                {r.title || 'Untitled recommendation'}
              </a>{' '}
              <button
                type="button"
                class="small"
                aria-label={`Unlink ${recommendationRef(r)}`}
                onClick={() => void link(r, false)}
              >
                Unlink
              </button>
            </li>
          ))}
        </ul>
      )}
      <div class="row">
        {others.length > 0 && (
          <>
            <label for="link-recommendation" class="visually-hidden">
              Recommendation to link
            </label>
            <select
              id="link-recommendation"
              value={choice}
              onChange={(e) => setChoice(e.currentTarget.value)}
            >
              <option value="">Choose a recommendation…</option>
              {others.map((r) => (
                <option key={r.id} value={r.id}>
                  {recommendationRef(r)} {r.title || 'Untitled recommendation'}
                </option>
              ))}
            </select>
            <button
              type="button"
              class="small"
              disabled={!choice}
              onClick={() => {
                const r = others.find((x) => x.id === choice);
                if (r) void link(r, true);
              }}
            >
              Link
            </button>
          </>
        )}
        <button
          type="button"
          class="small"
          onClick={() =>
            void createRecommendation(vault, finding.projectId, { findingIds: [finding.id] }).then(
              (r) => {
                location.hash = recommendationHref(r.id);
              },
            )
          }
        >
          + New recommendation for this finding
        </button>
      </div>
      <p role="status" class="muted">
        {message}
      </p>
    </fieldset>
  );
}
