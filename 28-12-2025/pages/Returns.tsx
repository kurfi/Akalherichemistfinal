import React, { useState, useEffect, useRef } from 'react'; // Added useRef
import { db, addReturn, addReturnedItem, updateProduct, updateCustomer } from '../db/db';
import { Sale, SaleItem, ReturnedItem, PaymentMethod, Product, Customer, ReturnReason } from '../types';
import { Search, RotateCcw, DollarSign, Package, AlertCircle, X, CheckCircle, Save, ChevronRight, ChevronLeft, Printer, Download, Image as ImageIcon } from 'lucide-react'; // Added Printer, Download, ImageIcon
import { format } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../auth/AuthContext';
import ReturnReceiptDisplay from '../components/ReturnReceiptDisplay'; // Import ReturnReceiptDisplay
import { generateAndSavePdfFromHtml, saveElementAsImage } from '../services/pdfService'; // Import pdfService functions

const Returns: React.FC = () => {
  const [step, setStep] = useState(1); // 1: Search Sale, 2: Select Items, 3: Refund Method/Reason, 4: Review, 5: Print Receipt
  const [searchQuery, setSearchQuery] = useState(''); // Unified search query
  const [originalSale, setOriginalSale] = useState<Sale | null>(null);
  const [returnableItems, setReturnableItems] = useState<
    (SaleItem & { returnedQuantity: number; restockStatus: 'restocked' | 'damaged'; reason: ReturnReason | string })[]
  >([]);
  const [totalRefundAmount, setTotalRefundAmount] = useState(0);
  const [returnReason, setReturnReason] = useState<ReturnReason | string>(ReturnReason.OTHER); // Default to Other
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [returnId, setReturnId] = useState<number | null>(null); // New state for newly created return ID
  const receiptRef = useRef<HTMLDivElement>(null); // Ref for the receipt component
  const { currentUser } = useAuth(); // Get current user for staffId

  const { showToast } = useToast();

  // Fetch customer details if sale has customerId
  useEffect(() => {
    if (originalSale?.customerId) {
      db.customers.get(originalSale.customerId).then(setCustomer);
    } else {
      setCustomer(null);
    }
  }, [originalSale?.customerId]);

  const handleSearchSale = async () => {
    if (!searchQuery) {
      showToast('Please enter a Sale ID, Customer Name, or Invoice Number', 'info');
      return;
    }
    try {
      let sale: Sale | undefined;

      // Try searching by Sale ID
      const id = parseInt(searchQuery);
      if (!isNaN(id)) {
        sale = await db.sales.get(id);
      }
      
      // If not found by ID, try by invoiceNumber (if provided)
      if (!sale) {
        sale = await db.sales.where('invoiceNumber').equalsIgnoreCase(searchQuery).first();
      }

      // If not found, try by customer name (partial match)
      if (!sale) {
          const salesByCustomer = await db.sales
              .where('customerName').startsWithIgnoreCase(searchQuery)
              .sortBy('date');
          // For simplicity, take the latest sale. In a real app, you might show a list.
          if (salesByCustomer.length > 0) sale = salesByCustomer[salesByCustomer.length - 1];
      }
      
      if (sale) {
        setOriginalSale(sale);
        setReturnableItems(
          sale.items.map((item) => ({
            ...item,
            returnedQuantity: 0, // This is the quantity the user WANTS to return in THIS transaction
            restockStatus: 'damaged', // Default to damaged to force selection
            reason: ReturnReason.OTHER, // Default to other reason
            // The item.returnedQuantity from originalSale.items will be used to calculate maxReturnable
          }))
        );
        setTotalRefundAmount(0);
        setStep(2); // Advance to Select Items step
        showToast(`Sale #${sale.id} found.`, 'success');
      } else {
        setOriginalSale(null);
        setReturnableItems([]);
        setStep(1); // Stay on search step
        showToast('Sale not found', 'error');
      }
    } catch (error) {
      console.error('Error fetching sale:', error);
      showToast('Error searching for sale', 'error');
    }
  };

  const handleQuantityChange = (
    productId: number,
    newQuantity: number,
    originalSaleItem: SaleItem
  ) => {
    setReturnableItems((prevItems) => {
      const updatedItems = prevItems.map((item) => {
        if (item.productId === productId) {
          const alreadyReturned = originalSaleItem.returnedQuantity || 0; // Quantity already returned from previous transactions
          const maxReturnable = originalSaleItem.quantity - alreadyReturned; // Max quantity that can be returned in THIS transaction
          const quantity = Math.max(0, Math.min(newQuantity, maxReturnable));
          return { ...item, returnedQuantity: quantity };
        }
        return item;
      });
      calculateRefund(updatedItems);
      return updatedItems;
    });
  };

  const calculateRefund = (items: typeof returnableItems) => {
    if (!originalSale) return;
    
    const totalSaleAmount = originalSale.totalAmount; // Subtotal before discount
    const totalSaleDiscount = originalSale.discount;
    
    const refund = items.reduce((sum, item) => {
        const itemTotal = item.returnedQuantity * item.price;
        
        // Calculate pro-rated discount for this item
        // Discount Share = (ItemTotal / TotalSaleAmount) * TotalDiscount
        const discountShare = totalSaleAmount > 0 
            ? (itemTotal / totalSaleAmount) * totalSaleDiscount 
            : 0;
            
        return sum + (itemTotal - discountShare);
    }, 0);
    
    setTotalRefundAmount(refund);
  };

  const handleRestockStatusChange = (
    productId: number,
    status: 'restocked' | 'damaged'
  ) => {
    setReturnableItems((prevItems) =>
      prevItems.map((item) =>
        item.productId === productId ? { ...item, restockStatus: status } : item
      )
    );
  };
  
  // Handle "Return All Items" for the current sale
  const handleReturnAllItems = () => {
    if (!originalSale) return;
    const updatedItems = originalSale.items.map(item => ({
      ...item,
      returnedQuantity: item.quantity,
      restockStatus: 'restocked', // Default for 'Return All', can be adjusted by user
      reason: ReturnReason.OTHER,
    }));
    setReturnableItems(updatedItems);
    calculateRefund(updatedItems);
  };

  // Handle "Return All of This Item"
  const handleReturnAllOfThisItem = (productId: number) => {
    setReturnableItems(prevItems => {
      const updatedItems = prevItems.map(item => {
        if (item.productId === productId) {
          return {
            ...item,
            returnedQuantity: item.quantity,
            restockStatus: 'restocked', // Default, can be adjusted
            reason: ReturnReason.OTHER,
          };
        }
        return item;
      });
      calculateRefund(updatedItems);
      return updatedItems;
    });
  };

  const handleProcessReturn = async () => {
    if (!originalSale || returnableItems.every((item) => item.returnedQuantity === 0)) {
      showToast('No items selected for return.', 'info');
      return;
    }
    if (!returnReason || returnReason === '') {
        showToast('Please provide a reason for the return.', 'info');
        return;
    }

    // Validation for restockStatus if quantity > 0
    const itemsToReturn = returnableItems.filter(item => item.returnedQuantity > 0);
    for (const item of itemsToReturn) {
        if (item.restockStatus !== 'restocked' && item.restockStatus !== 'damaged') {
            showToast(`Please specify restock status for ${item.productName}.`, 'info');
            return;
        }
    }

    try {
      await db.transaction(
        'rw',
        db.sales,
        db.batches,
        db.products,
        db.returns,
        db.returnedItems,
        db.customers,
        async () => {
          // 1. Add Return Entry
          const staffId = currentUser?.id || 0; // Use current user's ID
          const returnEntry: Omit<Return, 'id'> = {
            saleId: originalSale.id!,
            customerId: originalSale.customerId,
            customerName: originalSale.customerName,
            staffId: staffId, // Include staffId
            returnDate: new Date(),
            totalRefundAmount: totalRefundAmount,
            reason: returnReason as ReturnReason, // Cast to ReturnReason enum
            paymentMethod: refundMethod,
            notes: '', // Optional: Add a field for additional notes
          };
          const returnId = await addReturn(returnEntry);
          setReturnId(returnId); // Store the newly created return ID in state

          // 2. Add Returned Items and Adjust Inventory
          for (const item of itemsToReturn) {
              const product = await db.products.get(item.productId);
              
              // Determine Cost Price for Value Lost Calculation
              // Priority 1: Use costPrice from the original sale item (most accurate as it reflects the cost at time of sale)
              // Priority 2: Average cost from current batches
              // Priority 3: Fallback to 0 (or product.price if absolutely necessary, but 0 is safer for "Lost Cost")
              
              let actualCostPrice = item.costPrice;

              if (!actualCostPrice) {
                 const batches = await db.batches.where('productId').equals(item.productId).toArray();
                 if (batches.length > 0) {
                     const totalCost = batches.reduce((sum, b) => sum + (b.costPrice * b.quantity), 0);
                     const totalQty = batches.reduce((sum, b) => sum + b.quantity, 0);
                     actualCostPrice = totalQty > 0 ? totalCost / totalQty : batches[0].costPrice;
                 } else {
                     actualCostPrice = 0; // Unknown cost
                 }
              }

              const valueLost = item.restockStatus === 'damaged' ? item.returnedQuantity * actualCostPrice : 0;

              // Add to returnedItems table
              await addReturnedItem({
                returnId: returnId,
                productId: item.productId,
                productName: item.productName,
                quantity: item.returnedQuantity,
                price: item.price,
                refundAmount: item.returnedQuantity * item.price,
                restockStatus: item.restockStatus as 'restocked' | 'damaged', // Ensure correct type
                valueLost: valueLost, // Include valueLost
              });

              // Adjust product inventory (by updating batch quantities)
              if (item.restockStatus === 'restocked') {
                if (product) {
                    let remainingToRestock = item.returnedQuantity;
                    // Find batches for the product, ideally oldest first to match FIFO
                    const batches = await db.batches
                        .where('productId').equals(product.id!)
                        .sortBy('expiryDate'); // Sort by expiryDate or creationDate

                    // Try to add to an existing batch that isn't expired yet
                    let restockedToExistingBatch = false;
                    for (const batch of batches) {
                        if (batch.expiryDate > new Date()) { // Only restock to unexpired batches
                            await db.batches.update(batch.id!, { quantity: batch.quantity + remainingToRestock });
                            restockedToExistingBatch = true;
                            break;
                        }
                        // If there are multiple batches and this one expires soon, perhaps create a new batch?
                        // For now, simplicity: add to first available, or create new.
                    }

                    if (!restockedToExistingBatch) {
                        // If no suitable batch, create a new batch with a generic batch number for returned items
                        await db.batches.add({
                            productId: product.id!,
                            batchNumber: `RET-${format(new Date(), 'yyyyMMddHHmmss')}`,
                            expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)), // Default 1 year shelf life
                            quantity: remainingToRestock,
                            costPrice: actualCostPrice, // Use the determined actual cost price
                            sellingPrice: product.price,
                        });
                    }
                }
              }
            
          }

          // 3. Adjust Customer Debt
          // Logic: If original sale was on CREDIT, the return should reduce the customer's outstanding debt.
          // We do this regardless of the selected "Refund Method" in the UI, assuming the return implies a reversal of the credit transaction.
          if (
            originalSale.paymentMethod === PaymentMethod.CREDIT &&
            originalSale.customerId &&
            customer
          ) {
            const newDebt = customer.currentDebt - totalRefundAmount;
            await updateCustomer(customer.id!, {
              currentDebt: Math.max(0, newDebt),
            });
          }

          // 4. Update the original sale record with new returned quantities for its items
          const updatedSaleItems: SaleItem[] = originalSale.items.map(saleItem => {
              const returnedItemInThisTransaction = itemsToReturn.find(rtnItem => rtnItem.productId === saleItem.productId);
              if (returnedItemInThisTransaction) {
                  return {
                      ...saleItem,
                      returnedQuantity: (saleItem.returnedQuantity || 0) + returnedItemInThisTransaction.returnedQuantity
                  };
              }
              return saleItem;
          });
          await db.sales.update(originalSale.id!, { items: updatedSaleItems });
        }
      );

      showToast(`Return processed successfully! Refund: ₦${totalRefundAmount.toLocaleString()}`, 'success');
      // originalSale, returnableItems, totalRefundAmount, returnReason, refundMethod, customer will be retained for receipt printing
      setStep(5); // Advance to Print Return Receipt step
    } catch (error) {
      console.error('Error processing return:', error);
      showToast('Failed to process return. See console for details.', 'error');
    }
  };

  // Helper for resetting to initial state for a new return
  const startNewReturn = () => {
    setStep(1);
    setSearchQuery('');
    setOriginalSale(null);
    setReturnableItems([]);
    setTotalRefundAmount(0);
    setReturnReason(ReturnReason.OTHER);
    setRefundMethod(PaymentMethod.CASH);
    setCustomer(null);
    setReturnId(null); // Clear returnId on new return
  }

  // Handle Download PDF for Return Receipt
  const handleDownloadReturnPdf = async () => {
    if (!receiptRef.current || !originalSale) {
      showToast("Return receipt content is not available to save as PDF.", 'error');
      return;
    }
    const defaultFileName = `return-receipt-${returnId}-${format(new Date(), 'yyyyMMdd')}.pdf`;
    receiptRef.current.classList.add('bg-white'); // Temporarily add a white background
    try {
      await generateAndSavePdfFromHtml(receiptRef.current, defaultFileName);
      showToast('Return receipt PDF saved successfully!', 'success');
    } catch (error) {
      console.error("Return receipt PDF download failed:", error);
      showToast('Failed to save Return receipt PDF.', 'error');
    } finally {
      receiptRef.current.classList.remove('bg-white');
    }
  };

  // Handle Download Image for Return Receipt
  const handleDownloadReturnImage = async () => {
    if (!receiptRef.current || !originalSale) {
      showToast("Return receipt content is not available to save as an image.", 'error');
      return;
    }
    const defaultFileName = `return-receipt-${returnId}-${format(new Date(), 'yyyyMMdd')}.png`;
    receiptRef.current.classList.add('bg-white'); // Temporarily add a white background
    try {
      await saveElementAsImage(receiptRef.current, defaultFileName);
      showToast('Return receipt image saved successfully!', 'success');
    } catch (error) {
      console.error("Return receipt image download failed:", error);
      showToast('Failed to save Return receipt image.', 'error');
    } finally {
      receiptRef.current.classList.remove('bg-white');
    }
  };

  // Handle Print for Return Receipt
  const handlePrintReturnReceipt = () => {
    if (!receiptRef.current) {
        showToast("Return receipt content not found for printing.", 'error');
        return;
    }

    const printWindow = window.open('', '', 'height=600,width=800');
    if (printWindow) {
        printWindow.document.write('<html><head><title>Return Receipt</title>');
        // Inject current styles (tailwind, print.css)
        const styles = document.querySelectorAll('link[rel="stylesheet"], style');
        styles.forEach(style => {
            printWindow.document.write(style.outerHTML);
        });
        printWindow.document.write('</head><body>');
        // Manually copy the content, excluding the download/print buttons if any were inside the ref
        printWindow.document.write('<div style="width: 80mm; margin: auto; padding: 10px;">'); // Basic styling for fixed width
        printWindow.document.write(receiptRef.current.innerHTML);
        printWindow.document.write('</div></body></html>');
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        printWindow.close();
        showToast('Printing return receipt...', 'info');
    } else {
        showToast('Failed to open print window. Please allow pop-ups.', 'error');
    }
  };


  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Process Returns</h1>

      {/* Step 1: Search Sale */}
      {step === 1 && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-700 mb-4">Find Original Sale</h2>
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Enter Sale ID, Customer Name, or Invoice Number"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') handleSearchSale();
                }}
              />
            </div>
            <button
              onClick={handleSearchSale}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
            >
              <Search className="w-4 h-4" /> Search
            </button>
          </div>
          <p className="mt-4 text-sm text-slate-500">You can also search by customer name, invoice number, or date range (future implementation).</p>
        </div>
      )}

      {/* Step 2: Select Items */}
      {step === 2 && originalSale && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-700 mb-4">Sale Details & Select Items for Return</h2>

          {/* Sale Info Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 text-sm text-slate-700">
            <div>
              <p><strong>Sale ID:</strong> #{originalSale.id}</p>
              <p><strong>Invoice No:</strong> {originalSale.invoiceNumber || 'N/A'}</p>
              <p><strong>Date:</strong> {format(originalSale.date, 'MMM dd, yyyy HH:mm')}</p>
            </div>
            <div>
              <p><strong>Customer:</strong> {originalSale.customerName || 'Walk-in Customer'}</p>
              <p><strong>Payment Method:</strong> {originalSale.paymentMethod}</p>
              <p><strong>Cashier:</strong> {currentUser?.username || 'N/A'}</p>
            </div>
            <div className="text-right md:text-left">
              <p><strong>Original Amount:</strong> ₦{originalSale.totalAmount.toLocaleString()}</p>
              <p><strong>Discount:</strong> ₦{originalSale.discount.toLocaleString()}</p>
              <p className="text-lg font-bold"><strong>Final Amount:</strong> ₦{originalSale.finalAmount.toLocaleString()}</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={handleReturnAllItems}
              className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <RotateCcw className="w-4 h-4" /> Return All Items
            </button>
          </div>

          {/* Returnable Items Table */}
          <div className="overflow-x-auto overflow-y-hidden mb-6">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 hidden md:table-header-group">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase tracking-wider">Product</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase tracking-wider">Max Returnable</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase tracking-wider">Price</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase tracking-wider">Return Qty</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase tracking-wider">Refund</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {returnableItems.map((item) => {
                  const originalSoldItem = originalSale.items.find(saleItem => saleItem.productId === item.productId);
                  const alreadyReturned = originalSoldItem?.returnedQuantity || 0;
                  const maxReturnable = item.quantity - alreadyReturned;
                  return (
                    <React.Fragment key={item.productId}>
                      {/* Desktop Row */}
                      <tr className="hidden md:table-row">
                        <td className="px-3 py-2 whitespace-nowrap">{item.productName}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{maxReturnable}</td>
                        <td className="px-3 py-2 whitespace-nowrap">₦{item.price.toLocaleString()}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <input
                            type="number"
                            min="0"
                            max={maxReturnable}
                            value={item.returnedQuantity}
                            onChange={(e) =>
                              handleQuantityChange(
                                item.productId,
                                parseInt(e.target.value),
                                originalSoldItem || item
                              )
                            }
                            className="w-20 border border-slate-300 rounded-md p-1 text-center"
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <select
                            value={item.restockStatus}
                            onChange={(e) =>
                              handleRestockStatusChange(
                                item.productId,
                                e.target.value as 'restocked' | 'damaged'
                              )
                            }
                            className="border border-slate-300 rounded-md p-1"
                          >
                            <option value="restocked">Restock</option>
                            <option value="damaged">Damaged</option>
                          </select>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          ₦{(item.returnedQuantity * item.price).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                            <button
                              onClick={() => handleReturnAllOfThisItem(item.productId)}
                              className="text-xs text-blue-600 hover:underline"
                              disabled={maxReturnable <= 0}
                            >
                              Return All
                            </button>
                        </td>
                      </tr>

                      {/* Mobile Card */}
                      <tr className="md:hidden">
                        <td colSpan={7} className="px-0 py-4">
                          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
                            <div className="flex justify-between items-start">
                              <span className="font-bold text-slate-800">{item.productName}</span>
                              <span className="text-xs font-medium bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                                ₦{item.price.toLocaleString()} / unit
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-[10px] uppercase text-slate-500 font-bold">Return Qty</label>
                                <div className="flex items-center gap-2 mt-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max={maxReturnable}
                                    value={item.returnedQuantity}
                                    onChange={(e) =>
                                      handleQuantityChange(
                                        item.productId,
                                        parseInt(e.target.value),
                                        originalSoldItem || item
                                      )
                                    }
                                    className="w-full border border-slate-300 rounded-md p-2 text-center bg-white"
                                  />
                                  <button
                                    onClick={() => handleReturnAllOfThisItem(item.productId)}
                                    className="text-[10px] bg-blue-100 text-blue-700 px-2 py-2 rounded font-bold uppercase whitespace-nowrap"
                                    disabled={maxReturnable <= 0}
                                  >
                                    Max
                                  </button>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1">Max: {maxReturnable} available</p>
                              </div>

                              <div>
                                <label className="text-[10px] uppercase text-slate-500 font-bold">Status</label>
                                <select
                                  value={item.restockStatus}
                                  onChange={(e) =>
                                    handleRestockStatusChange(
                                      item.productId,
                                      e.target.value as 'restocked' | 'damaged'
                                    )
                                  }
                                  className="w-full mt-1 border border-slate-300 rounded-md p-2 bg-white text-sm"
                                >
                                  <option value="restocked">Restock</option>
                                  <option value="damaged">Damaged</option>
                                </select>
                              </div>
                            </div>

                            <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                              <span className="text-xs text-slate-500 italic">Subtotal Refund:</span>
                              <span className="font-bold text-indigo-600">₦{(item.returnedQuantity * item.price).toLocaleString()}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between mt-6">
            <button
              onClick={() => startNewReturn()}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-4 h-4 inline-block mr-2" /> Cancel
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={returnableItems.every((item) => item.returnedQuantity === 0)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Choose Refund Method & Reason */}
      {step === 3 && originalSale && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-700 mb-4">Refund Details</h2>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-4 mb-4">
            <label htmlFor="returnReason" className="block text-sm font-medium text-slate-700 min-w-[120px]">Reason for Return:</label>
            <select
              id="returnReason"
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value as ReturnReason)}
              className="flex-1 border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none max-w-sm"
            >
              {Object.values(ReturnReason).map((reason) => (
                <option key={reason} value={reason}>{reason}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <label htmlFor="refundMethod" className="block text-sm font-medium text-slate-700 min-w-[120px]">Refund Method:</label>
            <select
              id="refundMethod"
              value={refundMethod}
              onChange={(e) => setRefundMethod(e.target.value as PaymentMethod)}
              className="flex-1 border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none max-w-sm"
            >
              <option value={PaymentMethod.CASH}>Cash</option>
              <option value={PaymentMethod.STORE_CREDIT}>Store Credit</option>
              <option value={PaymentMethod.CARD}>POS Reversal / Card</option>
              <option value={PaymentMethod.TRANSFER}>Bank Transfer</option>
            </select>
          </div>

          <div className="flex justify-between items-center mt-6 p-4 bg-indigo-50 rounded-lg">
            <h3 className="text-xl font-bold text-indigo-700">Total Refund:</h3>
            <span className="text-3xl font-extrabold text-indigo-800">₦{totalRefundAmount.toLocaleString()}</span>
          </div>

          <div className="flex justify-between mt-6">
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={() => setStep(4)}
              disabled={!returnReason || totalRefundAmount === 0}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Review & Confirm */}
      {step === 4 && originalSale && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-700 mb-4">Review & Confirm Return</h2>
          
          {/* Sale Info Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 text-sm text-slate-700 border-b pb-4">
            <div>
              <p><strong>Sale ID:</strong> #{originalSale.id}</p>
              <p><strong>Invoice No:</strong> {originalSale.invoiceNumber || 'N/A'}</p>
              <p><strong>Date:</strong> {format(originalSale.date, 'MMM dd, yyyy HH:mm')}</p>
            </div>
            <div>
              <p><strong>Customer:</strong> {originalSale.customerName || 'Walk-in Customer'}</p>
              <p><strong>Original Payment:</strong> {originalSale.paymentMethod}</p>
              <p><strong>Cashier:</strong> {currentUser?.username || 'N/A'}</p>
            </div>
            <div className="text-right md:text-left">
              <p><strong>Refund Method:</strong> {refundMethod}</p>
              <p><strong>Return Reason:</strong> {returnReason}</p>
            </div>
          </div>

          {/* Items to be Returned */}
          <div className="overflow-x-auto overflow-y-hidden mb-6">
            <h3 className="font-medium text-slate-700 mb-2">Items to Return:</h3>
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 hidden md:table-header-group">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase tracking-wider">Product</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase tracking-wider">Return Qty</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500 uppercase tracking-wider">Refund</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {returnableItems.filter(item => item.returnedQuantity > 0).map((item) => (
                  <React.Fragment key={item.productId}>
                    {/* Desktop Row */}
                    <tr className="hidden md:table-row">
                      <td className="px-3 py-2 whitespace-nowrap">{item.productName}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{item.returnedQuantity}</td>
                      <td className="px-3 py-2 whitespace-nowrap capitalize">{item.restockStatus}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        ₦{(item.returnedQuantity * item.price).toLocaleString()}
                      </td>
                    </tr>

                    {/* Mobile Card */}
                    <tr className="md:hidden">
                      <td colSpan={4} className="px-0 py-2">
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex justify-between items-center">
                          <div>
                            <p className="font-bold text-slate-800 text-sm">{item.productName}</p>
                            <p className="text-xs text-slate-500">{item.returnedQuantity} units • <span className="capitalize">{item.restockStatus}</span></p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-indigo-600">₦{(item.returnedQuantity * item.price).toLocaleString()}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center mt-6 p-4 bg-indigo-50 rounded-lg">
            <h3 className="text-xl font-bold text-indigo-700">Total Refund:</h3>
            <span className="text-3xl font-extrabold text-indigo-800">₦{totalRefundAmount.toLocaleString()}</span>
          </div>

          <div className="flex justify-between mt-6">
            <button
              onClick={() => setStep(3)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={handleProcessReturn}
              className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2 text-lg font-semibold"
            >
              <RotateCcw className="w-5 h-5" /> Confirm & Process Return
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Print Return Receipt */}
      {step === 5 && originalSale && ( // Ensure originalSale is available for receipt
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 text-center">
          <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Return Processed!</h2>
          <p className="text-slate-600 mb-6">Refund of ₦{totalRefundAmount.toLocaleString()} completed successfully.</p>
          
          <div className="mb-6">
            <ReturnReceiptDisplay
              ref={receiptRef}
              originalSale={originalSale}
              returnItems={returnableItems}
              totalRefundAmount={totalRefundAmount}
              returnReason={returnReason}
              refundMethod={refundMethod}
              customer={customer}
              cashierUsername={currentUser?.username || 'N/A'}
              returnDate={new Date()} // Use current date for return receipt
              returnId={returnId}
            />
          </div>

          <div className="flex justify-center gap-3 mt-6">
            <button
                onClick={handleDownloadReturnPdf}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
                <Download className="w-4 h-4" /> Save PDF
            </button>
            <button
                onClick={handleDownloadReturnImage}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
                <ImageIcon className="w-4 h-4" /> Save Image
            </button>
          </div>

          <button
            onClick={startNewReturn}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 mx-auto text-lg font-semibold mt-6"
          >
            <RotateCcw className="w-5 h-5" /> Start New Return
          </button>
        </div>
      )}

      {/* Fallback for when no sale is found and search was performed */}
      {step === 1 && searchQuery && !originalSale && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 text-center text-slate-500">
          <p>No sale found matching "{searchQuery}". Please try again.</p>
        </div>
      )}
    </div>
  );
};

export default Returns;