import { useState } from 'preact/hooks';
import { type BaseMetrics } from './cvss/cvss31';
import { CvssCalculator } from './cvss/CvssCalculator';

const INITIAL: BaseMetrics = { AV: 'N', AC: 'L', PR: 'N', UI: 'N', S: 'U', C: 'N', I: 'N', A: 'N' };

export function App() {
  const [metrics, setMetrics] = useState<BaseMetrics>(INITIAL);
  return (
    <>
      <main class="shell">
        <h1>PwnPoint</h1>
        <p>Turn pentest findings into client-ready slides. Everything stays on this device.</p>
        <CvssCalculator value={metrics} onChange={setMetrics} />
      </main>
      <footer class="shell footer">PwnPoint v{__APP_VERSION__}</footer>
    </>
  );
}
