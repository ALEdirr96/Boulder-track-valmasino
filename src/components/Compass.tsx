import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Compass as CompassIcon, Navigation, AlertTriangle, Map as MapIcon, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';

interface CompassProps {
  targetLat: number;
  targetLng: number;
  userLat: number;
  userLng: number;
  userHeading: number | null;
  needsCompassPermission?: boolean;
  requestCompassPermission?: () => void;
  onOpenInMaps: () => void;
}

export const Compass: React.FC<CompassProps> = ({
  targetLat,
  targetLng,
  userLat,
  userLng,
  userHeading,
  needsCompassPermission,
  requestCompassPermission,
  onOpenInMaps,
}) => {
  const [bearing, setBearing] = useState<number>(0);
  const [distance, setDistance] = useState<number>(0);
  const [orientationAvailable, setOrientationAvailable] = useState<boolean>(true);

  useEffect(() => {
    // Calculate bearing
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const toDeg = (rad: number) => (rad * 180) / Math.PI;

    const lat1 = toRad(userLat);
    const lng1 = toRad(userLng);
    const lat2 = toRad(targetLat);
    const lng2 = toRad(targetLng);

    const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
    
    let brng = toDeg(Math.atan2(y, x));
    brng = (brng + 360) % 360;
    setBearing(brng);

    // Calculate distance (Haversine formula)
    const R = 6371e3; // Earth radius in meters
    const dLat = lat2 - lat1;
    const dLng = lng2 - lng1;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    setDistance(R * c);
  }, [userLat, userLng, targetLat, targetLng]);

  useEffect(() => {
    if (userHeading === null) {
      setOrientationAvailable(false);
    } else {
      setOrientationAvailable(true);
    }
  }, [userHeading]);

  const arrowRotation = userHeading !== null ? (bearing - userHeading + 360) % 360 : bearing;

  return (
    <div className="flex flex-col items-center justify-center p-6 space-y-8 h-full bg-stone-900 overflow-hidden text-white">
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Navigation className="w-5 h-5 text-emerald-500 fill-current" />
          <h2 className="text-2xl font-black italic uppercase tracking-tighter">Direzione Blocco</h2>
        </div>
        <p className="text-4xl font-black text-emerald-500 tabular-nums italic">
          {distance < 1000 ? `${Math.round(distance)}m` : `${(distance / 1000).toFixed(2)}km`}
        </p>
      </div>

      <div className="relative w-72 h-72 flex items-center justify-center">
        {/* Radar-like background */}
        <div className="absolute inset-0 rounded-full border-4 border-stone-800 bg-stone-800/20" />
        <div className="absolute inset-8 rounded-full border border-stone-700/50" />
        <div className="absolute inset-20 rounded-full border border-stone-700/30" />
        
        {/* Pulsing indicator */}
        <div className="absolute w-2 h-2 bg-emerald-500 rounded-full animate-ping" />

        {/* Direction Indicator */}
        <motion.div
          animate={{ rotate: arrowRotation }}
          transition={{ type: 'spring', stiffness: 80, damping: 15 }}
          className="relative w-full h-full flex items-center justify-center"
        >
          {/* Stylized Modern Wayfinder Arrow */}
          <div className="relative -top-2">
            <svg width="140" height="160" viewBox="0 0 140 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-[0_0_30px_rgba(16,185,129,0.4)]">
              {/* Outer glow/border */}
              <path d="M70 5L135 155L70 130L5 155L70 5Z" stroke="#10b981" strokeWidth="2" strokeLinejoin="round"/>
              {/* Main Arrow Body */}
              <path d="M70 10L130 150L70 125L10 150L70 10Z" fill="url(#arrow-gradient)"/>
              <defs>
                <linearGradient id="arrow-gradient" x1="70" y1="10" x2="70" y2="150" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#10b981" />
                  <stop offset="1" stopColor="#059669" />
                </linearGradient>
              </defs>
              {/* Central ridge */}
              <path d="M70 10V125L10 150L70 10Z" fill="black" fillOpacity="0.1" />
            </svg>
          </div>
        </motion.div>

        {/* Static North Marker */}
        <div className="absolute -top-6 text-[10px] font-black text-stone-600 tracking-widest">TARGET</div>
      </div>

      <div className="space-y-4 w-full max-w-sm">
        {needsCompassPermission ? (
          <div className="flex flex-col items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-500 text-xs text-center">
            <CompassIcon className="w-6 h-6 shrink-0" />
            <p className="font-bold leading-tight uppercase tracking-tight">
              Permesso Bussola
              <br/>
              <span className="text-[10px] font-normal opacity-80">Per far funzionare la bussola devi concedere il permesso sui dispositivi iOS.</span>
            </p>
            <button 
              onClick={requestCompassPermission}
              className="mt-2 px-6 py-2 bg-emerald-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg active:scale-95 transition-transform"
            >
              Attiva Bussola
            </button>
          </div>
        ) : !orientationAvailable ? (
          <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-500 text-xs">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p className="font-bold leading-tight uppercase tracking-tight">
              Gira il telefono <br/>
              <span className="text-[10px] font-normal opacity-80">Punta la freccia in alto per seguire la via</span>
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => window.location.reload()}
            className="flex items-center justify-center gap-2 p-4 bg-stone-800 border border-stone-700 rounded-2xl active:scale-95 transition-transform"
          >
            <CompassIcon className="w-4 h-4 text-stone-400" />
            <span className="text-xs font-black uppercase tracking-wider italic">Reset</span>
          </button>
          <button
            onClick={onOpenInMaps}
            className="flex items-center justify-center gap-2 p-4 bg-emerald-600 border border-emerald-500 rounded-2xl shadow-xl shadow-emerald-900/20 active:scale-95 transition-transform"
          >
            <ExternalLink className="w-4 h-4" />
            <span className="text-xs font-black uppercase tracking-wider italic">G-Maps</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-stone-700 text-[10px] font-black uppercase tracking-widest pt-4">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/40" />
          SYSTEM_OK
        </div>
        <div className="w-px h-3 bg-stone-800" />
        <div>AZIMUTH: {Math.round(bearing)}°</div>
      </div>
    </div>
  );
};
