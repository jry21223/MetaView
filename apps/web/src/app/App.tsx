import React from 'react';
import { APP_EDITION } from '../shared/config/constants';
import { OpsAppShell } from './OpsAppShell';
import { SelfAppShell } from './SelfAppShell';

export function App() {
  return APP_EDITION === 'ops' ? <OpsAppShell /> : <SelfAppShell />;
}
