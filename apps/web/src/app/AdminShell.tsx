import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAccount } from "../features/account";
import { WeChatLoginDialog } from "../features/account/ui/WeChatLoginDialog";
import { OpsDashboardPage } from "../pages/OpsDashboard/OpsDashboardPage";
import { savePostLoginPath } from "./opsGuestAccess";
// Issue #234: the ops dashboard stylesheet is loaded with this lazy admin
// chunk instead of the global index.css, so the apex (self) bundle no longer
// ships the admin styles at all.
import "../styles/pages/ops-dashboard.css";

/**
 * AdminShell owns the `/admin` surface as a slim seam over OpsDashboardPage.
 * It wires the logged-in admin's account identity and balance into the
 * sidebar (issue #230) and owns the WeChat login-dialog state (issue #228) so
 * the ops-edition permission panel can trigger login directly from `/admin`
 * instead of forcing the visitor to find a login entry elsewhere. Self
 * edition never reaches this shell — in self edition the /admin route is
 * not registered at all (the apex build drops it, see App.tsx), so there is
 * no login CTA or admin surface on the public site.
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
  const { account, refresh: refreshAccount } = useAccount();

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
    // The dashboard remount covers ops data; refresh the account too so a
    // cookie that arrived via another tab/popup surfaces the real identity.
    void refreshAccount();
  };

  return (
    <>
      <OpsDashboardPage
        key={dashboardKey}
        accountName={account?.display_name ?? null}
        accountBalanceYuan={account?.balance_yuan ?? null}
        accountAvatarUrl={account?.avatar_url ?? null}
        onOpenProviderSettings={() => navigate("/settings")}
        onRequireLogin={requireLogin}
      />
      {loginOpen && <WeChatLoginDialog onClose={handleLoginClose} />}
    </>
  );
}
