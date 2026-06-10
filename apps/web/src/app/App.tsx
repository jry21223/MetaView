import React from 'react';
import { APP_EDITION } from '../shared/config/constants';
import { OpsAppShell } from './OpsAppShell';
import { SelfAppShell } from './SelfAppShell';
import { PaymentResultPage } from '../pages/PaymentResultPage';

export function App() {
  if (window.location.pathname === '/payment/result') {
    return <PaymentResultPage />;
  }

  return APP_EDITION === 'ops' ? <OpsAppShell /> : <SelfAppShell />;
}
