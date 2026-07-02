import { BrowserRouter, Route, Routes, useNavigate } from 'react-router-dom';
import type { AppEdition } from '../shared/config/constants';
import { OpsAppShell } from './OpsAppShell';
import { SelfAppShell } from './SelfAppShell';
import { PaymentResultPage } from '../pages/PaymentResultPage';
import { OpsDashboardPage } from '../pages/OpsDashboard/OpsDashboardPage';
import { AssetShowcasePage } from '../pages/AssetShowcase/AssetShowcasePage';

function resolveAppEdition(): AppEdition {
  return import.meta.env.VITE_APP_EDITION === 'ops' ? 'ops' : 'self';
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

function AppRoutes() {
  const appEdition = resolveAppEdition();

  return (
    <Routes>
      <Route path="/payment/result" element={<PaymentResultPage />} />
      <Route
        path="/admin"
        element={
          appEdition === 'ops' ? (
            <OpsDashboardPage onNavigate={() => {}} />
          ) : (
            <AdminUnavailable />
          )
        }
      />
      <Route path="/asset-showcase" element={<AssetShowcasePage />} />
      <Route
        path="/*"
        element={appEdition === 'ops' ? <OpsAppShell /> : <SelfAppShell />}
      />
    </Routes>
  );
}

function AdminUnavailable() {
  const navigate = useNavigate();
  return (
    <main className="mv-root mv-admin-unavailable">
      <section className="mv-admin-unavailable__panel">
        <h1>运营后台仅在 ops edition 可用</h1>
        <p>当前是 self edition。后端仍会继续执行管理员权限校验。</p>
        <button type="button" className="mv-chip" onClick={() => navigate("/")}>
          返回工作台
        </button>
      </section>
    </main>
  );
}
