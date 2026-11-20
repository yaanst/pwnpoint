import { useEffect, useState } from 'preact/hooks';
import { type BaseMetrics } from './cvss/cvss31';
import { CvssCalculator } from './cvss/CvssCalculator';
import { FindingEditorPage } from './findings/FindingEditor';
import { FindingsPage } from './findings/FindingsPage';
import { ScenarioEditorPage } from './scenarios/ScenarioEditor';
import { ScenariosPage } from './scenarios/ScenariosPage';
import { DEFAULT_CVSS } from './findings/model';
import { guardUnloadWhileSaving } from './findings/pendingSaves';
import { SecuritySettings } from './settings/SecuritySettings';
import { SlideThemeSettings } from './slides/SlideThemeSettings';
import type { Vault } from './storage/vault';
import { VaultGate } from './storage/VaultGate';
import { matchRoute, type Page, useHashRoute } from './ui/router';

export function App() {
  const page = matchRoute(useHashRoute());
  const [metrics, setMetrics] = useState<BaseMetrics>(DEFAULT_CVSS);
  useEffect(guardUnloadWhileSaving, []);
  const current = (names: Page['name'][]) => (names.includes(page.name) ? 'page' : undefined);

  const render = (vault: Vault) => {
    switch (page.name) {
      case 'findings':
        return <FindingsPage vault={vault} />;
      case 'finding':
        return <FindingEditorPage vault={vault} id={page.id} />;
      case 'scenarios':
        return <ScenariosPage vault={vault} />;
      case 'scenario':
        return <ScenarioEditorPage vault={vault} id={page.id} />;
      case 'cvss':
        return <CvssCalculator value={metrics} onChange={setMetrics} />;
      case 'settings':
        return (
          <div class="stack-sections">
            <SlideThemeSettings vault={vault} />
            <SecuritySettings vault={vault} />
          </div>
        );
      default:
        return (
          <p role="alert">
            This page does not exist. <a href="#/findings">Go to findings</a>
          </p>
        );
    }
  };

  return (
    <>
      <header class="shell topbar">
        <h1>PwnPoint</h1>
        <nav aria-label="Main">
          <a href="#/findings" aria-current={current(['findings', 'finding'])}>
            Findings
          </a>
          <a href="#/scenarios" aria-current={current(['scenarios', 'scenario'])}>
            Scenarios
          </a>
          <a href="#/cvss" aria-current={current(['cvss'])}>
            CVSS calculator
          </a>
          <a href="#/settings" aria-current={current(['settings'])}>
            Settings
          </a>
        </nav>
      </header>
      <main class="shell">
        <VaultGate>{render}</VaultGate>
      </main>
      <footer class="shell footer">PwnPoint v{__APP_VERSION__}</footer>
    </>
  );
}
