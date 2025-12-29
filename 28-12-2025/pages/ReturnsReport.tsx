import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../db/db';
import { Return, ReturnedItem, PaymentMethod, Customer, User, ReturnReason } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, parseISO } from 'date-fns';
import { Search, Filter, Calendar, DollarSign, Package, User as UserIcon, Tag, CheckCircle, XCircle } from 'lucide-react';
import { DateRangePicker, Range } from 'react-date-range';
import 'react-date-range/dist/theme/default.css'; // theme css file
import 'react-date-range/dist/styles.css'; // main style file


const ReturnsReport: React.FC = () => {
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    customerId: '',
    staffId: '',
    reason: '',
    refundMethod: '',
    restockStatus: '', // 'restocked' | 'damaged' | ''
    searchKeyword: ''
  });

  const [dateRange, setDateRange] = useState<Range[]>([
    {
      startDate: undefined,
      endDate: undefined,
      key: 'selection',
    },
  ]);

  const allReturns = useLiveQuery(() => db.returns.toArray(), []);
  const allReturnedItems = useLiveQuery(() => db.returnedItems.toArray(), []);
  const allCustomers = useLiveQuery(() => db.customers.toArray(), []);
  const allUsers = useLiveQuery(() => db.users.toArray(), []);

  // Filtered returns based on filter state
  const filteredReturns = useMemo(() => {
    if (!allReturns || !allReturnedItems) return [];

    let tempReturns = allReturns;

    // Date range filter
    if (dateRange[0]?.startDate && dateRange[0]?.endDate) {
      const start = dateRange[0].startDate.setHours(0, 0, 0, 0);
      const end = dateRange[0].endDate.setHours(23, 59, 59, 999);
      tempReturns = tempReturns.filter(ret => ret.returnDate.getTime() >= start && ret.returnDate.getTime() <= end);
    }
    
    // Customer filter
    if (filters.customerId) {
        tempReturns = tempReturns.filter(ret => ret.customerId === parseInt(filters.customerId));
    }

    // Staff filter
    if (filters.staffId) {
        tempReturns = tempReturns.filter(ret => ret.staffId === parseInt(filters.staffId));
    }

    // Reason filter
    if (filters.reason) {
        tempReturns = tempReturns.filter(ret => ret.reason === filters.reason);
    }

    // Refund Method filter
    if (filters.refundMethod) {
        tempReturns = tempReturns.filter(ret => ret.paymentMethod === filters.refundMethod);
    }

    // Search Keyword filter (on customer name or saleId)
    if (filters.searchKeyword) {
        const keyword = filters.searchKeyword.toLowerCase();
        tempReturns = tempReturns.filter(ret =>
            ret.customerName?.toLowerCase().includes(keyword) ||
            ret.saleId?.toString().includes(keyword) ||
            ret.id?.toString().includes(keyword)
        );
    }

    // Apply restockStatus filter indirectly via returned items
    const returnsWithFilteredItems = tempReturns.map(ret => {
        const itemsForReturn = allReturnedItems.filter(item => item.returnId === ret.id);
        if (filters.restockStatus) {
            const filteredItems = itemsForReturn.filter(item => item.restockStatus === filters.restockStatus);
            return filteredItems.length > 0 ? { ...ret, returnedItems: filteredItems } : null;
        }
        return { ...ret, returnedItems: itemsForReturn };
    }).filter(Boolean) as (Return & { returnedItems: ReturnedItem[] })[];

    return returnsWithFilteredItems.sort((a, b) => b.returnDate.getTime() - a.returnDate.getTime()); // Sort by newest
  }, [allReturns, allReturnedItems, filters, dateRange]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleDateChange = (ranges: any) => {
    setDateRange([ranges.selection]);
    setFilters(prev => ({
        ...prev,
        startDate: ranges.selection.startDate ? format(ranges.selection.startDate, 'yyyy-MM-dd') : '',
        endDate: ranges.selection.endDate ? format(ranges.selection.endDate, 'yyyy-MM-dd') : '',
    }));
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Returns Report</h1>

      {/* Filters Section */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-700 mb-4 flex items-center gap-2"><Filter className="w-5 h-5" /> Filters</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {/* Date Range Filter */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date Range</label>
            <div className="relative">
              <input
                type="text"
                readOnly
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                value={dateRange[0]?.startDate ? `${format(dateRange[0].startDate, 'MMM dd, yyyy')} - ${format(dateRange[0].endDate!, 'MMM dd, yyyy')}` : 'Select Date Range'}
                onClick={() => { /* Toggle date picker visibility */ }}
              />
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            </div>
            {/* TODO: Implement a proper date range picker modal/popover */}
             {/* For now, a basic date input until Shadcn UI or similar is integrated for a better picker */}
            <input
                type="date"
                name="startDate"
                className="w-full border border-slate-200 rounded-lg p-2 text-sm mt-2"
                value={filters.startDate}
                onChange={handleFilterChange}
            />
            <input
                type="date"
                name="endDate"
                className="w-full border border-slate-200 rounded-lg p-2 text-sm mt-2"
                value={filters.endDate}
                onChange={handleFilterChange}
            />
          </div>

          {/* Customer Filter */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Customer</label>
            <select
              name="customerId"
              value={filters.customerId}
              onChange={handleFilterChange}
              className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">All Customers</option>
              {allCustomers?.map(customer => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
          </div>

          {/* Staff Filter */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Staff</label>
            <select
              name="staffId"
              value={filters.staffId}
              onChange={handleFilterChange}
              className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">All Staff</option>
              {allUsers?.map(user => (
                <option key={user.id} value={user.id}>{user.username}</option>
              ))}
            </select>
          </div>

          {/* Reason Filter */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Return Reason</label>
            <select
              name="reason"
              value={filters.reason}
              onChange={handleFilterChange}
              className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">All Reasons</option>
              {Object.values(ReturnReason).map(reason => (
                <option key={reason} value={reason}>{reason}</option>
              ))}
            </select>
          </div>

          {/* Refund Method Filter */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Refund Method</label>
            <select
              name="refundMethod"
              value={filters.refundMethod}
              onChange={handleFilterChange}
              className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">All Methods</option>
              {Object.values(PaymentMethod).map(method => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
          </div>

          {/* Restock Status Filter */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Restock Status</label>
            <select
              name="restockStatus"
              value={filters.restockStatus}
              onChange={handleFilterChange}
              className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">All Statuses</option>
              <option value="restocked">Restocked</option>
              <option value="damaged">Damaged</option>
            </select>
          </div>

          {/* Search Keyword */}
          <div className="col-span-full xl:col-span-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">Search Keyword</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                name="searchKeyword"
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Search by Customer/Sale ID/Return ID"
                value={filters.searchKeyword}
                onChange={handleFilterChange}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Returns Table */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <h2 className="text-lg font-semibold text-slate-700 mb-4">Returns Overview</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-slate-500 uppercase tracking-wider">Return ID</th>
                <th className="px-4 py-2 text-left text-slate-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-2 text-left text-slate-500 uppercase tracking-wider">Original Sale ID</th>
                <th className="px-4 py-2 text-left text-slate-500 uppercase tracking-wider">Customer</th>
                <th className="px-4 py-2 text-left text-slate-500 uppercase tracking-wider">Staff</th>
                <th className="px-4 py-2 text-left text-slate-500 uppercase tracking-wider">Reason</th>
                <th className="px-4 py-2 text-left text-slate-500 uppercase tracking-wider">Refund Method</th>
                <th className="px-4 py-2 text-left text-slate-500 uppercase tracking-wider">Refund Amount</th>
                <th className="px-4 py-2 text-left text-slate-500 uppercase tracking-wider">Items Returned</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filteredReturns.length > 0 ? (
                filteredReturns.map(ret => (
                  <tr key={ret.id}>
                    <td className="px-4 py-2 whitespace-nowrap font-medium">#{ret.id}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{format(ret.returnDate, 'MMM dd, yyyy HH:mm')}</td>
                    <td className="px-4 py-2 whitespace-nowrap">#{ret.saleId}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{ret.customerName || 'N/A'}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{allUsers?.find(u => u.id === ret.staffId)?.username || 'N/A'}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{ret.reason}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{ret.paymentMethod}</td>
                    <td className="px-4 py-2 whitespace-nowrap font-bold text-emerald-600">₦{ret.totalRefundAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    <td className="px-4 py-2">
                      {ret.returnedItems?.map((item, index) => (
                        <div key={index} className="flex items-center gap-1 text-xs">
                          {item.restockStatus === 'restocked' ? (
                            <CheckCircle className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <XCircle className="w-3 h-3 text-red-500" />
                          )}
                          {item.productName} ({item.quantity})
                        </div>
                      ))}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-4 text-center text-slate-500">No returns found matching your criteria.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReturnsReport;