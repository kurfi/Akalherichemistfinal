import * as React from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { UserRole } from '../types';
import { db } from '../db/db';
import { DollarSign, ShoppingBag, AlertTriangle, Users, TrendingDown, Wallet, CreditCard, Package, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { startOfDay, endOfDay, subDays, format, startOfMonth } from 'date-fns';

const Dashboard: React.FC = () => {
    const [stats, setStats] = useState({
        todaySales: 0,
        netSalesToday: 0, // New Metric
        todayExpenses: 0,
        totalExpenses: 0,
        totalDebtToUs: 0, // Receivables
        totalDebtToPay: 0, // Payables
        inventoryValue: 0,
        lowStockItems: 0,
        totalProducts: 0,
        // New Return Metrics
        totalRefundAmountToday: 0,
        totalRefundAmountLast7Days: 0,
        totalRefundAmountThisMonth: 0,
        numItemsReturnedToday: 0,
        numItemsReturnedLast7Days: 0,
        numItemsReturnedThisMonth: 0,
        totalValueDamagedToday: 0,
        totalValueDamagedLast7Days: 0,
        totalValueDamagedThisMonth: 0,
        returnRateToday: 0,
        returnRateLast7Days: 0,
        returnRateThisMonth: 0,
    });

    const [weeklyData, setWeeklyData] = useState<any[]>([]);

    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const isAdmin = currentUser?.role === UserRole.ADMIN;

    useEffect(() => {
        const fetchStats = async () => {
            const now = new Date();
            const todayStart = startOfDay(now);
            const todayEnd = endOfDay(now);
            const sevenDaysAgo = startOfDay(subDays(now, 6)); // Start of 6 days ago + today = 7 days
            const monthStart = startOfMonth(now);

            // Optimization: Use targeted queries instead of loading everything
            // Parallelize independent queries
            const [
                // Sales Ranges
                todaySalesArr,
                last7DaysSalesArr,
                thisMonthSalesArr,

                // Expenses Ranges & Totals
                paidExpensesArr, // Optimization trade-off: fetching all to filter Paid/Pending is simpler for lifetime totals, but we could optimize later.

                // Returns Ranges
                todayReturnsArr,
                last7DaysReturnsArr,
                thisMonthReturnsArr,

                // Global Data (Snapshot)
                allCustomers,
                allBatches,
                allProducts,
                allReturnedItems // Needed for linking items to returns (value damaged calc)
            ] = await Promise.all([
                db.sales.where('date').between(todayStart, todayEnd, true, true).toArray(),
                db.sales.where('date').between(sevenDaysAgo, todayEnd, true, true).toArray(),
                db.sales.where('date').between(monthStart, todayEnd, true, true).toArray(),

                db.expenses.toArray(), // Still needed for lifetime totals (Payables/Total Expenses)

                db.returns.where('returnDate').between(todayStart, todayEnd, true, true).toArray(),
                db.returns.where('returnDate').between(sevenDaysAgo, todayEnd, true, true).toArray(),
                db.returns.where('returnDate').between(monthStart, todayEnd, true, true).toArray(),

                db.customers.toArray(),
                db.batches.toArray(),
                db.products.toArray(),
                db.returnedItems.toArray() // Needed to calculate damaged value. If large, consider indexing 'returnId'.
            ]);

            // 1. Sales Calculations
            const todaySalesTotal = todaySalesArr.reduce((acc, sale) => acc + sale.finalAmount, 0);
            const last7DaysSalesTotal = last7DaysSalesArr.reduce((acc, sale) => acc + sale.finalAmount, 0);
            const thisMonthSalesTotal = thisMonthSalesArr.reduce((acc, sale) => acc + sale.finalAmount, 0);

            // 2. Expenses Calculations
            const paidExpenses = paidExpensesArr.filter(e => e.status === 'PAID' || !e.status);
            const pendingExpenses = paidExpensesArr.filter(e => e.status === 'PENDING');

            const todayExpensesTotal = paidExpenses
                .filter(e => e.date >= todayStart && e.date <= todayEnd)
                .reduce((acc, exp) => acc + exp.amount, 0);

            const totalExpenses = paidExpenses.reduce((acc, exp) => acc + exp.amount, 0);
            const totalDebtToPay = pendingExpenses.reduce((acc, exp) => acc + exp.amount, 0);

            // 3. Customer Debt (Receivables)
            const totalDebtToUs = allCustomers.reduce((acc, c) => acc + (c.currentDebt || 0), 0);

            // 4. Inventory Value & Low Stock
            const inventoryValue = allBatches.reduce((acc, b) => acc + (b.quantity * b.costPrice), 0);

            let lowStockCount = 0;
            for (const p of allProducts) {
                const productBatches = allBatches.filter(b => b.productId === p.id);
                const totalStock = productBatches.reduce((sum, b) => sum + b.quantity, 0);
                if (totalStock <= p.minStockLevel) lowStockCount++;
            }

            // 5. Return Metrics Helper
            const calculateReturnMetrics = (periodReturns: any[]) => {
                const periodReturnIds = periodReturns.map(ret => ret.id);
                const periodReturnedItems = allReturnedItems.filter(item => periodReturnIds.includes(item.returnId));

                const totalRefundAmount = periodReturns.reduce((acc, ret) => acc + ret.totalRefundAmount, 0);
                const numItemsReturned = periodReturnedItems.reduce((acc, item) => acc + item.quantity, 0);
                const totalValueDamaged = periodReturnedItems
                    .filter(item => item.restockStatus === 'damaged')
                    .reduce((acc, item) => acc + (item.valueLost || 0), 0);

                return { totalRefundAmount, numItemsReturned, totalValueDamaged };
            };

            const todayMetrics = calculateReturnMetrics(todayReturnsArr);
            const last7DaysMetrics = calculateReturnMetrics(last7DaysReturnsArr);
            const thisMonthMetrics = calculateReturnMetrics(thisMonthReturnsArr);

            // Calculate Return Rates
            const calculateReturnRate = (totalSales: number, totalRefunds: number) => {
                return totalSales > 0 ? (totalRefunds / totalSales) * 100 : 0;
            };

            const returnRateToday = calculateReturnRate(todaySalesTotal, todayMetrics.totalRefundAmount);
            const returnRateLast7Days = calculateReturnRate(last7DaysSalesTotal, last7DaysMetrics.totalRefundAmount);
            const returnRateThisMonth = calculateReturnRate(thisMonthSalesTotal, thisMonthMetrics.totalRefundAmount);

            // Net Sales Today
            const netSalesToday = todaySalesTotal - todayMetrics.totalRefundAmount;

            setStats(prevStats => ({
                ...prevStats,
                todaySales: todaySalesTotal,
                netSalesToday: netSalesToday,
                todayExpenses: todayExpensesTotal,
                totalExpenses: totalExpenses,
                totalDebtToUs: totalDebtToUs,
                totalDebtToPay: totalDebtToPay,
                inventoryValue: inventoryValue,
                lowStockItems: lowStockCount,
                totalProducts: allProducts.length,

                totalRefundAmountToday: todayMetrics.totalRefundAmount,
                totalRefundAmountLast7Days: last7DaysMetrics.totalRefundAmount,
                totalRefundAmountThisMonth: thisMonthMetrics.totalRefundAmount,

                numItemsReturnedToday: todayMetrics.numItemsReturned,
                numItemsReturnedLast7Days: last7DaysMetrics.numItemsReturned,
                numItemsReturnedThisMonth: thisMonthMetrics.numItemsReturned,

                totalValueDamagedToday: todayMetrics.totalValueDamaged,
                totalValueDamagedLast7Days: last7DaysMetrics.totalValueDamaged,
                totalValueDamagedThisMonth: thisMonthMetrics.totalValueDamaged,

                returnRateToday: returnRateToday,
                returnRateLast7Days: returnRateLast7Days,
                returnRateThisMonth: returnRateThisMonth,
            }));

            // 6. Weekly Sales Data
            // Optimize: We already fetched last7DaysSalesArr. We can group them in JS.
            const last7DaysChartData = [];
            for (let i = 6; i >= 0; i--) {
                const date = subDays(now, i);
                const dayStart = startOfDay(date);
                const dayEnd = endOfDay(date);

                const salesForDay = last7DaysSalesArr.filter(sale => sale.date >= dayStart && sale.date <= dayEnd);
                const total = salesForDay.reduce((acc, curr) => acc + curr.finalAmount, 0);
                last7DaysChartData.push({ name: format(date, 'EEE'), sales: total });
            }
            setWeeklyData(last7DaysChartData);
        };

        fetchStats();
    }, []);

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-end">
                <h1 className="text-2xl font-bold text-slate-800">Business Overview</h1>
                <div className="text-sm text-slate-500">{format(new Date(), 'EEEE, MMMM do, yyyy')}</div>
            </div>

            {/* SECTION 1: Daily Pulse */}
            <div>
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Daily Pulse</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {/* Net Sales Card */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center bg-gradient-to-br from-emerald-50 to-white">
                        <div>
                            <p className="text-sm font-medium text-slate-500">Net Sales (Today)</p>
                            <h3 className="text-2xl font-bold text-emerald-700">₦{stats.netSalesToday.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                            <div className="flex items-center gap-1 text-xs text-emerald-600 mt-1">
                                <ArrowUpRight className="w-3 h-3" />
                                <span>Actual Cash Flow</span>
                            </div>
                        </div>
                        <div className="p-3 bg-emerald-100 rounded-full border border-emerald-200">
                            <Wallet className="w-6 h-6 text-emerald-600" />
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
                        <div>
                            <p className="text-sm font-medium text-slate-500">Gross Sales</p>
                            <h3 className="text-2xl font-bold text-slate-900">₦{stats.todaySales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                            <div className="flex items-center gap-1 text-xs text-emerald-600 mt-1">
                                <ArrowUpRight className="w-3 h-3" />
                                <span>Total Revenue</span>
                            </div>
                        </div>
                        <div className="p-3 bg-blue-50 rounded-full">
                            <DollarSign className="w-6 h-6 text-blue-600" />
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
                        <div>
                            <p className="text-sm font-medium text-slate-500">Today's Refunds</p>
                            <h3 className="text-2xl font-bold text-slate-900">₦{stats.totalRefundAmountToday.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                            <div className="flex items-center gap-1 text-xs text-red-500 mt-1">
                                <ArrowDownRight className="w-3 h-3" />
                                <span>Cash Out</span>
                            </div>
                        </div>
                        <div className="p-3 bg-red-50 rounded-full">
                            <TrendingDown className="w-6 h-6 text-red-600" />
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
                        <div>
                            <p className="text-sm font-medium text-slate-500">Paid Expenses</p>
                            <h3 className="text-2xl font-bold text-slate-900">₦{stats.todayExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                            <div className="flex items-center gap-1 text-xs text-red-500 mt-1">
                                <TrendingDown className="w-3 h-3" />
                                <span>Cash Out</span>
                            </div>
                        </div>
                        <div className="p-3 bg-red-50 rounded-full">
                            <CreditCard className="w-6 h-6 text-red-600" />
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
                        <div>
                            <p className="text-sm font-medium text-slate-500">Low Stock</p>
                            <h3 className="text-2xl font-bold text-slate-900">{stats.lowStockItems}</h3>
                            <p className="text-xs text-slate-400 mt-1">Items to order</p>
                        </div>
                        <div className="p-3 bg-amber-50 rounded-full">
                            <AlertTriangle className="w-6 h-6 text-amber-600" />
                        </div>
                    </div>
                </div>
            </div>

            {/* SECTION 2: Financial Status */}
            <div>
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Financial Status</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Receivables */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-orange-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-orange-100 rounded-lg text-orange-600"><ArrowDownRight className="w-4 h-4" /></div>
                                <p className="text-sm font-medium text-slate-600">Receivables</p>
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900">₦{stats.totalDebtToUs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                            <p className="text-xs text-slate-400 mt-1">Debt customers owe us</p>
                        </div>
                    </div>

                    {/* Payables */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-rose-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-rose-100 rounded-lg text-rose-600"><ArrowUpRight className="w-4 h-4" /></div>
                                <p className="text-sm font-medium text-slate-600">Payables</p>
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900">₦{stats.totalDebtToPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                            <p className="text-xs text-slate-400 mt-1">Unpaid expenses/bills</p>
                        </div>
                    </div>

                    {/* Total Expenses */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-slate-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-slate-100 rounded-lg text-slate-600"><CreditCard className="w-4 h-4" /></div>
                                <p className="text-sm font-medium text-slate-600">Total Expenses</p>
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900">₦{stats.totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                            <p className="text-xs text-slate-400 mt-1">Lifetime paid expenses</p>
                        </div>
                    </div>

                    {/* Inventory Asset */}
                    {isAdmin && (
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="p-2 bg-blue-100 rounded-lg text-blue-600"><Package className="w-4 h-4" /></div>
                                    <p className="text-sm font-medium text-slate-600">Inventory Value</p>
                                </div>
                                <h3 className="text-2xl font-bold text-slate-900">₦{stats.inventoryValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                                <p className="text-xs text-slate-400 mt-1">Asset valuation (Cost)</p>
                            </div>
                        </div>
                    )}

                    {/* New: Total Refunds This Month */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-purple-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-purple-100 rounded-lg text-purple-600"><TrendingDown className="w-4 h-4" /></div>
                                <p className="text-sm font-medium text-slate-600">Total Refunds (Month)</p>
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900">₦{stats.totalRefundAmountThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                            <p className="text-xs text-slate-400 mt-1">Refunds issued this month</p>
                        </div>
                    </div>

                    {/* New: Damaged Value This Month */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-rose-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-rose-100 rounded-lg text-rose-600"><AlertTriangle className="w-4 h-4" /></div>
                                <p className="text-sm font-medium text-slate-600">Damaged Value (Month)</p>
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900">₦{stats.totalValueDamagedThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                            <p className="text-xs text-slate-400 mt-1">Value lost from damaged returns</p>
                        </div>
                    </div>

                    {/* New: Return Rate This Month */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600"><TrendingDown className="w-4 h-4" /></div>
                                <p className="text-sm font-medium text-slate-600">Return Rate (Month)</p>
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900">{stats.returnRateThisMonth.toFixed(2)}%</h3>
                            <p className="text-xs text-slate-400 mt-1">Refunds / Total Sales</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-semibold text-slate-800">Weekly Sales Performance</h2>
                        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">Last 7 Days</span>
                    </div>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                            <BarChart data={weeklyData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} axisLine={false} tickLine={false} dy={10} />
                                <YAxis stroke="#94a3b8" fontSize={12} axisLine={false} tickLine={false} tickFormatter={(value) => `₦${value / 1000}k`} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    cursor={{ fill: '#f8fafc' }}
                                    formatter={(value: any) => [`₦${value.toLocaleString()}`, 'Sales']}
                                />
                                <Bar dataKey="sales" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-800 mb-4">Quick Actions</h2>
                    <div className="space-y-3">
                        <button
                            onClick={() => navigate('/pos')}
                            className="w-full flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:bg-emerald-50 hover:border-emerald-100 transition-all duration-200 text-left group"
                        >
                            <div className="bg-emerald-100 p-2 rounded-md text-emerald-600 group-hover:scale-110 transition-transform"><ShoppingBag className="w-4 h-4" /></div>
                            <div>
                                <p className="font-medium text-slate-700 text-sm">New Sale</p>
                                <p className="text-xs text-slate-400">Go to POS</p>
                            </div>
                        </button>
                        {isAdmin && (
                            <button
                                onClick={() => navigate('/inventory')}
                                className="w-full flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:bg-blue-50 hover:border-blue-100 transition-all duration-200 text-left group"
                            >
                                <div className="bg-blue-100 p-2 rounded-md text-blue-600 group-hover:scale-110 transition-transform"><Package className="w-4 h-4" /></div>
                                <div>
                                    <p className="font-medium text-slate-700 text-sm">Add Inventory</p>
                                    <p className="text-xs text-slate-400">Restock products</p>
                                </div>
                            </button>
                        )}
                        <button
                            onClick={() => navigate('/customers')}
                            className="w-full flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:bg-orange-50 hover:border-orange-100 transition-all duration-200 text-left group"
                        >
                            <div className="bg-orange-100 p-2 rounded-md text-orange-600 group-hover:scale-110 transition-transform"><Users className="w-4 h-4" /></div>
                            <div>
                                <p className="font-medium text-slate-700 text-sm">Add Customer</p>
                                <p className="text-xs text-slate-400">Register new client</p>
                            </div>
                        </button>
                        {isAdmin && (
                            <button
                                onClick={() => navigate('/reports')}
                                className="w-full flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:bg-purple-50 hover:border-purple-100 transition-all duration-200 text-left group"
                            >
                                <div className="bg-purple-100 p-2 rounded-md text-purple-600 group-hover:scale-110 transition-transform"><TrendingDown className="w-4 h-4" /></div>
                                <div>
                                    <p className="font-medium text-slate-700 text-sm">View Reports</p>
                                    <p className="text-xs text-slate-400">Full business analytics</p>
                                </div>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;