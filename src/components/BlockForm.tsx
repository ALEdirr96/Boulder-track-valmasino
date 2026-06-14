import React, { useState, useEffect } from 'react';
import { MapPin, Camera, Save, X, Loader2, AlertCircle, Map as MapIcon } from 'lucide-react';
import { Block, BlockStatus } from '../types';
import { cn } from '../lib/utils';
import { MapView } from './MapView';

interface BlockFormProps {
  initialData?: Partial<Block>;
  onSubmit: (data: Partial<Block>) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  blocks?: Block[]; // To show context map
}

import imageCompression from 'browser-image-compression';

const STATUS_OPTIONS: { value: BlockStatus; label: string; color: string }[] = [
  { value: 'new', label: 'Nuovo', color: 'bg-blue-500' },
  { value: 'clean', label: 'Pulito', color: 'bg-emerald-500' },
  { value: 'to_clean', label: 'Da Pulire', color: 'bg-amber-500' },
  { value: 'project', label: 'Progetto', color: 'bg-purple-500' },
];

const RISK_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'Safe', label: 'Sicuro', color: 'bg-emerald-500' },
  { value: 'Loose', label: 'Sassi Instabili', color: 'bg-amber-500' },
  { value: 'Danger', label: 'Pericoloso', color: 'bg-red-500' },
];

const parseCoordinatesString = (text: string): { lat: number; lng: number } | null => {
  const cleanText = text.trim();
  const regex = /(-?\d+(?:\.\d+)?)\s*[\s,;/|]\s*(-?\d+(?:\.\d+)?)/;
  const match = cleanText.match(regex);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat, lng };
    }
  }
  return null;
};

export const BlockForm: React.FC<BlockFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
  blocks = [],
}) => {
  const [formData, setFormData] = useState<Partial<Block>>({
    name: '',
    area: '',
    status: 'new',
    type: 'blocco',
    height: '',
    style: '',
    exposure: '',
    accessNotes: '',
    landingNotes: '',
    riskLevel: 'Safe',
    lat: 0,
    lng: 0,
    ...initialData,
  });

  const [gettingLocation, setGettingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isPickingOnMap, setIsPickingOnMap] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);

  const handleGetLocation = () => {
    setGettingLocation(true);
    setLocationError(null);
    
    if (!navigator.geolocation) {
      setLocationError('Geolocalizzazione non supportata');
      setGettingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData((prev) => ({
          ...prev,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }));
        setGettingLocation(false);
      },
      (error) => {
        let msg = 'Errore nel recupero posizione';
        if (error.code === error.PERMISSION_DENIED) msg = 'Permesso negato. Abilita la posizione nelle impostazioni.';
        if (error.code === error.TIMEOUT) msg = 'Tempo scaduto. Riprova.';
        setLocationError(msg);
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
    );
  };

  const handlePasteCoordinates = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    const parsed = parseCoordinatesString(text);
    if (parsed) {
      e.preventDefault();
      setFormData(prev => ({ ...prev, lat: parsed.lat, lng: parsed.lng }));
    }
  };

  useEffect(() => {
    if (!initialData?.lat && !initialData?.lng) {
      handleGetLocation();
    }
  }, []);

  const [photos, setPhotos] = useState<string[]>(initialData?.photos || []);
  const [lines, setLines] = useState<any[]>(initialData?.lines || []);

  const addLine = () => {
    const newLine = { 
      id: Math.random().toString(36).substr(2, 9), 
      number: (lines.length + 1).toString(),
      name: '', 
      grade: '', 
      status: 'new' as const, 
      description: '' 
    };
    const updatedLines = [...lines, newLine];
    setLines(updatedLines);
    setFormData(prev => ({ ...prev, lines: updatedLines }));
  };

  const updateLine = (id: string, updates: any) => {
    const updatedLines = lines.map(l => l.id === id ? { ...l, ...updates } : l);
    setLines(updatedLines);
    setFormData(prev => ({ ...prev, lines: updatedLines }));
  };

  const removeLine = (id: string) => {
    const updatedLines = lines.filter(l => l.id !== id);
    setLines(updatedLines);
    setFormData(prev => ({ ...prev, lines: updatedLines }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsCompressing(true);
      try {
        const options = {
          maxSizeMB: 0.4,
          maxWidthOrHeight: 1200,
          useWebWorker: true
        };
        
        const compressedFile = await imageCompression(file, options);
        
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = reader.result as string;
          setPhotos(prev => [...prev, base64String]);
          setFormData(prev => ({ ...prev, photos: [...(prev.photos || []), base64String] }));
          setIsCompressing(false);
        };
        reader.readAsDataURL(compressedFile);
      } catch (error) {
        console.error("Compression error:", error);
        alert("Errore durante la compressione dell'immagine.");
        setIsCompressing(false);
      }
    }
  };

  const removePhoto = (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    setPhotos(newPhotos);
    setFormData(prev => ({ ...prev, photos: newPhotos }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.area || formData.lat === undefined || formData.lat === null || formData.lng === undefined || formData.lng === null) {
      alert('Nome, area e posizione sono obbligatori');
      return;
    }
    onSubmit(formData);
  };

  if (isPickingOnMap) {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="p-4 border-b border-stone-100 flex items-center justify-between bg-white z-10">
          <button onClick={() => setIsPickingOnMap(false)} className="text-stone-600 font-bold flex items-center gap-2">
            <X className="w-5 h-5" /> Annulla
          </button>
          <h2 className="text-lg font-bold text-stone-800">Scegli Posizione</h2>
          <button 
            onClick={() => setIsPickingOnMap(false)} 
            className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold active:scale-95 transition-transform"
          >
            Conferma
          </button>
        </div>
        <div className="flex-1 relative">
          <MapView 
            blocks={blocks}
            onBlockClick={() => {}}
            crosshairMode={true}
            onCenterChange={(lat, lng) => setFormData(prev => ({ ...prev, lat, lng }))}
            userLocation={formData.lat ? { lat: formData.lat, lng: formData.lng } : undefined}
          />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between p-4 border-b border-stone-100 sticky top-0 bg-white z-10">
        <button type="button" onClick={onCancel} className="p-2 text-stone-400">
          <X className="w-6 h-6" />
        </button>
        <div className="text-center">
          <h2 className="text-lg font-bold text-stone-800">
            {initialData?.id 
              ? (formData.type === 'falesia' ? 'Modifica Falesia' : 'Modifica Blocco') 
              : (formData.type === 'falesia' ? 'Nuova Falesia' : 'Nuovo Blocco')}
          </h2>
          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">ASD Val Masino Climbing</p>
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="p-2 text-emerald-600 font-bold disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Save className="w-6 h-6" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
        {/* Basic Info */}
        <section className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-wider block">Tipo di Struttura *</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'blocco' })}
                className={cn(
                  "flex-1 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider border-2 transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                  formData.type !== 'falesia'
                    ? "bg-stone-900 border-stone-850 text-white"
                    : "bg-stone-50 border-stone-150 text-stone-550 hover:bg-stone-100"
                )}
              >
                🪨 Blocco / Boulder
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'falesia' })}
                className={cn(
                  "flex-1 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider border-2 transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                  formData.type === 'falesia'
                    ? "bg-emerald-600 border-emerald-500 text-white"
                    : "bg-stone-50 border-stone-150 text-stone-550 hover:bg-stone-100"
                )}
              >
                🧗 Falesia / Falesia
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-wider">
              {formData.type === 'falesia' ? 'Nome Falesia *' : 'Nome Blocco *'}
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder={formData.type === 'falesia' ? 'Es: Sasso di Remenno' : 'Es: Il Pilastro'}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-wider">Settore / Zona *</label>
            <input
              type="text"
              required
              value={formData.area}
              onChange={(e) => setFormData({ ...formData, area: e.target.value })}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="Es: Bosco Alto"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-wider">
              {formData.type === 'falesia' ? 'Chiodatore / Libero Editore' : 'Scopritore / Proprietario Progetto'}
            </label>
            <input
              type="text"
              value={formData.projectOwner || ''}
              onChange={(e) => setFormData({ ...formData, projectOwner: e.target.value })}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder={formData.type === 'falesia' ? 'Chi ha chiodato o creato il settore' : 'Nome di chi ha trovato/pulito il blocco'}
            />
          </div>
        </section>

        {/* Location */}
        <section className="space-y-3 p-4 bg-stone-50 rounded-2xl border border-stone-100 shadow-sm">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-wider">Posizione GPS *</label>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setIsPickingOnMap(true)}
                className="text-xs font-bold text-emerald-600 flex items-center gap-1"
              >
                <MapIcon className="w-3 h-3" />
                Dalla Mappa
              </button>
              <button
                type="button"
                onClick={handleGetLocation}
                disabled={gettingLocation}
                className="text-xs font-bold text-emerald-600 flex items-center gap-1"
              >
                {gettingLocation ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPin className="w-3 h-3" />}
                GPS
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400 block">Latitudine</span>
              <input
                type="number"
                step="any"
                value={formData.lat || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, lat: parseFloat(e.target.value) || 0 }))}
                onPaste={handlePasteCoordinates}
                placeholder="Latitudine (es. 46.241512)"
                className="w-full p-3 bg-white border border-stone-200 rounded-xl text-sm font-mono text-stone-600 focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400 block">Longitudine</span>
              <input
                type="number"
                step="any"
                value={formData.lng || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, lng: parseFloat(e.target.value) || 0 }))}
                onPaste={handlePasteCoordinates}
                placeholder="Longitudine (es. 9.612123)"
                className="w-full p-3 bg-white border border-stone-200 rounded-xl text-sm font-mono text-stone-600 focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-stone-200/50 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Incolla Coordinate rapide</span>
              <span className="text-[8px] font-bold text-stone-400 uppercase">Es: 46.2415, 9.6121</span>
            </div>
            <input
              type="text"
              placeholder="Incolla coppia di coordinate o link di Maps..."
              onChange={(e) => {
                const val = e.target.value;
                const parsed = parseCoordinatesString(val);
                if (parsed) {
                  setFormData(prev => ({ ...prev, lat: parsed.lat, lng: parsed.lng }));
                }
              }}
              className="w-full px-3 py-2.5 bg-white border border-stone-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500 outline-none placeholder:text-stone-300 shadow-sm"
            />
          </div>
          
          {locationError && (
            <div className="flex items-center gap-2 text-xs text-red-500">
              <AlertCircle className="w-3 h-3" />
              {locationError}
            </div>
          )}
        </section>

        {/* Status & Risk */}
        <section className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-wider text-center block">Stato</label>
            <div className="flex flex-col gap-2">
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as BlockStatus })}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl font-bold text-sm outline-none"
              >
                {STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-wider text-center block">Pericolo</label>
            <div className="flex flex-col gap-2">
              <select
                value={formData.riskLevel || 'Safe'}
                onChange={(e) => setFormData({ ...formData, riskLevel: e.target.value })}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl font-bold text-sm outline-none"
              >
                {RISK_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Details */}
        <section className="space-y-4">
          <label className="text-xs font-bold text-stone-400 uppercase tracking-wider">Foto del Blocco</label>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((url, idx) => (
              <div key={idx} className="relative aspect-square bg-stone-100 rounded-xl overflow-hidden group">
                <img src={url} alt={`Photo ${idx}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(idx)}
                  className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {photos.length < 5 && (
              <label className="aspect-square bg-stone-50 border-2 border-dashed border-stone-200 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-stone-100 transition-colors relative">
                {isCompressing ? (
                  <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                ) : (
                  <>
                    <Camera className="w-6 h-6 text-stone-300" />
                    <span className="text-[10px] font-bold text-stone-400 uppercase mt-1">Aggiungi</span>
                  </>
                )}
                <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={isCompressing} />
              </label>
            )}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-wider">
              {formData.type === 'falesia' ? 'Lunghezza Via / Altezza Falesia (m)' : 'Altezza (m)'}
            </label>
            <input
              type="text"
              value={formData.height}
              onChange={(e) => setFormData({ ...formData, height: e.target.value })}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none"
              placeholder={formData.type === 'falesia' ? 'Es: 15' : 'Es: 3.5'}
            />
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-wider">
              {formData.type === 'falesia' ? `Vie / Tiri (${lines.length})` : `Linee / Blocchi (${lines.length})`}
            </label>
            <button
              type="button"
              onClick={addLine}
              className="px-3 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg text-xs font-black uppercase tracking-widest cursor-pointer"
            >
              {formData.type === 'falesia' ? '+ Aggiungi Via' : '+ Aggiungi Linea'}
            </button>
          </div>
          
          {lines.length > 0 ? (
            <div className="space-y-3">
              {lines.map((line, idx) => (
                <div key={line.id || idx} className="p-4 bg-stone-50 border border-stone-100 rounded-2xl space-y-3 relative">
                  <button 
                    type="button"
                    onClick={() => removeLine(line.id)}
                    className="absolute top-2 right-2 p-2 text-stone-300 hover:text-red-500 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-2">
                      <input
                        type="text"
                        placeholder="#"
                        value={line.number || ''}
                        onChange={(e) => updateLine(line.id, { number: e.target.value })}
                        className="w-full p-2 bg-white border border-stone-200 rounded-lg text-sm text-center font-black"
                      />
                    </div>
                    <div className="col-span-10">
                      <input
                        type="text"
                        placeholder={formData.type === 'falesia' ? 'Nome della via' : 'Nome della linea / Boulder'}
                        value={line.name}
                        onChange={(e) => updateLine(line.id, { name: e.target.value })}
                        className="w-full p-2 bg-white border border-stone-200 rounded-lg text-sm"
                      />
                    </div>
                    <div className="col-span-5">
                       <input
                        type="text"
                        placeholder={formData.type === 'falesia' ? 'Chiodatore / Primo Salitore' : 'Apritore'}
                        value={line.opener || ''}
                        onChange={(e) => updateLine(line.id, { opener: e.target.value })}
                        className="w-full p-2 bg-white border border-stone-200 rounded-lg text-[11px] font-bold uppercase tracking-wider italic"
                      />
                    </div>
                    <div className="col-span-3">
                      <input
                        type="text"
                        placeholder="Grado"
                        value={line.grade}
                        onChange={(e) => updateLine(line.id, { grade: e.target.value })}
                        className="w-full p-2 bg-white border border-stone-200 rounded-lg text-sm"
                      />
                    </div>
                    <div className="col-span-4">
                      <select
                        value={line.status}
                        onChange={(e) => updateLine(line.id, { status: e.target.value })}
                        className="w-full p-2 bg-white border border-stone-200 rounded-lg text-sm"
                      >
                        <option value="new">Nuovo</option>
                        <option value="clean">Pulito</option>
                        <option value="project">Progetto</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 bg-stone-50 rounded-2xl border border-dashed border-stone-200">
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest italic">
                {formData.type === 'falesia' ? 'Nessuna via aggiunta' : 'Nessuna linea aggiunta'}
              </p>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-wider">Stile / Appigli</label>
            <input
              type="text"
              value={formData.style}
              onChange={(e) => setFormData({ ...formData, style: e.target.value })}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none"
              placeholder="Es: Tacche, Strapiombo"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-wider">Note Pulizia / Accesso</label>
            <textarea
              value={formData.accessNotes}
              onChange={(e) => setFormData({ ...formData, accessNotes: e.target.value })}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none min-h-[100px]"
              placeholder="Come arrivare o stato della pulizia..."
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-wider">Note Sicurezza</label>
            <textarea
              value={formData.landingNotes}
              onChange={(e) => setFormData({ ...formData, landingNotes: e.target.value })}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none min-h-[80px]"
              placeholder="Sassi, radici, piano..."
            />
          </div>
        </section>
      </div>
    </form>
  );
};
