import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { supabase } from '../services/supabase';
import { useAuth } from '../auth/AuthContext';
import { User, UserRole, AuditLog } from '../types';
import { Users, Plus, X, Edit, Trash2, Folder, FolderOpen, ClipboardList, Printer, Lock, Download, Calendar } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { getAppDirectory, setAppDirectory, DirectoryType, isTauri } from '../services/directoryService';
import { useToast } from '../contexts/ToastContext';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { savePdf } from '../services/pdfService';

const Settings: React.FC = () => {
  const { currentUser } = useAuth();
  const users = useLiveQuery(() => db.users.toArray());
  const auditLogs = useLiveQuery(() => db.auditLogs.reverse().limit(50).toArray());
  const syncQueue = useLiveQuery(() => db.syncQueue.reverse().limit(20).toArray());
  const { showToast } = useToast();

  // Audit log export state
  const [logStartDate, setLogStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [logEndDate, setLogEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [isExportingLogs, setIsExportingLogs] = useState(false);

  // Modal states
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);

  // Form states
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [addUserForm, setAddUserForm] = useState({ username: '', email: '', password: '', confirmPassword: '', role: UserRole.CASHIER, error: '' });
  const [editUserForm, setEditUserForm] = useState({ id: 0, role: UserRole.CASHIER, password: '', confirmPassword: '', error: '' });
  const [changePasswordForm, setChangePasswordForm] = useState({ password: '', confirmPassword: '', error: '', loading: false });

  // Directory Paths State
  const [paths, setPaths] = useState({
    receipts: '', reports: '', exports: '', backups: ''
  });
  const [printerTarget, setPrinterTarget] = useState('');

  useEffect(() => {
    const loadSettings = async () => {
      if (isTauri()) {
        setPaths({
          receipts: await getAppDirectory('receipts'),
          reports: await getAppDirectory('reports'),
          exports: await getAppDirectory('exports'),
          backups: await getAppDirectory('backups')
        });
      }
      const pt = await db.settings.get('printerTarget');
      if (pt) setPrinterTarget(pt.value);
    };
    loadSettings();
  }, []);

  const savePrinterTarget = async () => {
    try {
      await db.settings.put({ key: 'printerTarget', value: printerTarget });
      showToast('Printer target saved successfully!', 'success');
    } catch (error) {
      console.error(error);
      showToast('Failed to save printer target.', 'error');
    }
  };

  const changePath = async (type: DirectoryType) => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: paths[type]
      });

      if (selected && typeof selected === 'string') {
        await setAppDirectory(type, selected);
        setPaths(prev => ({ ...prev, [type]: selected }));
      }
    } catch (err) {
      console.error("Failed to change path", err);
    }
  };

  const handleOpenAddModal = () => {
    setAddUserForm({ username: '', email: '', password: '', confirmPassword: '', role: UserRole.CASHIER, error: '' });
    setIsAddUserModalOpen(true);
  };

  const handleOpenEditModal = (user: User) => {
    setEditingUser(user);
    setEditUserForm({ id: user.id!, role: user.role, password: '', confirmPassword: '', error: '' });
    setIsEditUserModalOpen(true);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const { username, email, password, confirmPassword, role } = addUserForm;

    if (password !== confirmPassword) {
      setAddUserForm(prev => ({ ...prev, error: 'Passwords do not match.' }));
      return;
    }

    const existingUser = await db.users.where('username').equalsIgnoreCase(username).first();
    if (existingUser) {
      setAddUserForm(prev => ({ ...prev, error: 'Username already exists.' }));
      return;
    }

    try {
      if (navigator.onLine) {
        // Use Edge Function to create Auth User + Profile
        // We use the default email logic if email field is empty (though validation should catch it)
        const userEmail = email || `${username.toLowerCase().replace(/\s+/g, '')}@placeholder.com`;

        const { data, error } = await supabase.functions.invoke('create-user', {
          body: { email: userEmail, password, username, role }
        });

        if (error) throw new Error(error.message || 'Failed to connect to user creation service.');
        if (data?.error) throw new Error(data.error);

        // Add to local DB for offline access/cache (using the UUID from Auth)
        // We do NOT store password locally as it is handled by Supabase Auth now
        await db.users.add({
          supabase_id: data.user.id,
          username,
          role,
          updated_at: new Date().toISOString()
        });

        showToast(`User created successfully! Email: ${userEmail}`, 'success');
      } else {
        // Fallback to local-only
        alert("You are offline. User will be created locally but CANNOT login until synced and credentials created manually in Supabase Dashboard.");
        await db.users.add({ username, password, role });
      }

      setIsAddUserModalOpen(false);
    } catch (error: any) {
      console.error("Failed to add user:", error);
      setAddUserForm(prev => ({ ...prev, error: error.message || 'Failed to add user.' }));
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const { id, role, password, confirmPassword } = editUserForm;

    if (password && password !== confirmPassword) {
      setEditUserForm(prev => ({ ...prev, error: 'New passwords do not match.' }));
      return;
    }

    try {
      const updates: Partial<User> = { role };
      if (password) {
        updates.password = password;
      }
      await db.users.update(id, updates);
      setIsEditUserModalOpen(false);
    } catch (error) {
      console.error("Failed to update user:", error);
      setEditUserForm(prev => ({ ...prev, error: 'Failed to update user.' }));
    }
  };

  const { changePassword } = useAuth();
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const { password, confirmPassword } = changePasswordForm;

    if (!password) {
      setChangePasswordForm(prev => ({ ...prev, error: 'Password cannot be empty.' }));
      return;
    }

    if (password !== confirmPassword) {
      setChangePasswordForm(prev => ({ ...prev, error: 'Passwords do not match.' }));
      return;
    }

    setChangePasswordForm(prev => ({ ...prev, loading: true, error: '' }));
    try {
      const result = await changePassword(password);
      if (result.success) {
        showToast('Password updated successfully!', 'success');
        setIsChangePasswordModalOpen(false);
        setChangePasswordForm({ password: '', confirmPassword: '', error: '', loading: false });
      } else {
        setChangePasswordForm(prev => ({ ...prev, error: result.error || 'Failed to update password.' }));
      }
    } catch (err: any) {
      setChangePasswordForm(prev => ({ ...prev, error: err.message || 'An unexpected error occurred.' }));
    } finally {
      setChangePasswordForm(prev => ({ ...prev, loading: false }));
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (userId === currentUser?.id) {
      alert("You cannot delete your own account.");
      return;
    }
    if (window.confirm("Are you sure you want to delete this user? This action cannot be undone.")) {
      try {
        await db.users.delete(userId);
      } catch (error) {
        console.error("Failed to delete user:", error);
        alert("Failed to delete user.");
      }
    }
  };

  const exportAuditLogs = async () => {
    setIsExportingLogs(true);
    try {
      const start = parseISO(logStartDate);
      start.setHours(0, 0, 0, 0);
      const end = parseISO(logEndDate);
      end.setHours(23, 59, 59, 999);

      const logs = await db.auditLogs
        .where('timestamp')
        .between(start, end)
        .reverse()
        .toArray();

      if (logs.length === 0) {
        showToast('No logs found for the selected period.', 'info');
        return;
      }

      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text("AK Alheri Chemist - System Audit Logs", 14, 22);
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Period: ${logStartDate} to ${logEndDate}`, 14, 30);

      autoTable(doc, {
        startY: 40,
        head: [['Timestamp', 'Action', 'Details', 'User']],
        body: logs.map(log => [
          format(log.timestamp, 'yyyy-MM-dd HH:mm:ss'),
          log.action,
          log.details,
          log.user
        ]),
        headStyles: { fillColor: [71, 85, 105] }, // Slate-600
        styles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 35 },
          2: { cellWidth: 'auto' },
          3: { cellWidth: 25 }
        }
      });

      const fileName = `Audit_Logs_${logStartDate}_to_${logEndDate}.pdf`;
      await savePdf(doc, fileName, 'reports');
      showToast(`Audit logs exported successfully!`, 'success');
    } catch (error) {
      console.error("Failed to export audit logs:", error);
      showToast("Failed to export audit logs.", "error");
    } finally {
      setIsExportingLogs(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 md:space-y-8 pb-10">
      <h1 className="text-xl md:text-2xl font-bold text-slate-800">Settings</h1>

      {/* Security & Profile (All Users) */}
      <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="p-2.5 md:p-3 bg-indigo-100 rounded-full">
              <Lock className="w-5 h-5 md:w-6 md:h-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-bold text-slate-900">Security & Profile</h2>
              <p className="text-slate-500 text-xs md:text-sm">Manage your account security.</p>
            </div>
          </div>
          <button
            onClick={() => setIsChangePasswordModalOpen(true)}
            className="w-full md:w-auto px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors text-xs md:text-sm font-medium"
          >
            Change Password
          </button>
        </div>
        <div className="pt-3 md:pt-4 border-t border-slate-100">
          <div className="flex justify-between items-center text-xs md:text-sm">
            <span className="text-slate-500">Username:</span>
            <span className="font-semibold text-slate-900">{currentUser?.username}</span>
          </div>
          <div className="flex justify-between items-center text-xs md:text-sm mt-2">
            <span className="text-slate-500">Role:</span>
            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-[10px] md:text-xs font-bold uppercase">{currentUser?.role}</span>
          </div>
        </div>
      </div>

      {/* File Path Configuration (Tauri Only) */}
      {isTauri() && currentUser?.role === UserRole.ADMIN && (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
            <div className="p-2.5 md:p-3 bg-emerald-100 rounded-full">
              <Folder className="w-5 h-5 md:w-6 md:h-6 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-bold text-slate-900">File Save Locations</h2>
              <p className="text-slate-500 text-xs md:text-sm">Configure where files are saved.</p>
            </div>
          </div>
          <div className="space-y-3 md:space-y-4">
            {(['receipts', 'reports', 'exports', 'backups'] as DirectoryType[]).map(type => (
              <div key={type} className="flex flex-col gap-1">
                <label className="text-xs md:text-sm font-medium text-slate-700 capitalize">{type} Folder</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={paths[type]}
                    readOnly
                    className="flex-1 p-1.5 md:p-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] md:text-sm text-slate-600 font-mono truncate"
                  />
                  <button
                    onClick={() => changePath(type)}
                    className="p-1.5 md:p-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-700"
                    title="Change Folder"
                  >
                    <FolderOpen className="w-4 h-4 md:w-5 md:h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hardware Configuration (Tauri Only) */}
      {isTauri() && currentUser?.role === UserRole.ADMIN && (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
            <div className="p-2.5 md:p-3 bg-blue-100 rounded-full">
              <Printer className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-bold text-slate-900">Hardware Configuration</h2>
              <p className="text-slate-500 text-xs md:text-sm">Setup printers and devices.</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs md:text-sm font-medium text-slate-700">Printer Target</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="tcp://192.168.1.100:9100"
                  value={printerTarget}
                  onChange={(e) => setPrinterTarget(e.target.value)}
                  className="flex-1 p-1.5 md:p-2 bg-white border border-slate-300 rounded-lg text-xs md:text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button
                  onClick={savePrinterTarget}
                  className="px-3 md:px-4 py-1.5 md:py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 font-medium text-xs md:text-sm"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Management (Admin Only) */}
      {currentUser?.role === UserRole.ADMIN && (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-4">
            <div>
              <h2 className="text-base md:text-lg font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 md:w-5 md:h-5 text-slate-500" />
                User Management
              </h2>
              <p className="text-slate-500 text-xs md:text-sm">Manage user accounts.</p>
            </div>
            <button
              onClick={handleOpenAddModal}
              className="w-full md:w-auto bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 flex items-center justify-center gap-2 shadow-sm text-xs md:text-sm font-medium"
            >
              <Plus className="w-4 h-4" /> Add User
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-2 md:p-3 font-medium">Username</th>
                  <th className="p-2 md:p-3 font-medium">Role</th>
                  <th className="p-2 md:p-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users?.map(user => (
                  <tr key={user.id}>
                    <td className="p-2 md:p-3 font-medium text-slate-800">{user.username}</td>
                    <td className="p-2 md:p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${user.role === UserRole.ADMIN
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-green-100 text-green-700'
                        }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="p-2 md:p-3 text-right">
                      <div className="flex gap-1 md:gap-2 justify-end">
                        <button onClick={() => handleOpenEditModal(user)} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-md"><Edit className="w-3.5 h-3.5 md:w-4 md:h-4" /></button>
                        <button
                          onClick={() => handleDeleteUser(user.id!)}
                          disabled={user.id === currentUser.id}
                          className="p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* troubleshooting (Admin Only) */}
      {currentUser?.role === UserRole.ADMIN && (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 md:gap-4 mb-4">
            <div className="p-2.5 md:p-3 bg-red-100 rounded-full">
              <ClipboardList className="w-5 h-5 md:w-6 md:h-6 text-red-600" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-bold text-slate-900">Troubleshooting</h2>
              <p className="text-slate-500 text-xs md:text-sm">Force sync and reset cache.</p>
            </div>
          </div>
          <button
            onClick={async () => {
              if (window.confirm("Perform a Hard Reset? This will clear local data and re-pull everything from Supabase. Unsynced changes will be lost.")) {
                const { hardResetAndSync } = await import('../services/syncService');
                showToast("Starting hard reset...", "info");
                await hardResetAndSync();
                showToast("Hard reset completed!", "success");
              }
            }}
            className="w-full py-2.5 md:py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold transition-colors flex items-center justify-center gap-2 text-sm"
          >
            Hard Reset & Sync Data
          </button>
        </div>
      )}

      {/* Synchronization Queue (Admin Only) */}
      {currentUser?.role === UserRole.ADMIN && (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 md:gap-4 mb-4">
            <div className="p-2.5 md:p-3 bg-blue-100 rounded-full">
              <Plus className="w-5 h-5 md:w-6 md:h-6 text-blue-600 rotate-45" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-bold text-slate-900">Sync Status</h2>
              <p className="text-slate-500 text-xs md:text-sm">Cloud synchronization queue monitoring.</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-2 md:p-3 font-medium">Table</th>
                  <th className="p-2 md:p-3 font-medium">Action</th>
                  <th className="p-2 md:p-3 font-medium">Status</th>
                  <th className="hidden md:table-cell p-3 font-medium">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {syncQueue?.map(item => (
                  <tr key={item.id}>
                    <td className="p-2 md:p-3 font-medium text-slate-800">{item.table_name}</td>
                    <td className="p-2 md:p-3 text-slate-600 uppercase">{item.action}</td>
                    <td className="p-2 md:p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-bold ${
                        item.status === 'completed' ? 'bg-green-100 text-green-700' :
                        item.status === 'failed' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="hidden md:table-cell p-3 text-red-500 text-xs italic">{item.error || '-'}</td>
                  </tr>
                ))}
                {syncQueue?.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-slate-400">Sync queue is empty.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* System Logs (Admin Only) */}
      {currentUser?.role === UserRole.ADMIN && (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3 md:gap-4">
              <div className="p-2.5 md:p-3 bg-slate-100 rounded-full">
                <ClipboardList className="w-5 h-5 md:w-6 md:h-6 text-slate-600" />
              </div>
              <div>
                <h2 className="text-base md:text-lg font-bold text-slate-900">System Logs</h2>
                <p className="text-slate-500 text-xs md:text-sm">Audit logs of activities.</p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
              <div className="flex items-center gap-1.5 md:gap-2">
                <Calendar className="w-3.5 h-3.5 md:w-4 md:h-4 text-slate-400" />
                <input
                  type="date"
                  value={logStartDate}
                  onChange={(e) => setLogStartDate(e.target.value)}
                  className="bg-transparent text-[10px] md:text-sm border-none focus:ring-0 p-0 w-24 md:w-28"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="date"
                  value={logEndDate}
                  onChange={(e) => setLogEndDate(e.target.value)}
                  className="bg-transparent text-[10px] md:text-sm border-none focus:ring-0 p-0 w-24 md:w-28"
                />
              </div>
              <button
                onClick={exportAuditLogs}
                disabled={isExportingLogs}
                className="flex-1 md:flex-none flex items-center justify-center gap-1.5 md:gap-2 px-2.5 py-1.5 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 text-[10px] md:text-sm font-medium transition-colors disabled:opacity-50"
              >
                {isExportingLogs ? (
                  <>Exporting...</>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    Export PDF
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="p-2 md:p-3 font-medium">Timestamp</th>
                  <th className="p-2 md:p-3 font-medium">Action</th>
                  <th className="hidden md:table-cell p-3 font-medium">Details</th>
                  <th className="p-2 md:p-3 font-medium text-right">User</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs?.map(log => (
                  <tr key={log.id}>
                    <td className="p-2 md:p-3 text-slate-500 whitespace-nowrap text-[10px] md:text-xs">
                      {format(log.timestamp, 'MMM dd, HH:mm')}
                    </td>
                    <td className="p-2 md:p-3 font-medium text-slate-800 text-[10px] md:text-sm">{log.action}</td>
                    <td className="hidden md:table-cell p-3 text-slate-600 text-xs">{log.details}</td>
                    <td className="p-2 md:p-3 text-right text-slate-500 text-[10px] md:text-xs">{log.user}</td>
                  </tr>
                ))}
                {auditLogs?.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-slate-400">No logs found.</td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="text-[9px] md:text-[10px] text-slate-400 mt-4 italic text-center">Displaying last 50 events. Use Export to view more.</p>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
          <div className="bg-white rounded-xl p-4 md:p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[95vh]">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg md:text-xl font-bold text-slate-800">Add New User</h2>
              <button onClick={() => setIsAddUserModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAddUser} className="space-y-3 md:space-y-4">
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Username</label>
                <input required value={addUserForm.username} onChange={e => setAddUserForm(p => ({ ...p, username: e.target.value, error: '' }))} className="w-full border-slate-300 border p-2 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Email (for Login)</label>
                <input type="email" required value={addUserForm.email} onChange={e => setAddUserForm(p => ({ ...p, email: e.target.value, error: '' }))} className="w-full border-slate-300 border p-2 rounded-lg placeholder:text-slate-400 text-sm" placeholder="user@example.com" />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Password</label>
                <input required type="password" value={addUserForm.password} onChange={e => setAddUserForm(p => ({ ...p, password: e.target.value, error: '' }))} className="w-full border-slate-300 border p-2 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
                <input required type="password" value={addUserForm.confirmPassword} onChange={e => setAddUserForm(p => ({ ...p, confirmPassword: e.target.value, error: '' }))} className="w-full border-slate-300 border p-2 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Role</label>
                <select value={addUserForm.role} onChange={e => setAddUserForm(p => ({ ...p, role: e.target.value as UserRole }))} className="w-full border-slate-300 border p-2 rounded-lg bg-white text-sm">
                  <option value={UserRole.CASHIER}>Cashier</option>
                  <option value={UserRole.ADMIN}>Admin</option>
                </select>
              </div>
              {addUserForm.error && <p className="text-xs text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{addUserForm.error}</p>}
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setIsAddUserModalOpen(false)} className="px-4 py-2 rounded-lg text-xs md:text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700 text-xs md:text-sm font-bold">Save User</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {isEditUserModalOpen && editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
          <div className="bg-white rounded-xl p-4 md:p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[95vh]">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg md:text-xl font-bold text-slate-800">Edit User: {editingUser.username}</h2>
              <button onClick={() => setIsEditUserModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleUpdateUser} className="space-y-3 md:space-y-4">
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Role</label>
                <select value={editUserForm.role} onChange={e => setEditUserForm(p => ({ ...p, role: e.target.value as UserRole }))} className="w-full border-slate-300 border p-2 rounded-lg bg-white text-sm">
                  <option value={UserRole.CASHIER}>Cashier</option>
                  <option value={UserRole.ADMIN}>Admin</option>
                </select>
              </div>
              <p className="text-[10px] md:text-xs text-slate-500 border-t border-slate-100 pt-4 italic text-center">Leave password blank to keep current.</p>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">New Password</label>
                <input type="password" value={editUserForm.password} onChange={e => setEditUserForm(p => ({ ...p, password: e.target.value, error: '' }))} className="w-full border-slate-300 border p-2 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
                <input type="password" value={editUserForm.confirmPassword} onChange={e => setEditUserForm(p => ({ ...p, confirmPassword: e.target.value, error: '' }))} className="w-full border-slate-300 border p-2 rounded-lg text-sm" />
              </div>
              {editUserForm.error && <p className="text-xs text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{editUserForm.error}</p>}
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setIsEditUserModalOpen(false)} className="px-4 py-2 rounded-lg text-xs md:text-sm text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700 text-xs md:text-sm font-bold">Update User</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Change Password Modal */}
      {isChangePasswordModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-4">
          <div className="bg-white rounded-xl p-4 md:p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[95vh]">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg md:text-xl font-bold text-slate-800">Change Password</h2>
              <button
                onClick={() => setIsChangePasswordModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
                disabled={changePasswordForm.loading}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-3 md:space-y-4">
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">New Password</label>
                <input
                  required
                  type="password"
                  value={changePasswordForm.password}
                  onChange={e => setChangePasswordForm(p => ({ ...p, password: e.target.value, error: '' }))}
                  className="w-full border-slate-300 border p-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  placeholder="Enter new password"
                />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
                <input
                  required
                  type="password"
                  value={changePasswordForm.confirmPassword}
                  onChange={e => setChangePasswordForm(p => ({ ...p, confirmPassword: e.target.value, error: '' }))}
                  className="w-full border-slate-300 border p-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  placeholder="Confirm new password"
                />
              </div>

              {changePasswordForm.error && (
                <p className="text-xs text-red-600 bg-red-50 p-3 rounded-lg border border-red-100 italic">
                  {changePasswordForm.error}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsChangePasswordModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs md:text-sm text-slate-600 hover:bg-slate-100"
                  disabled={changePasswordForm.loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-xs md:text-sm font-bold disabled:opacity-50 flex items-center gap-2"
                  disabled={changePasswordForm.loading}
                >
                  {changePasswordForm.loading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;