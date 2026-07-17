import { BrowserRouter, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import type { AppEdition } from "../shared/config/constants";
import { PaymentResultPage } from "../pages/PaymentResultPage";
import { OpsDashboardPage } from "../pages/OpsDashboard/OpsDashboardPage";
import { AssetShowcasePage } from "../pages/AssetShowcase/AssetShowcasePage";
import { LandingRoute } from "./LandingRoute";
import { TemplatesPage } from "../pages/Templates/TemplatesPage";
import { TemplatePreviewPage } from "../pages/Templates/TemplatePreviewPage";
import { PublicTemplatesLayout } from "../pages/Templates/PublicTemplatesLayout";
import { OpsAppShell } from "./OpsAppShell";
import { SelfAppShell } from "./SelfAppShell";
import { stageToPath } from "./routes";

function resolveAppEdition(): AppEdition {
  return import.meta.env.VITE_APP_EDITION === "ops" ? "ops" : "self";
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
      <Route path="/" element={<LandingRoute appEdition={appEdition} />} />
      <Route path="/payment/result" element={<PaymentResultPage />} />
      <Route
        path="/admin"
        element={
          appEdition === "ops" ? (
            <OpsDashboardRoute />
          ) : (
            <AdminUnavailable />
          )
        }
      />
      <Route path="/asset-showcase" element={<AssetShowcasePage />} />
      <Route
        path="/templates"
        element={<PublicTemplatesLayout><TemplatesPage /></PublicTemplatesLayout>}
      />
      <Route path="/templates/:templateId" element={<TemplatePreviewPage />} />
      <Route path="/cases" element={<Navigate to="/templates" replace />} />
      <Route path="/cases/:slug" element={<LegacyCaseRedirect />} />
      <Route
        path="/*"
        element={appEdition === "ops" ? <OpsAppShell /> : <SelfAppShell />}
      />
    </Routes>
  );
}

const LEGACY_CASE_ROUTES: Record<string, string> = {
  "derivative-tangent": "/templates/derivative-tangent",
  "bfs-tree": "/templates/bfs-tree",
  "projectile-motion": "/templates/projectile",
};

function LegacyCaseRedirect() {
  const { slug = "" } = useParams<{ slug: string }>();
  return <Navigate to={LEGACY_CASE_ROUTES[slug] ?? "/templates"} replace />;
}

function OpsDashboardRoute() {
  const navigate = useNavigate();
  return (
    <OpsDashboardPage
      onNavigate={(stage) => navigate(stageToPath(stage))}
    />
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
          返回首页
        </button>
      </section>
    </main>
  );
}
