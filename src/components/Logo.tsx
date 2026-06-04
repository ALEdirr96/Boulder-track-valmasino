import React from 'react';
import { cn } from '../lib/utils';
import logoUrl from '../assets/images/official_symbol_scalamasino_1779367181213.png';

interface LogoProps {
  className?: string;
  showText?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ className, showText = true }) => {
  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div className="relative">
        {/* Circle containing the high resolution graphic logo symbol */}
        <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-xl border-4 border-stone-800/10 overflow-hidden hover:scale-105 transition-transform duration-500">
          <img 
            src={logoUrl} 
            alt="Valmasino Climbing Logo" 
            className="w-full h-full object-contain p-2"
          />
        </div>
      </div>
      {showText && (
        <div className="text-center font-sans tracking-tight">
          <div className="text-xs font-black tracking-[0.15em] text-stone-200 uppercase leading-none">Val Masino Climbing</div>
          <div className="text-sm font-extrabold uppercase tracking-widest text-[#ef4444] mt-1.5 font-sans">ASD</div>
        </div>
      )}
    </div>
  );
};

