import React, { useState } from 'react';
import { db, deleteCustomer, logAudit } from '../db/db';
import { Customer, Sale, CustomerPayment, PaymentMethod } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import { UserPlus, Mail, Phone, X, History, Upload, Download, Pencil, Wallet, Trash2, Search } from 'lucide-react'; // Import Search icon
import { format } from 'date-fns';
import { useAuth } from '../auth/AuthContext';

const Customers: React.FC = () => {
  const { currentUser } = useAuth();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isRepayModalOpen, setIsRepayModalOpen] = useState(false);
  
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSales, setCustomerSales] = useState<Sale[]>([]);
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([]);
  const [activeHistoryTab, setActiveHistoryTab] = useState<'purchases' | 'repayments'>('purchases');
  
  const [newCustomer, setNewCustomer] = useState<Partial<Customer>>({
    creditLimit: 0,
    currentDebt: 0
  });
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [searchQuery, setSearchQuery] = useState(''); // New state for search query

  const [repayForm, setRepayForm] = useState({
      amount: '',
      method: PaymentMethod.CASH,
      note: ''
  });

  // Filter out Walk-in Customer from the management list
  const customers = useLiveQuery(() => {
    if (!db.customers) return [];
    let query = db.customers.where('name').notEqual('Walk-in Customer');

    if (searchQuery) {
      const lowerCaseQuery = searchQuery.toLowerCase();
      return query.filter(customer =>
        customer.name.toLowerCase().includes(lowerCaseQuery) ||
        customer.phone.includes(lowerCaseQuery) ||
        customer.email?.toLowerCase().includes(lowerCaseQuery)
      ).toArray();
    }
    return query.toArray();
  }, [searchQuery]);

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newCustomer.name && newCustomer.phone) {
      await db.customers.add({
        name: newCustomer.name,
        phone: newCustomer.phone,
        email: newCustomer.email || '',
        creditLimit: Number(newCustomer.creditLimit) || 0,
        currentDebt: 0
      } as Customer);
      setIsAddModalOpen(false);
      setNewCustomer({ creditLimit: 0, currentDebt: 0 });
    }
  };

  const handleOpenEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsEditModalOpen(true);
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer || !editingCustomer.id) return;

    try {
      await db.customers.update(editingCustomer.id, {
        name: editingCustomer.name,
        phone: editingCustomer.phone,
        email: editingCustomer.email,
        creditLimit: Number(editingCustomer.creditLimit) || 0,
      });
      setIsEditModalOpen(false);
      setEditingCustomer(null);
    } catch (error) {
      console.error("Failed to update customer:", error);
      alert("Failed to update customer details.");
    }
  };

  const handleViewHistory = async (customer: Customer) => {
    setSelectedCustomer(customer);
    if (customer.id) {
        const sales = await db.sales.where('customerId').equals(customer.id).reverse().toArray();
        const payments = await db.customerPayments.where('customerId').equals(customer.id).reverse().toArray();
        setCustomerSales(sales);
        setCustomerPayments(payments);
        setIsHistoryModalOpen(true);
        setActiveHistoryTab('purchases');
    }
  };

  const handleOpenRepayModal = (customer: Customer) => {
      setSelectedCustomer(customer);
      setRepayForm({ amount: '', method: PaymentMethod.CASH, note: '' });
      setIsRepayModalOpen(true);
  };

  const handleRepayDebt = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedCustomer || !selectedCustomer.id || !repayForm.amount) return;

      const amount = parseFloat(repayForm.amount);
      if (amount <= 0 || amount > selectedCustomer.currentDebt) {
          alert("Please enter a valid amount less than or equal to the current debt.");
          return;
      }

      try {
          await (db as any).transaction('rw', db.customers, db.customerPayments, db.auditLogs, async () => {
              // Record payment
              await db.customerPayments.add({
                  customerId: selectedCustomer.id!,
                  date: new Date(),
                  amount: amount,
                  paymentMethod: repayForm.method,
                  note: repayForm.note
              });

              // Deduct debt
              const newDebt = (selectedCustomer.currentDebt || 0) - amount;
              await db.customers.update(selectedCustomer.id!, {
                  currentDebt: newDebt < 0 ? 0 : newDebt
              });

              // Audit Log
              await logAudit(
                'REPAY_DEBT',
                `Repaid ₦${amount} for customer ${selectedCustomer.name} via ${repayForm.method}`,
                currentUser?.username || 'Unknown'
              );
          });

          setIsRepayModalOpen(false);
          alert("Repayment recorded successfully!");
      } catch (error) {
          console.error("Repayment failed", error);
          alert("Failed to record repayment.");
      }
  };

  const handleDeleteCustomer = async (customerId: number) => {
    const confirmation = window.confirm('Are you sure you want to delete this customer? This action cannot be undone.');

    if (confirmation) {
      try {
        await deleteCustomer(customerId);
        new Notification('Customer Deleted', { body: 'Customer deleted successfully.' });
      } catch (error) {
        console.error('Failed to delete customer:', error);
        new Notification('Error', { body: 'Failed to delete customer.' });
      }
    }
  };

  const downloadTemplate = () => {
    const headers = "Name,Phone,Email,CreditLimit,CurrentDebt\nJohn Doe,08012345678,john@example.com,50000,0";
    const blob = new Blob([headers], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'customers_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        const text = event.target?.result as string;
        const lines = text.split('\n');
        const customersToAdd: Partial<Customer>[] = [];

        // Skip header row (index 0)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const [name, phone, email, creditLimit, currentDebt] = line.split(',');

            if (name && phone) {
                customersToAdd.push({
                    name: name.trim(),
                    phone: phone.trim(),
                    email: email?.trim() || '',
                    creditLimit: parseFloat(creditLimit) || 0,
                    currentDebt: parseFloat(currentDebt) || 0
                });
            }
        }

        if (customersToAdd.length > 0) {
            try {
                await db.customers.bulkAdd(customersToAdd as Customer[]);
                alert(`Successfully imported ${customersToAdd.length} customers.`);
                setIsBulkModalOpen(false);
            } catch (error) {
                console.error("Import failed", error);
                alert("Import failed. Please check your CSV format.");
            }
        } else {
            alert("No valid customers found in file.");
        }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-800">Customers</h1>
        <div className="flex-1 min-w-0 md:max-w-xs relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input 
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-white border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                placeholder="Search customers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
            />
        </div>
        <div className="flex gap-2">
             <button 
                onClick={() => setIsBulkModalOpen(true)}
                className="bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 flex items-center gap-2 shadow-sm transition-colors"
            >
                <Upload className="w-4 h-4" />
                Import CSV
            </button>
            <button 
                onClick={() => setIsAddModalOpen(true)}
                className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 flex items-center gap-2 shadow-sm"
            >
                <UserPlus className="w-4 h-4" />
                Add Customer
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {customers?.map(customer => (
            <div key={customer.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col transition-all hover:shadow-md">
                <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-xl shrink-0">
                        {customer.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-bold text-slate-800 truncate">{customer.name}</h3>
                        <p className="text-xs text-slate-500">ID: {customer.id}</p>
                    </div>
                </div>
                <div className="space-y-2 text-sm text-slate-600 mb-6">
                    <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-slate-400" />
                        {customer.phone}
                    </div>
                    {customer.email && (
                        <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-slate-400" />
                            {customer.email}
                        </div>
                    )}
                </div>
                <div className="mt-auto pt-4 border-t border-slate-100 flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-xs text-slate-400">Current Debt</p>
                            <p className={`font-bold ${customer.currentDebt > 0 ? 'text-red-500' : 'text-slate-700'}`}>
                                ₦{customer.currentDebt.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </p>
                        </div>
                        {customer.currentDebt > 0 && (
                            <button 
                                onClick={() => handleOpenRepayModal(customer)}
                                className="px-3 py-1 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-md text-xs font-bold hover:bg-emerald-100 flex items-center gap-1"
                            >
                                <Wallet className="w-3 h-3" /> Repay
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2 w-full">
                        <button 
                            onClick={() => handleOpenEditModal(customer)}
                            className="flex-1 py-2 bg-slate-50 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-100 flex items-center justify-center gap-2 transition-colors"
                        >
                            <Pencil className="w-3 h-3" /> Edit
                        </button>
                        <button 
                            onClick={() => handleViewHistory(customer)}
                            className="flex-1 py-2 bg-slate-50 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-100 flex items-center justify-center gap-2 transition-colors"
                        >
                            <History className="w-4 h-4" /> History
                        </button>
                        <button 
                            onClick={() => handleDeleteCustomer(customer.id!)}
                            className="flex-1 py-2 bg-red-50 text-red-600 text-sm font-medium rounded-lg hover:bg-red-100 flex items-center justify-center gap-2 transition-colors"
                        >
                            <Trash2 className="w-3 h-3" /> Delete
                        </button>
                    </div>
                </div>
            </div>
        ))}
        
        {customers?.length === 0 && (
             <div className="col-span-full text-center py-10 text-slate-400">
                 No customers found. Add one to get started.
             </div>
        )}
      </div>

      {/* Add Customer Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-slate-800">New Customer</h2>
                <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAddCustomer} className="space-y-4">
              <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                  <input 
                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" 
                    placeholder="e.g. John Doe" 
                    required
                    value={newCustomer.name || ''}
                    onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
                  />
              </div>
              <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input 
                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" 
                    placeholder="e.g. 08012345678" 
                    required
                    value={newCustomer.phone || ''}
                    onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}
                  />
              </div>
              <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email (Optional)</label>
                  <input 
                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" 
                    type="email"
                    placeholder="john@example.com" 
                    value={newCustomer.email || ''}
                    onChange={e => setNewCustomer({...newCustomer, email: e.target.value})}
                  />
              </div>
              <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Credit Limit (₦)</label>
                  <input 
                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" 
                    type="number"
                    placeholder="0.00" 
                    value={newCustomer.creditLimit || ''}
                    onChange={e => setNewCustomer({...newCustomer, creditLimit: parseFloat(e.target.value)})}
                  />
              </div>
              
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800">Save Customer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {isEditModalOpen && editingCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-slate-800">Edit Customer</h2>
                <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleUpdateCustomer} className="space-y-4">
              <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                  <input 
                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" 
                    required
                    value={editingCustomer.name || ''}
                    onChange={e => setEditingCustomer({...editingCustomer, name: e.target.value})}
                  />
              </div>
              <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input 
                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" 
                    required
                    value={editingCustomer.phone || ''}
                    onChange={e => setEditingCustomer({...editingCustomer, phone: e.target.value})}
                  />
              </div>
              <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email (Optional)</label>
                  <input 
                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" 
                    type="email"
                    value={editingCustomer.email || ''}
                    onChange={e => setEditingCustomer({...editingCustomer, email: e.target.value})}
                  />
              </div>
              <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Credit Limit (₦)</label>
                  <input 
                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" 
                    type="number"
                    placeholder="0.00" 
                    value={editingCustomer.creditLimit || ''}
                    onChange={e => setEditingCustomer({...editingCustomer, creditLimit: parseFloat(e.target.value) || 0})}
                  />
              </div>
              
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800">Update Customer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {isBulkModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
                  <div className="flex justify-between items-center mb-4">
                      <h2 className="text-xl font-bold text-slate-800">Bulk Import Customers</h2>
                      <button onClick={() => setIsBulkModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                  </div>
                  
                  <div className="space-y-6">
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                          <h3 className="font-medium text-slate-800 mb-2 flex items-center gap-2"><Download className="w-4 h-4" /> Step 1: Get Template</h3>
                          <p className="text-sm text-slate-500 mb-3">Download the CSV template to see the required format.</p>
                          <button 
                            onClick={downloadTemplate}
                            className="text-sm text-indigo-600 font-medium hover:underline"
                          >
                            Download Template.csv
                          </button>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                          <h3 className="font-medium text-slate-800 mb-2 flex items-center gap-2"><Upload className="w-4 h-4" /> Step 2: Upload CSV</h3>
                          <p className="text-sm text-slate-500 mb-3">Select your filled CSV file to import.</p>
                          <input 
                            type="file" 
                            accept=".csv"
                            onChange={handleBulkImport}
                            className="block w-full text-sm text-slate-500
                              file:mr-4 file:py-2 file:px-4
                              file:rounded-full file:border-0
                              file:text-sm file:font-semibold
                              file:bg-indigo-50 file:text-indigo-700
                              hover:file:bg-indigo-100
                            "
                          />
                      </div>
                  </div>
                  
                  <div className="mt-6 flex justify-end">
                      <button onClick={() => setIsBulkModalOpen(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg">Close</button>
                  </div>
              </div>
          </div>
      )}

      {/* Repay Debt Modal */}
      {isRepayModalOpen && selectedCustomer && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-slate-800">Repay Debt</h2>
                    <button onClick={() => setIsRepayModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                </div>
                
                <div className="mb-6 bg-red-50 border border-red-100 p-4 rounded-lg">
                    <p className="text-sm text-red-600">Current Outstanding Debt for {selectedCustomer.name}</p>
                    <p className="text-2xl font-bold text-red-700">₦{selectedCustomer.currentDebt.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                </div>

                <form onSubmit={handleRepayDebt} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₦)</label>
                        <input 
                            type="number"
                            required
                            min="1"
                            max={selectedCustomer.currentDebt}
                            className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                            placeholder="0.00"
                            value={repayForm.amount}
                            onChange={e => setRepayForm({...repayForm, amount: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
                        <select 
                            className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                            value={repayForm.method}
                            onChange={e => setRepayForm({...repayForm, method: e.target.value as PaymentMethod})}
                        >
                            <option value={PaymentMethod.CASH}>Cash</option>
                            <option value={PaymentMethod.TRANSFER}>Transfer</option>
                            <option value={PaymentMethod.CARD}>POS / Card</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Note (Optional)</label>
                        <input 
                            type="text"
                            className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                            placeholder="e.g. Partial payment via bank"
                            value={repayForm.note}
                            onChange={e => setRepayForm({...repayForm, note: e.target.value})}
                        />
                    </div>
                    
                    <div className="flex justify-end gap-3 mt-6">
                        <button type="button" onClick={() => setIsRepayModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium">Confirm Payment</button>
                    </div>
                </form>
            </div>
          </div>
      )}

      {/* History Modal */}
      {isHistoryModalOpen && selectedCustomer && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl max-h-[80vh] flex flex-col">
               <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                   <div>
                       <h2 className="text-xl font-bold text-slate-800">{selectedCustomer.name}</h2>
                       <p className="text-sm text-slate-500">Customer History</p>
                   </div>
                   <button onClick={() => setIsHistoryModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
               </div>

               <div className="flex border-b border-slate-100">
                   <button 
                        onClick={() => setActiveHistoryTab('purchases')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeHistoryTab === 'purchases' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
                   >
                       Purchases
                   </button>
                   <button 
                        onClick={() => setActiveHistoryTab('repayments')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeHistoryTab === 'repayments' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
                   >
                       Debt Repayments
                   </button>
               </div>
               
               <div className="p-6 overflow-y-auto flex-1">
                   {activeHistoryTab === 'purchases' ? (
                       <div className="overflow-x-auto">
                           <table className="w-full text-left text-sm">
                               <thead className="text-slate-500 border-b border-slate-100">
                                   <tr>
                                       <th className="pb-3 font-medium">Date</th>
                                       <th className="pb-3 font-medium">Ref ID</th>
                                       <th className="pb-3 font-medium">Items</th>
                                       <th className="pb-3 font-medium text-right">Amount</th>
                                   </tr>
                               </thead>
                               <tbody className="divide-y divide-slate-50">
                                   {customerSales.map(sale => (
                                       <tr key={sale.id}>
                                           <td className="py-3 text-slate-600">{format(sale.date, 'MMM dd, yyyy')}</td>
                                           <td className="py-3 text-slate-400">#{sale.id}</td>
                                           <td className="py-3 text-slate-600">{sale.items.length} items</td>
                                           <td className="py-3 text-right font-bold text-slate-800">
                                               ₦{sale.finalAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                           </td>
                                       </tr>
                                   ))}
                                   {customerSales.length === 0 && (
                                       <tr>
                                           <td colSpan={4} className="py-8 text-center text-slate-400">No purchase history found.</td>
                                       </tr>
                                   )}
                               </tbody>
                           </table>
                       </div>
                   ) : (
                       <div className="overflow-x-auto">
                           <table className="w-full text-left text-sm">
                               <thead className="text-slate-500 border-b border-slate-100">
                                   <tr>
                                       <th className="pb-3 font-medium">Date</th>
                                       <th className="pb-3 font-medium">Method</th>
                                       <th className="pb-3 font-medium">Note</th>
                                       <th className="pb-3 font-medium text-right">Amount Repaid</th>
                                   </tr>
                               </thead>
                               <tbody className="divide-y divide-slate-50">
                                   {customerPayments.map(payment => (
                                       <tr key={payment.id}>
                                           <td className="py-3 text-slate-600">{format(payment.date, 'MMM dd, yyyy')}</td>
                                           <td className="py-3 text-slate-600">
                                               <span className="px-2 py-1 rounded-full bg-slate-100 text-xs font-medium text-slate-600">{payment.paymentMethod}</span>
                                           </td>
                                           <td className="py-3 text-slate-500 italic">{payment.note || '-'}</td>
                                           <td className="py-3 text-right font-bold text-emerald-600">
                                               ₦{payment.amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                           </td>
                                       </tr>
                                   ))}
                                   {customerPayments.length === 0 && (
                                       <tr>
                                           <td colSpan={4} className="py-8 text-center text-slate-400">No repayment history found.</td>
                                       </tr>
                                   )}
                               </tbody>
                           </table>
                       </div>
                   )}
               </div>
               
               <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-between items-center">
                    {activeHistoryTab === 'purchases' ? (
                        <>
                            <div className="text-slate-500 text-sm">Total Purchases: {customerSales.length}</div>
                            <div className="text-slate-800 font-bold">
                                Total Spent: ₦{customerSales.reduce((acc, s) => acc + s.finalAmount, 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </div>
                        </>
                    ) : (
                        <>
                             <div className="text-slate-500 text-sm">Total Repayments: {customerPayments.length}</div>
                             <div className="text-slate-800 font-bold">
                                 Total Repaid: ₦{customerPayments.reduce((acc, p) => acc + p.amount, 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                             </div>
                        </>
                    )}
               </div>
            </div>
          </div>
      )}
    </div>
  );
};

export default Customers;
