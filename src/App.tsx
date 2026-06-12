/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  query, 
  orderBy,
  getDoc,
  where,
  getDocs,
  setDoc,
  limit
} from 'firebase/firestore';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  onAuthStateChanged, 
  User as FirebaseUser,
  signOut,
  sendPasswordResetEmail
} from 'firebase/auth';
import { db, auth, firebaseConfigExport } from './firebase';
import { Block, BlockStatus, UserProfile } from './types';
import { Layout } from './components/Layout';
import { BlockCard } from './components/BlockCard';
import { BlockDetail } from './components/BlockDetail';
import { BlockForm } from './components/BlockForm';
import { MapView } from './components/MapView';
import { Compass } from './components/Compass';
import { UserManagement } from './components/UserManagement';
import { CalendarView } from './components/CalendarView';
import { EquipmentManagement } from './components/EquipmentManagement';
import { logActivity } from './lib/logger';
import { Logo } from './components/Logo';
import { useLocation } from './hooks/useLocation';
import officialLogoUrl from './assets/images/official_symbol_scalamasino_1779367181213.png';
import { 
  Loader2, LogIn, Mountain, Filter, 
  CheckCircle, Star, AlertCircle, X,
  ArrowLeft, Search, UserPlus, Shield, Info, ExternalLink, Clock,
  ChevronDown
} from 'lucide-react';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

type View = 'list' | 'map' | 'calendar' | 'equipment' | 'detail' | 'form' | 'guide' | 'profile' | 'admin';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentView, setCurrentView] = useState<View>('list');
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [activeTab, setActiveTab ] = useState<'home' | 'map' | 'calendar' | 'equipment' | 'profile' | 'admin' | 'equipment'>('home');
  const [filter, setFilter] = useState<BlockStatus | 'all' | 'favorite' | 'visited'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'blocco' | 'falesia'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isGuest, setIsGuest] = useState(false);
  const [showReservedArea, setShowReservedArea] = useState(false);

  // Auth form state
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const { location, error: locationError, needsCompassPermission, requestCompassPermission } = useLocation();

  const [appTheme, setAppTheme] = useState<{
    accentColor: string;
    logoText: string;
    showLogoSymbol: boolean;
    logoImage: string | null;
  }>({
    accentColor: 'emerald',
    logoText: 'ASD Val Masino Climbing',
    showLogoSymbol: true,
    logoImage: officialLogoUrl,
  });

  useEffect(() => {
    const unsubTheme = onSnapshot(doc(db, 'settings', 'app'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        let fetchedLogoText = data.logoText || 'ASD VAL MASINO CLIMBING';
        if (!fetchedLogoText || fetchedLogoText.toLowerCase().includes('scalamasino')) {
          fetchedLogoText = 'ASD VAL MASINO CLIMBING';
        }
        setAppTheme({
          accentColor: data.accentColor || 'emerald',
          logoText: fetchedLogoText,
          showLogoSymbol: data.showLogoSymbol !== false,
          logoImage: data.logoImage || officialLogoUrl,
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/app');
    });
    return unsubTheme;
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const colors: Record<string, { primary: string; hover: string; bgLight: string }> = {
      emerald: { primary: '#059669', hover: '#047857', bgLight: 'rgba(5, 150, 105, 0.1)' },
      red: { primary: '#ef4444', hover: '#dc2626', bgLight: 'rgba(239, 68, 68, 0.1)' },
      blue: { primary: '#2563eb', hover: '#1d4ed8', bgLight: 'rgba(37, 99, 235, 0.1)' },
      amber: { primary: '#d97706', hover: '#b45309', bgLight: 'rgba(217, 119, 6, 0.1)' },
      violet: { primary: '#8b5cf6', hover: '#7c3aed', bgLight: 'rgba(139, 92, 246, 0.1)' },
      stone: { primary: '#4b5563', hover: '#374151', bgLight: 'rgba(75, 85, 99, 0.1)' },
    };
    const setColors = colors[appTheme.accentColor] || colors.emerald;

    root.style.setProperty('--color-accent-primary', setColors.primary);
    root.style.setProperty('--color-accent-hover', setColors.hover);
    root.style.setProperty('--color-accent-bg-light', setColors.bgLight);
  }, [appTheme.accentColor]);

  // Auth Listener - Non-blocking
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      console.log("Auth state changed:", fbUser?.email);
      setUser(fbUser);
      setAuthReady(true);
      if (fbUser) {
        setIsGuest(false);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  // Profile Fetcher - Handles background logic
  useEffect(() => {
    if (!user) return;


    const syncProfile = async () => {
      setLoading(true);
      try {
        const userEmail = user.email?.toLowerCase();
        const profileDoc = await getDoc(doc(db, 'users', user.uid));
        
        if (profileDoc.exists()) {
          const data = profileDoc.data() as UserProfile;
          setProfile({ uid: user.uid, ...data });
        } else {
          const isSuperAdmin = userEmail === 'asdadmin@scalamasino.com' || userEmail === 'asdadmin@valmasinoclimbing.com' || userEmail === 'videoclipalessandrosangiorgio@gmail.com';
          const newProfile = {
            email: userEmail || '',
            displayName: (userEmail === 'asdadmin@scalamasino.com' || userEmail === 'asdadmin@valmasinoclimbing.com') ? 'Admin Val Masino' : (userEmail === 'videoclipalessandrosangiorgio@gmail.com' ? 'Alessandro Sangiorgio' : (user.displayName || userEmail?.split('@')[0] || 'Utente')),
            role: isSuperAdmin ? 'admin' : 'user',
            status: isSuperAdmin ? 'active' : 'pending',
            createdAt: serverTimestamp(),
            photoURL: user.photoURL || null
          };
          
          try {
            await setDoc(doc(db, 'users', user.uid), newProfile);
            setProfile({ uid: user.uid, ...newProfile } as any);
          } catch (e: any) {
            console.error("Profile creation error:", e);
            setAuthError("Errore creazione profilo: " + e.message);
          }
        }
      } catch (err: any) {
        console.error("Profile sync error:", err);
        setAuthError("Errore sincronizzazione profilo.");
      } finally {
        setLoading(false);
      }
    };

    syncProfile();
  }, [user]);

  // Blocks Listener
  useEffect(() => {
    // If guest, fetch only clean blocks
    // If logged in and active, fetch all blocks
    if (!isGuest && (!user || !profile || profile.status !== 'active')) return;

    setLoading(true);
    let q;
    if (isGuest) {
      q = query(collection(db, 'blocks'), where('status', '==', 'clean'), orderBy('createdAt', 'desc'));
    } else {
      q = query(collection(db, 'blocks'), orderBy('createdAt', 'desc'));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const blocksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Block[];
      setBlocks(blocksData);
      setLoading(false);
    }, (error) => {
      setLoading(false);
      handleFirestoreError(error, OperationType.GET, 'blocks');
    });

    return unsubscribe;
  }, [user, profile, isGuest]);

  const handleForgotPassword = async () => {
    if (!email) {
      setAuthError("Inserisci la tua email per reimpostare la password.");
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      alert("Email di ripristino password inviata! Controlla la tua casella di posta.");
      setAuthError(null);
    } catch (error: any) {
      console.error("Reset Error:", error);
      setAuthError("Errore nell'invio dell'email: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (error: any) {
      console.error("Auth Error:", error);
      if (error.code === 'auth/operation-not-allowed') {
        setAuthError("L'accesso con Email/Password non è abilitato nella console Firebase.");
      } else if (error.code === 'auth/email-already-in-use') {
        setAuthError("Questa email è già registrata. Prova ad accedere.");
      } else if (error.code === 'auth/weak-password') {
        setAuthError("La password deve avere almeno 6 caratteri.");
      } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        setAuthError("Credenziali non valide. Controlla email e password.");
      } else {
        setAuthError(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setCurrentView('list');
      setActiveTab('home');
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  // Wrapper for Firestore operations with error handling
  const executeFirestore = async (op: () => Promise<any>, operationType: OperationType, path: string | null, friendlyMsg: string) => {
    try {
      return await op();
    } catch (error) {
      console.error(error);
      const detailedError = handleFirestoreError(error, operationType, path);
      alert(`${friendlyMsg}\n\nDettagli tecnici: ${detailedError}`);
    }
  };

  const handleAddBlock = async (data: Partial<Block>) => {
    if (!user || !profile) return;
    await executeFirestore(async () => {
      await addDoc(collection(db, 'blocks'), {
        ...data,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        createdByEmail: user.email,
        createdByDisplayName: profile.displayName,
        visited: false,
        favorite: false,
      });
      await logActivity(`Creato il blocco "${data.name}" nel settore "${data.area}"`, 'block', {
        uid: user.uid,
        email: user.email || '',
        displayName: profile.displayName || 'Anonimo',
      });
      setCurrentView('list');
    }, OperationType.CREATE, 'blocks', "Errore nel salvataggio del blocco. Potresti non avere i permessi necessari.");
  };

  const handleUpdateBlock = async (data: Partial<Block>) => {
    if (!user || !selectedBlock) return;
    await executeFirestore(async () => {
      const blockRef = doc(db, 'blocks', selectedBlock.id);
      await updateDoc(blockRef, {
        ...data,
        updatedAt: serverTimestamp(),
      });
      await logActivity(`Modificato il blocco "${selectedBlock.name}"`, 'block', {
        uid: user.uid,
        email: user.email || '',
        displayName: profile?.displayName || 'Anonimo',
      });
      setSelectedBlock({ ...selectedBlock, ...data });
      setCurrentView('detail');
    }, OperationType.UPDATE, `blocks/${selectedBlock.id}`, "Errore nell'aggiornamento. Permesso negato.");
  };

  const handleDeleteBlock = async (id: string) => {
    if (!user) return;
    await executeFirestore(async () => {
      const blockToDelete = blocks.find(b => b.id === id);
      const name = blockToDelete?.name || id;
      await deleteDoc(doc(db, 'blocks', id));
      await logActivity(`Eliminato il blocco "${name}"`, 'block', {
        uid: user.uid,
        email: user.email || '',
        displayName: profile?.displayName || 'Anonimo',
      });
      setCurrentView('list');
      setSelectedBlock(null);
    }, OperationType.DELETE, `blocks/${id}`, "Errore nell'eliminazione.");
  };

  const handleToggleFavorite = async (block: Block) => {
    if (!user) return;
    await executeFirestore(async () => {
      await updateDoc(doc(db, 'blocks', block.id), {
        favorite: !block.favorite
      });
    }, OperationType.UPDATE, `blocks/${block.id}`, "Errore aggiornamento preferite.");
  };

  const handleToggleVisited = async (block: Block) => {
    if (!user) return;
    await executeFirestore(async () => {
      await updateDoc(doc(db, 'blocks', block.id), {
        visited: !block.visited
      });
    }, OperationType.UPDATE, `blocks/${block.id}`, "Errore aggiornamento visita.");
  };

  const handleUpdateProfile = async (newName: string) => {
    if (!user || !profile) return;
    await executeFirestore(async () => {
      const profileRef = doc(db, 'users', user.uid);
      await updateDoc(profileRef, {
        displayName: newName
      });
      setProfile({ ...profile, displayName: newName });
    }, OperationType.UPDATE, `users/${user.uid}`, "Errore nell'aggiornamento del profilo.");
  };

  const filteredBlocks = useMemo(() => {
    return blocks.filter(b => {
      const matchesType = (() => {
        if (typeFilter === 'all') return true;
        if (typeFilter === 'blocco') return !b.type || b.type === 'blocco';
        if (typeFilter === 'falesia') return b.type === 'falesia';
        return true;
      })();

      const matchesFilter = (() => {
        if (filter === 'all') return true;
        if (filter === 'favorite') return b.favorite;
        if (filter === 'visited') return b.visited;
        return b.status === filter;
      })();

      const matchesSearch = b.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          b.area.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesType && matchesFilter && matchesSearch;
    });
  }, [blocks, typeFilter, filter, searchQuery]);

  if (!authReady) {
    return (
      <div className="h-screen flex items-center justify-center bg-stone-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-brand" />
          <p className="text-brand font-bold uppercase tracking-widest text-xs">Caricamento...</p>
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    if (isGuest) {
       // We'll handle the guest UI within the main renderView logic
    } else {
      return (
        <div className="h-screen flex flex-col items-center justify-center bg-stone-900 p-8 text-center overflow-y-auto w-full">
          {appTheme.showLogoSymbol && (
            <div className="w-16 h-16 bg-brand-light rounded-3xl flex items-center justify-center mb-6 overflow-hidden border border-brand/10">
              {appTheme.logoImage ? (
                <img src={appTheme.logoImage} alt="Logo" className="w-full h-full object-contain p-2" />
              ) : (
                <Mountain className="w-8 h-8 text-brand" />
              )}
            </div>
          )}
          <h1 className="text-3xl font-black text-white mb-2 uppercase tracking-tighter italic">Boulder Tracker</h1>
          <p className="text-brand font-black uppercase tracking-widest text-[11px] mb-8">
            {appTheme.logoText}
          </p>
          
          <div className="w-full max-w-sm space-y-4">
            <button
              onClick={() => {
                setIsGuest(true);
                setFilter('all');
                setActiveTab('home');
                setCurrentView('list');
              }}
              className="w-full p-6 bg-brand text-white rounded-3xl shadow-xl shadow-brand/40 font-black uppercase tracking-[0.2em] text-sm flex flex-col items-center gap-2 hover:bg-brand-hover transition-all active:scale-95 border-b-4 border-black/30"
            >
              <div className="flex items-center gap-3">
                <Mountain className="w-6 h-6" />
                GUIDA BOULDER ASD
              </div>
              <span className="text-[8px] opacity-70 tracking-[0.3em]">Accesso Libero - Sola Lettura</span>
            </button>

            <div className="bg-stone-800 rounded-3xl border border-stone-700 shadow-xl overflow-hidden transition-all duration-300">
              <button 
                onClick={() => setShowReservedArea(!showReservedArea)}
                className="w-full p-6 flex items-center justify-between hover:bg-stone-700/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Shield className={cn("w-5 h-5 transition-colors", showReservedArea ? "text-brand" : "text-stone-500")} />
                  <h2 className="text-white font-black uppercase tracking-widest text-[10px]">
                    Area Riservata Soci
                  </h2>
                </div>
                <motion.div
                  animate={{ rotate: showReservedArea ? 180 : 0 }}
                  className="text-stone-500"
                >
                  <ChevronDown className="w-5 h-5" />
                </motion.div>
              </button>

              <AnimatePresence>
                {showReservedArea && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                  >
                    <div className="px-6 pb-6 space-y-4">
                      {isLogin ? (
                        <>
                          <form onSubmit={handleAuth} className="space-y-4">
                            <input
                              type="email"
                              placeholder="Email"
                              required
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="w-full p-4 bg-stone-900 border border-stone-700 rounded-2xl text-white outline-none focus:ring-2 focus:ring-brand transition-all text-sm animate-none"
                            />
                            <input
                              type="password"
                              placeholder="Password"
                              required
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="w-full p-4 bg-stone-900 border border-stone-700 rounded-2xl text-white outline-none focus:ring-2 focus:ring-brand transition-all text-sm animate-none"
                            />
                            {authError && (
                              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs flex items-center gap-2 animate-none">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                {authError}
                              </div>
                            )}
                            <button
                              type="submit"
                              disabled={loading}
                              className="w-full flex items-center justify-center gap-3 p-4 bg-stone-700 text-white rounded-2xl shadow-lg border-b-4 border-stone-900 font-black uppercase tracking-widest italic disabled:opacity-50 hover:bg-stone-600 transition-all"
                            >
                              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entra'}
                            </button>
                          </form>
                
                          <button
                            onClick={handleForgotPassword}
                            className="w-full text-[10px] font-bold text-stone-500 hover:text-white uppercase tracking-widest transition-colors"
                          >
                            Password dimenticata?
                          </button>
                
                          <button
                            onClick={() => setIsLogin(false)}
                            className="w-full text-stone-400 text-[10px] font-bold uppercase tracking-wider hover:text-white transition-colors"
                          >
                            Non sei ancora socio? Registrati
                          </button>
                        </>
                      ) : (
                        <>
                          <form onSubmit={handleAuth} className="space-y-4">
                            <input
                              type="email"
                              placeholder="Email"
                              required
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="w-full p-4 bg-stone-900 border border-stone-700 rounded-2xl text-white outline-none focus:ring-2 focus:ring-brand transition-all text-sm animate-none"
                            />
                            <input
                              type="password"
                              placeholder="Password"
                              required
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="w-full p-4 bg-stone-900 border border-stone-700 rounded-2xl text-white outline-none focus:ring-2 focus:ring-brand transition-all text-sm animate-none"
                            />
                            {authError && (
                              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                {authError}
                              </div>
                            )}
                            <button
                              type="submit"
                              disabled={loading}
                              className="w-full flex items-center justify-center gap-3 p-4 bg-stone-700 text-white rounded-2xl shadow-lg border-b-4 border-stone-900 font-black uppercase tracking-widest italic disabled:opacity-50 hover:bg-stone-600 transition-all"
                            >
                              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Registrati'}
                            </button>
                          </form>
                
                          <button
                            onClick={() => setIsLogin(true)}
                            className="w-full text-stone-400 text-[10px] font-bold uppercase tracking-wider hover:text-white transition-colors"
                          >
                            Hai già un account? Accedi
                          </button>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
  
          <div className="mt-12 space-y-4 max-w-xs">
            <p className="text-stone-500 text-[10px] leading-relaxed uppercase font-bold">
              Strumento riservato ai soci per il tracciamento delle pulizie e l'esplorazione della Val Masino.
            </p>
            <div className="pt-4 border-t border-stone-800">
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-stone-600 italic">
                Created by Alessandro Sangiorgio for ASD Val Masino Climbing
              </p>
            </div>
            <div className="flex items-center justify-center gap-4 text-stone-600">
               <Shield className="w-6 h-6 opacity-30" />
               <div className="w-px h-6 bg-stone-800" />
               <Mountain className="w-6 h-6 opacity-30" />
            </div>
          </div>
        </div>
      );
    }
  }

  // Pending/Blocked Screens
  if (!isGuest && profile?.status === 'blocked') {
    return (
      <div className="min-h-screen bg-stone-900 flex flex-col items-center justify-center p-6 text-center text-white">
        <Shield className="w-16 h-16 text-red-500 mb-6 opacity-50" />
        <h1 className="text-2xl font-black uppercase italic tracking-tighter mb-2">Accesso Negato</h1>
        <p className="text-stone-400 text-sm max-w-xs mb-8">Il tuo account è stato bloccato dall'amministratore.</p>
        <button 
          onClick={handleLogout}
          className="px-8 py-3 bg-stone-800 rounded-2xl font-black uppercase tracking-widest text-[10px]"
        >
          Esci
        </button>
      </div>
    );
  }

  if (!isGuest && profile?.status === 'pending') {
    return (
      <div className="min-h-screen bg-stone-900 flex flex-col items-center justify-center p-6 text-center text-white overflow-y-auto">
        <div className="w-16 h-16 bg-brand-light rounded-3xl flex items-center justify-center mb-6">
          <Clock className="w-8 h-8 text-brand animate-pulse" />
        </div>
        <h1 className="text-2xl font-black uppercase italic tracking-tighter mb-2">Account In Attesa</h1>
        <p className="text-stone-400 text-sm max-w-xs mb-8">
          La tua registrazione è stata ricevuta. Un amministratore deve approvare il tuo profilo prima che tu possa accedere ai dati.
        </p>
        <div className="p-4 bg-stone-800 border border-stone-700 rounded-2xl text-left mb-8 w-full max-w-sm mx-auto">
           <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-1">Membro</p>
           <p className="text-sm font-bold text-white">{profile.displayName}</p>
           <p className="text-[10px] text-stone-400 mt-2 italic">{profile.email}</p>
        </div>
        <button 
          onClick={handleLogout}
          className="px-8 py-3 bg-stone-800 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-stone-700 transition-colors"
        >
          Esci e Torna più tardi
        </button>
      </div>
    );
  }

  const renderView = () => {
    switch (currentView) {
      case 'list':
        return (
          <div className="flex flex-col h-full bg-stone-900">
            <header className="p-4 pb-2 bg-stone-900 sticky top-0 z-10" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  {appTheme.showLogoSymbol && (
                    <div className="w-10 h-10 bg-brand-light rounded-2xl flex items-center justify-center overflow-hidden border border-brand/10">
                      {appTheme.logoImage ? (
                        <img src={appTheme.logoImage} alt="Logo" className="w-full h-full object-contain p-1" />
                      ) : (
                        <Mountain className="w-5 h-5 text-brand" />
                      )}
                    </div>
                  )}
                  <div>
                    <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter leading-none">{isGuest ? 'Guida Boulder' : 'I Blocchi'}</h1>
                    <p className="text-[10px] font-black text-brand uppercase tracking-widest mt-1">
                      {isGuest ? `Versione Pubblica ${appTheme.logoText}` : `${appTheme.logoText} Explorer`}
                    </p>
                  </div>
                </div>
                <div 
                  onClick={() => isGuest ? setIsGuest(false) : setCurrentView('profile')} 
                  className={cn(
                    "w-12 h-12 bg-stone-800 rounded-2xl flex items-center justify-center border-2 border-brand cursor-pointer overflow-hidden shadow-lg shadow-brand/10 text-white font-bold text-sm",
                    isGuest && "bg-red-500/10 border-red-500"
                  )}
                >
                  {isGuest ? <X className="w-6 h-6 text-red-500" /> : profile?.displayName?.slice(0, 2).toUpperCase()}
                </div>
              </div>

              {/* Search Bar */}
              <div className="bg-stone-800 border border-stone-700 rounded-2xl px-4 py-3 flex items-center gap-3 mb-6">
                <Search className="w-4 h-4 text-stone-500" />
                <input
                  type="text"
                  placeholder="Cerca per nome o area..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none outline-none text-xs text-white w-full placeholder-stone-600 font-bold"
                />
                {searchQuery && (
                  <X 
                    className="w-4 h-4 text-stone-500 cursor-pointer" 
                    onClick={() => setSearchQuery('')} 
                  />
                )}
              </div>

              {/* Type Filter Segment Selector */}
              <div className="flex bg-stone-950/65 p-1 rounded-2xl mb-6 border border-stone-800 gap-1.5 shadow-inner scale-100 select-none">
                <button
                  onClick={() => setTypeFilter('all')}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5",
                    typeFilter === 'all' ? "bg-stone-800 text-white shadow" : "text-stone-450 hover:text-white"
                  )}
                >
                  🏔️ Tutti
                </button>
                <button
                  onClick={() => setTypeFilter('blocco')}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5",
                    typeFilter === 'blocco' ? "bg-stone-800 text-white shadow" : "text-stone-450 hover:text-white"
                  )}
                >
                  🪨 Blocchi
                </button>
                <button
                  onClick={() => setTypeFilter('falesia')}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5",
                    typeFilter === 'falesia' ? "bg-emerald-600/90 text-white shadow" : "text-stone-450 hover:text-white"
                  )}
                >
                  🧗 Falesie
                </button>
              </div>

              {/* Stats Card */}
              <div className="p-4 bg-stone-800 rounded-3xl border border-stone-700 mb-6 flex items-center justify-around select-none">
                <div className="text-center">
                  <p className="text-xl font-black text-white italic">
                    {blocks.filter(b => typeFilter === 'all' ? true : typeFilter === 'blocco' ? (!b.type || b.type === 'blocco') : b.type === 'falesia').length}
                  </p>
                  <p className="text-[10px] font-bold text-stone-500 uppercase">Totali</p>
                </div>
                <div className="w-px h-8 bg-stone-700" />
                <div className="text-center">
                   <p className="text-xl font-black text-emerald-500 italic">
                     {blocks.filter(b => (typeFilter === 'all' ? true : typeFilter === 'blocco' ? (!b.type || b.type === 'blocco') : b.type === 'falesia') && b.status === 'clean').length}
                   </p>
                   <p className="text-[10px] font-bold text-stone-500 uppercase">Puliti</p>
                </div>
                <div className="w-px h-8 bg-stone-700" />
                <div className="text-center">
                   <p className="text-xl font-black text-amber-500 italic">
                     {blocks.filter(b => (typeFilter === 'all' ? true : typeFilter === 'blocco' ? (!b.type || b.type === 'blocco') : b.type === 'falesia') && b.status === 'to_clean').length}
                   </p>
                   <p className="text-[10px] font-bold text-stone-500 uppercase">Da Pulire</p>
                </div>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2 overflow-x-auto pb-4 no-scrollbar">
                <button
                  onClick={() => setFilter('all')}
                  className={cn(
                    "px-4 py-2 rounded-full text-xs font-black italic uppercase tracking-wider transition-all border-2",
                    filter === 'all' ? "bg-emerald-600 text-white border-emerald-500" : "bg-stone-800 text-stone-500 border-stone-700"
                  )}
                >
                  Tutti
                </button>
                {!isGuest && (
                  <>
                    <button
                      onClick={() => setFilter('new')}
                      className={cn(
                        "px-4 py-2 rounded-full text-xs font-black italic uppercase tracking-wider transition-all border-2",
                        filter === 'new' ? "bg-blue-600 text-white border-blue-500" : "bg-stone-800 text-stone-500 border-stone-700"
                      )}
                    >
                      Nuovi
                    </button>
                    <button
                      onClick={() => setFilter('clean')}
                      className={cn(
                        "px-4 py-2 rounded-full text-xs font-black italic uppercase tracking-wider transition-all border-2",
                        filter === 'clean' ? "bg-emerald-600 text-white border-emerald-500" : "bg-stone-800 text-stone-500 border-stone-700"
                      )}
                    >
                      Puliti
                    </button>
                    <button
                      onClick={() => setFilter('to_clean')}
                      className={cn(
                        "px-4 py-2 rounded-full text-xs font-black italic uppercase tracking-wider transition-all border-2",
                        filter === 'to_clean' ? "bg-amber-600 text-white border-amber-500" : "bg-stone-800 text-stone-500 border-stone-700"
                      )}
                    >
                      Da Pulire
                    </button>
                    <button
                      onClick={() => setFilter('favorite')}
                      className={cn(
                        "px-4 py-2 rounded-full text-xs font-black italic uppercase tracking-wider flex items-center gap-2 transition-all border-2",
                        filter === 'favorite' ? "bg-pink-600 text-white border-pink-500" : "bg-stone-800 text-stone-500 border-stone-700"
                      )}
                    >
                      <Star className="w-3 h-3 fill-current" /> Preferiti
                    </button>
                  </>
                )}
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 pb-44" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 120px)' }}>
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-stone-700" />
                </div>
              ) : filteredBlocks.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 gap-3.5">
                    {filteredBlocks.map(block => (
                       <div key={block.id} className="relative">
                          <BlockCard
                            block={block}
                            onClick={() => {
                              setSelectedBlock(block);
                              setCurrentView('detail');
                            }}
                          />
                       </div>
                    ))}
                  </div>

                  {/* Partner Footer */}
                  <div className="pt-12 pb-8 flex flex-col items-center gap-4">
                     <div className="w-16 h-1 bg-stone-800 rounded-full" />
                     <p className="text-[9px] font-black text-stone-600 uppercase tracking-widest italic text-center max-w-[240px]">
                       Created by Alessandro Sangiorgio for ASD Val Masino Climbing
                     </p>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-16 h-16 bg-stone-800 rounded-full flex items-center justify-center mb-4 border border-stone-700">
                    <Filter className="w-8 h-8 text-stone-600" />
                  </div>
                  <p className="text-stone-500 font-bold uppercase tracking-widest text-xs">Nessun blocco trovato</p>
                </div>
              )}
            </div>
          </div>
        );

      case 'map':
        return (
          <div className="h-full relative">
            <MapView
              blocks={blocks}
              userLocation={location ? { lat: location.lat, lng: location.lng } : undefined}
              onBlockClick={(block) => {
                setSelectedBlock(block);
                setCurrentView('detail');
              }}
              onMapLongClick={isGuest ? undefined : (lat, lng) => {
                setEditingBlock({ lat, lng } as any);
                setCurrentView('form');
              }}
            />
            <div className="absolute top-4 left-4 right-4 flex flex-col gap-2">
              <div className="bg-stone-900/90 backdrop-blur-md p-3 rounded-2xl shadow-2xl border border-stone-700 flex items-center gap-3">
                <Search className="w-5 h-5 text-emerald-500" />
                <input
                  type="text"
                  placeholder="Cerca area o blocco..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none outline-none text-sm w-full text-white placeholder-stone-600 font-bold"
                />
                {searchQuery && (
                  <X 
                    className="w-4 h-4 text-emerald-500 cursor-pointer" 
                    onClick={() => setSearchQuery('')} 
                  />
                )}
              </div>
              <div className="flex gap-2">
                 <div className="px-3 py-1.5 bg-emerald-600/90 backdrop-blur-md rounded-full text-[10px] font-black text-white uppercase italic shadow-lg border border-emerald-500">
                    Val Masino 3D
                 </div>
                 {isGuest && (
                   <button 
                    onClick={() => setIsGuest(false)}
                    className="px-3 py-1.5 bg-red-600/90 backdrop-blur-md rounded-full text-[10px] font-black text-white uppercase italic shadow-lg border border-red-500 flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Esci Guest
                  </button>
                 )}
                 {!isGuest && profile?.role === 'admin' && (
                   <button 
                     onClick={() => {
                       setCurrentView('admin');
                       setActiveTab('admin');
                     }}
                     className="px-3 py-1.5 bg-stone-900/90 backdrop-blur-md rounded-full text-[10px] font-black text-white uppercase italic shadow-lg border border-stone-700 flex items-center gap-1"
                   >
                     <Shield className="w-3 h-3 text-emerald-500" /> Admin
                   </button>
                 )}
              </div>
            </div>
          </div>
        );

      case 'detail':
        return selectedBlock ? (
          <BlockDetail
            block={selectedBlock}
            onBack={() => setCurrentView(activeTab === 'map' ? 'map' : 'list')}
            onEdit={() => {
              setEditingBlock(selectedBlock);
              setCurrentView('form');
            }}
            onDelete={() => handleDeleteBlock(selectedBlock.id)}
            onGuide={() => setCurrentView('guide')}
            onToggleFavorite={() => handleToggleFavorite(selectedBlock)}
            onToggleVisited={() => handleToggleVisited(selectedBlock)}
            isAdmin={profile?.role === 'admin'}
            isOwner={profile?.uid === selectedBlock.createdBy}
            isGuest={isGuest}
            userProfile={profile}
          />
        ) : null;

      case 'form':
        return (
          <BlockForm
            initialData={editingBlock || {}}
            blocks={blocks}
            onSubmit={editingBlock?.id ? handleUpdateBlock : handleAddBlock}
            onCancel={() => {
              setCurrentView(editingBlock?.id ? 'detail' : 'list');
              setEditingBlock(null);
            }}
            isLoading={loading}
          />
        );

      case 'guide':
        return selectedBlock && location ? (
          <div className="h-full flex flex-col bg-stone-50">
            <header className="p-4 bg-white border-b border-stone-200 flex items-center gap-4">
              <button onClick={() => setCurrentView('detail')} className="p-2 text-stone-400">
                <ArrowLeft className="w-6 h-6" />
              </button>
              <div>
                <h2 className="font-black text-stone-900 italic uppercase tracking-tight">{selectedBlock.name}</h2>
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{selectedBlock.area}</p>
              </div>
            </header>
            <Compass
              targetLat={selectedBlock.lat}
              targetLng={selectedBlock.lng}
              userLat={location.lat}
              userLng={location.lng}
              userHeading={location.heading}
              needsCompassPermission={needsCompassPermission}
              requestCompassPermission={requestCompassPermission}
              onOpenInMaps={() => {
                window.open(`https://www.google.com/maps/dir/?api=1&destination=${selectedBlock.lat},${selectedBlock.lng}&travelmode=walking`);
              }}
            />
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-6 bg-stone-900 border-t border-stone-800">
            <div className="w-32 h-32 bg-stone-800 rounded-full flex items-center justify-center border-2 border-emerald-500/20">
              <Loader2 className="w-12 h-12 animate-spin text-emerald-500" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white italic uppercase mb-2">Recupero Posizione...</h3>
              <p className="text-stone-500 text-xs font-bold leading-relaxed max-w-xs">
                Assicurati che il GPS sia attivo e di aver concesso i permessi al browser.
              </p>
            </div>
            
            <div className="flex flex-col gap-3 w-full max-w-xs">
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest italic shadow-xl shadow-emerald-900/20"
              >
                Riprova
              </button>
              <button
                onClick={() => setCurrentView('detail')}
                className="px-6 py-4 bg-stone-800 text-stone-400 rounded-2xl font-black uppercase tracking-widest italic"
              >
                Torna Indietro
              </button>
            </div>
          </div>
        );

      case 'calendar':
        return profile ? (
          <CalendarView profile={profile} />
        ) : null;

      case 'equipment':
        return profile ? (
          <EquipmentManagement profile={profile} />
        ) : null;

      case 'profile':
        return (
          <div className="flex flex-col h-full bg-stone-900 p-8 pt-16">
            <div className="flex flex-col items-center text-center mb-12">
              <div className="w-28 h-28 rounded-3xl bg-stone-800 flex items-center justify-center border-4 border-emerald-500 mb-6 shadow-2xl shadow-emerald-500/20 transform rotate-3 relative group">
                 <span className="text-4xl font-black text-white italic transform -rotate-3">
                   {profile.displayName.slice(0, 1).toUpperCase()}
                 </span>
              </div>
              
              <div className="space-y-2 w-full max-w-xs mx-auto">
                <div className="relative group">
                  <input
                    type="text"
                    defaultValue={profile.displayName}
                    onBlur={(e) => {
                      if (e.target.value && e.target.value !== profile.displayName) {
                        handleUpdateProfile(e.target.value);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-full bg-transparent text-2xl font-black text-white italic uppercase tracking-tighter text-center outline-none focus:ring-2 focus:ring-emerald-500 rounded-lg p-1"
                  />
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-[8px] font-black uppercase text-stone-500 tracking-widest">
                    Clicca per rinominare
                  </div>
                </div>
                
                <div className="flex items-center justify-center gap-2">
                   <div className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                     PROFILO {profile.role.toUpperCase()}
                   </div>
                   {profile.role === 'admin' && (
                     <button 
                       onClick={() => {
                         setCurrentView('admin');
                         setActiveTab('admin');
                       }}
                       className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-1"
                     >
                       <Shield className="w-3 h-3" /> Gestisci
                     </button>
                   )}
                </div>
                {profile.displayName.toLowerCase() !== 'alessandro sangiorgio' && (
                  <button 
                    onClick={() => handleUpdateProfile('Alessandro Sangiorgio')}
                    className="mt-2 text-[10px] font-black text-stone-500 hover:text-emerald-500 uppercase tracking-widest transition-colors"
                  >
                    Imposta come "Alessandro Sangiorgio"
                  </button>
                )}
              </div>
              <p className="text-stone-500 text-xs mt-3 font-bold">{profile.email}</p>
            </div>

            <div className="space-y-6 flex-1 overflow-y-auto pb-24">
              <div className="p-6 bg-stone-800 border border-stone-700 rounded-3xl shadow-xl">
                <h3 className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-6 border-b border-stone-700 pb-2 flex items-center gap-2">
                  <Info className="w-3 h-3" /> Info Membro ASD Val Masino Climbing
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-stone-500 font-bold uppercase tracking-wider italic">ID Membro</span>
                    <span className="text-white font-mono">{profile.uid.slice(0, 8)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-stone-500 font-bold uppercase tracking-wider italic">Partner</span>
                    <span className="text-emerald-500 font-black italic">ASD Val Masino Climbing</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => alert("Scopo app: Tracciamento pulizia boulder Val Masino. Non distribuire a terzi.")}
                  className="w-full p-5 bg-stone-800 border border-stone-700 rounded-3xl text-white font-black uppercase tracking-widest italic flex items-center justify-between"
                >
                  Informazioni App <ExternalLink className="w-4 h-4 text-emerald-500" />
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full p-5 bg-stone-800 border border-stone-700 rounded-3xl text-red-500 font-black uppercase tracking-widest italic flex items-center justify-between"
                >
                  Esci dall'Account <LogIn className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="text-center mt-auto pt-8 border-t border-stone-800/50">
               <p className="text-[9px] font-black text-stone-600 uppercase tracking-widest italic mb-2">Created by Alessandro Sangiorgio for ASD Val Masino Climbing</p>
               <p className="text-[8px] font-black text-stone-800 uppercase tracking-widest">Boulder Tracker v1.2</p>
            </div>
          </div>
        );

      case 'admin':
        return profile ? (
          <UserManagement profile={profile} onClose={() => { setCurrentView('list'); setActiveTab('home'); }} />
        ) : null;

      default:
        return null;
    }
  };

  return (
    <Layout
      activeTab={activeTab}
      onTabChange={(tab) => {
        if (isGuest && (tab === 'profile' || tab === 'admin' || tab === 'equipment')) return;
        
        setActiveTab(tab);
        if (tab === 'home') {
          setCurrentView('list');
        } else if (tab === 'admin') {
          setCurrentView('admin');
        } else {
          setCurrentView(tab);
        }
      }}
      onAddClick={() => {
        if (!profile) return;
        if (activeTab === 'admin') {
          window.dispatchEvent(new CustomEvent('app-team-add-click'));
        } else {
          setEditingBlock(null);
          setCurrentView('form');
        }
      }}
      isAdmin={profile?.role === 'admin'}
      isGuest={isGuest}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={currentView}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="h-full"
        >
          {renderView()}
        </motion.div>
      </AnimatePresence>
    </Layout>
  );
}
