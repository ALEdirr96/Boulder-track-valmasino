import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Block, BlockStatus } from '../types';
import { Loader2 } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// Fix for Leaflet default icon issues in React
// @ts-ignore
import icon from 'leaflet/dist/images/marker-icon.png';
// @ts-ignore
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapViewProps {
  blocks: Block[];
  onBlockClick: (block: Block) => void;
  userLocation?: { lat: number; lng: number };
  onMapLongClick?: (lat: number, lng: number) => void;
  crosshairMode?: boolean;
  onCenterChange?: (lat: number, lng: number) => void;
}

const STATUS_COLORS: Record<BlockStatus, string> = {
  new: '#3b82f6',
  clean: '#10b981',
  to_clean: '#f59e0b',
  project: '#a855f7',
};

// Helper component to handle center changes and events
const MapEvents: React.FC<{
  onCenterChange?: (lat: number, lng: number) => void;
  crosshairMode: boolean;
}> = ({ onCenterChange, crosshairMode }) => {
  const map = useMapEvents({
    move: () => {
      if (crosshairMode && onCenterChange) {
        const center = map.getCenter();
        onCenterChange(center.lat, center.lng);
      }
    },
  });
  return null;
};

// Helper to update center when userLocation changes
const ChangeView: React.FC<{ center: [number, number] }> = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
  return null;
};

const createCustomIcon = (color: string) => {
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: ${color}; width: 16px; height: 16px; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 5px rgba(0,0,0,0.3);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
};

const userIcon = L.divIcon({
  className: 'user-icon',
  html: `<div style="background-color: #3b82f6; width: 12px; height: 12px; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(59,130,246,0.5);"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

export const MapView: React.FC<MapViewProps> = ({
  blocks,
  onBlockClick,
  userLocation,
  onMapLongClick,
  crosshairMode = false,
  onCenterChange,
}) => {
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);

  const initialCenter: [number, number] = userLocation 
    ? [userLocation.lat, userLocation.lng] 
    : (blocks.length > 0 ? [blocks[0].lat, blocks[0].lng] : [46.2411, 9.5369]);

  return (
    <div className="relative w-full h-full bg-stone-100">
      <MapContainer 
        center={initialCenter} 
        zoom={15} 
        style={{ width: '100%', height: '100%' }}
        zoomControl={true}
      >
        {/* Esri Satellite Imagery - Free and clear */}
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
        />
        {/* Topographic labels overlay - Esri */}
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
          opacity={0.7}
        />

        <MapEvents onCenterChange={onCenterChange} crosshairMode={crosshairMode} />
        {userLocation && <ChangeView center={[userLocation.lat, userLocation.lng]} />}

        {!crosshairMode && blocks.map((block) => (
          <Marker
            key={block.id}
            position={[block.lat, block.lng]}
            icon={createCustomIcon(STATUS_COLORS[block.status])}
            eventHandlers={{
              click: () => setSelectedBlock(block),
            }}
          >
            <Popup>
              <div className="p-1 min-w-[150px]">
                <h4 className="font-bold text-stone-800 text-sm mb-0.5">{block.name}</h4>
                <p className="text-[10px] text-stone-500 mb-2 uppercase tracking-tighter">{block.area}</p>
                <button
                  onClick={() => onBlockClick(block)}
                  className="w-full py-2 bg-stone-900 text-white text-[10px] font-black uppercase tracking-widest italic rounded-lg"
                >
                  Ingaggio
                </button>
              </div>
            </Popup>
          </Marker>
        ))}

        {userLocation && (
          <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon} />
        )}
      </MapContainer>

      {crosshairMode && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[1000]">
          <div className="relative">
            <div className="w-12 h-12 flex items-center justify-center">
              <div className="absolute inset-0 border border-emerald-500/30 rounded-full scale-110 animate-pulse" />
              <div className="absolute inset-2 border-2 border-emerald-500 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.3)]" />
              <div className="w-px h-full bg-emerald-500 absolute" />
              <div className="w-full h-px bg-emerald-500 absolute" />
              <div className="w-1.5 h-1.5 bg-white rounded-full z-10 shadow-sm" />
            </div>
            <div className="absolute top-14 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
              <div className="bg-stone-900 shadow-2xl text-white text-[10px] px-3 py-1.5 rounded-xl whitespace-nowrap font-black uppercase tracking-widest backdrop-blur-md border border-emerald-500/50">
                Bersaglio
              </div>
              <div className="w-px h-4 bg-emerald-500" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
