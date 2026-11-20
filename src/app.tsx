import { useState } from 'preact/hooks';
import { type BaseMetrics } from './cvss/cvss31';
import { CvssCalculator } from './cvss/CvssCalculator';
import { SecuritySettings } from './settings/SecuritySettings';
import { VaultGate } from './storage/VaultGate';
import { useHashRoute } from './ui/router';

const INITIAL: BaseMetrics = { AV: 'N', AC: 'L', PR: 'N', UI: 'N', S: 'U', C: 'N', I: 'N', A: 'N' };

export function App() {
  const route = useHashRoute();
  const [metrics, setMetrics] = useState<BaseMetrics>(INITIAL);
  return (
    <>
      <header class="shell topbar">
        <h1>PwnPoint</h1>
        <nav aria-label="Main">
          <a href="#/" aria-current={route === '/' ? 'page' : undefined}>
            CVSS calculator
          </a>
          <a href="#/settings" aria-current={route === '/settings' ? 'page' : undefined}>
            Settings
          </a>
        </nav>
      </header>
      <main class="shell">
        <VaultGate>
          {(vault) =>
            route === '/settings' ? (
              <SecuritySettings vault={vault} />
            ) : (
              <CvssCalculator value={metrics} onChange={setMetrics} />
            )
          }
        </VaultGate>
      </main>
      <footer class="shell footer">PwnPoint v{__APP_VERSION__}</footer>
    </>
  );
}
