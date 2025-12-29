import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../db/db';
import { Return, ReturnedItem, Product, ReturnReason } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, getMonth, getYear, parseISO } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area } from 'recharts';
import { Package, Repeat, DollarSign, BarChart as BarChartIcon } from 'lucide-react';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#a4de6c', '#d0ed57', '#ffc658'];

interface ReturnAnalyticsProps {
  startDate: string;
  endDate: string;
}

const ReturnAnalytics: React.FC<ReturnAnalyticsProps> = ({ startDate, endDate }) => {
  const allReturns = useLiveQuery(() => db.returns.toArray(), []);
  const allReturnedItems = useLiveQuery(() => db.returnedItems.toArray(), []);
  const allProducts = useLiveQuery(() => db.products.toArray(), []);

  const filteredReturns = useMemo(() => {
    if (!allReturns) return [];
    const start = parseISO(startDate).setHours(0, 0, 0, 0);
    const end = parseISO(endDate).setHours(23, 59, 59, 999);
    
    return allReturns.filter(
      (ret) => ret.returnDate.getTime() >= start && ret.returnDate.getTime() <= end
    );
  }, [allReturns, startDate, endDate]);

  const filteredReturnedItems = useMemo(() => {
    if (!allReturnedItems || !filteredReturns) return [];
    const returnIds = filteredReturns.map(ret => ret.id);
    return allReturnedItems.filter(item => returnIds.includes(item.returnId));
  }, [allReturnedItems, filteredReturns]);


  // 1. Return Reasons Breakdown
  const reasonsData = useMemo(() => {
    const counts: { [key: string]: number } = {};
    filteredReturns.forEach(ret => {
      counts[ret.reason] = (counts[ret.reason] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredReturns]);

  // 2. Top Returned Products
  const topProductsData = useMemo(() => {
    const productStats: { [productId: number]: { name: string; quantity: number; refundValue: number } } = {};
    filteredReturnedItems.forEach(item => {
      if (!productStats[item.productId]) {
        productStats[item.productId] = { name: item.productName, quantity: 0, refundValue: 0 };
      }
      productStats[item.productId].quantity += item.quantity;
      productStats[item.productId].refundValue += item.refundAmount;
    });
    return Object.values(productStats).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  }, [filteredReturnedItems]);

  // 3. Monthly Return Trends
  const monthlyTrendsData = useMemo(() => {
    const monthlyData: { [key: string]: number } = {}; // Format: YYYY-MM
    filteredReturns.forEach(ret => {
      const monthKey = format(ret.returnDate, 'yyyy-MM');
      monthlyData[monthKey] = (monthlyData[monthKey] || 0) + ret.totalRefundAmount;
    });

    // Ensure all months in range are present, even if no returns
    const allMonths: string[] = [];
    let current = parseISO(startDate);
    const end = parseISO(endDate);
    while (current <= end) {
      allMonths.push(format(current, 'yyyy-MM'));
      current = new Date(current.setMonth(current.getMonth() + 1));
    }
    const uniqueMonths = Array.from(new Set(allMonths)).sort(); // Ensure sorted and unique

    return uniqueMonths.map(month => ({
      month: format(parseISO(month), 'MMM yyyy'),
      refundAmount: monthlyData[month] || 0
    }));
  }, [filteredReturns, startDate, endDate]);

  // 4. Damage vs Restock Ratio
  const restockStatusData = useMemo(() => {
    const counts: { restocked: number; damaged: number } = { restocked: 0, damaged: 0 };
    filteredReturnedItems.forEach(item => {
      if (item.restockStatus === 'restocked') {
        counts.restocked += item.quantity;
      } else if (item.restockStatus === 'damaged') {
        counts.damaged += item.quantity;
      }
    });
    return [
      { name: 'Restocked', value: counts.restocked },
      { name: 'Damaged', value: counts.damaged },
    ];
  }, [filteredReturnedItems]);


  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Total Refunds</p>
                    <h3 className="text-2xl font-bold text-indigo-600 mt-1">₦{filteredReturns.reduce((sum, ret) => sum + ret.totalRefundAmount, 0).toLocaleString()}</h3>
                </div>
                <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600"><DollarSign className="w-5 h-5" /></div>
            </div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Number of Returns</p>
                    <h3 className="text-2xl font-bold text-blue-600 mt-1">{filteredReturns.length}</h3>
                </div>
                <div className="p-2 bg-blue-100 rounded-lg text-blue-600"><Repeat className="w-5 h-5" /></div>
            </div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Items Damaged</p>
                    <h3 className="text-2xl font-bold text-red-600 mt-1">{filteredReturnedItems.filter(item => item.restockStatus === 'damaged').reduce((sum, item) => sum + item.quantity, 0)}</h3>
                </div>
                <div className="p-2 bg-red-100 rounded-lg text-red-600"><Package className="w-5 h-5" /></div>
            </div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Value Lost (Damaged)</p>
                    <h3 className="text-2xl font-bold text-red-600 mt-1">₦{filteredReturnedItems.filter(item => item.restockStatus === 'damaged').reduce((sum, item) => sum + (item.valueLost || 0), 0).toLocaleString()}</h3>
                </div>
                <div className="p-2 bg-red-100 rounded-lg text-red-600"><DollarSign className="w-5 h-5" /></div>
            </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2"><PieChart className="w-5 h-5 text-slate-500" /> Return Reasons Breakdown</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <PieChart>
                <Pie
                  data={reasonsData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {reasonsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(value: number, name: string) => [`${value} Returns`, name]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2"><BarChartIcon className="w-5 h-5 text-slate-500" /> Damage vs Restock Ratio</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <PieChart>
                <Pie
                  data={restockStatusData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {restockStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(value: number, name: string) => [`${value} Items`, name]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Monthly Return Trends */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2"><AreaChart className="w-5 h-5 text-slate-500" /> Monthly Return Trends (Refund Amount)</h3>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <AreaChart data={monthlyTrendsData}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRefund" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => `₦${value.toLocaleString()}`} />
              <CartesianGrid strokeDasharray="3 3" />
              <RechartsTooltip formatter={(value: number) => `₦${value.toLocaleString()}`} />
              <Area type="monotone" dataKey="refundAmount" stroke="#8884d8" fillOpacity={1} fill="url(#colorRefund)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Returned Products Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Package className="w-5 h-5 text-slate-500" /> Top 5 Returned Products</h3>
          </div>
          <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                      <tr>
                          <th className="p-4 font-medium">Product</th>
                          <th className="p-4 font-medium text-right">Quantity Returned</th>
                          <th className="p-4 font-medium text-right">Refund Value</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {topProductsData.length > 0 ? (
                          topProductsData.map((p, i) => (
                              <tr key={i} className="hover:bg-slate-50">
                                  <td className="p-4 text-slate-800 font-medium">{p.name}</td>
                                  <td className="p-4 text-right text-slate-600">{p.quantity}</td>
                                  <td className="p-4 text-right font-bold text-red-600">₦{p.refundValue.toLocaleString()}</td>
                              </tr>
                          ))
                      ) : (
                          <tr>
                              <td colSpan={3} className="p-4 text-center text-slate-500">No products returned in this period.</td>
                          </tr>
                      )}
                  </tbody>
              </table>
          </div>
      </div>

    </div>
  );
};

export default ReturnAnalytics;