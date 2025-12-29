import React, { useState } from 'react';
import { db } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { CheckCircle2, Clock } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { syncData } from '../services/syncService';

const Expenses: React.FC = () => {
    const { showToast } = useToast();
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('Utilities');
    const [note, setNote] = useState('');
    const [status, setStatus] = useState<'PAID' | 'PENDING'>('PAID');

    const expenses = useLiveQuery(() => db.expenses.reverse().toArray());

    const addExpense = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await db.expenses.add({
                date: new Date(),
                category,
                amount: parseFloat(amount),
                note,
                status
            });
            setAmount('');
            setNote('');
            setStatus('PAID');
            showToast('Expense recorded successfully!', 'success');
            
            // Force sync
            syncData();
        } catch (error) {
            console.error("Failed to add expense:", error);
            showToast('Failed to record expense locally.', 'error');
        }
    };

    const toggleStatus = async (id: number, currentStatus: 'PAID' | 'PENDING') => {
        await db.expenses.update(id, {
            status: currentStatus === 'PAID' ? 'PENDING' : 'PAID'
        });
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h2 className="text-lg font-bold mb-4 text-slate-800">Record Expense</h2>
                    <form onSubmit={addExpense} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">Category</label>
                            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full p-2 border rounded-lg">
                                <option>Rent</option>
                                <option>Utilities</option>
                                <option>Salaries</option>
                                <option>Inventory Purchase</option>
                                <option>Maintenance</option>
                                <option>Other</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">Amount</label>
                            <input type="number" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-2 border rounded-lg" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">Status</label>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name="status" 
                                        checked={status === 'PAID'} 
                                        onChange={() => setStatus('PAID')}
                                        className="text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <span className="text-sm text-slate-700">Paid</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name="status" 
                                        checked={status === 'PENDING'} 
                                        onChange={() => setStatus('PENDING')}
                                        className="text-red-600 focus:ring-red-500"
                                    />
                                    <span className="text-sm text-slate-700">Pending (Unpaid)</span>
                                </label>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">Note</label>
                            <textarea value={note} onChange={e => setNote(e.target.value)} className="w-full p-2 border rounded-lg" rows={3}></textarea>
                        </div>
                        <button className={`w-full py-2 rounded-lg font-medium text-white ${status === 'PAID' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'}`}>
                            {status === 'PAID' ? 'Record Payment' : 'Record Payable'}
                        </button>
                    </form>
                </div>
            </div>
            
            <div className="lg:col-span-2">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <h2 className="text-lg font-bold p-4 border-b border-slate-200 bg-slate-50 text-slate-800">Expense History</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-slate-500 text-sm">
                                <tr>
                                    <th className="p-4">Date</th>
                                    <th className="p-4">Category</th>
                                    <th className="p-4">Note</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4 text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {expenses?.map(ex => (
                                    <tr key={ex.id} className="hover:bg-slate-50">
                                        <td className="p-4 text-slate-600">{format(ex.date, 'MMM dd, yyyy')}</td>
                                        <td className="p-4 font-medium text-slate-800">{ex.category}</td>
                                        <td className="p-4 text-slate-500 text-sm">{ex.note}</td>
                                        <td className="p-4">
                                            <button 
                                                onClick={() => toggleStatus(ex.id!, ex.status)}
                                                className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${
                                                    ex.status === 'PAID' 
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                                                    : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                                }`}
                                            >
                                                {ex.status === 'PAID' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                                {ex.status}
                                            </button>
                                        </td>
                                        <td className="p-4 text-right font-bold text-slate-800">₦{ex.amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Expenses;