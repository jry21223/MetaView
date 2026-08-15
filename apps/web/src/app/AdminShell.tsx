import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { WeChatLoginDialog } from "../features/account/ui/WeChatLoginDialog";
import { OpsDashboardPage } from "../pages/OpsDashboard/OpsDashboardPage";
import { savePostLoginPath } from "./opsGuestAccess";
import { stageToPath } from "./routes";

/**
 * AdminShell owns the `/admin` surface as a slim seam over OpsDashboardPage.
 * It also owns the WeChat login-dialog state (issue #228) so the ops-edition
 * permission panel can trigger login directly from `/admin` instead of forcing
 * the visitor to find a login entry elsewhere. Self edition never reaches this
 * shell — App renders AdminUnavailable there, which intentionally has no login
 * CTA (self edition has no account/login at all).
 */
export function AdminShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loginOpen, setLoginOpen] = useState(false);
  // Bumped when the login dialog closes so OpsDashboardPage remounts and its
  // useOpsDashboard effect refetches without a manual refresh. On a real
  // WeChat OAuth redirect the SPA already remounts; this covers the in-SPA
  // close path (dismissal, or a cookie that arrived via another tab/popup).
  const [dashboardKey, setDashboardKey] = useState(0);

  // WeChat login is a full redirect (window.location.assign → WeChat → OAuth
  // callback → landing route). Persist /admin as the post-login return path so
  // LandingRoute's consumePostLoginPath() navigate lands the user back on
  // /admin after login instead of leaving them on /.
  const requireLogin = () => {
    savePostLoginPath(location.pathname);
    setLoginOpen(true);
  };

  const handleLoginClose = () => {
    setLoginOpen(false);
    setDashboardKey((n) => n + 1);
  };

  return (
    <>
      <OpsDashboardPage
        key={dashboardKey}
        onNavigate={(stage) => navigate(stageToPath(stage))}
        onRequireLogin={requireLogin}
      />
      {loginOpen && <WeChatLoginDialog onClose={handleLoginClose} />}
    </>
  );
}