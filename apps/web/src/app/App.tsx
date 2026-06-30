import type { AppEdition } from '../shared/config/constants';
import { OpsAppShell } from './OpsAppShell';
import { SelfAppShell } from './SelfAppShell';
import { PaymentResultPage } from '../pages/PaymentResultPage';
import { OpsDashboardPage } from '../pages/OpsDashboard/OpsDashboardPage';

function resolveAppEdition(): AppEdition {
  return import.meta.env.VITE_APP_EDITION === 'ops' ? 'ops' : 'self';
}

export function App() {
  const appEdition = resolveAppEdition();
  if (window.location.pathname === '/payment/result') {
    return <PaymentResultPage />;
  }
  if (window.location.pathname === '/admin') {
    if (appEdition === 'ops') {
      return <OpsDashboardPage onNavigate={() => {}} />;
    }
    return (
      <main className="mv-root mv-admin-unavailable">
        <section className="mv-admin-unavailable__panel">
          <h1>运营后台仅在 ops edition 可用</h1>
          <p>当前是 self edition。后端仍会继续执行管理员权限校验。</p>
          <button type="button" className="mv-chip" onClick={() => window.location.assign("/")}>
            返回工作台
          </button>
        </section>
      </main>
    );
  }

  return appEdition === 'ops' ? <OpsAppShell /> : <SelfAppShell />;
}
