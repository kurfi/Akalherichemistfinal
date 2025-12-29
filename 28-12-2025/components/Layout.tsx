import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar Overlay for Mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth relative">
        {/* Mobile Header with Hamburger */}
        <div className="md:hidden flex items-center justify-between mb-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500 p-1.5 rounded-lg">
              <Menu className="w-5 h-5 text-white cursor-pointer" onClick={() => setIsSidebarOpen(true)} />
            </div>
            <h1 className="text-sm font-bold text-slate-800">AK Alheri</h1>
          </div>
        </div>

        <div className="max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
