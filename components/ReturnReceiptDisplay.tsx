import React from 'react';
import { Sale, SaleItem, PaymentMethod, Customer, ReturnReason, Return, ReturnedItem } from '../types';
import { format } from 'date-fns';

// Props for the ReturnReceiptDisplay component
interface ReturnReceiptDisplayProps {
  originalSale: Sale;
  returnItems: (SaleItem & { returnedQuantity: number; restockStatus: 'restocked' | 'damaged'; reason: ReturnReason | string })[];
  totalRefundAmount: number;
  returnReason: ReturnReason | string;
  refundMethod: PaymentMethod;
  customer: Customer | null;
  cashierUsername: string;
  returnDate: Date;
  returnId: number | null; // Pass the newly created return ID
  paperSize?: '80mm' | '58mm'; // Optional: for receipt formatting
}

// This component will render the detailed return receipt
const ReturnReceiptDisplay = React.forwardRef<HTMLDivElement, ReturnReceiptDisplayProps>(
  (
    {
      originalSale,
      returnItems,
      totalRefundAmount,
      returnReason,
      refundMethod,
      customer,
      cashierUsername,
      returnDate,
      returnId,
      paperSize = '80mm',
    },
    ref
  ) => {
    const itemsToDisplay = returnItems.filter((item) => item.returnedQuantity > 0);

    return (
      <div 
        id="return-receipt-content"
        ref={ref} 
        className={`bg-white p-4 md:p-6 border border-slate-200 text-xs md:text-sm font-mono text-slate-800 leading-tight max-h-full overflow-y-auto ${paperSize === '80mm' ? 'receipt-80mm' : 'receipt-58mm'}`}
        style={{ minHeight: '400px' }} // Ensure visibility for image/pdf generation
      >
        <div className="text-center mb-4">
          <h2 className="text-base md:text-lg font-bold mb-1">AK Alheri Chemist PPMVS Kurfi</h2>
          <p className="text-[10px] md:text-xs text-slate-500">No.2&3 Maraɗi Aliyu Street Opposite JIBWIS Jumma'a Masjid Kurfi</p>
          <p className="text-[10px] md:text-xs text-slate-500">Tel: 09060605362, 07039177740</p>
          <p className="text-[10px] md:text-xs text-slate-500">Email: kabirbalakurfi@gmail.com</p>
        </div>

        <div className="border-b border-dashed border-slate-300 pb-2 mb-2 space-y-1">
          <div className="flex justify-between">
            <span>Return ID:</span>
            <span>#{returnId || 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span>Date:</span>
            <span>{format(returnDate, 'dd/MM/yyyy HH:mm')}</span>
          </div>
          <div className="flex justify-between">
            <span>Customer:</span>
            <span>{customer?.name || originalSale.customerName || 'Walk-in Customer'}</span>
          </div>
          <div className="flex justify-between">
            <span>Cashier:</span>
            <span>{cashierUsername}</span>
          </div>
        </div>

        <div className="mb-2">
          <p className="font-medium text-slate-700 mb-1 text-[10px] md:text-xs uppercase tracking-wide">Original Sale Details:</p>
          <div className="border-b border-dashed border-slate-300 pb-2 mb-2 space-y-1 text-[10px] md:text-xs">
            <div className="flex justify-between">
              <span>Sale ID:</span>
              <span>#{originalSale.id}</span>
            </div>
            <div className="flex justify-between">
              <span>Date:</span>
              <span>{format(originalSale.date, 'dd/MM/yyyy HH:mm')}</span>
            </div>
            <div className="flex justify-between">
              <span>Amount:</span>
              <span>₦{originalSale.finalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        <div className="mb-2">
          <p className="font-medium text-slate-700 mb-1 text-[10px] md:text-xs uppercase tracking-wide">Returned Items:</p>
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="pb-1">Item</th>
                <th className="pb-1 text-right border-r border-dashed border-slate-300 pr-2">Qty</th>
                <th className="pb-1 text-right border-r border-dashed border-slate-300 pr-2">Price</th>
                <th className="pb-1 text-right">Refund</th>
              </tr>
            </thead>
            <tbody>
              {itemsToDisplay.map((item, i) => (
                <tr key={i}>
                  <td className="pt-1 pr-1">{item.productName} ({item.restockStatus})</td>
                  <td className="pt-1 text-right border-r border-dashed border-slate-300 pr-2">{item.returnedQuantity}</td>
                  <td className="pt-1 text-right border-r border-dashed border-slate-300 pr-2">₦{item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="pt-1 text-right">₦{(item.returnedQuantity * item.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-dashed border-slate-300 pt-2 space-y-1 mb-4">
          <div className="flex justify-between text-[10px] md:text-xs">
            <span>Return Reason:</span>
            <span>{returnReason}</span>
          </div>
          <div className="flex justify-between text-[10px] md:text-xs">
            <span>Refund Method:</span>
            <span>{refundMethod}</span>
          </div>
          <div className="flex justify-between font-bold text-base md:text-lg mt-2">
            <span>TOTAL REFUND</span>
            <span>₦{totalRefundAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        <div className="text-center text-[10px] md:text-xs text-slate-500 mt-6">
          <p>Mun gode da kasuwancin ku!</p>
          <p>Thank you for your business!</p>
        </div>
      </div>
    );
  }
);

export default ReturnReceiptDisplay;