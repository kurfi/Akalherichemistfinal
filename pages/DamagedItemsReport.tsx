import React, { useState, useMemo } from 'react';
import { db } from '../db/db';
import { ReturnedItem, Customer, User } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { Search, Filter, Calendar, Package, User as UserIcon } from 'lucide-react';
import { Range } from 'react-date-range';

const DamagedItemsReport: React.FC = () => {
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    productId: '',
    staffId: '',
    searchKeyword: ''
  });

  const [dateRange, setDateRange] = useState<Range[]>([
    {
      startDate: undefined,
      endDate: undefined,
      key: 'selection',
    },
  ]);

  const allReturnedItems = useLiveQuery(() => db.returnedItems.where('restockStatus').equals('damaged').toArray(), []);
  const allProducts = useLiveQuery(() => db.products.toArray(), []);
  const allUsers = useLiveQuery(() => db.users.toArray(), []);
  const allReturns = useLiveQuery(() => db.returns.toArray(), []); // To link staffId

  const filteredDamagedItems = useMemo(() => {
    if (!allReturnedItems) return [];

    let tempItems = allReturnedItems;

    // Date range filter
    if (dateRange[0]?.startDate && dateRange[0]?.endDate) {
      const start = dateRange[0].startDate.setHours(0, 0, 0, 0);
      const end = dateRange[0].endDate.setHours(23, 59, 59, 999);
      
      const returnsInDateRange = allReturns?.filter(ret => ret.returnDate.getTime() >= start && ret.returnDate.getTime() <= end).map(ret => ret.id) || [];
      tempItems = tempItems.filter(item => returnsInDateRange.includes(item.returnId));
    }
    
    // Product filter
    if (filters.productId) {
        tempItems = tempItems.filter(item => item.productId === parseInt(filters.productId));
    }

    // Staff filter (requires joining with returns table)
    if (filters.staffId && allReturns) {
        const returnsByStaff = allReturns.filter(ret => ret.staffId === parseInt(filters.staffId)).map(ret => ret.id);
        tempItems = tempItems.filter(item => returnsByStaff.includes(item.returnId));
    }

    // Search Keyword filter (on product name or returnId)
    if (filters.searchKeyword) {
        const keyword = filters.searchKeyword.toLowerCase();
        tempItems = tempItems.filter(item =>
            item.productName.toLowerCase().includes(keyword) ||
            item.returnId.toString().includes(keyword)
        );
    }

    // Sort by return date (newest first)
    return tempItems.sort((a, b) => {
        const returnA = allReturns?.find(ret => ret.id === a.returnId);
        const returnB = allReturns?.find(ret => ret.id === b.returnId);
        return (returnB?.returnDate?.getTime() || 0) - (returnA?.returnDate?.getTime() || 0);
    });
  }, [allReturnedItems, filters, dateRange, allReturns]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleDateChange = (ranges: any) => {
    setDateRange([ranges.selection]);
    setFilters(prev => ({
        ...prev,
        startDate: ranges.selection.startDate ? format(ranges.selection.startDate, 'yyyy-MM-dd') : '',
        endDate: ranges.selection.endDate ? format(ranges.selection.endDate, 'yyyy-MM-MM') : '',
    }));
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Damaged Items Report</h1>

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

          {/* Product Filter */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Product</label>
            <select
              name="productId"
              value={filters.productId}
              onChange={handleFilterChange}
              className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">All Products</option>
              {allProducts?.map(product => (
                <option key={product.id} value={product.id}>{product.name}</option>
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

          {/* Search Keyword */}
          <div className="col-span-full xl:col-span-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">Search Keyword</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                name="searchKeyword"
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Search by Product Name/Return ID"
                value={filters.searchKeyword}
                onChange={handleFilterChange}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Damaged Items Table */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <h2 className="text-lg font-semibold text-slate-700 mb-4">Damaged Items Overview</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-slate-500 uppercase tracking-wider">Return ID</th>
                <th className="px-4 py-2 text-left text-slate-500 uppercase tracking-wider">Product</th>
                <th className="px-4 py-2 text-left text-slate-500 uppercase tracking-wider">Qty Damaged</th>
                <th className="px-4 py-2 text-left text-slate-500 uppercase tracking-wider">Value Lost</th>
                <th className="px-4 py-2 text-left text-slate-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-2 text-left text-slate-500 uppercase tracking-wider">Staff</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filteredDamagedItems.length > 0 ? (
                filteredDamagedItems.map(item => {
                  const associatedReturn = allReturns?.find(ret => ret.id === item.returnId);
                  const returnDate = associatedReturn ? format(associatedReturn.returnDate, 'MMM dd, yyyy HH:mm') : 'N/A';
                  const staffName = allUsers?.find(u => u.id === associatedReturn?.staffId)?.username || 'N/A';
                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-2 whitespace-nowrap font-medium">#{item.returnId}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{item.productName}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{item.quantity}</td>
                      <td className="px-4 py-2 whitespace-nowrap font-bold text-red-600">₦{item.valueLost?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) || '0.00'}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{returnDate}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{staffName}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-center text-slate-500">No damaged items found matching your criteria.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DamagedItemsReport;