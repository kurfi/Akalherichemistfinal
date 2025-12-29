// contexts/ToastContext.tsx
import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import Toast from '../components/Toast';

interface ToastContextType {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [toastTimeoutId, setToastTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    // Clear any existing timeout to prevent multiple toasts overlapping
    if (toastTimeoutId) {
      clearTimeout(toastTimeoutId);
    }

    setToast({ message, type });

    const id = setTimeout(() => {
      setToast(null);
      setToastTimeoutId(null);
    }, 3000); // Toast disappears after 3 seconds
    setToastTimeoutId(id);
  }, [toastTimeoutId]);

  const closeToast = useCallback(() => {
    if (toastTimeoutId) {
      clearTimeout(toastTimeoutId);
      setToastTimeoutId(null);
    }
    setToast(null);
  }, [toastTimeoutId]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={closeToast}
        />
      )}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};


