import React from 'react';
import { Home, Map as MapIcon, Plus, User, Search, Shield, Calendar as CalendarIcon, Package } from 'lucide-react';
import { cn } from '../lib/utils';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: 'home' | 'map' | 'calendar' | 'equipment' | 'profile' | 'admin';
  onTabChange: (tab: 'home' | 'map' | 'calendar' | 'equipment' | 'profile' | 'admin') => void;
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
      <nav 
        className="bg-white border-t border-stone-100 flex items-center justify-around px-4 pt-2 relative z-50 shadow-[0_-4px_16px_rgba(0,0,0,0.02)]"
        style={{ 
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
          height: 'calc(env(safe-area-inset-bottom, 0px) + 74px)'
        }}
      >
        <button
          onClick={() => onTabChange('home')}
          className={cn(
            "flex flex-col items-center gap-1.5 transition-all duration-205 active:scale-95 py-1 px-1.5 rounded-xl text-center select-none",
            activeTab === 'home' ? "text-emerald-600 font-extrabold" : "text-stone-300 hover:text-stone-500"
          )}
        >
          <Home className="w-5.5 h-5.5 shrink-0" />
          <span className="text-[9px] font-extrabold uppercase tracking-wider leading-none">Home</span>
        </button>

        <button
          onClick={() => onTabChange('map')}
          className={cn(
            "flex flex-col items-center gap-1.5 transition-all duration-205 active:scale-95 py-1 px-1.5 rounded-xl text-center select-none",
            activeTab === 'map' ? "text-emerald-600" : "text-stone-300 hover:text-stone-500"
          )}
        >
          <MapIcon className="w-5.5 h-5.5 shrink-0" />
          <span className="text-[9px] font-extrabold uppercase tracking-wider leading-none">Mappa</span>
        </button>

        {/* Floating Action Button */}
        {!isGuest && (
          <div className="relative -top-5.5 flex flex-col items-center justify-center px-1">
            <button
              onClick={onAddClick}
              className="w-13 h-13 bg-emerald-600 text-white rounded-full shadow-lg shadow-emerald-600/30 flex items-center justify-center active:scale-90 hover:scale-105 transition-all duration-200 hover:bg-emerald-700 hover:shadow-emerald-600/40 cursor-pointer"
            >
              <Plus className="w-7 h-7" />
            </button>
          </div>
        )}

        {!isGuest && (
          <button
            onClick={() => onTabChange('admin')}
            className={cn(
              "flex flex-col items-center gap-1.5 transition-all duration-205 active:scale-95 py-1 px-1.5 rounded-xl text-center select-none",
              activeTab === 'admin' ? "text-emerald-600 font-extrabold" : "text-stone-300 hover:text-stone-500"
            )}
          >
            <Shield className="w-5.5 h-5.5 shrink-0" />
            <span className="text-[9px] font-extrabold uppercase tracking-wider leading-none">Team</span>
          </button>
        )}

        {!isGuest && (
          <button
            onClick={() => onTabChange('profile')}
            className={cn(
              "flex flex-col items-center gap-1.5 transition-all duration-205 active:scale-95 py-1 px-1.5 rounded-xl text-center select-none",
              activeTab === 'profile' ? "text-emerald-600 font-extrabold" : "text-stone-300 hover:text-stone-500"
            )}
          >
            <User className="w-5.5 h-5.5 shrink-0" />
            <span className="text-[9px] font-extrabold uppercase tracking-wider leading-none">Profilo</span>
          </button>
        )}
      </nav>
    </div>
  );
};
