import { useNavigate } from "react-router-dom";
import { OpsDashboardPage } from "../pages/OpsDashboard/OpsDashboardPage";
import { stageToPath } from "./routes";

/**
 * AdminShell owns the `/admin` surface as a slim seam over OpsDashboardPage.
 * Issue #230 will replace the admin chrome here without touching
 * OpsAppShell/SelfAppShell/GlobalTopbar; #227 only creates the seam, so this
 * renders the same destinations and dashboard content as today.
 */
export function AdminShell() {
  const navigate = useNavigate();
  return (
    <OpsDashboardPage
      onNavigate={(stage) => navigate(stageToPath(stage))}
    />
  );
}