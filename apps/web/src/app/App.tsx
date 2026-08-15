import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import type { AppEdition } from "../shared/config/constants";
import { PaymentResultPage } from "../pages/PaymentResultPage";
import { AssetShowcasePage } from "../pages/AssetShowcase/AssetShowcasePage";
import { LandingRoute } from "./LandingRoute";
import { OpsAppShell } from "./OpsAppShell";
import { SelfAppShell } from "./SelfAppShell";
import { SeoManager } from "./SeoManager";

// The ops admin shell (MUI dashboard) is a separate chunk, loaded only in the
// ops edition. The conditional keeps the lazy definition itself inside the
// dead branch of the self build, so the minifier drops the dynamic import and
// the AdminShell chunk is not even emitted into the self bundle.
const AdminShell =
  import.meta.env.VITE_APP_EDITION === "ops"
    ? lazy(() =>
        import("./AdminShell").then((module) => ({ default: module.AdminShell })),
      )
    : null;

function resolveAppEdition(): AppEdition {
  return import.meta.env.VITE_APP_EDITION === "ops" ? "ops" : "self";
}

export function App() {
  return (
    <BrowserRouter>
      <SeoManager />
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
      {/* Issue #233: /admin exists only in the ops edition. The inline env
          check (rather than the appEdition variable) lets the build-time
          minifier fold `"self" === "ops"` to false so the lazy AdminShell
          chunk is not even emitted into the self bundle. */}
      {import.meta.env.VITE_APP_EDITION === "ops" && AdminShell && (
        <Route
          path="/admin"
          element={
            <Suspense fallback={null}>
              <AdminShell />
            </Suspense>
          }
        />
      )}
      <Route path="/asset-showcase" element={<AssetShowcasePage />} />
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
