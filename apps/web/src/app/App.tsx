import { APP_EDITION } from '../shared/config/constants';
import { OpsAppShell } from './OpsAppShell';
import { SelfAppShell } from './SelfAppShell';
import { PaymentResultPage } from '../pages/PaymentResultPage';
import { OpsDashboardPage } from '../pages/OpsDashboard/OpsDashboardPage';

export function App() {
  if (window.location.pathname === '/payment/result') {
    return <PaymentResultPage />;
  }
  if (window.location.pathname === '/admin') {
    return <OpsDashboardPage onNavigate={() => {}} />;
  }

  return APP_EDITION === 'ops' ? <OpsAppShell /> : <SelfAppShell />;
}
