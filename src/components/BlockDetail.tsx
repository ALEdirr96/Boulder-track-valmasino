import React from 'react';
import { 
  MapPin, Star, Calendar, User, Info, Navigation, 
  Edit2, Trash2, CheckCircle, ArrowLeft, 
  ExternalLink, Ruler, Mountain, Sun, AlertTriangle,
  Clock, ShieldAlert, Shield, X, ChevronLeft, ChevronRight,
  Check
} from 'lucide-react';
import { Block, BlockStatus, BlockReview, UserProfile } from '../types';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

interface BlockDetailProps {
  block: Block;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onGuide: () => void;
  onToggleFavorite: () => void;
  onToggleVisited: () => void;
  isAdmin?: boolean;
  isOwner?: boolean;
  isGuest?: boolean;
  userProfile?: UserProfile | null;
}

const STATUS_COLORS: Record<BlockStatus, string> = {
  new: 'bg-blue-500',
  clean: 'bg-emerald-500',
  to_clean: 'bg-amber-500',
  project: 'bg-purple-500',
};

const STATUS_LABELS: Record<BlockStatus, string> = {
  new: 'Nuovo',
  clean: 'Pulito',
  to_clean: 'Da Pulire',
  project: 'Progetto',
};

export const BlockDetail: React.FC<BlockDetailProps> = ({
  block,
  onBack,
  onEdit,
  onDelete,
  onGuide,
  onToggleFavorite,
  onToggleVisited,
  isAdmin = false,
  isOwner = false,
  isGuest = false,
  userProfile = null,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = React.useState<number | null>(null);
  
  // Custom reviews & ascents community state
  const [reviews, setReviews] = React.useState<BlockReview[]>([]);
  const [loadingReviews, setLoadingReviews] = React.useState(true);
  const [userReview, setUserReview] = React.useState<BlockReview | null>(null);

  // Form input state for active user
  const [rating, setRating] = React.useState(0);
  const [comment, setComment] = React.useState('');
  const [hasClimbed, setHasClimbed] = React.useState(false);
  const [climbedLines, setClimbedLines] = React.useState<string[]>([]);
  const [isSaving, setIsSaving] = React.useState(false);

  // Active user ID (authenticated or persistent generated guest ID)
  const effectiveUserId = React.useMemo(() => {
    if (userProfile?.uid) return userProfile.uid;
    let storedUid = localStorage.getItem('boulder_tracker_guest_uid');
    if (!storedUid) {
      storedUid = 'guest_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
      localStorage.setItem('boulder_tracker_guest_uid', storedUid);
    }
    return storedUid;
  }, [userProfile?.uid]);

  // Saved nickname state for guest climbers
  const [guestNickname, setGuestNickname] = React.useState(() => {
    return localStorage.getItem('boulder_tracker_guest_nickname') || '';
  });

  React.useEffect(() => {
    if (!block?.id) return;
    const q = query(collection(db, 'blocks', block.id, 'reviews'), orderBy('createdAt', 'desc'));
    setLoadingReviews(true);
    const unsub = onSnapshot(q, (snapshot) => {
      const fetchedReviews: BlockReview[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as BlockReview));
      setReviews(fetchedReviews);
      
      const found = fetchedReviews.find(r => r.userId === effectiveUserId);
      if (found) {
        setUserReview(found);
        setRating(found.rating);
        setComment(found.comment);
        setHasClimbed(found.hasClimbed);
        setClimbedLines(found.climbedLines || []);
        // Restore guest nickname if present
        if (!userProfile?.uid && found.userDisplayName && found.userDisplayName !== 'Scaler Anonimo') {
          setGuestNickname(found.userDisplayName);
        }
      } else {
        setUserReview(null);
        setRating(0);
        setComment('');
        setHasClimbed(false);
        setClimbedLines([]);
      }
      setLoadingReviews(false);
    }, (error) => {
      console.error("Error loading reviews:", error);
      setLoadingReviews(false);
    });
    return unsub;
  }, [block.id, effectiveUserId, userProfile?.uid]);

  const handleToggleClimbedLine = (lineId: string) => {
    setClimbedLines(prev => {
      const exists = prev.includes(lineId);
      const updated = exists ? prev.filter(id => id !== lineId) : [...prev, lineId];
      if (updated.length > 0) {
        setHasClimbed(true);
      }
      return updated;
    });
  };

  const handleToggleHasClimbed = () => {
    const nextVal = !hasClimbed;
    setHasClimbed(nextVal);
    if (!nextVal) {
      setClimbedLines([]);
    } else if (block?.lines && block.lines.length === 1) {
      const singleLineId = block.lines[0].id || block.lines[0].name || 'line_0';
      setClimbedLines([singleLineId]);
    }
  };

  const handleSaveReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const reviewRef = doc(db, 'blocks', block.id, 'reviews', effectiveUserId);
      const isGuestUser = !userProfile?.uid;
      
      const displayName = isGuestUser 
        ? (guestNickname.trim() || 'Scaler Anonimo')
        : (userProfile.displayName || userProfile.email.split('@')[0]);

      if (isGuestUser) {
        localStorage.setItem('boulder_tracker_guest_nickname', guestNickname);
      }

      await setDoc(reviewRef, {
        userId: effectiveUserId,
        userEmail: isGuestUser ? 'guest@valmasinoclimbing.com' : userProfile.email,
        userDisplayName: displayName,
        rating,
        comment,
        hasClimbed,
        climbedLines,
        createdAt: userReview?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Error saving review:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteReview = async () => {
    if (!window.confirm("Sei sicuro di voler eliminare il tuo feedback?")) return;
    setIsSaving(true);
    try {
      const reviewRef = doc(db, 'blocks', block.id, 'reviews', effectiveUserId);
      await deleteDoc(reviewRef);
      setRating(0);
      setComment('');
      setHasClimbed(false);
      setClimbedLines([]);
      setUserReview(null);
    } catch (err) {
      console.error("Error deleting review:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Helper inside component to render "Sassi" rock icons cleanly
  const renderSassi = (count: number, onClick?: (rating: number) => void) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((num) => {
          const filled = num <= count;
          return (
            <button
              type={onClick ? "button" : undefined}
              key={num}
              onClick={onClick ? () => onClick(num) : undefined}
              disabled={!onClick}
              className={cn(
                "p-1 focus:outline-none transition-transform duration-100",
                onClick ? "hover:scale-125 cursor-pointer active:scale-95" : "cursor-default"
              )}
            >
              <Mountain 
                className={cn(
                  "w-5 h-5 transition-colors",
                  filled 
                    ? "text-stone-600 fill-stone-600 stroke-stone-700" 
                    : "text-stone-200 stroke-stone-300"
                )} 
              />
            </button>
          );
        })}
      </div>
    );
  };

  const completedAscentsCount = reviews.filter(r => r.hasClimbed).length;
  const averageSassi = React.useMemo(() => {
    const ratedReviews = reviews.filter(r => r.rating > 0);
    if (ratedReviews.length === 0) return null;
    const sum = ratedReviews.reduce((acc, r) => acc + r.rating, 0);
    return Math.round((sum / ratedReviews.length) * 10) / 10;
  }, [reviews]);

  const date = block.createdAt?.toDate ? block.createdAt.toDate() : new Date(block.createdAt);

  const canEdit = !isGuest && (isOwner || isAdmin);

  return (
    <div className="flex flex-col h-full bg-stone-50">
      {/* Header Image */}
      <div 
        onClick={() => { if (block.photos?.[0]) setActivePhotoIndex(0); }}
        className={cn(
          "relative h-72 bg-stone-200 select-none",
          block.photos?.[0] ? "cursor-pointer group overflow-hidden" : ""
        )}
      >
        {block.photos?.[0] ? (
          <>
            <img
              src={block.photos[0]}
              alt={block.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-black/10 group-hover:bg-black/30 transition-all flex items-center justify-center">
              <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white font-black uppercase text-[10px] tracking-widest py-2 px-4 rounded-xl backdrop-blur-md shadow-lg border border-white/10">
                Visualizza uncropped (16:9)
              </span>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-300">
            <MapPin className="w-16 h-16" />
          </div>
        )}
        
        <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/50 to-transparent z-10" onClick={(e) => e.stopPropagation()}>
          <button onClick={onBack} className="p-2 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/30 transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            {!isGuest && (
              <button onClick={onToggleFavorite} className={cn(
                "p-2 bg-white/20 backdrop-blur-md rounded-full hover:bg-white/30 transition-colors",
                block.favorite ? "text-amber-400" : "text-white"
              )}>
                <Star className={cn("w-6 h-6", block.favorite && "fill-current")} />
              </button>
            )}
            {canEdit && (
              <button onClick={onEdit} className="p-2 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/30 transition-colors">
                <Edit2 className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/70 to-transparent" onClick={(e) => e.stopPropagation()}>
          <div className={cn(
            "inline-block px-2 py-1 rounded-full text-[10px] font-bold text-white uppercase tracking-wider mb-2",
            STATUS_COLORS[block.status]
          )}>
            {STATUS_LABELS[block.status]}
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">{block.name}</h1>
          <div className="flex items-center gap-2 text-white/80 text-sm">
            <MapPin className="w-4 h-4" />
            {block.area}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-32">
        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-px bg-stone-200 border-b border-stone-200">
          <div className="bg-white p-3 flex flex-col items-center justify-center text-center">
            <Ruler className="w-4 h-4 text-stone-400 mb-1" />
            <span className="text-[10px] font-black text-stone-800">{block.height || '---'}m</span>
            <span className="text-[8px] text-stone-400 uppercase tracking-wider">
              {block.type === 'falesia' ? 'Sviluppo' : 'Altezza'}
            </span>
          </div>
          <div className="bg-white p-3 flex flex-col items-center justify-center text-center">
            <Sun className="w-4 h-4 text-stone-400 mb-1" />
            <span className="text-[10px] font-black text-stone-800">{block.exposure || '---'}</span>
            <span className="text-[8px] text-stone-400 uppercase tracking-wider">Sole</span>
          </div>
          <div className={cn(
            "p-3 flex flex-col items-center justify-center text-center",
            block.riskLevel === 'Danger' ? "bg-red-50" : block.riskLevel === 'Loose' ? "bg-amber-50" : "bg-white"
          )}>
            {block.riskLevel === 'Danger' ? (
              <ShieldAlert className="w-4 h-4 text-red-500 mb-1" />
            ) : block.riskLevel === 'Loose' ? (
              <AlertTriangle className="w-4 h-4 text-amber-500 mb-1" />
            ) : (
              <Shield className="w-4 h-4 text-emerald-500 mb-1" />
            )}
            <span className={cn(
              "text-[10px] font-black uppercase tracking-tighter opacity-80 italic",
              block.riskLevel === 'Danger' ? "text-red-600" : block.riskLevel === 'Loose' ? "text-amber-600" : "text-emerald-600"
            )}>
              {block.riskLevel === 'Danger' ? 'PERICOLO' : block.riskLevel === 'Loose' ? 'INSTABILE' : 'SOLIDO'}
            </span>
          </div>
        </div>

        {/* Community Stats bar */}
        {(completedAscentsCount > 0 || averageSassi !== null) && (
          <div className="px-6 py-3 bg-stone-100/55 border-b border-stone-200/60 flex items-center justify-between text-[11px] font-bold text-stone-600">
            {averageSassi !== null ? (
              <div className="flex items-center gap-1.5 animate-fade-in">
                <span className="text-[10px] font-black text-stone-400 uppercase tracking-wide">Media:</span>
                <div className="flex items-center gap-0.5 select-none scale-90">
                  {renderSassi(Math.round(averageSassi))}
                </div>
                <span className="text-stone-700 font-extrabold">({averageSassi}/5)</span>
              </div>
            ) : (
              <div />
            )}
            {completedAscentsCount > 0 && (
              <div className="flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-100/40 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tight shadow-sm select-none animate-fade-in">
                <CheckCircle className="w-3.5 h-3.5 fill-emerald-100" />
                <span>{completedAscentsCount} {completedAscentsCount === 1 ? 'Salita registrata' : 'Salite registrate'}</span>
              </div>
            )}
          </div>
        )}

        <div className="p-6 space-y-8">
          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={onGuide}
              className={cn(
                "flex items-center justify-center gap-2 p-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-600/20 active:scale-95 transition-transform",
                isGuest ? "col-span-2" : ""
              )}
            >
              <Navigation className="w-5 h-5" />
              Guidami
            </button>
            {!isGuest && (
              <button
                onClick={onToggleVisited}
                className={cn(
                  "flex items-center justify-center gap-2 p-4 rounded-2xl font-bold border-2 active:scale-95 transition-transform",
                  block.visited 
                    ? "bg-emerald-50 border-emerald-500 text-emerald-700" 
                    : "bg-white border-stone-200 text-stone-600"
                )}
              >
                <CheckCircle className={cn("w-5 h-5", block.visited && "fill-current")} />
                {block.visited ? 'Visitato' : 'Visita'}
              </button>
            )}
          </div>

          {/* Lines Table */}
          {block.lines && block.lines.length > 0 && (
            <section className="space-y-4">
              <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest">
                {block.type === 'falesia' ? `Vie / Tiri (${block.lines.length})` : `Linee / Boulder (${block.lines.length})`}
              </h3>
              <div className="bg-white border border-stone-100 rounded-3xl overflow-hidden shadow-sm">
                {block.lines.map((line, idx) => (
                  <div key={line.id || idx} className="p-4 flex items-center justify-between border-b last:border-0 border-stone-50">
                    <div className="flex items-center gap-3">
                      {line.number && (
                        <div className="w-7 h-7 flex items-center justify-center bg-emerald-600 rounded-lg text-xs font-black text-white shadow-sm shrink-0">
                          {line.number}
                        </div>
                      )}
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-stone-800">{line.name || (block.type === 'falesia' ? `Via ${idx + 1}` : `Linea ${idx + 1}`)}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-tight italic">
                            {line.status === 'clean' ? 'Pulito' : line.status === 'project' ? 'Progetto' : 'Nuovo'}
                          </span>
                          {line.opener && (
                            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest before:content-['•'] before:mr-2 before:text-stone-300">
                              {line.opener}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="px-3 py-1 bg-stone-900 text-white rounded-lg text-[10px] font-black italic">
                      {line.grade || '---'}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Details */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest">Informazioni</h3>
            
            <div className="space-y-4">
              {block.style && (
                <div className="flex gap-4">
                  <Info className="w-5 h-5 text-stone-300 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-stone-800">Stile / Appigli</p>
                    <p className="text-sm text-stone-500">{block.style}</p>
                  </div>
                </div>
              )}
              
              {block.accessNotes && (
                <div className="flex gap-4">
                  <Clock className="w-5 h-5 text-stone-300 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-stone-800">Accesso</p>
                    <p className="text-sm text-stone-500">{block.accessNotes}</p>
                  </div>
                </div>
              )}

              {block.landingNotes && (
                <div className="flex gap-4">
                  <ShieldAlert className="w-5 h-5 text-stone-300 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-stone-800">Atterraggio</p>
                    <p className="text-sm text-stone-500">{block.landingNotes}</p>
                  </div>
                </div>
              )}

              {block.riskLevel && (
                <div className="flex gap-4">
                  <AlertTriangle className="w-5 h-5 text-stone-300 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-stone-800">Pericolosità</p>
                    <p className="text-sm text-stone-500">{block.riskLevel}</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Photo Gallery */}
          {block.photos && block.photos.length > 0 && (
            <section className="space-y-4">
              <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest">Galleria Foto</h3>
              <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                {block.photos.map((photo, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => setActivePhotoIndex(idx)}
                    className="w-64 aspect-video bg-stone-100 rounded-3xl overflow-hidden shrink-0 shadow-lg border-4 border-white cursor-pointer hover:border-brand hover:scale-[1.01] active:scale-[0.99] transition-all relative group"
                  >
                    <img src={photo} alt={`Block detail ${idx}`} className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white font-black text-[9px] uppercase tracking-widest bg-black/50 px-2.5 py-1.5 rounded-lg backdrop-blur-sm shadow">
                        Vedi uncropped
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* COMMUNITY REVIEWS & ASCENTS SECTION */}
          <section className="space-y-4 pt-6 border-t border-stone-200">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest">Feedback & Salite</h3>
              <span className="text-[10px] font-black uppercase text-stone-400 bg-stone-100 px-2.5 py-1 rounded-full">Community ({reviews.length})</span>
            </div>

            {/* User review form / edit card for all climbers */}
            <form onSubmit={handleSaveReview} className="bg-white rounded-3xl p-5 border border-stone-200/50 shadow-sm space-y-4 animate-fade-in">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-stone-400">
                  {userReview ? "La tua valutazione" : "Aggiungi il tuo feedback"}
                </span>
                {userReview && (
                  <button
                    type="button"
                    onClick={handleDeleteReview}
                    className="text-[9px] font-black text-red-500 uppercase hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" /> Elimina
                  </button>
                )}
              </div>

              {/* Nickname input for Guest users */}
              {!userProfile?.uid && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-stone-400 tracking-wider block">Tuo Nome / Soprannome (Opzionale)</label>
                  <input
                    type="text"
                    placeholder="Es: Climber99 (Lascia vuoto per Anonimo)"
                    value={guestNickname}
                    onChange={(e) => setGuestNickname(e.target.value)}
                    maxLength={30}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl text-xs placeholder-stone-400 font-bold outline-none focus:border-stone-400 transition-colors"
                  />
                </div>
              )}

              {/* 1. Climb marking */}
              <div className="flex items-center justify-between bg-stone-50 p-3 rounded-2xl border border-stone-100">
                <div className="flex flex-col pr-2">
                  <span className="text-xs font-bold text-stone-800">Contrassegna come Salito</span>
                  <span className="text-[9px] text-stone-400 leading-tight">Attiva questa opzione se hai completato la salita</span>
                </div>
                <button
                  type="button"
                  onClick={handleToggleHasClimbed}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer shrink-0 select-none",
                    hasClimbed 
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/10" 
                      : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                  )}
                >
                  {hasClimbed ? "Salito! ✓" : "Non Salito"}
                </button>
              </div>

              {/* Specific Lines climbed checklist */}
              {block.lines && block.lines.length > 0 && (
                <div className="space-y-2 bg-stone-50/40 p-3.5 rounded-2xl border border-stone-100/80">
                  <label className="text-[10px] font-black uppercase text-stone-400 tracking-wider block">
                    {block.type === 'falesia' ? 'Quali vie hai salito? (Seleziona per segnarle)' : 'Quali linee hai salito? (Seleziona per segnarle)'}
                  </label>
                  <div className="space-y-1 py-1 max-h-48 overflow-y-auto no-scrollbar">
                    {block.lines.map((line, idx) => {
                      const lineId = line.id || line.name || `line_${idx}`;
                      const isSelected = climbedLines.includes(lineId);
                      return (
                        <button
                          type="button"
                          key={lineId}
                          onClick={() => handleToggleClimbedLine(lineId)}
                          className={cn(
                            "w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all duration-150 select-none active:scale-[0.99] cursor-pointer",
                            isSelected 
                              ? "bg-emerald-50/50 border-emerald-300 text-stone-800 font-bold" 
                              : "bg-white border-stone-200/40 text-stone-600 font-medium hover:border-stone-300"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "w-5 h-5 rounded-md flex items-center justify-center border transition-all duration-150 shrink-0",
                              isSelected 
                                ? "bg-emerald-600 border-emerald-600 text-white" 
                               : "border-stone-300 bg-white text-transparent"
                            )}>
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                            <span className="text-xs">
                              {line.number ? `${line.number}. ` : ''}{line.name || (block.type === 'falesia' ? `Via ${idx + 1}` : `Linea ${idx + 1}`)}
                            </span>
                          </div>
                          <span className="text-[10px] font-black uppercase text-stone-450 bg-stone-100/80 px-2 py-0.5 rounded-md italic">
                            {line.grade || '---'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. Rating in SASSI */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-stone-400 tracking-wider block">
                  {block.type === 'falesia' ? 'Valutazione Falesia (SASSI)' : 'Valutazione Blocco (SASSI)'}
                </label>
                <div className="flex items-center gap-2">
                  {renderSassi(rating, (r) => setRating(r))}
                  <span className="text-xs font-bold text-stone-500">
                    {rating === 0 ? "Seleziona i sassi" : `${rating} ${rating === 1 ? 'sasso' : 'sassi'}`}
                  </span>
                </div>
              </div>

              {/* 3. Text comment */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-stone-400 tracking-wider block">Consigli o commenti</label>
                <textarea
                  placeholder="Scrivi qui i tuoi consigli, i passaggi chiave o commenti sul blocco..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={300}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl text-xs text-stone-800 placeholder-stone-400 outline-none focus:border-stone-400 transition-colors h-20 resize-none font-medium"
                />
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-3 bg-stone-900 hover:bg-stone-800 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-2 active:scale-95"
              >
                {isSaving ? "Salvataggio in corso..." : (userReview ? "Aggiorna Feedback" : "Invia Feedback")}
              </button>
            </form>

            {/* List of other climbers' reviews */}
            <div className="space-y-3">
              {loadingReviews ? (
                <p className="text-xs text-stone-400 italic text-center py-4">Caricamento commenti...</p>
              ) : reviews.length === 0 ? (
                <p className="text-xs text-stone-450 italic text-center py-8 bg-stone-100/30 rounded-3xl border border-dashed border-stone-200/50">Nessun feedback presente. Sii il primo ad aggiungerne uno!</p>
              ) : (
                reviews.map((rev) => {
                  const revDate = rev.createdAt?.toDate ? rev.createdAt.toDate() : (rev.createdAt ? new Date(rev.createdAt) : new Date());
                  const revLines = rev.climbedLines || [];
                  const climbedLineObjects = block.lines
                    ? block.lines.filter(l => revLines.includes(l.id || l.name || ''))
                    : [];

                  return (
                    <div key={rev.id || rev.userId} className="p-4 bg-white border border-stone-100 rounded-3xl shadow-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-stone-800 flex items-center gap-1.5 flex-wrap">
                            {rev.userDisplayName}
                            {rev.hasClimbed && (
                              <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100">
                                Salito
                              </span>
                            )}
                          </span>
                          <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider">
                            {format(revDate, 'd MMM yyyy', { locale: it })}
                          </span>
                        </div>
                        {rev.rating > 0 && (
                          <div className="flex items-center gap-0.5 select-none scale-90 origin-right">
                            {renderSassi(rev.rating)}
                          </div>
                        )}
                      </div>

                      {/* Display climbed lines if any were selected */}
                      {climbedLineObjects.length > 0 && (
                        <div className="flex flex-col gap-1 pt-1 bg-stone-50/45 p-2 rounded-2xl border border-stone-100/40">
                          <span className="text-[8px] font-black uppercase tracking-wider text-stone-400">
                            {block.type === 'falesia' ? 'Vie salite:' : 'Linee salite:'}
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {climbedLineObjects.map((line, idx) => (
                              <span 
                                key={line.id || idx} 
                                className="text-[9px] font-bold text-stone-700 bg-white border border-stone-200/50 px-2 py-0.5 rounded-full inline-flex items-center gap-1 select-none animate-fade-in"
                              >
                                {line.number && (
                                  <span className="w-3.5 h-3.5 flex items-center justify-center bg-stone-600 text-white font-black text-[8px] rounded-full shrink-0">
                                    {line.number}
                                  </span>
                                )}
                                <span>{line.name || (block.type === 'falesia' ? `Via ${idx + 1}` : `Linea ${idx + 1}`)}</span>
                                <span className="text-[8px] font-semibold text-stone-400 italic">({line.grade || '---'})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {rev.comment && (
                        <p className="text-xs text-stone-600 font-medium pl-2 leading-relaxed border-l-2 border-stone-200/60">
                          {rev.comment}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Metadata */}
          <div className="pt-6 border-t border-stone-200 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs text-stone-400">
              <Calendar className="w-3 h-3" />
              Inserito il {format(date, 'd MMMM yyyy', { locale: it })}
            </div>
            <div className="flex items-center gap-2 text-xs font-black text-amber-600 uppercase tracking-widest bg-amber-50 self-start px-3 py-1 rounded-xl border border-amber-100">
              <User className="w-3 h-3" />
              Progetto di: {block.projectOwner || block.createdByDisplayName || block.createdByEmail || 'Anonimo'}
            </div>
          </div>

          {canEdit && (
            <div className="pt-4">
              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full flex items-center justify-center gap-2 p-4 text-red-500 font-black uppercase tracking-widest italic border-2 border-red-500/10 rounded-2xl active:bg-red-50 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-5 h-5" />
                  {block.type === 'falesia' ? 'Elimina Falesia' : 'Elimina Blocco'}
                </button>
              ) : (
                <div className="p-6 bg-red-50 rounded-3xl border-2 border-red-100 space-y-4">
                  <p className="text-red-700 text-sm font-bold text-center">
                    {block.type === 'falesia' 
                      ? 'Sei sicuro di voler eliminare definitivamente questa falesia? Questa azione non è reversibile.'
                      : 'Sei sicuro di voler eliminare definitivamente questo blocco? Questa azione non è reversibile.'}
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={onDelete}
                      className="flex-1 p-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest italic shadow-lg shadow-red-900/20 cursor-pointer"
                    >
                      Sì, Elimina
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 p-4 bg-white text-stone-500 rounded-2xl font-black uppercase tracking-widest italic border border-stone-200 cursor-pointer"
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Modal */}
      {activePhotoIndex !== null && block.photos && (
        <div 
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-stone-950/95 p-4 backdrop-blur-md"
          onClick={() => setActivePhotoIndex(null)}
        >
          <div className="absolute top-4 right-4 flex items-center gap-3 z-[60]" onClick={(e) => e.stopPropagation()}>
            <span className="text-white/60 font-mono text-xs font-bold leading-none select-none bg-stone-900/80 px-3 py-2 rounded-xl border border-white/5">
              {activePhotoIndex + 1} / {block.photos.length}
            </span>
            <button 
              onClick={() => setActivePhotoIndex(null)}
              className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all duration-200 active:scale-95 cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <div 
            className="relative w-full max-w-4xl aspect-video bg-stone-900/40 rounded-3xl overflow-hidden border border-white/10 flex items-center justify-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={block.photos[activePhotoIndex]}
              alt={`Entire view ${activePhotoIndex}`}
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
            
            {block.photos.length > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActivePhotoIndex((prev) => (prev! === 0 ? block.photos!.length - 1 : prev! - 1));
                  }}
                  className="absolute left-4 p-3 bg-black/40 hover:bg-black/60 text-white rounded-2xl border border-white/10 hover:border-white/20 transition-all active:scale-90 duration-200"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActivePhotoIndex((prev) => (prev! === block.photos!.length - 1 ? 0 : prev! + 1));
                  }}
                  className="absolute right-4 p-3 bg-black/40 hover:bg-black/60 text-white rounded-2xl border border-white/10 hover:border-white/20 transition-all active:scale-90 duration-200"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
          </div>
          <div className="mt-4 text-center select-none" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs text-white/55 font-bold uppercase tracking-wider">Immagine intera in formato 16:9 non ritagliato</p>
          </div>
        </div>
      )}
    </div>
  );
};
