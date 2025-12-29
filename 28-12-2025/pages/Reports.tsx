import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../db/db';
import { Sale, SaleStatus, PaymentMethod, Product, Batch, Expense, Return, ReturnedItem } from '../types';
import { format, startOfMonth, startOfWeek, endOfWeek, startOfYear, endOfYear, endOfMonth, startOfDay, endOfDay, subDays, addDays, isAfter, isBefore } from 'date-fns';
import { FileText, TrendingUp, DollarSign, ShoppingBag, Calendar, Package, AlertTriangle, PieChart as PieIcon, CreditCard, RotateCcw, TrendingDown, Search } from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { savePdf } from '../services/pdfService';
import { useToast } from '../contexts/ToastContext';
import ReturnAnalytics from '../components/ReturnAnalytics'; // Import ReturnAnalytics

// Define color palette for charts
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const Reports: React.FC = () => {
    const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [sales, setSales] = useState<Sale[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [batches, setBatches] = useState<Batch[]>([]);
    const [returns, setReturns] = useState<Return[]>([]);
    const [returnedItems, setReturnedItems] = useState<ReturnedItem[]>([]); // New state for items
    const [loading, setLoading] = useState(false);
    const [activePreset, setActivePreset] = useState<'today' | 'week' | 'month' | 'year' | 'custom'>('month');
    const [activeTab, setActiveTab] = useState<'overview' | 'sales' | 'inventory' | 'financials' | 'returnAnalytics'>('overview');
    const [salesSearchQuery, setSalesSearchQuery] = useState(''); // Search state
    const { showToast } = useToast(); // Initialize useToast

    const fetchData = async () => {
        setLoading(true);
        try {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);

            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);

            // Parallel fetching
            const [fetchedSales, fetchedExpenses, fetchedProducts, fetchedBatches, fetchedReturns, fetchedReturnedItems] = await Promise.all([
                db.sales.where('date').between(start, end).reverse().toArray(),
                db.expenses.where('date').between(start, end).reverse().toArray(),
                db.products.toArray(),
                db.batches.toArray(),
                db.returns.where('returnDate').between(start, end).toArray(),
                db.returnedItems.toArray() // Fetch all items then filter (simpler for now given schema)
            ]);

            // Filter returned items based on fetched returns IDs
            const returnIds = fetchedReturns.map(r => r.id);
            const relevantReturnedItems = fetchedReturnedItems.filter(item => returnIds.includes(item.returnId));

            setSales(fetchedSales);
            setExpenses(fetchedExpenses);
            setProducts(fetchedProducts);
            setBatches(fetchedBatches);
            setReturns(fetchedReturns);
            setReturnedItems(relevantReturnedItems);
        } catch (error) {
            console.error("Failed to fetch report data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [startDate, endDate]); // Re-fetch when dates change

    const handleSetPreset = (preset: 'today' | 'week' | 'month' | 'year') => {
        setActivePreset(preset);
        let start, end;
        const now = new Date();
        switch (preset) {
            case 'today': start = startOfDay(now); end = endOfDay(now); break;
            case 'week': start = startOfWeek(now); end = endOfWeek(now); break;
            case 'month': start = startOfMonth(now); end = endOfMonth(now); break;
            case 'year': start = startOfYear(now); end = endOfYear(now); break;
        }
        setStartDate(format(start, 'yyyy-MM-dd'));
        setEndDate(format(end, 'yyyy-MM-dd'));
    };

    // --- Derived Statistics & Data Transformations ---

    // 1. Overview / Sales Stats
    const totalRevenue = sales.reduce((sum, s) => sum + s.finalAmount, 0);
    const totalDiscounts = sales.reduce((sum, s) => sum + (s.discount || 0), 0);
    const totalTransactions = sales.length;
    const avgOrderValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const totalRefunds = returns.reduce((sum, r) => sum + r.totalRefundAmount, 0);
    const totalValueLost = returnedItems.reduce((sum, item) => sum + (item.valueLost || 0), 0); // Calculate Value Lost

    // Calculate COGS & Profits
    const totalCOGS = sales.reduce((sum, sale) => {
        const saleCost = (sale.items || []).reduce((itemSum, item) => {
            return itemSum + (item.quantity * (item.costPrice || 0));
        }, 0);
        return sum + saleCost;
    }, 0);

    // Calculate Cost of Good Returns to reverse COGS for restockable items
    const totalCostOfGoodReturns = returnedItems.reduce((sum, item) => {
        // If valueLost is 0, it implies the item was returned in good condition (resellable)
        // We need to estimate the cost. We'll use the costPrice stored on the item if available, 
        // otherwise fallback to an average from current batches or product price/markups.
        // Assuming ReturnedItem might not have costPrice, we try to find it from batches.

        if ((item.valueLost || 0) > 0) return sum; // Damaged items remain in COGS (loss)

        let cost = (item as any).costPrice;
        if (!cost) {
            // Fallback: Average cost from current batches for this product
            const productBatches = batches.filter(b => b.productId === item.productId);
            if (productBatches.length > 0) {
                const totalBatchCost = productBatches.reduce((bSum, b) => bSum + (b.costPrice * b.quantity), 0);
                const totalBatchQty = productBatches.reduce((bSum, b) => bSum + b.quantity, 0);
                cost = totalBatchQty > 0 ? totalBatchCost / totalBatchQty : 0;
            } else {
                // Last resort fallback: try to find product and guess (or 0)
                // For safety in reports, 0 prevents inflating profit artificially if data missing.
                cost = 0;
            }
        }
        return sum + (item.quantity * cost);
    }, 0);

    const grossProfit = totalRevenue - totalCOGS;
    // Net Profit = Gross Profit - Expenses - Refunds (Lost Revenue) + Cost of Good Returns (Asset Recovered)
    // Note: Discounts are already deducted from totalRevenue (finalAmount), so we don't subtract them again.
    const netProfit = grossProfit - totalExpenses - totalRefunds + totalCostOfGoodReturns;

    // Filtered Sales for Display
    const filteredSales = useMemo(() => {
        if (!salesSearchQuery) return sales;
        const lowerQuery = salesSearchQuery.toLowerCase();
        return sales.filter(sale =>
            (sale.customerName?.toLowerCase() || '').includes(lowerQuery) ||
            (sale.id?.toString() || '').includes(lowerQuery) ||
            (sale.invoiceNumber?.toLowerCase() || '').includes(lowerQuery)
        );
    }, [sales, salesSearchQuery]);

    // 2. Chart Data: Sales by Date
    const salesByDate = useMemo(() => {
        const grouped: Record<string, number> = {};
        sales.forEach(sale => {
            const dateStr = format(sale.date, 'MMM dd');
            grouped[dateStr] = (grouped[dateStr] || 0) + sale.finalAmount;
        });
        return Object.entries(grouped).map(([date, amount]) => ({ date, amount }));
    }, [sales]);

    // 3. Chart Data: Payment Methods
    const salesByPayment = useMemo(() => {
        const grouped: Record<string, number> = {};
        sales.forEach(sale => {
            if (sale.paymentMethod === PaymentMethod.MULTIPAY && sale.paymentMethods) {
                sale.paymentMethods.forEach(pm => {
                    grouped[pm.method] = (grouped[pm.method] || 0) + pm.amount;
                });
            } else {
                grouped[sale.paymentMethod] = (grouped[sale.paymentMethod] || 0) + sale.finalAmount;
            }
        });
        return Object.entries(grouped).map(([name, value]) => ({ name, value }));
    }, [sales]);

    // 4. Inventory: Expiry & Low Stock
    const inventoryAnalysis = useMemo(() => {
        const now = new Date();
        const threeMonthsFromNow = addDays(now, 90);

        // Low Stock
        const lowStockProducts = products.filter(p => {
            const totalStock = batches.filter(b => b.productId === p.id).reduce((sum, b) => sum + b.quantity, 0);
            return totalStock <= p.minStockLevel;
        }).map(p => ({
            ...p,
            currentStock: batches.filter(b => b.productId === p.id).reduce((sum, b) => sum + b.quantity, 0)
        }));

        // Expiring Soon (or Expired)
        const expiringBatches = batches.filter(b => {
            // Filter out empty batches if you only care about stock on hand
            if (b.quantity === 0) return false;
            const expiryDate = new Date(b.expiryDate);
            return isBefore(expiryDate, threeMonthsFromNow);
        }).map(b => {
            const product = products.find(p => p.id === b.productId);
            const expiryDate = new Date(b.expiryDate);
            return {
                ...b,
                productName: product?.name || 'Unknown',
                isExpired: isBefore(expiryDate, now),
                daysUntilExpiry: Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 3600 * 24))
            };
        }).sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

        return { lowStockProducts, expiringBatches };
    }, [products, batches]);

    // 5. Top Selling Products
    const topProducts = useMemo(() => {
        const productStats: Record<number, { name: string, qty: number, revenue: number }> = {};
        sales.forEach(sale => {
            (sale.items || []).forEach(item => {
                if (!productStats[item.productId]) {
                    productStats[item.productId] = { name: item.productName, qty: 0, revenue: 0 };
                }
                productStats[item.productId].qty += item.quantity;
                productStats[item.productId].revenue += item.total;
            });
        });
        return Object.values(productStats)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);
    }, [sales]);


    // --- PDF Export ---
    const generatePDF = async () => {

        const doc = new jsPDF();

        // Title
        doc.setFontSize(18);
        doc.text("AK Alheri Chemist Business Report", 14, 22);
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Period: ${startDate} to ${endDate}`, 14, 30);

        let yPos = 40;

        // Summary Table
        autoTable(doc, {
            startY: yPos,
            head: [['Metric', 'Value']],
            body: [
                ['Total Sales', `N${totalRevenue.toLocaleString()}`],
                ['Total Refunds', `N${totalRefunds.toLocaleString()}`],
                ['Value Lost (Damaged)', `N${totalValueLost.toLocaleString()}`],
                ['Cost of Goods Sold', `N${totalCOGS.toLocaleString()}`],
                ['Total Expenses', `N${totalExpenses.toLocaleString()}`],
                ['Total Discounts', `N${totalDiscounts.toLocaleString()}`],
                ['Gross Profit', `N${grossProfit.toLocaleString()}`],
                ['Net Profit', `N${netProfit.toLocaleString()}`],
            ],
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185] },
            didParseCell: function (data) {
                if (data.section === 'body' && data.column.index === 1) { // Apply to value column
                    const metricName = data.row.cells[0].text[0]; // Get the metric name from the first column
                    if (['Total Sales', 'Gross Profit'].includes(metricName)) {
                        data.cell.styles.textColor = [34, 139, 34]; // Forest Green
                    } else if (['Total Refunds', 'Cost of Goods Sold', 'Total Expenses', 'Total Discounts', 'Value Lost (Damaged)'].includes(metricName)) {
                        data.cell.styles.textColor = [220, 20, 60]; // Crimson Red
                    } else if (metricName === 'Net Profit') {
                        data.cell.styles.textColor = [0, 0, 0]; // Black
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            }
        });

        yPos = (doc as any).lastAutoTable.finalY + 15;

        // Sales by Payment Method
        doc.text("Sales by Payment Method", 14, yPos);
        yPos += 5;
        autoTable(doc, {
            startY: yPos,
            head: [['Method', 'Amount']],
            body: salesByPayment.map(p => [p.name, `N${p.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]),
            styles: { fontSize: 8 }
        });

        yPos = (doc as any).lastAutoTable.finalY + 15;

        // Sales Breakdown
        doc.text("Sales History (Top 50)", 14, yPos);
        yPos += 5;
        autoTable(doc, {
            startY: yPos,
            head: [['Date', 'Customer', 'Items', 'Discount', 'Total', 'Method']],
            body: sales.slice(0, 50).map(s => [
                format(s.date, 'yyyy-MM-dd HH:mm'),
                s.customerName || 'Walk-in',
                (s.items?.length || 0).toString(),
                (s.discount || 0).toFixed(2),
                s.finalAmount.toFixed(2),
                s.paymentMethod
            ]),
            styles: { fontSize: 8 }
        });

        // Final saving step
        const defaultFileName = `AK_Alheri_Chemist_Report_${startDate}_${endDate}.pdf`;
        try {
            await savePdf(doc, defaultFileName, 'reports');
            showToast('PDF report saved successfully!', 'success'); // Show success toast
        } catch (error) {
            console.error("PDF generation/saving failed:", error);
            showToast('Failed to save PDF report.', 'error'); // Show error toast
        }
    };
    const TabButton: React.FC<{ id: typeof activeTab, label: string, icon: React.ReactNode }> = ({ id, label, icon }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all font-medium ${activeTab === id
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-emerald-50'
                }`}
        >
            {icon}
            {label}
        </button>
    );

    return (
        <div className="space-y-6 pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h1 className="text-2xl font-bold text-slate-800">Business Intelligence</h1>
                <div className="flex gap-2">
                    <button
                        onClick={generatePDF}
                        className="bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 flex items-center gap-2 shadow-sm"
                    >
                        <FileText className="w-4 h-4" /> PDF Report
                    </button>
                </div>
            </div>

            {/* Date Filter Bar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
                    <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                        {(['today', 'week', 'month', 'year'] as const).map(preset => (
                            <button
                                key={preset}
                                onClick={() => handleSetPreset(preset)}
                                className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-all ${activePreset === preset ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                {preset}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 w-full lg:w-auto">
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => { setStartDate(e.target.value); setActivePreset('custom'); }}
                            className="p-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-500"
                        />
                        <span className="text-slate-400">-</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => { setEndDate(e.target.value); setActivePreset('custom'); }}
                            className="p-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-500"
                        />
                    </div>
                </div>
            </div>

            {/* Tabs Navigation */}
            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
                <TabButton id="overview" label="Overview" icon={<PieIcon className="w-4 h-4" />} />
                <TabButton id="sales" label="Sales Details" icon={<TrendingUp className="w-4 h-4" />} />
                <TabButton id="inventory" label="Inventory Health" icon={<Package className="w-4 h-4" />} />
                <TabButton id="financials" label="Financials" icon={<span className="w-4 h-4 flex items-center justify-center font-bold text-xs">₦</span>} />
                <TabButton id="returnAnalytics" label="Return Analytics" icon={<RotateCcw className="w-4 h-4" />} />
            </div>

            {/* CONTENT AREAS */}

            {/* 1. OVERVIEW TAB */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Total Sales</p>
                                    <h3 className="text-xl font-bold text-emerald-600 mt-1">₦{totalRevenue.toLocaleString()}</h3>
                                </div>
                                <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600"><TrendingUp className="w-4 h-4" /></div>
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Cost of Goods</p>
                                    <h3 className="text-xl font-bold text-slate-700 mt-1">₦{totalCOGS.toLocaleString()}</h3>
                                </div>
                                <div className="p-2 bg-slate-100 rounded-lg text-slate-600"><Package className="w-4 h-4" /></div>
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Gross Profit</p>
                                    <h3 className="text-xl font-bold text-blue-600 mt-1">₦{grossProfit.toLocaleString()}</h3>
                                </div>
                                <div className="p-2 bg-blue-100 rounded-lg text-blue-600"><DollarSign className="w-4 h-4" /></div>
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Total Expenses</p>
                                    <h3 className="text-xl font-bold text-red-500 mt-1">₦{totalExpenses.toLocaleString()}</h3>
                                </div>
                                <div className="p-2 bg-red-100 rounded-lg text-red-600"><CreditCard className="w-4 h-4" /></div>
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Net Profit</p>
                                    <h3 className={`text-xl font-bold mt-1 ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                        ₦{netProfit.toLocaleString()}
                                    </h3>
                                </div>
                                <div className="p-2 bg-purple-100 rounded-lg text-purple-600"><span className="w-4 h-4 flex items-center justify-center font-bold text-sm">₦</span></div>
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Discounts Made</p>
                                    <h3 className="text-xl font-bold text-orange-500 mt-1">₦{totalDiscounts.toLocaleString()}</h3>
                                </div>
                                <div className="p-2 bg-orange-100 rounded-lg text-orange-600"><span className="w-4 h-4 flex items-center justify-center font-bold text-sm">₦</span></div>
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Total Refunds</p>
                                    <h3 className="text-xl font-bold text-rose-500 mt-1">₦{totalRefunds.toLocaleString()}</h3>
                                </div>
                                <div className="p-2 bg-rose-100 rounded-lg text-rose-600"><TrendingDown className="w-4 h-4" /></div>
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Value Lost (Damaged)</p>
                                    <h3 className="text-xl font-bold text-red-600 mt-1">₦{totalValueLost.toLocaleString()}</h3>
                                </div>
                                <div className="p-2 bg-red-100 rounded-lg text-red-600"><AlertTriangle className="w-4 h-4" /></div>
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Transactions</p>
                                    <h3 className="text-xl font-bold text-slate-800 mt-1">{totalTransactions}</h3>
                                </div>
                                <div className="p-2 bg-amber-100 rounded-lg text-amber-600"><ShoppingBag className="w-4 h-4" /></div>
                            </div>
                        </div>
                    </div>

                    {/* Charts Row */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <h3 className="font-bold text-slate-800 mb-6">Sales Trend</h3>
                            <div className="h-72 w-full">
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                    <AreaChart data={salesByDate}>
                                        <defs>
                                            <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(value) => `N${value / 1000}k`} />
                                        <RechartsTooltip
                                            formatter={(value: number) => [`₦${value.toLocaleString()}`, 'Revenue']}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        />
                                        <Area type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <h3 className="font-bold text-slate-800 mb-6">Payment Methods</h3>
                            <div className="h-72 w-full">
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                    <PieChart>
                                        <Pie
                                            data={salesByPayment}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={100}
                                            fill="#8884d8"
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {salesByPayment.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip formatter={(value: number) => `₦${value.toLocaleString()}`} />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Top Products Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-6 border-b border-slate-200">
                            <h3 className="font-bold text-slate-800">Top Selling Products</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-500">
                                    <tr>
                                        <th className="p-4 font-medium">Product</th>
                                        <th className="p-4 font-medium text-right">Quantity Sold</th>
                                        <th className="p-4 font-medium text-right">Revenue</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {topProducts.map((p, i) => (
                                        <tr key={i} className="hover:bg-slate-50">
                                            <td className="p-4 text-slate-800 font-medium">{p.name}</td>
                                            <td className="p-4 text-right text-slate-600">{p.qty}</td>
                                            <td className="p-4 text-right font-bold text-emerald-600">₦{p.revenue.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* 2. INVENTORY TAB */}
            {activeTab === 'inventory' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-4 border-b border-slate-200 bg-red-50 flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-red-600" />
                            <h3 className="font-bold text-red-900">Low Stock Alerts</h3>
                        </div>
                        <div className="p-4 overflow-y-auto max-h-[500px]">
                            {inventoryAnalysis.lowStockProducts.length === 0 ? (
                                <p className="text-slate-500 text-center py-4">All stock levels are healthy.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-slate-500">
                                                <th className="pb-2">Product</th>
                                                <th className="pb-2 text-right">Current</th>
                                                <th className="pb-2 text-right">Min</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {inventoryAnalysis.lowStockProducts.map(p => (
                                                <tr key={p.id}>
                                                    <td className="py-3 font-medium text-slate-800">{p.name}</td>
                                                    <td className="py-3 text-right text-red-600 font-bold">{p.currentStock}</td>
                                                    <td className="py-3 text-right text-slate-500">{p.minStockLevel}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-4 border-b border-slate-200 bg-amber-50 flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-amber-600" />
                            <h3 className="font-bold text-amber-900">Expiry Watch (Next 90 Days)</h3>
                        </div>
                        <div className="p-4 overflow-y-auto max-h-[500px]">
                            {inventoryAnalysis.expiringBatches.length === 0 ? (
                                <p className="text-slate-500 text-center py-4">No upcoming expiries found.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-slate-500">
                                                <th className="pb-2">Batch</th>
                                                <th className="pb-2">Product</th>
                                                <th className="pb-2">Expires</th>
                                                <th className="pb-2 text-right">Days</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {inventoryAnalysis.expiringBatches.map(b => (
                                                <tr key={b.id} className={b.isExpired ? "bg-red-50" : ""}>
                                                    <td className="py-3 font-mono text-xs text-slate-500">{b.batchNumber}</td>
                                                    <td className="py-3 font-medium text-slate-800">{b.productName}</td>
                                                    <td className="py-3 text-slate-600">{format(b.expiryDate, 'MMM dd, yyyy')}</td>
                                                    <td className={`py-3 text-right font-bold ${b.isExpired ? 'text-red-600' : 'text-amber-600'}`}>
                                                        {b.isExpired ? 'EXPIRED' : `${b.daysUntilExpiry} days`}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 3. SALES TAB (Legacy Table) */}
            {activeTab === 'sales' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
                        <div className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-slate-400" />
                            <h2 className="font-semibold text-slate-800">Detailed Sales Log</h2>
                        </div>
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="Search sales..."
                                value={salesSearchQuery}
                                onChange={(e) => setSalesSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                            />
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                                <tr>
                                    <th className="p-4 font-medium">Date</th>
                                    <th className="p-4 font-medium">Customer</th>
                                    <th className="p-4 font-medium">Payment</th>
                                    <th className="p-4 font-medium">Items</th>
                                    <th className="p-4 font-medium text-right">Discount</th>
                                    <th className="p-4 font-medium text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredSales.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-slate-400">
                                            {loading ? "Loading..." : "No sales found matching your criteria."}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredSales.map((sale) => (
                                        <tr key={sale.id} className="hover:bg-slate-50">
                                            <td className="p-4">
                                                <div className="font-medium text-slate-900">{format(sale.date, 'MMM dd, yyyy')}</div>
                                                <div className="text-xs text-slate-500">{format(sale.date, 'HH:mm')}</div>
                                                {sale.invoiceNumber && <div className="text-xs text-slate-400">#{sale.invoiceNumber}</div>}
                                            </td>
                                            <td className="p-4 text-slate-700">{sale.customerName || 'Walk-in'}</td>
                                            <td className="p-4">
                                                <span className="px-2 py-1 rounded-full text-xs bg-slate-100 text-slate-600 border border-slate-200">
                                                    {sale.paymentMethod}
                                                </span>
                                            </td>
                                            <td className="p-4 text-slate-600">
                                                {(sale.items?.length || 0)} items
                                            </td>
                                            <td className="p-4 text-right text-orange-500">
                                                {(sale.discount || 0) > 0 ? `-₦${(sale.discount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-'}
                                            </td>
                                            <td className="p-4 text-right font-bold text-slate-900">
                                                ₦{sale.finalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* 4. FINANCIALS TAB */}

            {activeTab === 'financials' && (

                <div className="space-y-6">

                    {/* Financial Summary */}

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">

                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Total Sales</p>
                                    <h3 className="text-2xl font-bold text-emerald-600 mt-1">₦{totalRevenue.toLocaleString()}</h3>
                                </div>
                                <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600"><TrendingUp className="w-5 h-5" /></div>
                            </div>
                        </div>

                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Gross Profit</p>
                                    <h3 className="text-2xl font-bold text-blue-600 mt-1">₦{grossProfit.toLocaleString()}</h3>
                                </div>
                                <div className="p-2 bg-blue-100 rounded-lg text-blue-600"><DollarSign className="w-5 h-5" /></div>
                            </div>
                        </div>

                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Total Expenses</p>
                                    <h3 className="text-2xl font-bold text-red-500 mt-1">₦{totalExpenses.toLocaleString()}</h3>
                                </div>
                                <div className="p-2 bg-red-100 rounded-lg text-red-600"><CreditCard className="w-5 h-5" /></div>
                            </div>
                        </div>

                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Net Profit</p>
                                    <h3 className={`text-2xl font-bold mt-1 ${netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                        ₦{netProfit.toLocaleString()}
                                    </h3>
                                </div>
                                <div className="p-2 bg-purple-100 rounded-lg text-purple-600"><span className="w-5 h-5 flex items-center justify-center font-bold text-sm">₦</span></div>
                            </div>
                        </div>

                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Discounts Made</p>
                                    <h3 className="text-2xl font-bold text-orange-500 mt-1">₦{totalDiscounts.toLocaleString()}</h3>
                                </div>
                                <div className="p-2 bg-orange-100 rounded-lg text-orange-600"><span className="w-5 h-5 flex items-center justify-center font-bold text-sm">₦</span></div>
                            </div>
                        </div>

                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Total Refunds</p>
                                    <h3 className="text-2xl font-bold text-rose-500 mt-1">₦{totalRefunds.toLocaleString()}</h3>
                                </div>
                                <div className="p-2 bg-rose-100 rounded-lg text-rose-600"><TrendingDown className="w-5 h-5" /></div>
                            </div>
                        </div>

                    </div>



                    {/* Detailed Expenses Table */}

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">

                        <div className="p-6 border-b border-slate-200">

                            <h3 className="font-bold text-slate-800">Detailed Expenses</h3>

                        </div>

                        <div className="overflow-x-auto">

                            <table className="w-full text-left text-sm">

                                <thead className="bg-slate-50 text-slate-500">

                                    <tr>

                                        <th className="p-4 font-medium">Date</th>

                                        <th className="p-4 font-medium">Description</th>

                                        <th className="p-4 font-medium">Category</th>

                                        <th className="p-4 font-medium text-right">Amount</th>

                                    </tr>

                                </thead>

                                <tbody className="divide-y divide-slate-100">

                                    {expenses.length === 0 ? (

                                        <tr>

                                            <td colSpan={4} className="p-8 text-center text-slate-400">

                                                {loading ? "Loading expenses..." : "No expenses recorded for this period."}

                                            </td>

                                        </tr>

                                    ) : (

                                        expenses.map((expense) => (

                                            <tr key={expense.id} className="hover:bg-slate-50">

                                                <td className="p-4">

                                                    <div className="font-medium text-slate-900">{format(expense.date, 'MMM dd, yyyy')}</div>

                                                    <div className="text-xs text-slate-500">{format(expense.date, 'HH:mm')}</div>

                                                </td>

                                                <td className="p-4 text-slate-700">{expense.note}</td>

                                                <td className="p-4 text-slate-600">{expense.category}</td>

                                                <td className="p-4 text-right font-bold text-red-500">

                                                    ₦{expense.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

                                                </td>

                                            </tr>

                                        ))

                                    )}

                                </tbody>

                            </table>

                        </div>

                    </div>

                </div>

            )}



            {/* 5. RETURN ANALYTICS TAB */}

            {activeTab === 'returnAnalytics' && (

                <ReturnAnalytics startDate={startDate} endDate={endDate} />

            )}

        </div>

    );

};



export default Reports;