import { createContext, useContext, useState, type ReactNode } from 'react';
import type { AppStatus } from '../types';

interface AppStatusContextValue {
  status: AppStatus;
  setStatus: (s: AppStatus) => void;
  statusMessage: string;
  setStatusMessage: (m: string) => void;
}

const AppStatusContext = createContext<AppStatusContextValue | null>(null);

export function AppStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  return (
    <AppStatusContext.Provider value={{ status, setStatus, statusMessage, setStatusMessage }}>
      {children}
    </AppStatusContext.Provider>
  );
}

export function useAppStatus() {
  const ctx = useContext(AppStatusContext);
  if (!ctx) {
    throw new Error('useAppStatus must be used within AppStatusProvider');
  }
  return ctx;
}
