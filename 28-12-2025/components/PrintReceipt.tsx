// components/PrintReceipt.tsx
import React, { useState, useCallback } from 'react';

// Define the interface for the hook's return values
interface UsePrintReceiptReturn {
  printReceipt: () => Promise<void>;
  isPrinting: boolean;
  printError: string | null;
}

/**
 * Custom React hook for printing the current webview content in a Tauri application.
 * Utilizes Tauri's window.print() function.
 * @returns {UsePrintReceiptReturn} An object containing the print function, printing state, and any error.
 */
export const usePrintReceipt = (): UsePrintReceiptReturn => {
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const printReceipt = useCallback(async () => {
    setPrintError(null); // Clear previous errors
    if (typeof window !== 'undefined' && window.__TAURI__ && window.__TAURI__.window) {
      setIsPrinting(true);
      try {
        // In Tauri v2, print is available on the WebviewWindow instance
        const { WebviewWindow } = window.__TAURI__.window;
        const currentWindow = WebviewWindow.getCurrent();
        await currentWindow.print();
        // Note: Tauri's print() method typically doesn't resolve/reject based on user action (cancel/print).
        // It simply opens the print dialog. We'll assume success for UI purposes once dialog opens.
      } catch (error) {
        console.error('Error during Tauri print:', error);
        setPrintError('Failed to open print dialog.');
      } finally {
        setIsPrinting(false);
      }
    } else {
      console.warn('Not running in Tauri environment, using browser print.');
      setIsPrinting(true);
      try {
        window.print(); // Fallback to browser's print
      } catch (error) {
        console.error('Error during browser print:', error);
        setPrintError('Failed to open browser print dialog.');
      } finally {
        setIsPrinting(false);
      }
    }
  }, []);

  return { printReceipt, isPrinting, printError };
};

// Define interface for the component's props
interface PrintReceiptButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  onPrintStart?: () => void;
  onPrintEnd?: (error: string | null) => void;
}

/**
 * React component for a button that triggers printing of the current webview content.
 * It uses the `usePrintReceipt` hook to handle the printing logic.
 * The button is disabled while printing is in progress.
 * @param {PrintReceiptButtonProps} props - Component props, including children, onPrintStart, and onPrintEnd.
 */
export const PrintReceiptButton: React.FC<PrintReceiptButtonProps> = ({
  children,
  onPrintStart,
  onPrintEnd,
  ...buttonProps
}) => {
  const { printReceipt, isPrinting, printError } = usePrintReceipt();

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    buttonProps.onClick?.(event); // Call original onClick if provided
    if (onPrintStart) onPrintStart();
    await printReceipt();
    if (onPrintEnd) onPrintEnd(printError);
  };

  return (
    <button {...buttonProps} onClick={handleClick} disabled={isPrinting || buttonProps.disabled}>
      {isPrinting ? 'Printing...' : children}
    </button>
  );
};
