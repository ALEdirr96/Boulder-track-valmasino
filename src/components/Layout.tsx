import React from 'react';
import { Home, Map as MapIcon, Plus, User, Search, Shield } from 'lucide-react';
import { cn } from '../lib/utils';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: 'home' | 'map' | 'profile' | 'admin';
  onTabChange: (tab: 'home' | 'map' | 'profile' | 'admin') => void;
  onAddClick: () => void;
  isAdmin?: boolean;
  isGuest?: boolean;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  activeTab,
  onTabChange,
  onAddClick,
  isAdmin,
  isGuest,
}) => {
  return (
    <div className="flex flex-col h-screen bg-stone-50 overflow-hidden">
      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="h-20 bg-white border-t border-stone-100 flex items-center justify-around px-4 pb-4 relative z-50">
        <button
          onClick={() => onTabChange('home')}
          className={cn(
            "flex flex-col items-center gap-1 transition-colors",
            activeTab === 'home' ? "text-emerald-600" : "text-stone-300"
          )}
        >
          <Home className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Home</span>
        </button>

        <button
          onClick={() => onTabChange('map')}
          className={cn(
            "flex flex-col items-center gap-1 transition-colors",
            activeTab === 'map' ? "text-emerald-600" : "text-stone-300"
          )}
        >
          <MapIcon className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Mappa</span>
        </button>

        {/* Floating Action Button */}
        {!isGuest && (
          <div className="relative -top-6">
            <button
              onClick={onAddClick}
              className="w-14 h-14 bg-emerald-600 text-white rounded-full shadow-xl shadow-emerald-600/30 flex items-center justify-center active:scale-90 transition-transform hover:bg-emerald-700"
            >
              <Plus className="w-8 h-8" />
            </button>
          </div>
        )}

        {!isGuest && isAdmin && (
          <button
            onClick={() => onTabChange('admin')}
            className={cn(
              "flex flex-col items-center gap-1 transition-colors",
              activeTab === 'admin' ? "text-emerald-600" : "text-stone-300"
            )}
          >
            <Shield className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Team</span>
          </button>
        )}

        {!isGuest && (
          <button
            onClick={() => onTabChange('profile')}
            className={cn(
              "flex flex-col items-center gap-1 transition-colors",
              activeTab === 'profile' ? "text-emerald-600" : "text-stone-300"
            )}
          >
            <User className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Profilo</span>
          </button>
        )}
      </nav>
    </div>
  );
};
