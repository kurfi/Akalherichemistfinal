import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Package, Users, Receipt, PieChart, Settings, LogOut, RotateCcw, Cloud, CloudOff, RefreshCw, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { UserRole } from '../types';
import { useSync } from '../contexts/SyncContext';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const location = useLocation();
  const { currentUser, logout } = useAuth();
  const { syncStatus } = useSync();

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, roles: [UserRole.ADMIN, UserRole.CASHIER] },
    { name: 'POS', path: '/pos', icon: ShoppingCart, roles: [UserRole.ADMIN, UserRole.CASHIER] },
    { name: 'Inventory', path: '/inventory', icon: Package, roles: [UserRole.ADMIN] },
    { name: 'Customers', path: '/customers', icon: Users, roles: [UserRole.ADMIN, UserRole.CASHIER] },
    { name: 'Expenses', path: '/expenses', icon: Receipt, roles: [UserRole.ADMIN] },
    { name: 'Reports', path: '/reports', icon: PieChart, roles: [UserRole.ADMIN] },
    { name: 'Returns', path: '/returns', icon: RotateCcw, roles: [UserRole.ADMIN] }, // New Returns Nav Item
    { name: 'Settings', path: '/settings', icon: Settings, roles: [UserRole.ADMIN, UserRole.CASHIER] },
  ];

  const availableNavItems = navItems.filter(item => currentUser && item.roles.includes(currentUser.role));

  const getSyncIcon = () => {
    switch (syncStatus) {
      case 'syncing': return <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />;
      case 'offline':
      case 'error': return <CloudOff className="w-4 h-4 text-red-400" />;
      default: return <Cloud className="w-4 h-4 text-emerald-400" />;
    }
  };

  const getSyncText = () => {
    switch (syncStatus) {
      case 'syncing': return 'Syncing...';
      case 'offline': return 'Offline';
      case 'error': return 'Sync Error';
      default: return 'Online';
    }
  };

  return (
    <aside className={`w-64 bg-slate-900 text-slate-100 flex flex-col h-screen fixed left-0 top-0 z-30 transition-all duration-300 md:translate-x-0 ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'} md:relative shadow-xl`}>
      <div className="p-4 md:p-6 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5 md:gap-3">
          <div className="bg-emerald-500 p-1.5 md:p-2 rounded-lg">
            <ShoppingCart className="w-5 h-5 md:w-6 md:h-6 text-white" />
          </div>
          <div>
            <h1 className="text-base md:text-lg font-bold tracking-tight">AK Alheri Chemist</h1>
            <p className="text-[10px] md:text-xs text-slate-400">Kurfi</p>
          </div>
        </div>

        {/* Close Button for Mobile */}
        <button
          onClick={onClose}
          className="md:hidden p-1 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 md:py-6 px-3 space-y-1">
        {availableNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => {
                if (window.innerWidth < 768) onClose();
              }}
              className={`flex items-center gap-3 px-3.5 py-2.5 md:px-4 md:py-3 rounded-lg transition-all duration-200 group ${isActive
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                }`}
            >
              <Icon className={`w-4.5 h-4.5 md:w-5 md:h-5 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-emerald-400'}`} />
              <span className="text-sm md:text-base font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 md:p-4 border-t border-slate-800 space-y-2 md:space-y-3">
        {/* Sync Indicator */}
        <div className="flex items-center gap-2 px-2 text-[10px] md:text-xs text-slate-400">
          {getSyncIcon()}
          <span>{getSyncText()}</span>
        </div>

        <div className="px-3 py-2 md:px-4 md:py-3 bg-slate-800 rounded-lg">
          <p className="text-xs md:text-sm font-bold text-white truncate">{currentUser?.username}</p>
          <p className="text-[10px] md:text-xs text-emerald-400 uppercase tracking-wider">{currentUser?.role}</p>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3.5 py-2.5 md:px-4 md:py-3 w-full rounded-lg text-slate-400 hover:bg-red-900/20 hover:text-red-400 transition-colors text-sm md:text-base"
        >
          <LogOut className="w-4.5 h-4.5 md:w-5 md:h-5" />
          <span className="font-medium">Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;