import React from 'react';
import { Loader2, ShoppingCart } from 'lucide-react';

const SplashScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900 text-white">
      <div className="flex flex-col items-center animate-pulse">
        <div className="p-4 bg-emerald-500 rounded-2xl mb-6 shadow-lg shadow-emerald-500/20">
          <ShoppingCart className="w-12 h-12 text-white" />
        </div>
        <h1 className="text-3xl font-bold tracking-wider mb-2">AK Alheri Chemist</h1>
        <p className="text-slate-400 text-sm mb-8">Loading System...</p>
        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
      </div>
      <div className="absolute bottom-8 text-xs text-slate-600">
        &copy; {new Date().getFullYear()} AK Alheri Chemist
      </div>
    </div>
  );
};

export default SplashScreen;
