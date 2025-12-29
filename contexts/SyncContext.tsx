import React, { createContext, useState, useEffect, useContext } from 'react';
import { subscribeToSyncStatus, SyncStatus } from '../services/syncService';

interface SyncContextType {
  syncStatus: SyncStatus;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  useEffect(() => {
    // Initial check
    if (!navigator.onLine) setSyncStatus('offline');

    const unsubscribe = subscribeToSyncStatus((status) => {
      setSyncStatus(status);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <SyncContext.Provider value={{ syncStatus }}>
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
};
