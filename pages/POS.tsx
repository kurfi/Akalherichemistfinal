import * as React from 'react';
import { useState, useRef } from 'react';
import { db, logAudit } from '../db/db';
import { Product, Customer, SaleItem, SaleStatus, PaymentMethod, Sale } from '../types';
import { Search, Plus, Minus, User, CreditCard, ShoppingCart, Smartphone, FileText, Banknote, X, History, Clock, PauseCircle, RotateCcw, Trash2, Receipt, Printer, Download, Layers, Image } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { savePdf, saveElementAsImage, generateAndSavePdfFromHtml } from '../services/pdfService';
import { generateReceiptBuffer, printRawReceipt } from '../services/printerService';
import { usePrintReceipt, PrintReceiptButton } from '../components/PrintReceipt'; // Import the new hook and component
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../auth/AuthContext';
import '../print.css';

export default function POS() {
    const { currentUser } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');
    const [historySearchQuery, setHistorySearchQuery] = useState('');
    const [cart, setCart] = useState<SaleItem[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isCartOpen, setIsCartOpen] = useState(false); // Mobile drawer state
    const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
    const receiptRef = useRef<HTMLDivElement>(null);
    const [isMultipayOpen, setIsMultipayOpen] = useState(false);
    const [multipayEntries, setMultipayEntries] = useState<{ method: PaymentMethod; amount: string }[]>([]);
    const [paperSize, setPaperSize] = useState<'80mm' | '58mm'>('80mm');
    const [discount, setDiscount] = useState<number>(0);
    const { showToast } = useToast(); // Initialize useToast

    // Custom hook for printing
    const { printReceipt, isPrinting: isPrintingWebview } = usePrintReceipt();


    // State for Right Panel Navigation: 'cart' | 'history' | 'held'
    const [activePanel, setActivePanel] = useState<'cart' | 'history' | 'held'>('cart');

    // Tab State: 'cart' | 'held' | 'history'
    const [activeTab, setActiveTab] = useState<'cart' | 'held' | 'history'>('cart');

    // Queries
    const productsWithStock = useLiveQuery(async () => {
        const prods = searchQuery.length === 0
            ? await db.products.toArray()
            : await db.products
                .where('name').startsWithIgnoreCase(searchQuery)
                .or('barcode').equals(searchQuery)
                .toArray();

        const allBatches = await db.batches.toArray();
        const now = new Date();

        return prods.map(p => {
            const pBatches = allBatches.filter(b => b.productId === p.id);
            const totalStock = pBatches.reduce((sum, b) => sum + b.quantity, 0);
            const validStock = pBatches
                .filter(b => new Date(b.expiryDate) > now)
                .reduce((sum, b) => sum + b.quantity, 0);

            return {
                ...p,
                totalStock,
                validStock,
                isOutOfStock: validStock <= 0,
                hasExpiredStock: (totalStock > 0 && validStock === 0)
            };
        });
    }, [searchQuery]);

    const customers = useLiveQuery(() =>
        db.customers.filter(c => c.name !== 'Walk-in Customer').toArray()
    );

    // Fetch recent completed sales for History Tab
    const recentSales = useLiveQuery(async () => {
        if (!historySearchQuery) {
            return await db.sales.where('status').equals(SaleStatus.COMPLETED).reverse().limit(50).toArray();
        }
        const q = historySearchQuery.toLowerCase();
        return await db.sales
            .where('status').equals(SaleStatus.COMPLETED)
            .filter(sale =>
                (sale.customerName || '').toLowerCase().includes(q) ||
                (sale.id?.toString() || '').includes(q)
            )
            .reverse()
            .limit(50)
            .toArray();
    }, [historySearchQuery]);

    // Fetch held sales
    const heldSales = useLiveQuery(() =>
        db.sales.where('status').equals(SaleStatus.HELD).reverse().toArray()
    );

    const cartItemCount = cart.reduce((acc, item) => acc + item.quantity, 0);

    // Cart Logic
    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(item => item.productId === product.id);
            if (existing) {
                return prev.map(item =>
                    item.productId === product.id
                        ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.price }
                        : item
                );
            }
            return [...prev, {
                productId: product.id!,
                productName: product.name,
                quantity: 1,
                price: product.price,
                total: product.price
            }];
        });
    };

    const updateQuantity = (productId: number, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.productId === productId) {
                const newQty = Math.max(1, item.quantity + delta);
                return { ...item, quantity: newQty, total: newQty * item.price };
            }
            return item;
        }));
    };

    const removeFromCart = (productId: number) => {
        setCart(prev => prev.filter(item => item.productId !== productId));
    };

    const calculateTotal = () => cart.reduce((sum, item) => sum + item.total, 0);

    // Hold Sale Logic
    const handleHoldSale = async () => {
        if (cart.length === 0) return;
        try {
            const total = calculateTotal();
            await db.sales.add({
                customerId: selectedCustomer?.id,
                customerName: selectedCustomer?.name || 'Walk-in',
                date: new Date(),
                totalAmount: total,
                discount: discount,
                finalAmount: Math.max(0, total - discount),
                paymentMethod: PaymentMethod.CASH, // Default placeholder
                status: SaleStatus.HELD,
                items: cart
            });
            setCart([]);
            setDiscount(0);
            setSelectedCustomer(null);
            setActiveTab('held'); // Switch to held tab to show it worked
        } catch (error) {
            console.error(error);
            alert("Failed to hold sale.");
        }
    };

    // Resume Held Sale
    const handleResumeSale = async (sale: Sale) => {
        setCart(sale.items);
        setDiscount(sale.discount || 0);
        if (sale.customerId) {
            const cust = await db.customers.get(sale.customerId);
            setSelectedCustomer(cust || null);
        } else {
            setSelectedCustomer(null);
        }
        if (sale.id) await db.sales.delete(sale.id);
        setActiveTab('cart'); // Switch back to cart
    };

    const handleCheckout = async (method: PaymentMethod, multipayEntries: { method: PaymentMethod; amount: string }[] = []) => {
        if (cart.length === 0) return;

        if (method === PaymentMethod.CREDIT && !selectedCustomer) {
            alert("Please select a registered customer to record a debt sale.");
            return;
        }

        try {
            let saleId: number | undefined;
            const totalAmount = calculateTotal();
            const finalAmount = Math.max(0, totalAmount - discount);

            await (db as any).transaction('rw', db.sales, db.batches, db.products, db.customers, async () => {
                const finalItems: SaleItem[] = [];

                // 1. Stock Check & COGS Calculation & Deduction (FIFO)
                const now = new Date();
                for (const item of cart) {
                    const allBatches = await db.batches.where('productId').equals(item.productId).sortBy('expiryDate');
                    const validBatches = allBatches.filter(b => new Date(b.expiryDate) > now);

                    const totalValidAvailable = validBatches.reduce((sum, b) => sum + b.quantity, 0);
                    if (totalValidAvailable < item.quantity) {
                        throw new Error(`Insufficient valid (unexpired) stock for ${item.productName}`);
                    }

                    let remainingQtyToDeduct = item.quantity;
                    let totalItemCost = 0;

                    // Deduct from valid batches and calculate cost
                    for (const batch of validBatches) {
                        if (remainingQtyToDeduct <= 0) break;

                        const deduct = Math.min(batch.quantity, remainingQtyToDeduct);

                        if (deduct > 0) {
                            // Calculate cost portion
                            totalItemCost += deduct * batch.costPrice;

                            // Update batch
                            await db.batches.update(batch.id!, { quantity: batch.quantity - deduct });
                            remainingQtyToDeduct -= deduct;
                        }
                    }

                    // Calculate weighted average cost per unit
                    // If quantity is 0 (shouldn't happen due to cart logic), avoid NaN
                    const averageCostPrice = item.quantity > 0 ? totalItemCost / item.quantity : 0;

                    finalItems.push({
                        ...item,
                        costPrice: averageCostPrice
                    });
                }

                const saleData: Omit<Sale, 'id'> = {
                    customerId: selectedCustomer?.id,
                    customerName: selectedCustomer?.name || 'Walk-in',
                    date: new Date(),
                    totalAmount: totalAmount,
                    discount: discount,
                    finalAmount: finalAmount,
                    paymentMethod: method,
                    status: SaleStatus.COMPLETED,
                    items: finalItems // Use items with costPrice
                };

                if (method === PaymentMethod.MULTIPAY) {
                    saleData.paymentMethods = multipayEntries.map(e => ({ ...e, amount: parseFloat(e.amount) }));
                }

                const newSaleId = await db.sales.add(saleData as Sale);
                saleId = newSaleId;

                // 2. Debt Update
                if (method === PaymentMethod.CREDIT && selectedCustomer?.id) {
                    const customer = await db.customers.get(selectedCustomer.id);
                    if (customer) {
                        const currentDebt = customer.currentDebt || 0;
                        await db.customers.update(customer.id!, { 
                            currentDebt: currentDebt + finalAmount,
                            updated_at: new Date().toISOString()
                        });
                    }
                }
            });

            // Log Audit outside transaction (to treat it as a side effect, or if db transaction included it, inside)
            // Since db transaction above doesn't include auditLogs, we do it here.
            if (saleId) {
                const sale = await db.sales.get(saleId);
                setReceiptSale(sale || null);

                await logAudit(
                    'SALE_COMPLETED',
                    `Sale #${saleId} completed. Amount: ₦${finalAmount}`,
                    currentUser?.username || 'Unknown'
                );
            }

            setCart([]);
            setDiscount(0);
            setIsPaymentModalOpen(false);
            setSelectedCustomer(null);
            setIsCartOpen(false);
            setIsMultipayOpen(false);
            setMultipayEntries([]);
            // alert('Sale Completed Successfully!'); // Removed to show receipt
        } catch (error: any) {
            console.error(error);
            alert(error.message || 'Transaction failed.');
        }
    };

    const handlePrintReceipt = async () => {
        await printReceipt();
    };

    const handlePrintRaw = async () => {
        if (!receiptSale) return;
        try {
            const buffer = generateReceiptBuffer(receiptSale);
            await printRawReceipt(buffer);
        } catch (error) {
            console.error("Raw print failed:", error);
            showToast("Failed to generate raw print data.", 'error');
        }
    };

    const handleDownloadImage = async () => {
        if (!receiptRef.current || !receiptSale) {
            showToast("Receipt content is not available to save as an image.", 'error');
            return;
        }
        const defaultFileName = `receipt-${receiptSale.id}-${format(new Date(), 'yyyyMMdd')}.png`;
        receiptRef.current.classList.add('bg-white');
        try {
            await saveElementAsImage(receiptRef.current, defaultFileName);
            showToast('Receipt image saved successfully!', 'success');
        } catch (error) {
            console.error("Receipt image download failed:", error);
            showToast('Failed to save receipt image.', 'error');
        } finally {
            receiptRef.current.classList.remove('bg-white');
        }
    };

    const handleDownloadReceipt = async () => {
        if (!receiptRef.current || !receiptSale) {
            showToast("Receipt content is not available to save as PDF.", 'error');
            return;
        }

        const defaultFileName = `receipt-${receiptSale.id}-${format(new Date(), 'yyyyMMdd')}.pdf`;

        // Temporarily add a white background to the receipt element for consistent PDF rendering
        receiptRef.current.classList.add('bg-white');

        try {
            await generateAndSavePdfFromHtml(receiptRef.current, defaultFileName);
            showToast('Receipt PDF saved successfully!', 'success');
        } catch (error) {
            console.error("Receipt PDF download failed:", error);
            showToast('Failed to save Receipt PDF.', 'error');
        } finally {
            // Remove the temporary white background
            receiptRef.current.classList.remove('bg-white');
        }
    };

    return (
        <div className="flex flex-col lg:flex-row h-[calc(100vh-theme(spacing.24))] lg:h-[calc(100vh-theme(spacing.16))] gap-4 relative">

            {/* LEFT: Product Catalog */}
            <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden no-print">
                <div className="p-3 md:p-4 border-b border-slate-200 flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input
                            className="w-full pl-10 pr-4 py-2 md:py-3 rounded-lg bg-slate-50 border-none focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm md:text-base"
                            placeholder="Scan barcode or search product..."
                            autoFocus
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 md:p-4 bg-slate-50">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                        {productsWithStock?.map(product => {
                            const isDisabled = product.isOutOfStock;
                            const statusLabel = product.isOutOfStock ? (product.hasExpiredStock ? 'Expired' : 'Out') : null;

                            return (
                                <div
                                    key={product.id}
                                    onClick={() => !isDisabled && addToCart(product)}
                                    className={`bg-white p-3 md:p-4 rounded-xl border shadow-sm transition-all duration-200 group flex flex-col justify-between h-[130px] md:h-40 ${isDisabled
                                        ? 'opacity-60 grayscale cursor-not-allowed border-slate-200'
                                        : 'hover:shadow-md hover:border-emerald-400 hover:-translate-y-0.5 active:scale-95 cursor-pointer border-slate-200'
                                        }`}
                                >
                                    <div className="min-w-0">
                                        <div className="flex justify-between items-start gap-1">
                                            <h3 className="font-bold text-slate-800 line-clamp-2 text-[11px] md:text-sm leading-tight uppercase tracking-tight">{product.name}</h3>
                                            {statusLabel && (
                                                <span className={`text-[8px] md:text-[9px] px-1 md:px-1.5 py-0.5 rounded font-black uppercase shrink-0 ${product.hasExpiredStock ? 'bg-red-100 text-red-600' : 'bg-slate-200 text-slate-600'
                                                    }`}>
                                                    {statusLabel}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[9px] md:text-xs text-slate-400 mt-0.5 truncate font-medium">{product.category}</p>
                                        <div className="mt-1 md:mt-2 flex items-center gap-1">
                                            <Layers className="w-2.5 h-2.5 md:w-3 md:h-3 text-slate-400" />
                                            <span className={`text-[9px] md:text-xs font-bold ${product.validStock <= product.minStockLevel ? 'text-amber-600' : 'text-slate-500'}`}>
                                                Qty: {product.validStock}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-end mt-1">
                                        <span className="font-black text-emerald-600 text-xs md:text-base">₦{product.price.toLocaleString()}</span>
                                        <div className={`p-1 md:p-1.5 rounded-lg transition-colors ${isDisabled
                                            ? 'bg-slate-50 text-slate-300'
                                            : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white'
                                            }`}>
                                            <Plus className="w-3 h-3 md:w-4 md:h-4" />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Mobile Cart Overlay */}
            {isCartOpen && (
                <div className="fixed inset-0 bg-black/50 z-30 lg:hidden no-print" onClick={() => setIsCartOpen(false)} />
            )}

            {/* RIGHT: Cart & Navigation Panel */}
            <div className={`
            fixed inset-y-0 right-0 w-full sm:w-96 bg-white z-40 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col no-print
            lg:relative lg:transform-none lg:w-96 lg:shadow-sm lg:border lg:border-slate-200 lg:rounded-xl lg:z-0
            ${isCartOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
      `}>

                {/* Tabs Header */}
                <div className="flex border-b border-slate-200 bg-slate-50 lg:rounded-t-xl overflow-hidden">
                    <button
                        onClick={() => setActiveTab('cart')}
                        className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'cart'
                            ? 'bg-white text-emerald-600 border-b-2 border-emerald-600'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                            }`}
                    >
                        <ShoppingCart className="w-4 h-4" /> Sale
                    </button>
                    <button
                        onClick={() => setActiveTab('held')}
                        className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors relative ${activeTab === 'held'
                            ? 'bg-white text-emerald-600 border-b-2 border-emerald-600'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                            }`}
                    >
                        <PauseCircle className="w-4 h-4" /> Held
                        {(heldSales?.length || 0) > 0 && (
                            <span className="ml-1 bg-amber-500 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full font-bold">
                                {heldSales?.length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'history'
                            ? 'bg-white text-emerald-600 border-b-2 border-emerald-600'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                            }`}
                    >
                        <History className="w-4 h-4" /> History
                    </button>
                    <div className="lg:hidden flex items-center px-2">
                        <button onClick={() => setIsCartOpen(false)} className="p-2"><X className="w-5 h-5 text-slate-500" /></button>
                    </div>
                </div>

                {/* PANEL BODY CONTENT */}

                {/* 1. CART VIEW */}
                {activeTab === 'cart' && (
                    <>
                        <div className="px-4 pt-3 pb-3 border-b border-slate-200 bg-slate-50">
                            <div className="flex items-center gap-2 text-slate-600 mb-1">
                                <User className="w-3 h-3" />
                                <span className="text-xs font-medium uppercase tracking-wide">Customer</span>
                            </div>
                            <select
                                className="w-full p-2 rounded border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                value={selectedCustomer?.id || ''}
                                onChange={(e) => {
                                    const cust = customers?.find(c => c.id === parseInt(e.target.value));
                                    setSelectedCustomer(cust || null);
                                }}
                            >
                                <option value="">Walk-in Customer</option>
                                {customers?.map(c => (
                                    <option key={c.id} value={c.id}>{c.name} {c.currentDebt > 0 ? `(Debt: ₦${c.currentDebt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : ''}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
                            {cart.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                    <ShoppingCart className="w-12 h-12 mb-2 opacity-20" />
                                    <p className="text-sm md:text-base">Cart is empty</p>
                                </div>
                            ) : (
                                cart?.map(item => (
                                    <div key={item.productId} className="flex justify-between items-center p-2.5 md:p-3 bg-slate-50 rounded-lg border border-slate-100">
                                        <div className="flex-1 min-w-0 pr-2">
                                            <h4 className="font-medium text-slate-800 truncate text-xs md:text-sm">{item.productName}</h4>
                                            <p className="text-[10px] md:text-xs text-slate-500">₦{item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / unit</p>
                                        </div>
                                        <div className="flex items-center gap-1.5 md:gap-2">
                                            <button onClick={() => updateQuantity(item.productId, -1)} className="p-1 hover:bg-slate-200 rounded text-slate-500"><Minus className="w-3 h-3" /></button>
                                            <span className="w-4 text-center text-xs md:text-sm font-medium">{item.quantity}</span>
                                            <button onClick={() => updateQuantity(item.productId, 1)} className="p-1 hover:bg-slate-200 rounded text-slate-500"><Plus className="w-3 h-3" /></button>
                                        </div>
                                        <div className="ml-2 md:ml-3 text-right min-w-[55px] md:min-w-[60px]">
                                            <p className="font-bold text-slate-800 text-xs md:text-sm">₦{item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                            <button onClick={() => removeFromCart(item.productId)} className="text-[10px] md:text-xs text-red-400 hover:text-red-600 mt-0.5 md:mt-1">Remove</button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="p-4 md:p-6 bg-slate-900 text-white rounded-b-xl mt-auto">
                            <div className="flex justify-between mb-2 text-xs md:text-sm text-slate-300">
                                <span>Subtotal</span>
                                <span>₦{calculateTotal().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between items-center mb-4 md:mb-6 text-xs md:text-sm text-slate-300">
                                <span>Discount</span>
                                <input
                                    type="number"
                                    min="0"
                                    max={calculateTotal()}
                                    value={discount || ''}
                                    onChange={(e) => setDiscount(Math.min(calculateTotal(), Math.max(0, parseFloat(e.target.value) || 0)))}
                                    className="w-20 md:w-24 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-right text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                                    placeholder="0.00"
                                />
                            </div>
                            <div className="flex justify-between mb-4 md:mb-6 text-lg md:text-xl font-bold text-white">
                                <span>Total</span>
                                <span>₦{Math.max(0, calculateTotal() - discount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 md:gap-3">
                                <button
                                    onClick={handleHoldSale}
                                    disabled={cart.length === 0}
                                    className="col-span-1 py-2.5 md:py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-1 text-xs md:text-sm"
                                >
                                    <PauseCircle className="w-4 h-4 md:w-5 md:h-5" />
                                    <span className="hidden sm:inline">Hold</span>
                                </button>
                                <button
                                    onClick={() => setIsPaymentModalOpen(true)}
                                    disabled={cart.length === 0}
                                    className="col-span-2 py-2.5 md:py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm md:text-base"
                                >
                                    <CreditCard className="w-4 h-4 md:w-5 md:h-5" />
                                    Pay Now
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {/* 2. HISTORY VIEW */}
                {activeTab === 'history' && (
                    <div className="flex-1 overflow-y-auto bg-white">
                        <div className="p-2 border-b border-slate-100 sticky top-0 bg-white z-10">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                                <input
                                    className="w-full pl-9 pr-4 py-2 text-sm rounded-lg bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                                    placeholder="Search by Name or ID..."
                                    value={historySearchQuery}
                                    onChange={(e) => setHistorySearchQuery(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="divide-y divide-slate-100">
                            {recentSales && recentSales.length > 0 ? (
                                recentSales.map((sale) => (
                                    <div key={sale.id} className="p-4 hover:bg-slate-50 transition-colors border-b border-slate-100">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-bold text-slate-800">₦{sale.finalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{sale.paymentMethod}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs text-slate-500">
                                            <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> {format(sale.date, 'MMM dd, HH:mm')}</div>
                                            <div className="flex items-center gap-1"><User className="w-3 h-3" /> {sale.customerName}</div>
                                        </div>
                                        <div className="mt-2 pt-2 border-t border-slate-50 flex justify-end">
                                            <button
                                                onClick={() => setReceiptSale(sale)}
                                                className="text-xs text-emerald-600 flex items-center gap-1 hover:underline"
                                            >
                                                <Receipt className="w-3 h-3" /> Receipt
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-10 text-center text-slate-400 flex flex-col items-center gap-2">
                                    <History className="w-8 h-8 opacity-20" />
                                    <p>No recent sales.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 3. HELD SALES VIEW */}
                {activeTab === 'held' && (
                    <div className="flex-1 overflow-y-auto bg-white">
                        <div className="divide-y divide-slate-100">
                            {heldSales && heldSales.length > 0 ? (
                                heldSales.map(sale => (
                                    <div key={sale.id} className="p-4 hover:bg-slate-50 transition-colors border-b border-slate-100">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <p className="font-bold text-slate-800">₦{sale.finalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                <p className="text-xs text-slate-500 mt-1">{format(sale.date, 'MMM dd, HH:mm')} • {sale.items.length} Items</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-slate-500 mb-2">{sale.customerName}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 mt-2">
                                            <button
                                                onClick={() => handleResumeSale(sale)}
                                                className="flex-1 py-1.5 bg-emerald-50 text-emerald-600 text-xs font-bold rounded border border-emerald-200 hover:bg-emerald-100 flex items-center justify-center gap-1"
                                            >
                                                <RotateCcw className="w-3 h-3" /> Resume
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (confirm('Discard this held sale?')) await db.sales.delete(sale.id!);
                                                }}
                                                className="py-1.5 px-3 bg-red-50 text-red-600 text-xs font-bold rounded border border-red-200 hover:bg-red-100"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-10 text-center text-slate-400 flex flex-col items-center gap-2">
                                    <PauseCircle className="w-8 h-8 opacity-20" />
                                    <p>No sales on hold.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

            </div>

            {/* Mobile Cart Toggle FAB */}
            <button
                onClick={() => setIsCartOpen(true)}
                className="lg:hidden fixed bottom-6 right-6 w-16 h-16 bg-emerald-600 text-white rounded-full shadow-2xl flex items-center justify-center z-30 hover:bg-emerald-700 transition-transform active:scale-95 border-4 border-slate-50 no-print"
            >
                <ShoppingCart className="w-7 h-7" />
                {cartItemCount > 0 && (
                    <span className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold h-6 w-6 flex items-center justify-center rounded-full border-2 border-emerald-600 shadow-sm transform translate-x-1 -translate-y-1">
                        {cartItemCount}
                    </span>
                )}
            </button>

            {/* Payment Modal */}
            {isPaymentModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 md:p-4 no-print">
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl p-4 md:p-6">
                        <div className="flex justify-between items-center mb-4 md:mb-6">
                            <h2 className="text-xl md:text-2xl font-bold text-slate-900">Complete Payment</h2>
                            <button onClick={() => { setIsPaymentModalOpen(false); setIsMultipayOpen(false); setMultipayEntries([]); }} className="p-2 hover:bg-slate-100 rounded-full">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>

                        <div className="text-center mb-6 md:mb-8 bg-slate-50 p-4 rounded-xl">
                            <p className="text-slate-500 text-[10px] md:text-sm uppercase tracking-wide mb-1">Total Payable</p>
                            <p className="text-2xl md:text-4xl font-extrabold text-emerald-600">₦{Math.max(0, calculateTotal() - discount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            {discount > 0 && (
                                <p className="text-xs md:text-sm text-slate-400 mt-1 line-through">₦{calculateTotal().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            )}
                        </div>

                        {!isMultipayOpen ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-6 md:mb-8">
                                <button onClick={() => handleCheckout(PaymentMethod.CASH)} className="group p-4 md:p-6 border border-slate-200 rounded-xl hover:bg-emerald-50 hover:border-emerald-500 hover:shadow-md transition-all flex flex-col items-center gap-2 md:gap-3">
                                    <div className="p-2 md:p-3 bg-emerald-100 text-emerald-600 rounded-full group-hover:bg-emerald-200"><Banknote className="w-5 h-5 md:w-6 md:h-6" /></div>
                                    <span className="font-bold text-slate-700 group-hover:text-emerald-700 text-sm md:text-base">Cash</span>
                                </button>
                                <button onClick={() => handleCheckout(PaymentMethod.CARD)} className="group p-4 md:p-6 border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-500 hover:shadow-md transition-all flex flex-col items-center gap-2 md:gap-3">
                                    <div className="p-2 md:p-3 bg-blue-100 text-blue-600 rounded-full group-hover:bg-blue-200"><CreditCard className="w-5 h-5 md:w-6 md:h-6" /></div>
                                    <span className="font-bold text-slate-700 group-hover:text-blue-700 text-sm md:text-base">POS / Card</span>
                                </button>
                                <button onClick={() => handleCheckout(PaymentMethod.TRANSFER)} className="group p-4 md:p-6 border border-slate-200 rounded-xl hover:bg-purple-50 hover:border-purple-500 hover:shadow-md transition-all flex flex-col items-center gap-2 md:gap-3">
                                    <div className="p-2 md:p-3 bg-purple-100 text-purple-600 rounded-full group-hover:bg-purple-200"><Smartphone className="w-5 h-5 md:w-6 md:h-6" /></div>
                                    <span className="font-bold text-slate-700 group-hover:text-purple-700 text-sm md:text-base">Transfer</span>
                                </button>
                                <button onClick={() => setIsMultipayOpen(true)} className="group p-4 md:p-6 border border-slate-200 rounded-xl hover:bg-fuchsia-50 hover:border-fuchsia-500 hover:shadow-md transition-all flex flex-col items-center gap-2 md:gap-3">
                                    <div className="p-2 md:p-3 bg-fuchsia-100 text-fuchsia-600 rounded-full group-hover:bg-fuchsia-200"><Layers className="w-5 h-5 md:w-6 md:h-6" /></div>
                                    <span className="font-bold text-slate-700 group-hover:text-fuchsia-700 text-sm md:text-base">Multipay</span>
                                </button>
                                <button onClick={() => handleCheckout(PaymentMethod.CREDIT)} disabled={!selectedCustomer} className={`group p-4 md:p-6 border border-slate-200 rounded-xl transition-all flex flex-col items-center gap-2 md:gap-3 ${!selectedCustomer ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'hover:bg-orange-50 hover:border-orange-500 hover:shadow-md cursor-pointer'}`}>
                                    <div className={`p-2 md:p-3 rounded-full ${!selectedCustomer ? 'bg-slate-200 text-slate-400' : 'bg-orange-100 text-orange-600 group-hover:bg-orange-200'}`}><FileText className="w-5 h-5 md:w-6 md:h-6" /></div>
                                    <span className={`font-bold text-sm md:text-base ${!selectedCustomer ? 'text-slate-400' : 'text-slate-700 group-hover:text-orange-700'}`}>Debt / Credit</span>
                                    {!selectedCustomer && <span className="text-[9px] md:text-[10px] text-red-400 -mt-1 md:-mt-2">(Select Customer)</span>}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                                <form onSubmit={(e) => {
                                    e.preventDefault();
                                    const form = e.target as HTMLFormElement;
                                    const amount = (form.elements.namedItem('amount') as HTMLInputElement).value;
                                    const method = (form.elements.namedItem('method') as HTMLSelectElement).value as PaymentMethod;
                                    if (amount && parseFloat(amount) > 0) {
                                        setMultipayEntries([...multipayEntries, { method, amount }]);
                                        form.reset();
                                    }
                                }}>
                                    <div className="flex flex-col md:flex-row gap-2">
                                        <select name="method" className="flex-1 p-2 rounded border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                                            <option value={PaymentMethod.CASH}>Cash</option>
                                            <option value={PaymentMethod.CARD}>POS / Card</option>
                                            <option value={PaymentMethod.TRANSFER}>Transfer</option>
                                        </select>
                                        <div className="flex flex-1 gap-2">
                                            <input name="amount" type="number" step="0.01" placeholder="Amount" className="flex-1 p-2 rounded border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none w-full" />
                                            <button type="submit" className="p-2 bg-emerald-500 text-white rounded hover:bg-emerald-600 shrink-0"><Plus className="w-5 h-5" /></button>
                                        </div>
                                    </div>
                                </form>
                                <div className="space-y-2">
                                    {multipayEntries?.map((entry, index) => (
                                        <div key={index} className="flex justify-between items-center p-2 bg-slate-50 rounded border border-slate-100">
                                            <span className="text-xs md:text-sm font-medium">{entry.method}: <span className="text-emerald-600">₦{parseFloat(entry.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
                                            <button onClick={() => setMultipayEntries(multipayEntries.filter((_, i) => i !== index))} className="p-1 text-red-500 hover:bg-red-100 rounded transition-colors"><X className="w-4 h-4" /></button>
                                        </div>
                                    ))}
                                </div>
                                <div className="pt-4 border-t border-slate-200 space-y-2 text-[10px] md:text-sm uppercase font-bold tracking-wider">
                                    <div className="flex justify-between text-slate-500">
                                        <span>Total Paid:</span>
                                        <span className="text-slate-900 font-black">₦{multipayEntries.reduce((acc, e) => acc + parseFloat(e.amount || '0'), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Remaining:</span>
                                        <span className={`font-black ${(Math.max(0, calculateTotal() - discount) - multipayEntries.reduce((acc, e) => acc + parseFloat(e.amount || '0'), 0)) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>₦{(Math.max(0, calculateTotal() - discount) - multipayEntries.reduce((acc, e) => acc + parseFloat(e.amount || '0'), 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleCheckout(PaymentMethod.MULTIPAY, multipayEntries)}
                                    disabled={multipayEntries.reduce((acc, e) => acc + parseFloat(e.amount || '0'), 0) !== Math.max(0, calculateTotal() - discount)}
                                    className="w-full py-3 bg-emerald-500 text-white rounded-lg font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
                                >
                                    Confirm Payment
                                </button>
                            </div>
                        )}

                        <button onClick={() => { setIsPaymentModalOpen(false); setIsMultipayOpen(false); setMultipayEntries([]); }} className="w-full py-3 text-slate-500 font-medium hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors">Cancel Transaction</button>
                    </div>
                </div>
            )}

            {/* Receipt Modal */}
            {receiptSale && (
                <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-2 md:p-4" id="printable-receipt">
                    <div className="bg-white rounded-xl shadow-2xl flex flex-col w-full max-w-lg max-h-[95vh]">
                        <div className="p-3 md:p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 no-print">
                            <div className="flex items-center gap-2">
                                <button onClick={() => setPaperSize('80mm')} className={`px-2 py-1 text-[10px] md:text-xs rounded ${paperSize === '80mm' ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-600'}`}>80mm</button>
                                <button onClick={() => setPaperSize('58mm')} className={`px-2 py-1 text-[10px] md:text-xs rounded ${paperSize === '58mm' ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-600'}`}>58mm</button>
                            </div>
                            <button onClick={() => setReceiptSale(null)} className="p-1.5 md:p-2 hover:bg-slate-200 rounded-full transition-colors">
                                <X className="w-4 h-4 md:w-5 md:h-5 text-slate-600" />
                            </button>
                        </div>

                        <div className="p-4 md:p-6 bg-slate-100 flex justify-center overflow-y-auto">
                            {/* Receipt Container (The part that gets printed/downloaded) */}
                            <div
                                id="receipt-content"
                                ref={receiptRef}
                                className={`bg-white p-4 md:p-6 border border-slate-200 text-xs md:text-sm font-mono text-slate-800 leading-tight ${paperSize === '80mm' ? 'receipt-80mm' : 'receipt-58mm'}`}
                                style={{ minHeight: '400px' }}
                            >
                                <div className="text-center mb-4">
                                    <h2 className="text-base md:text-lg font-bold mb-1">AK Alheri Chemist PPMVS Kurfi</h2>
                                    <p className="text-[10px] md:text-xs text-slate-500">No.2&3 Maraɗi Aliyu Street Opposite JIBWIS Jumma'a Masjid Kurfi</p>
                                    <p className="text-[10px] md:text-xs text-slate-500">Tel: 09060605362, 07039177740</p>
                                    <p className="text-[10px] md:text-xs text-slate-500">Email: kabirbalakurfi@gmail.com</p>
                                </div>

                                <div className="border-b border-dashed border-slate-300 pb-2 mb-2 space-y-1">
                                    <div className="flex justify-between"><span>Date:</span><span>{format(receiptSale.date, 'dd/MM/yyyy HH:mm')}</span></div>
                                    <div className="flex justify-between"><span>Sale ID:</span><span>#{receiptSale.id}</span></div>
                                    <div className="flex justify-between"><span>Customer:</span><span>{receiptSale.customerName}</span></div>
                                </div>

                                <div className="mb-2">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="border-b border-slate-300">
                                                <th className="pb-1">Item</th>
                                                <th className="pb-1 text-right border-r border-dashed border-slate-300 pr-2">Qty</th>
                                                <th className="pb-1 text-right border-r border-dashed border-slate-300 pr-2">Price</th>
                                                <th className="pb-1 text-right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(receiptSale.items || []).map((item, i) => (
                                                <tr key={i}>
                                                    <td className="pt-1 pr-1">{item.productName}</td>
                                                    <td className="pt-1 text-right border-r border-dashed border-slate-300 pr-2">{item.quantity}</td>
                                                    <td className="pt-1 text-right border-r border-dashed border-slate-300 pr-2">{item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    <td className="pt-1 text-right">{item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="border-t border-dashed border-slate-300 pt-2 space-y-1 mb-4">
                                    {(receiptSale.discount || 0) > 0 && (
                                        <>
                                            <div className="flex justify-between text-[10px] md:text-xs">
                                                <span>Subtotal:</span>
                                                <span>₦{receiptSale.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                            </div>
                                            <div className="flex justify-between text-[10px] md:text-xs">
                                                <span>Discount:</span>
                                                <span>-₦{receiptSale.discount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                            </div>
                                        </>
                                    )}
                                    <div className="flex justify-between font-bold text-base md:text-lg">
                                        <span>TOTAL</span>
                                        <span>₦{receiptSale.finalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px] md:text-xs">
                                        <span>Payment Method:</span>
                                        {receiptSale.paymentMethod === PaymentMethod.MULTIPAY ? (
                                            <div className="text-right">
                                                {(receiptSale.paymentMethods || []).filter(pm => pm != null).map((pm, i) => (
                                                    <div key={i}>{pm.method}: ₦{pm.amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                                ))}
                                            </div>
                                        ) : (
                                            <span>{receiptSale.paymentMethod}</span>
                                        )}
                                    </div>
                                </div>

                                <div className="text-center text-[10px] md:text-xs text-slate-500 mt-6">
                                    <p>Mun gode da kasuwancin ku!</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-3 md:p-4 border-t border-slate-200 flex flex-wrap gap-2 md:gap-3 justify-center md:justify-end bg-white no-print">
                            <button
                                onClick={handlePrintRaw}
                                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors text-xs md:text-sm"
                            >
                                <Printer className="w-3.5 h-3.5 md:w-4 md:h-4" /> Thermal
                            </button>
                            <button
                                onClick={handleDownloadImage}
                                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs md:text-sm"
                            >
                                <Download className="w-3.5 h-3.5 md:w-4 md:h-4" /> Image
                            </button>
                            <button
                                onClick={handleDownloadReceipt}
                                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-xs md:text-sm"
                            >
                                <Download className="w-3.5 h-3.5 md:w-4 md:h-4" /> PDF
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}