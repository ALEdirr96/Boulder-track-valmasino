import React, { useState, useEffect } from 'react';
import { 
  User as UserIcon, Trash2, Mail, Shield, X, Loader2, Save, Undo2, LogIn,
  Check, Ban, UserX, UserCheck, Clock, KeyRound, AlertTriangle, Palette, 
  FileText, Edit2, ShieldAlert, Mountain, HelpCircle, Upload, Link, RotateCcw,
  ExternalLink
} from 'lucide-react';
import { motion } from 'motion/react';
import { UserProfile } from '../types';
import { initializeApp } from 'firebase/app';
import { getAuth, EmailAuthProvider, reauthenticateWithCredential, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { 
  collection, 
  query, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  updateDoc,
  setDoc,
  orderBy,
  limit,
  getDocs
} from 'firebase/firestore';
import { db, firebaseConfigExport } from '../firebase';
import { logActivity } from '../lib/logger';

interface UserManagementProps {
  onClose: () => void;
}

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
  };
}

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const auth = getAuth();
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
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
};

export const UserManagement: React.FC<UserManagementProps> = ({ onClose }) => {
  const [activeAdminTab, setActiveAdminTab] = useState<'users' | 'theme' | 'logs'>('users');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'blocked'>('all');
  
  // Security confirmation state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmingAction, setConfirmingAction] = useState<{type: 'single' | 'bulk'; uid?: string; name?: string} | null>(null);
  const [reAuthLoading, setReAuthLoading] = useState(false);
  const [reAuthError, setReAuthError] = useState<string | null>(null);

  // App Theme customization state
  const [accentColor, setAccentColor] = useState('emerald');
  const [logoText, setLogoText] = useState('ASD VAL MASINO CLIMBING');
  const [showLogoSymbol, setShowLogoSymbol] = useState(true);
  const [logoImage, setLogoImage] = useState<string | null>(null);
  const [savingTheme, setSavingTheme] = useState(false);

  // Logs state
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editingLogText, setEditingLogText] = useState('');
  const [savingLogId, setSavingLogId] = useState<string | null>(null);
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
  
  const currentAuth = getAuth();

  const [sendingResetEmail, setSendingResetEmail] = useState(false);
  const [resetEmailSuccess, setResetEmailSuccess] = useState<string | null>(null);

  const handleSendResetEmail = async (targetEmail: string) => {
    setSendingResetEmail(true);
    setResetEmailSuccess(null);
    try {
      await sendPasswordResetEmail(currentAuth, targetEmail);
      setResetEmailSuccess(`Link per il ripristino inviato con successo a: ${targetEmail}`);
    } catch (err: any) {
      console.error(err);
      alert(`Errore nell'invio: ${err.message}`);
    } finally {
      setSendingResetEmail(false);
    }
  };

  // State & Handlers for verification and cleanup of inactive user accounts (Firestore + guidance for Firebase Auth)
  const [cleaningUpState, setCleaningUpState] = useState<{[key: string]: boolean}>({});
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);

  const handleHardDeleteUser = async (uid: string, email: string, displayName: string) => {
    if (!window.confirm(`Sei sicuro di voler CANCELLARE COMPLETAMENTE il record di questo membro da Firestore? \n\nMembro: ${displayName || 'Membro'}\nEmail: ${email}\n\nQuesta azione eliminerà DEFINITIVAMENTE la scheda soci su Firestore.`)) {
      return;
    }
    setCleaningUpState(prev => ({ ...prev, [uid]: true }));
    try {
      await deleteDoc(doc(db, 'users', uid));
      
      await logActivity(
        `Eliminato completamente record Firestore dell'utente disattivo "${displayName}" (${email})`,
        'user',
        { 
          uid: currentAuth.currentUser?.uid || 'admin', 
          email: currentAuth.currentUser?.email || '', 
          displayName: currentAuth.currentUser?.displayName || 'Amministratore' 
        }
      );
      setCleanupMessage(`Record di ${email} eliminato correttamente da Firestore.`);
      setTimeout(() => setCleanupMessage(null), 8000);
    } catch (error: any) {
      console.error("Hard delete error:", error);
      setCleanupMessage(`Errore durante l'eliminazione: ${error.message || String(error)}`);
    } finally {
      setCleaningUpState(prev => ({ ...prev, [uid]: false }));
    }
  };

  const handleBulkHardDeleteInactive = async () => {
    const inactiveUsers = users.filter(u => u.status !== 'active');
    if (inactiveUsers.length === 0) {
      alert("Non ci sono utenti disattivi da cancellare.");
      return;
    }
    if (!window.confirm(`Sei sicuro di voler CANCELLARE COMPLETAMENTE tutti i ${inactiveUsers.length} record Firestore di utenti disattivi (bloccati, eliminati soft o in attesa di approvazione)?\n\nQuesta operazione eliminerà solo le schede soci da Firestore. Dovrai comunque entrare nella Console Firebase Auth per rimuovere la loro registrazione d'accesso.`)) {
      return;
    }
    
    setCleaningUpState(prev => ({ ...prev, 'bulk-operation': true }));
    setCleanupMessage(null);
    let deletedCount = 0;
    try {
      for (const u of inactiveUsers) {
        await deleteDoc(doc(db, 'users', u.uid));
        deletedCount++;
      }
      
      await logActivity(
        `Eliminati in blocco ${deletedCount} record Firestore di utenti disattivi`,
        'user',
        { 
          uid: currentAuth.currentUser?.uid || 'admin', 
          email: currentAuth.currentUser?.email || '', 
          displayName: currentAuth.currentUser?.displayName || 'Amministratore' 
        }
      );
      setCleanupMessage(`Pulizia completata! Rimossi completamente ${deletedCount} record disattivi da Firestore.`);
      setTimeout(() => setCleanupMessage(null), 8000);
    } catch (error: any) {
      console.error(error);
      setCleanupMessage(`Errore nel bulk delete: ${error.message || String(error)}`);
    } finally {
      setCleaningUpState(prev => ({ ...prev, 'bulk-operation': false }));
    }
  };

  const isSuperAdmin = currentUserEmail?.trim().toLowerCase() === 'asdadmin@scalamasino.com' || 
                      currentUserEmail?.trim().toLowerCase() === 'asdadmin@valmasinoclimbing.com' || 
                      currentUserEmail?.trim().toLowerCase() === 'videoclipalessandrosangiorgio@gmail.com';
  
  const currentUserRecord = users.find(u => u.uid === currentAuth.currentUser?.uid);
  const isAdmin = currentUserRecord?.role === 'admin' || isSuperAdmin;
  
  // Loaded standard users on initialization
  useEffect(() => {
    const authUnsubscribe = currentAuth.onAuthStateChanged((user) => {
      setCurrentUserEmail(user?.email || null);
    });

    let unsubUsers = () => {};
    if (currentAuth.currentUser) {
      const qUsers = query(collection(db, 'users'));
      unsubUsers = onSnapshot(qUsers, (snapshot) => {
        const usersData = snapshot.docs.map(doc => ({
          uid: doc.id,
          ...doc.data()
        })) as UserProfile[];
        setUsers(usersData);
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'users');
      });
    }

    return () => {
      authUnsubscribe();
      unsubUsers();
    };
  }, [currentUserEmail]);

  // Theme configuration listener
  useEffect(() => {
    const unsubTheme = onSnapshot(doc(db, 'settings', 'app'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setAccentColor(data.accentColor || 'emerald');
        let fetchedLogoText = data.logoText || 'ASD VAL MASINO CLIMBING';
        if (!fetchedLogoText || fetchedLogoText.toLowerCase().includes('scalamasino')) {
          fetchedLogoText = 'ASD VAL MASINO CLIMBING';
        }
        setLogoText(fetchedLogoText);
        setShowLogoSymbol(data.showLogoSymbol !== false);
        setLogoImage(data.logoImage || null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/app');
    });
    return unsubTheme;
  }, []);

  // Logs snapshot listener with local fallback sorting to satisfy no-index configurations
  useEffect(() => {
    if (activeAdminTab === 'logs') {
      setLoadingLogs(true);
      const qLogs = query(collection(db, 'logs'));
      const unsubLogs = onSnapshot(qLogs, (snapshot) => {
        const logsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        // Safe robust local sorting by timestamp
        logsData.sort((a: any, b: any) => {
          const tA = new Date(a.createdAt || 0).getTime();
          const tB = new Date(b.createdAt || 0).getTime();
          return tB - tA;
        });
        setLogs(logsData.slice(0, 50));
        setLoadingLogs(false);
      }, (err) => {
        setLoadingLogs(false);
        handleFirestoreError(err, OperationType.GET, 'logs');
      });
      return unsubLogs;
    }
  }, [activeAdminTab]);

  const handleUpdateStatus = async (uid: string, status: 'active' | 'pending' | 'blocked') => {
    setUpdatingUid(uid);
    try {
      const targetUser = users.find(u => u.uid === uid);
      await updateDoc(doc(db, 'users', uid), { status });
      
      // Log this action
      await logActivity(
        `Stato utente "${targetUser?.displayName || uid}" modificato a "${status}"`,
        'user',
        { 
          uid: currentAuth.currentUser?.uid || 'admin', 
          email: currentAuth.currentUser?.email || '', 
          displayName: currentAuth.currentUser?.displayName || 'Amministratore' 
        }
      );
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    } finally {
      setUpdatingUid(null);
    }
  };

  const handleToggleRole = async (uid: string, currentRole: 'admin' | 'user') => {
    if (uid === currentAuth.currentUser?.uid) {
      alert("Non puoi cambiare il tuo stesso ruolo.");
      return;
    }
    setUpdatingUid(uid);
    try {
      const targetUser = users.find(u => u.uid === uid);
      const newRole = currentRole === 'admin' ? 'user' : 'admin';
      await updateDoc(doc(db, 'users', uid), { role: newRole });

      // Log this action
      await logActivity(
        `Ruolo utente "${targetUser?.displayName || uid}" modificato a "${newRole}"`,
        'user',
        { 
          uid: currentAuth.currentUser?.uid || 'admin', 
          email: currentAuth.currentUser?.email || '', 
          displayName: currentAuth.currentUser?.displayName || 'Amministratore' 
        }
      );
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    } finally {
      setUpdatingUid(null);
    }
  };

  const handleDeleteUser = (uid: string, name: string) => {
    if (uid === currentAuth.currentUser?.uid) {
      alert("Non puoi eliminare il tuo stesso account.");
      return;
    }
    setConfirmingAction({ type: 'single', uid, name });
    setConfirmPassword('');
    setReAuthError(null);
    setShowConfirmModal(true);
  };

  const handleDeleteNonAdmins = () => {
    const nonAdmins = users.filter(u => u.role !== 'admin' && u.uid !== currentAuth.currentUser?.uid);
    if (nonAdmins.length === 0) {
      alert("Nessun utente non-admin da eliminare.");
      return;
    }
    setConfirmingAction({ type: 'bulk' });
    setConfirmPassword('');
    setReAuthError(null);
    setShowConfirmModal(true);
  };

  const executeConfirmedAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmingAction || !currentAuth.currentUser || !currentAuth.currentUser.email) return;

    setReAuthLoading(true);
    setReAuthError(null);

    try {
      // 1. Re-authenticate to verify security clearance
      const credential = EmailAuthProvider.credential(currentAuth.currentUser.email, confirmPassword);
      await reauthenticateWithCredential(currentAuth.currentUser, credential);

      // 2. Execute deletion logic
      if (confirmingAction.type === 'single' && confirmingAction.uid) {
        setDeletingUid(confirmingAction.uid);
        await updateDoc(doc(db, 'users', confirmingAction.uid), { status: 'deleted' });
        
        await logActivity(
          `Eliminato definitivamente l'utente "${confirmingAction.name || confirmingAction.uid}"`,
          'user',
          { 
            uid: currentAuth.currentUser.uid, 
            email: currentAuth.currentUser.email, 
            displayName: currentAuth.currentUser.displayName || 'Amministratore' 
          }
        );
      } else if (confirmingAction.type === 'bulk') {
        setLoading(true);
        const nonAdmins = users.filter(u => u.role !== 'admin' && u.uid !== currentAuth.currentUser?.uid);
        const deletePromises = nonAdmins.map(u => updateDoc(doc(db, 'users', u.uid), { status: 'deleted' }));
        await Promise.all(deletePromises);
        
        await logActivity(
          `Eliminati in blocco ${nonAdmins.length} utenti non-amministratori`,
          'user',
          { 
            uid: currentAuth.currentUser.uid, 
            email: currentAuth.currentUser.email, 
            displayName: currentAuth.currentUser.displayName || 'Amministratore' 
          }
        );
        alert(`${nonAdmins.length} utenti eliminati con successo.`);
      }

      // 3. Success cleanup
      setShowConfirmModal(false);
      setConfirmingAction(null);
      setConfirmPassword('');
    } catch (error: any) {
      console.error("Security Verification Failed:", error);
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setReAuthError("Password non corretta. Riprova.");
      } else {
        setReAuthError("Errore di verifica: " + error.message);
      }
    } finally {
      setReAuthLoading(false);
      setDeletingUid(null);
      setLoading(false);
    }
  };

  // Change Theme dynamic configurations
  const handleSaveThemeSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logoText.trim()) {
      alert("Il testo logo non può essere vuoto");
      return;
    }
    setSavingTheme(true);
    try {
      await setDoc(doc(db, 'settings', 'app'), {
        accentColor,
        logoText,
        showLogoSymbol,
        logoImage
      }, { merge: true });

      await logActivity(
        `Modificati i colori e le personalizzazioni grafiche dell'app (accento: ${accentColor})`,
        'settings',
        { 
          uid: currentAuth.currentUser?.uid || 'admin', 
          email: currentAuth.currentUser?.email || '', 
          displayName: currentAuth.currentUser?.displayName || 'Amministratore' 
        }
      );
      
      alert("Impostazioni dell'app aggiornate con successo!");
    } catch (err: any) {
      alert("Errore durante il salvataggio: " + err.message);
    } finally {
      setSavingTheme(false);
    }
  };

  // Manage modifications of the system logs
  const handleStartEditLog = (item: any) => {
    setEditingLogId(item.id);
    setEditingLogText(item.action);
  };

  const handleUpdateLog = async (logId: string) => {
    if (!editingLogText.trim()) return;
    setSavingLogId(logId);
    try {
      await updateDoc(doc(db, 'logs', logId), {
        action: editingLogText
      });
      setEditingLogId(null);
    } catch (err: any) {
      alert("Errore modifica log: " + err.message);
    } finally {
      setSavingLogId(null);
    }
  };

  const handleDeleteLog = async (logId: string) => {
    if (!window.confirm("Sei sicuro di voler eliminare questo registro attività?")) return;
    setDeletingLogId(logId);
    try {
      await deleteDoc(doc(db, 'logs', logId));
    } catch (err: any) {
      alert("Errore nell'eliminazione del registro: " + err.message);
    } finally {
      setDeletingLogId(null);
    }
  };

  const filteredUsers = users.filter(u => {
    if (filter === 'all') return true;
    return u.status === filter;
  }).sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return 0;
  });

  return (
    <div className="flex flex-col h-full bg-stone-100">
      {/* Header Panel */}
      <header className="p-6 bg-white border-b border-stone-200 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-black text-stone-900 uppercase italic">Controllo ASD</h2>
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Opzioni Amministrative & Registri</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={onClose}
              className="p-3 bg-stone-100 text-stone-500 rounded-2xl hover:bg-stone-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Administration Core Tabs */}
        <div className="flex gap-2 border-t border-stone-100 pt-4">
          <button
            onClick={() => setActiveAdminTab('users')}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeAdminTab === 'users' ? 'bg-brand text-white shadow-md shadow-brand/10' : 'bg-stone-50 text-stone-400 hover:text-stone-700'
            }`}
          >
            <UserIcon className="w-4 h-4" /> Membri
          </button>
          <button
            onClick={() => setActiveAdminTab('theme')}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeAdminTab === 'theme' ? 'bg-brand text-white shadow-md shadow-brand/10' : 'bg-stone-50 text-stone-400 hover:text-stone-700'
            }`}
          >
            <Palette className="w-4 h-4" /> Stile & Colori
          </button>
          <button
            onClick={() => setActiveAdminTab('logs')}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              activeAdminTab === 'logs' ? 'bg-brand text-white shadow-md shadow-brand/10' : 'bg-stone-50 text-stone-400 hover:text-stone-700'
            }`}
          >
            <FileText className="w-4 h-4" /> Registri Log
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        
        {/* SUBVIEW 1: USERS MANAGEMENT */}
        {activeAdminTab === 'users' && (
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-stone-200 bg-white/80 backdrop-blur-md flex gap-2 overflow-x-auto sticky top-0 z-10">
              {(['all', 'pending', 'active', 'blocked'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                    filter === f ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-400 hover:text-stone-600'
                  }`}
                >
                  {f === 'all' ? 'Tutti' : f === 'pending' ? 'In Attesa' : f === 'active' ? 'Attivi' : 'Bloccati'}
                  {users.filter(u => u.status === f).length > 0 && ` (${users.filter(u => u.status === f).length})`}
                </button>
              ))}
            </div>

            <div className="p-4 space-y-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <Loader2 className="w-8 h-8 animate-spin text-brand" />
                  <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Caricamento membri...</p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-20 text-stone-400 uppercase font-black text-[10px] tracking-widest">
                  Nessun membro trovato con questo filtro
                </div>
              ) : (
                filteredUsers.map(user => (
                  <div key={user.uid} className="bg-white border-2 border-stone-200/50 rounded-[2rem] overflow-hidden shadow-sm hover:border-stone-300 transition-all">
                    <div className="p-5 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className="w-14 h-14 bg-stone-50 rounded-2xl flex items-center justify-center overflow-hidden border border-stone-100 shadow-inner">
                            {user.photoURL ? (
                              <img src={user.photoURL} className="w-full h-full object-cover" />
                            ) : (
                              <UserIcon className="w-6 h-6 text-stone-300" />
                            )}
                          </div>
                          {user.status === 'active' && <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-lg flex items-center justify-center border-2 border-white shadow-sm"><Check className="w-3 h-3 text-white" /></div>}
                          {user.status === 'pending' && <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-amber-500 rounded-lg flex items-center justify-center border-2 border-white shadow-sm"><Clock className="w-3 h-3 text-white" /></div>}
                          {user.status === 'blocked' && <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-red-500 rounded-lg flex items-center justify-center border-2 border-white shadow-sm"><UserX className="w-3 h-3 text-white" /></div>}
                        </div>
                        <div>
                          <div className="font-black text-stone-900 flex items-center gap-2">
                            {user.displayName}
                            {user.role === 'admin' && <Shield className="w-3 h-3 text-brand shrink-0" />}
                          </div>
                          <div className="text-[10px] font-bold text-stone-400 uppercase tracking-tight">{user.email}</div>
                          <div className={`text-[8px] font-black uppercase tracking-widest mt-1 ${
                            user.status === 'active' ? 'text-emerald-500' : user.status === 'pending' ? 'text-amber-500' : 'text-red-500'
                          }`}>
                            {user.status === 'active' ? 'Account Abilitato' : user.status === 'pending' ? 'Richiesta di Accesso' : 'Accesso Negato'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {user.status === 'pending' && (
                          <button
                            onClick={() => handleUpdateStatus(user.uid, 'active')}
                            disabled={updatingUid === user.uid}
                            className="p-3 bg-brand text-white rounded-2xl shadow-lg shadow-brand/20 hover:bg-brand-hover transition-all disabled:opacity-50 cursor-pointer"
                            title="Approva Membro"
                          >
                            {updatingUid === user.uid ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserCheck className="w-5 h-5" />}
                          </button>
                        )}

                        {user.status === 'active' && user.uid !== currentAuth.currentUser?.uid && (
                          <button
                            onClick={() => handleUpdateStatus(user.uid, 'blocked')}
                            disabled={updatingUid === user.uid}
                            className="p-3 bg-stone-100 text-stone-400 rounded-2xl hover:bg-red-50 hover:text-red-500 transition-all disabled:opacity-50 cursor-pointer"
                            title="Blocca Accesso"
                          >
                            {updatingUid === user.uid ? <Loader2 className="w-5 h-5 animate-spin" /> : <Ban className="w-5 h-5" />}
                          </button>
                        )}

                        {user.status === 'blocked' && (
                          <button
                            onClick={() => handleUpdateStatus(user.uid, 'active')}
                            disabled={updatingUid === user.uid}
                            className="p-3 bg-stone-100 text-stone-400 rounded-2xl hover:bg-emerald-50 hover:text-emerald-500 transition-all disabled:opacity-50 cursor-pointer"
                            title="Riabilita Accesso"
                          >
                            {updatingUid === user.uid ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserCheck className="w-5 h-5" />}
                          </button>
                        )}

                        {user.uid !== currentAuth.currentUser?.uid && (
                          <button
                            onClick={() => handleDeleteUser(user.uid, user.displayName)}
                            disabled={deletingUid === user.uid}
                            className="p-3 bg-stone-100 text-stone-400 rounded-2xl hover:bg-red-600 hover:text-white transition-all disabled:opacity-50 cursor-pointer"
                            title="Elimina Definitivamente"
                          >
                            {deletingUid === user.uid ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Advanced Actions for Super Admin */}
                    {isSuperAdmin && user.status === 'active' && user.uid !== currentAuth.currentUser?.uid && (
                      <div className="px-5 pb-5 pt-0 flex gap-2">
                        <button
                          onClick={() => handleToggleRole(user.uid, user.role)}
                          className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all cursor-pointer ${
                            user.role === 'admin' 
                              ? 'bg-brand text-white border-brand' 
                              : 'bg-white text-stone-400 border-stone-100 hover:border-stone-200'
                          }`}
                        >
                          {user.role === 'admin' ? 'Privilegi Admin: SI' : 'Promuovi ad Admin'}
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* UTILITY: VERIFY AND CLEANUP INACTIVE ACCOUNTS */}
            {isAdmin && (
              <div className="px-4 pb-8">
                <div className="bg-amber-50/30 border-2 border-dashed border-amber-200/60 rounded-[2rem] p-5 space-y-4 shadow-inner">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-5 h-5 text-amber-600" />
                      <span className="text-[11px] font-black uppercase tracking-widest text-stone-800">Verifica & Sincronizzazione Auth</span>
                    </div>
                    {users.filter(u => u.status !== 'active').length > 0 && (
                      <button
                        onClick={handleBulkHardDeleteInactive}
                        disabled={cleaningUpState['bulk-operation']}
                        type="button"
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[9px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {cleaningUpState['bulk-operation'] ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                        Svuota tutti i disattivi da Firestore
                      </button>
                    )}
                  </div>

                  <p className="text-[10px] text-stone-500 font-medium leading-relaxed">
                    Per motivi di sicurezza di Google Firebase, la cancellazione definitiva di un account d'accesso da <strong>Firebase Authentication</strong> deve essere effettuata manualmente tramite la console web. Usa questa sezione per controllare le email, copiare quelle inattive e cancellare le loro schede soci da Firestore.
                  </p>

                  {cleanupMessage && (
                    <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 text-[10px] font-medium transition-all">
                      {cleanupMessage}
                    </div>
                  )}

                  {/* Account Status Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-white rounded-2xl border border-stone-200 flex flex-col justify-center items-center shadow-sm">
                      <span className="text-[8px] font-black uppercase tracking-widest text-stone-400">Mail Attive</span>
                      <span className="text-xl font-black text-emerald-600 mt-1">
                        {users.filter(u => u.status === 'active').length}
                      </span>
                    </div>
                    <div className="p-3 bg-white rounded-2xl border border-stone-200 flex flex-col justify-center items-center shadow-sm">
                      <span className="text-[8px] font-black uppercase tracking-widest text-stone-400">Account Disattivi / Finti</span>
                      <span className="text-xl font-black text-amber-600 mt-1">
                        {users.filter(u => u.status !== 'active').length}
                      </span>
                    </div>
                  </div>

                  {/* List of deactivated accounts to easily check & copy */}
                  {users.filter(u => u.status !== 'active').length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      <span className="text-[8px] font-black uppercase tracking-widest text-stone-400 block">Dettaglio Email Associate non Attive:</span>
                      {users.filter(u => u.status !== 'active').map(u => (
                        <div key={u.uid} className="p-3 bg-white border border-stone-100 rounded-xl flex items-center justify-between gap-2 text-xs font-semibold">
                          <div className="min-w-0">
                            <p className="font-bold text-stone-800 truncate text-[11px]">{u.displayName}</p>
                            <p className="text-[10px] text-stone-400 font-mono truncate">{u.email}</p>
                            <span className={`inline-block mt-0.5 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                              u.status === 'pending' ? 'bg-amber-100 text-amber-800' : u.status === 'blocked' ? 'bg-red-100 text-red-800' : 'bg-stone-100 text-stone-800'
                            }`}>
                              {u.status === 'pending' ? 'In attesa' : u.status === 'blocked' ? 'Bloccato' : 'Eliminato soft'}
                            </span>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(u.email);
                                alert(`Email "${u.email}" copiata negli appunti!\nOra clicca sul pulsante nero "Apri Console Firebase Auth" e cercala per cancellarla anche lì.`);
                              }}
                              title="Copia email per cercarla"
                              type="button"
                              className="p-1.5 hover:bg-stone-100 text-stone-500 rounded-lg transition-colors border border-stone-200/50"
                            >
                              <Mail className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleHardDeleteUser(u.uid, u.email, u.displayName)}
                              disabled={cleaningUpState[u.uid]}
                              title="Cancella interamente da Firestore"
                              type="button"
                              className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition-colors border border-red-100"
                            >
                              {cleaningUpState[u.uid] ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center py-2 text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50/50 rounded-xl">
                      ✓ Nessun account disattivo o inattivo su Firestore!
                    </p>
                  )}

                  {/* Direct External Link Button to Firebase Console Auth Users */}
                  <div className="pt-2">
                    <a
                      href={`https://console.firebase.google.com/project/${firebaseConfigExport?.projectId || 'valmasinoclimbing'}/authentication/users`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex items-center justify-center gap-2 w-full py-2.5 bg-stone-900 hover:bg-stone-800 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer shadow-md text-center"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Apri Console Firebase Auth
                    </a>
                    <span className="block text-[8px] text-center text-stone-400 mt-1 font-bold">
                      ID Progetto: {firebaseConfigExport?.projectId || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SUBVIEW 2: THEME & COLOR PERSONALIZATION */}
        {activeAdminTab === 'theme' && (
          <div className="p-6 max-w-lg mx-auto">
            <form onSubmit={handleSaveThemeSettings} className="bg-white border text-stone-800 border-stone-200/60 rounded-[2.5rem] p-6 shadow-sm space-y-6">
              <h3 className="text-md font-black uppercase tracking-tighter italic border-b border-stone-100 pb-3 flex items-center gap-2">
                <Palette className="w-5 h-5 text-brand" /> Personalizzazione Grafica
              </h3>

              {/* Theme Presets */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Colore Accento Principale</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'emerald', label: 'Verde Smeraldo', colorClass: 'bg-emerald-600' },
                    { value: 'red', label: 'Rosso Rubino', colorClass: 'bg-red-500' },
                    { value: 'blue', label: 'Blu Zaffiro', colorClass: 'bg-blue-600' },
                    { value: 'amber', label: 'Giallo Ambra', colorClass: 'bg-amber-600' },
                    { value: 'violet', label: 'Twilight Viola', colorClass: 'bg-violet-600' },
                    { value: 'stone', label: 'Nero Stealth', colorClass: 'bg-stone-600' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAccentColor(opt.value)}
                      className={`p-3.5 rounded-2xl flex items-center gap-3 border-2 outline-none transition-all text-left cursor-pointer ${
                        accentColor === opt.value ? 'border-brand bg-stone-50' : 'border-stone-100 hover:border-stone-200 bg-white'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-lg shrink-0 shadow-sm ${opt.colorClass}`} />
                      <span className="text-xs font-bold text-stone-700">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Brand Text */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Branding Text / Testo Logo</label>
                <input
                  type="text"
                  value={logoText}
                  onChange={(e) => setLogoText(e.target.value)}
                  placeholder="Es: ASD Val Masino Climbing"
                  maxLength={40}
                  className="w-full p-3 bg-stone-50 border-2 border-stone-100 rounded-2xl text-xs font-bold outline-none focus:border-brand transition-colors"
                />
              </div>

              {/* Logo Show/Hide */}
              <div className="space-y-2 flex items-center justify-between bg-stone-50 p-4 rounded-2xl border border-stone-100">
                <div>
                  <label className="text-xs font-bold text-stone-800 uppercase tracking-tight block">Simbolo Icona Montagna</label>
                  <span className="text-[8px] text-stone-400 uppercase font-black tracking-wider">Mostra o nascondi l'icona della montagna</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLogoSymbol(!showLogoSymbol)}
                  className={`w-12 h-6 rounded-full p-1 transition-colors relative cursor-pointer outline-none ${
                    showLogoSymbol ? 'bg-brand' : 'bg-stone-300'
                  }`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full shadow-md transition-transform ${
                    showLogoSymbol ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Custom Image/Logo Symbol Selection */}
              {showLogoSymbol && (
                <div className="space-y-3 bg-stone-50 p-4 rounded-3xl border border-stone-100 transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-stone-800 uppercase tracking-tight block">Personalizza Simbolo con Immagine</label>
                    {logoImage && (
                      <button
                        type="button"
                        onClick={() => setLogoImage(null)}
                        className="text-[9px] font-black uppercase tracking-wider text-red-500 flex items-center gap-1 hover:underline cursor-pointer outline-none"
                      >
                        <RotateCcw className="w-3 h-3" /> Ripristina Default
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                    {/* Option A: Image Upload */}
                    <div className="space-y-1">
                      <span className="text-[8px] text-stone-400 uppercase font-black tracking-widest block mb-1">Metodo A: Carica immagine locale</span>
                      <div className="relative border-2 border-dashed border-stone-200 hover:border-brand rounded-2xl p-4 transition-colors bg-white flex flex-col items-center justify-center text-center cursor-pointer group">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            
                            // Check file size limit to prevent oversized data in storage
                            if (file.size > 153600) {
                              alert("L'immagine è troppo grande! Carica un file inferiore a 150KB, oppure usa un URL online.");
                              return;
                            }

                            const reader = new FileReader();
                            reader.onloadend = () => {
                              if (typeof reader.result === 'string') {
                                setLogoImage(reader.result);
                              }
                            };
                            reader.readAsDataURL(file);
                          }}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                        <Upload className="w-5 h-5 text-stone-400 group-hover:text-brand transition-colors mb-1" />
                        <span className="text-[10px] font-bold text-stone-600">Carica immagine</span>
                        <span className="text-[8px] text-stone-400 mt-0.5">PNG, JPG, SVG o WebP (max 150KB)</span>
                      </div>
                    </div>

                    {/* Option B: Image URL */}
                    <div className="space-y-1">
                      <span className="text-[8px] text-stone-400 uppercase font-black tracking-widest block mb-1">Metodo B: Inserisci URL Immagine online</span>
                      <div className="relative flex items-center">
                        <Link className="w-4 h-4 text-stone-400 absolute left-3" />
                        <input
                          type="url"
                          placeholder="https://esempio.com/logo.png"
                          value={logoImage && !logoImage.startsWith('data:') ? logoImage : ''}
                          onChange={(e) => setLogoImage(e.target.value || null)}
                          className="w-full pl-9 pr-3 py-2 bg-white border border-stone-200 rounded-xl text-xs outline-none focus:border-brand transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Live Preview Card */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest block">Anteprima Istantanea Branding</label>
                <div className="p-4 bg-stone-900 rounded-3xl flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center overflow-hidden" style={{ backgroundColor: accentColor === 'stone' ? '#4b5563' : 'rgba(16, 185, 129, 0.15)' }}>
                    {showLogoSymbol ? (
                      logoImage ? (
                        <img src={logoImage} alt="Logo" className="w-full h-full object-cover" />
                      ) : (
                        <Mountain className="w-4 h-4" style={{ color: accentColor === 'stone' ? '#fff' : 'var(--color-accent-primary)' }} />
                      )
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-white italic uppercase">I Blocchi</h4>
                    <span className="text-[9px] font-bold text-red-500 uppercase tracking-widest block mt-0.5">{logoText} Explorer</span>
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <button
                type="submit"
                disabled={savingTheme}
                className="w-full py-4 bg-brand text-white font-black text-[10px] uppercase tracking-widest italic rounded-2xl shadow-xl shadow-brand/20 flex items-center justify-center gap-2 cursor-pointer hover:bg-brand-hover active:scale-98 transition-colors disabled:opacity-55"
              >
                {savingTheme ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salva Impostazioni
              </button>
            </form>
          </div>
        )}

        {/* SUBVIEW 3: ACTIVITY LOG MANAGEMENT */}
        {activeAdminTab === 'logs' && (
          <div className="p-4 space-y-4">
            <div className="bg-white border border-stone-200/60 rounded-[2rem] p-5 shadow-sm space-y-2">
              <h3 className="text-sm font-black uppercase tracking-tighter italic text-stone-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-brand" /> Registri Attività di Sistema
              </h3>
              <p className="text-[9px] text-stone-400 font-bold uppercase tracking-wider leading-relaxed">
                Visualizza, annota, correggi (modifica) o elimina i registri delle azioni e pulizie boulder nel team.
              </p>
            </div>

            {loadingLogs ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-brand" />
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Caricamento log...</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-20 text-stone-400 uppercase font-black text-[9px] tracking-widest">
                Nessun registro di attività memorizzato nel database
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map((item) => (
                  <div 
                    key={item.id} 
                    className="p-5 bg-white border border-stone-200/50 rounded-2xl shadow-sm space-y-3 hover:shadow-md transition-shadow relative"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 flex-1">
                        <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 bg-stone-100 rounded-md text-stone-500 italic">
                          {item.type || 'generale'}
                        </span>
                        
                        {editingLogId === item.id ? (
                          <div className="space-y-2 pt-1">
                            <textarea
                              rows={2}
                              value={editingLogText}
                              onChange={(e) => setEditingLogText(e.target.value)}
                              className="w-full text-xs font-bold text-stone-800 bg-stone-50 border-2 border-stone-100 rounded-xl p-3 outline-none focus:border-brand"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleUpdateLog(item.id)}
                                disabled={savingLogId === item.id}
                                className="px-3 py-1.5 bg-brand text-white font-black text-[9px] uppercase tracking-widest rounded-lg flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              >
                                {savingLogId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                Salva
                              </button>
                              <button
                                onClick={() => setEditingLogId(null)}
                                className="px-3 py-1.5 bg-stone-100 text-stone-700 font-black text-[9px] uppercase tracking-widest rounded-lg flex items-center gap-1 cursor-pointer"
                              >
                                <Undo2 className="w-3 h-3" />
                                Annulla
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs font-bold text-stone-900 leading-relaxed">{item.action}</p>
                        )}

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-stone-400 font-bold pt-1">
                          <span className="text-brand font-black">{item.createdByDisplayName || 'Anonimo'}</span>
                          <span className="text-stone-300">|</span>
                          <span className="text-stone-400 font-mono text-[8px]">{item.createdByEmail || ''}</span>
                          <span className="text-stone-300">|</span>
                          <span className="text-stone-400 font-mono text-[8px]">
                            {item.createdAt ? new Date(item.createdAt).toLocaleString('it-IT') : 'Data non specificata'}
                          </span>
                        </div>
                      </div>

                      {editingLogId !== item.id && (
                        <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleStartEditLog(item)}
                            className="p-2 bg-stone-50 hover:bg-stone-100 text-stone-500 rounded-lg transition-colors cursor-pointer"
                            title="Modifica Testo Log"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteLog(item.id)}
                            disabled={deletingLogId === item.id}
                            className="p-2 bg-stone-50 hover:bg-red-50 hover:text-red-500 text-stone-400 rounded-lg transition-all cursor-pointer"
                            title="Elimina Registro"
                          >
                            {deletingLogId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      <div className="p-5 bg-stone-900 text-white flex flex-col gap-1 items-center text-center">
        <ShieldAlert className="w-4 h-4 text-brand mb-1" />
        <p className="text-[10px] font-bold uppercase tracking-widest leading-relaxed italic">
          Partner ASD Val Masino Climbing Member Cloud
        </p>
        <span className="text-[8px] text-stone-500 uppercase font-black">Supervisore: {currentAuth.currentUser?.email}</span>
      </div>

      {/* Security Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/80 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl p-8 text-center"
          >
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            
            <h3 className="text-xl font-black text-stone-900 uppercase italic mb-2">Conferma Sicurezza</h3>
            <p className="text-stone-500 text-[10px] font-bold uppercase tracking-widest leading-relaxed mb-6">
              {confirmingAction?.type === 'bulk' 
                ? "Stai eliminando TUTTI i membri non-amministratori. Inserisci la tua password per confermare."
                : `Stai eliminando definitamente ${confirmingAction?.name}. Inserisci la tua password per confermare.`
              }
            </p>

            <form onSubmit={executeConfirmedAction} className="space-y-4">
              <div className="relative">
                <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  type="password"
                  placeholder="La tua password admin"
                  required
                  autoFocus
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-4 bg-stone-50 border-2 border-stone-100 text-stone-800 rounded-2xl text-sm outline-none focus:border-red-500/50 transition-all font-bold"
                />
              </div>

              {reAuthError && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-red-100 italic">
                  {reAuthError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirmModal(false);
                    setConfirmingAction(null);
                  }}
                  className="py-4 bg-stone-100 text-stone-900 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-stone-200 transition-all cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={reAuthLoading || !confirmPassword}
                  className="py-4 bg-red-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-red-600/30 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {reAuthLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Elimina Ora"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};
