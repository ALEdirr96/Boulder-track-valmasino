import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, Wrench, History, Plus, Search, Calendar, User, 
  ArrowRightLeft, FileText, X, Check, AlertCircle, Trash2, Info, Loader2, ClipboardCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getAuth } from 'firebase/auth';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc, 
  orderBy, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { logActivity } from '../lib/logger';
import { UserProfile, EquipmentBooking } from '../types';

interface Equipment {
  id: string;
  name: string;
  category: string;
  status: 'available' | 'borrowed' | 'maintenance';
  serialNumber?: string;
  createdAt: any;
  borrowedByEmail?: string;
  borrowedByUserId?: string;
  borrowedByName?: string;
  borrowedAt?: any;
}

interface EquipmentLog {
  id: string;
  equipmentId: string;
  equipmentName: string;
  personName: string;
  action: 'borrow' | 'return' | 'maintenance';
  dateTime: any;
  adminId: string;
  notes?: string;
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

interface EquipmentManagementProps {
  profile: UserProfile;
}

export const EquipmentManagement: React.FC<EquipmentManagementProps> = ({ profile }) => {
  // Navigation inside the module
  const [tab, setTab] = useState<'list' | 'bookings' | 'add' | 'history'>('list');

  // Firestore Data
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [logs, setLogs] = useState<EquipmentLog[]>([]);
  const [bookings, setBookings] = useState<EquipmentBooking[]>([]);
  const [loading, setLoading] = useState(true);

  // States for interactive modals / overlays
  const [selectedItem, setSelectedItem] = useState<Equipment | null>(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [logActionType, setLogActionType] = useState<'borrow' | 'return' | 'maintenance'>('borrow');

  // Quick Borrow Modal state
  const [showQuickBorrowModal, setShowQuickBorrowModal] = useState(false);
  const [quickBorrowEquipmentId, setQuickBorrowEquipmentId] = useState('');
  const [quickBorrowEquipmentIds, setQuickBorrowEquipmentIds] = useState<string[]>([]);
  const [quickBorrowPerson, setQuickBorrowPerson] = useState('');
  const [quickBorrowNotes, setQuickBorrowNotes] = useState('');
  const [quickBorrowError, setQuickBorrowError] = useState('');
  const [isSubmittingQuickBorrow, setIsSubmittingQuickBorrow] = useState(false);

  // User Return Modal states
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnItem, setReturnItem] = useState<Equipment | null>(null);
  const [returnCondition, setReturnCondition] = useState<'available' | 'maintenance'>('available');
  const [returnNotes, setReturnNotes] = useState('');
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
  const [returnError, setReturnError] = useState('');

  // Booking Modal States
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);
  const [bookingStartDate, setBookingStartDate] = useState('');
  const [bookingEndDate, setBookingEndDate] = useState('');
  const [bookingError, setBookingError] = useState('');
  const [submittingBooking, setSubmittingBooking] = useState(false);

  // Form states
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newSerial, setNewSerial] = useState('');
  const [formError, setFormError] = useState('');
  const [adding, setAdding] = useState(false);

  // Movement Form inside components modal
  const [personName, setPersonName] = useState('');
  const [movementNotes, setMovementNotes] = useState('');
  const [movementError, setMovementError] = useState('');
  const [submittingMovement, setSubmittingMovement] = useState(false);

  // Filter and Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'borrowed' | 'maintenance' | 'my-borrowed'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // History search/filters
  const [historySearch, setHistorySearch] = useState('');
  const [historyActionFilter, setHistoryActionFilter] = useState<'all' | 'borrow' | 'return' | 'maintenance'>('all');

  const currentAuth = getAuth();
  const currentAdmin = currentAuth.currentUser;

  // Categories presets
  const categoryPresets = [
    'Rinvii (Quickdraws)',
    'Corde (Ropes)',
    'Crash Pad',
    'Imbraghi (Harnesses)',
    'Caschi (Helmets)',
    'Moschettoni (Carabiners)',
    'Assicuratori (Belay Devices)',
    'Tessera d\'Associazione',
    'Trapani & Attrezzatura Chiodatura',
    'Prese da Arrampicata',
    'Altro / Accessori'
  ];

  // Fetch Equipment
  useEffect(() => {
    setLoading(true);
    const eqRef = collection(db, 'equipment');
    const eqQuery = query(eqRef, orderBy('createdAt', 'desc'));

    const unsubscribeEq = onSnapshot(eqQuery, (snapshot) => {
      const items: Equipment[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        items.push({
          id: doc.id,
          name: data.name || '',
          category: data.category || '',
          status: data.status || 'available',
          serialNumber: data.serialNumber || '',
          createdAt: data.createdAt,
          borrowedByEmail: data.borrowedByEmail || '',
          borrowedByUserId: data.borrowedByUserId || '',
          borrowedByName: data.borrowedByName || '',
          borrowedAt: data.borrowedAt,
        });
      });
      setEquipmentList(items);
      setLoading(false);
    }, (error) => {
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'equipment');
    });

    // Fetch Logs
    const logsRef = collection(db, 'equipment_logs');
    const logsQuery = query(logsRef, orderBy('dateTime', 'desc'));

    const unsubscribeLogs = onSnapshot(logsQuery, (snapshot) => {
      const logItems: EquipmentLog[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        logItems.push({
          id: doc.id,
          equipmentId: data.equipmentId || '',
          equipmentName: data.equipmentName || '',
          personName: data.personName || '',
          action: data.action || 'borrow',
          dateTime: data.dateTime,
          adminId: data.adminId || '',
          notes: data.notes || '',
        });
      });
      setLogs(logItems);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'equipment_logs');
    });

    // Fetch Bookings
    const qBookings = query(collection(db, 'equipment_bookings'));
    const unsubscribeBookings = onSnapshot(qBookings, (snapshot) => {
      const bookList: EquipmentBooking[] = [];
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        bookList.push({
          id: docSnap.id,
          equipmentId: d.equipmentId || '',
          equipmentName: d.equipmentName || '',
          userId: d.userId || '',
          userDisplayName: d.userDisplayName || '',
          startDate: d.startDate || '',
          endDate: d.endDate || '',
          status: d.status || 'pending',
          createdAt: d.createdAt
        });
      });
      setBookings(bookList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'equipment_bookings');
    });

    return () => {
      unsubscribeEq();
      unsubscribeLogs();
      unsubscribeBookings();
    };
  }, []);

  useEffect(() => {
    const handleAddClick = () => {
      // Set default name to current active user name
      setQuickBorrowPerson(profile?.displayName || profile?.email || '');
      setQuickBorrowEquipmentId('');
      setQuickBorrowEquipmentIds([]);
      setQuickBorrowNotes('');
      setQuickBorrowError('');
      setShowQuickBorrowModal(true);
    };
    window.addEventListener('app-add-equipment-borrow', handleAddClick);
    return () => {
      window.removeEventListener('app-add-equipment-borrow', handleAddClick);
    };
  }, [profile]);

  const handleQuickBorrowSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuickBorrowError('');

    if (quickBorrowEquipmentIds.length === 0) {
      setQuickBorrowError('Seleziona almeno un attrezzo.');
      return;
    }

    const borrowerName = quickBorrowPerson.trim();
    if (!borrowerName) {
      setQuickBorrowError('Inserisci il nome di chi preleva l\'attrezzatura.');
      return;
    }

    // Validate if all are available first
    const unavailableNames: string[] = [];
    const chosenItems: Equipment[] = [];

    for (const id of quickBorrowEquipmentIds) {
      const selectedQuickItem = equipmentList.find(eq => eq.id === id);
      if (!selectedQuickItem) {
        setQuickBorrowError('Un attrezzo selezionato non è stato trovato.');
        return;
      }
      if (selectedQuickItem.status !== 'available') {
        unavailableNames.push(selectedQuickItem.name);
      } else {
        chosenItems.push(selectedQuickItem);
      }
    }

    if (unavailableNames.length > 0) {
      setQuickBorrowError(`I seguenti attrezzi non sono disponibili per il prestito: ${unavailableNames.join(', ')}`);
      return;
    }

    setIsSubmittingQuickBorrow(true);
    try {
      for (const item of chosenItems) {
        const eqDocRef = doc(db, 'equipment', item.id);
        
        // Update status to borrowed with borrower info
        await updateDoc(eqDocRef, { 
          status: 'borrowed',
          borrowedByEmail: profile?.email || '',
          borrowedByUserId: profile?.uid || '',
          borrowedByName: borrowerName,
          borrowedAt: serverTimestamp()
        });

        // Create Equipment Log
        await addDoc(collection(db, 'equipment_logs'), {
          equipmentId: item.id,
          equipmentName: item.name,
          personName: borrowerName,
          action: 'borrow',
          dateTime: serverTimestamp(),
          adminId: currentAdmin?.uid || 'user',
          notes: quickBorrowNotes.trim() || 'Prelevato tramite prelievo giornaliero Magazzino.',
        });

        // System activity log
        await logActivity(
          `Prelevato / In Prestito: attrezzo "${item.name}" associato a ${borrowerName}`,
          'equipment',
          profile
        );
      }

      setShowQuickBorrowModal(false);
      setQuickBorrowEquipmentId('');
      setQuickBorrowEquipmentIds([]);
      setQuickBorrowPerson('');
      setQuickBorrowNotes('');
      alert('Registrazione prelievo magazzino completata con successo!');
    } catch (err: any) {
      setQuickBorrowError(err.message || 'Errore durante la registrazione.');
    } finally {
      setIsSubmittingQuickBorrow(false);
    }
  };

  // Check if an equipment has an active booking today
  const getActiveBookingToday = (equipmentId: string) => {
    const todayStr = new Date().toISOString().split('T')[0];
    return bookings.find(b => b.equipmentId === equipmentId && b.status !== 'cancelled' && b.startDate <= todayStr && b.endDate >= todayStr);
  };

  // Get ordered upcoming bookings
  const getUpcomingBookings = (equipmentId: string) => {
    const todayStr = new Date().toISOString().split('T')[0];
    return bookings
      .filter(b => b.equipmentId === equipmentId && b.status !== 'cancelled' && b.endDate >= todayStr)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  };

  const isBorrowedByMe = (item: Equipment) => {
    if (item.status !== 'borrowed') return false;
    const isMyId = !!(item.borrowedByUserId && item.borrowedByUserId === profile?.uid);
    const isMyEmail = !!(item.borrowedByEmail && item.borrowedByEmail === profile?.email);
    const isMyName = !!(item.borrowedByName && item.borrowedByName === profile?.displayName);
    return isMyId || isMyEmail || isMyName;
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReturnError('');
    if (!returnItem) return;

    setIsSubmittingReturn(true);
    try {
      const eqDocRef = doc(db, 'equipment', returnItem.id);

      // Status at return: 'available' or 'maintenance'
      const finalStatus = returnCondition;

      // 1. Update equipment document
      await updateDoc(eqDocRef, {
        status: finalStatus,
        borrowedByEmail: null,
        borrowedByUserId: null,
        borrowedByName: null,
        borrowedAt: null
      });

      // 2. Create Equipment Log
      const personNameLabel = profile?.displayName || profile?.email || 'Socio';
      await addDoc(collection(db, 'equipment_logs'), {
        equipmentId: returnItem.id,
        equipmentName: returnItem.name,
        personName: personNameLabel,
        action: 'return',
        dateTime: serverTimestamp(),
        adminId: 'user-return',
        notes: returnNotes.trim() || `Attrezzatura riconsegnata dal socio. Stato: ${finalStatus === 'available' ? 'Disponibile' : 'In manutenzione'}.`
      });

      // 3. Log activity
      await logActivity(
        `Restituito: attrezzo "${returnItem.name}" riconsegnato da ${personNameLabel} (Stato: ${finalStatus === 'available' ? 'Disponibile' : 'In Manutenzione'})`,
        'equipment',
        profile
      );

      setShowReturnModal(false);
      setReturnItem(null);
      setReturnNotes('');
      setReturnCondition('available');
      alert('Riconsegna attrezzatura registrata con successo!');
    } catch (err: any) {
      setReturnError(err.message || 'Errore durante la riconsegna.');
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  // Filtered Equipment List
  const filteredEquipment = useMemo(() => {
    return equipmentList.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (item.serialNumber && item.serialNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
                            item.category.toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchesStatus = false;
      if (statusFilter === 'all') {
        matchesStatus = true;
      } else if (statusFilter === 'my-borrowed') {
        matchesStatus = item.status === 'borrowed' && (
          (item.borrowedByUserId && item.borrowedByUserId === profile?.uid) ||
          (item.borrowedByEmail && item.borrowedByEmail === profile?.email) ||
          (item.borrowedByName && item.borrowedByName === profile?.displayName)
        );
      } else {
        matchesStatus = item.status === statusFilter;
      }

      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [equipmentList, searchQuery, statusFilter, categoryFilter, profile]);

  const myBorrowedItems = useMemo(() => {
    return equipmentList.filter(item => isBorrowedByMe(item));
  }, [equipmentList, profile]);

  // Unique categories list for filters
  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    equipmentList.forEach(item => {
      if (item.category) cats.add(item.category);
    });
    return Array.from(cats);
  }, [equipmentList]);

  // Filtered logs list
  const filteredHistory = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch = log.equipmentName.toLowerCase().includes(historySearch.toLowerCase()) || 
                            log.personName.toLowerCase().includes(historySearch.toLowerCase()) ||
                            (log.notes && log.notes.toLowerCase().includes(historySearch.toLowerCase()));
      const matchesAction = historyActionFilter === 'all' || log.action === historyActionFilter;
      return matchesSearch && matchesAction;
    });
  }, [logs, historySearch, historyActionFilter]);

  // Counters
  const counters = useMemo(() => {
    const total = equipmentList.length;
    const available = equipmentList.filter(e => e.status === 'available').length;
    const borrowed = equipmentList.filter(e => e.status === 'borrowed').length;
    const maintenance = equipmentList.filter(e => e.status === 'maintenance').length;
    
    return {
      total,
      available,
      borrowed,
      maintenance
    };
  }, [equipmentList]);

  // Actions
  const handleAddEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!newName.trim() || !newCategory.trim()) {
      setFormError('I campi Nome e Categoria sono obbligatori.');
      return;
    }

    setAdding(true);
    try {
      await addDoc(collection(db, 'equipment'), {
        name: newName.trim(),
        category: newCategory.trim(),
        status: 'available',
        serialNumber: newSerial.trim() || '',
        createdAt: serverTimestamp(),
      });

      // Log to global system logger if provided
      await logActivity(
        `Registrato nuovo attrezzo ASD: "${newName.trim()}" (${newCategory.trim()})`,
        'equipment',
        profile
      );

      setNewName('');
      setNewCategory('');
      setNewSerial('');
      setTab('list');
      alert('Attrezzatura aggiunta con successo!');
    } catch (err: any) {
      setAdding(false);
      handleFirestoreError(err, OperationType.CREATE, 'equipment');
    } finally {
      setAdding(false);
    }
  };

  const openMovementModal = (item: Equipment, action: 'borrow' | 'return' | 'maintenance') => {
    setSelectedItem(item);
    setLogActionType(action);
    setPersonName(action === 'maintenance' ? 'Responsabile Manutenzione ASD' : (profile?.displayName || profile?.email || ''));
    setMovementNotes('');
    setMovementError('');
    setShowLogModal(true);
  };

  const handleProcessMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    setMovementError('');
    if (!selectedItem) return;

    if (!personName.trim()) {
      setMovementError('Inserire il nome della persona o del responsabile.');
      return;
    }

    setSubmittingMovement(true);
    try {
      const eqDocRef = doc(db, 'equipment', selectedItem.id);
      
      // Map status depending on action
      const newStatus = logActionType === 'borrow' ? 'borrowed' : 
                        logActionType === 'return' ? 'available' : 'maintenance';

      // 1. Update status and borrower details
      const updatePayload: any = { status: newStatus };
      if (logActionType === 'borrow') {
        updatePayload.borrowedByName = personName.trim();
        updatePayload.borrowedByEmail = (personName.trim() === profile?.displayName || personName.trim() === profile?.email) ? (profile?.email || '') : '';
        updatePayload.borrowedByUserId = (personName.trim() === profile?.displayName || personName.trim() === profile?.email) ? (profile?.uid || '') : '';
        updatePayload.borrowedAt = serverTimestamp();
      } else {
        updatePayload.borrowedByName = null;
        updatePayload.borrowedByEmail = null;
        updatePayload.borrowedByUserId = null;
        updatePayload.borrowedAt = null;
      }
      await updateDoc(eqDocRef, updatePayload);

      // 2. Create Equipment Log
      await addDoc(collection(db, 'equipment_logs'), {
        equipmentId: selectedItem.id,
        equipmentName: selectedItem.name,
        personName: personName.trim(),
        action: logActionType,
        dateTime: serverTimestamp(),
        adminId: currentAdmin?.uid || 'admin',
        notes: movementNotes.trim() || '',
      });

      // 3. System activity log
      let actionLabel = logActionType === 'borrow' ? 'Assegnato/In Prestito' : 
                        logActionType === 'return' ? 'Restituito e Disponibile' : 'In Manutenzione';
      
      await logActivity(
        `${actionLabel}: attrezzo "${selectedItem.name}" associato a ${personName.trim()}`,
        'equipment',
        profile
      );

      setShowLogModal(false);
      setSelectedItem(null);
      alert('Movimento registrato con successo!');
    } catch (err: any) {
      setSubmittingMovement(false);
      handleFirestoreError(err, OperationType.WRITE, `equipment/${selectedItem?.id}`);
    } finally {
      setSubmittingMovement(false);
    }
  };

  const handleQuickMaintenance = async (item: Equipment) => {
    if (window.confirm(`Spostare l'attrezzo "${item.name}" in manutenzione?`)) {
      try {
        const eqDocRef = doc(db, 'equipment', item.id);
        await updateDoc(eqDocRef, { status: 'maintenance' });

        await addDoc(collection(db, 'equipment_logs'), {
          equipmentId: item.id,
          equipmentName: item.name,
          personName: 'Responsabile Tecnico ASD',
          action: 'maintenance',
          dateTime: serverTimestamp(),
          adminId: currentAdmin?.uid || 'admin',
          notes: 'Manutenzione straordinaria ordinata rapidamente.',
        });

        await logActivity(
          `Impostato in manutenzione: attrezzo "${item.name}"`,
          'equipment',
          profile
        );

        alert('Impostato in manutenzione!');
      } catch (err: any) {
        handleFirestoreError(err, OperationType.UPDATE, `equipment/${item.id}`);
      }
    }
  };

  const handleDeleteItem = async (item: Equipment) => {
    if (window.confirm(`Sei sicuro di voler ELIMINARE definitivamente "${item.name}" dal catalogo? Questa azione è irreversibile.`)) {
      try {
        await deleteDoc(doc(db, 'equipment', item.id));

        await logActivity(
          `Eliminato attrezzo "${item.name}" dal catalogo ASD`,
          'equipment',
          profile
        );

        alert('Elemento eliminato dal catalogo.');
      } catch (err: any) {
        handleFirestoreError(err, OperationType.DELETE, `equipment/${item.id}`);
      }
    }
  };

  // Trigger Booking Modal
  const openBookingModal = (item: Equipment) => {
    setSelectedItem(item);
    setSelectedEquipmentIds([item.id]);
    setBookingStartDate('');
    setBookingEndDate('');
    setBookingError('');
    setShowBookingModal(true);
  };

  // Submit Booking Form
  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingError('');

    if (selectedEquipmentIds.length === 0) {
      setBookingError('Seleziona almeno un attrezzo da prenotare.');
      return;
    }
    if (!bookingStartDate || !bookingEndDate) {
      setBookingError('Inserire data di inizio e fine.');
      return;
    }

    if (bookingStartDate > bookingEndDate) {
      setBookingError('La data di fine non può essere inferiore alla data di inizio.');
      return;
    }

    // Check availability for all selected equipment
    const overlappingNames: string[] = [];
    const maintenanceNames: string[] = [];

    selectedEquipmentIds.forEach(id => {
      const eq = equipmentList.find(item => item.id === id);
      if (!eq) return;

      if (eq.status === 'maintenance') {
        maintenanceNames.push(eq.name);
      }

      const isOverlapping = bookings.some(b => {
        if (b.equipmentId !== id) return false;
        if (b.status === 'cancelled') return false;
        return b.startDate <= bookingEndDate && b.endDate >= bookingStartDate;
      });

      if (isOverlapping) {
        overlappingNames.push(eq.name);
      }
    });

    if (maintenanceNames.length > 0) {
      setBookingError(`I seguenti attrezzi sono in manutenzione: ${maintenanceNames.join(', ')}`);
      return;
    }

    if (overlappingNames.length > 0) {
      setBookingError(`I seguenti attrezzi sono già prenotati nelle date selezionate: ${overlappingNames.join(', ')}`);
      return;
    }

    setSubmittingBooking(true);
    try {
      for (const id of selectedEquipmentIds) {
        const itemObj = equipmentList.find(eq => eq.id === id);
        if (!itemObj) continue;

        const bookingData = {
          equipmentId: id,
          equipmentName: itemObj.name,
          userId: profile.uid,
          userDisplayName: profile.displayName || profile.email,
          startDate: bookingStartDate,
          endDate: bookingEndDate,
          status: 'approved', // Auto approved for members
          createdAt: serverTimestamp()
        };

        await addDoc(collection(db, 'equipment_bookings'), bookingData);

        await logActivity(
          `Prenotazione attrezzatura "${itemObj.name}" dal ${bookingStartDate} al ${bookingEndDate}`,
          'equipment',
          profile
        );
      }

      setShowBookingModal(false);
      setSelectedItem(null);
      setSelectedEquipmentIds([]);
      setBookingStartDate('');
      setBookingEndDate('');
      alert('Prenotazione registrata con successo!');
    } catch (err: any) {
      setBookingError('Errore salvataggio: ' + err.message);
    } finally {
      setSubmittingBooking(false);
    }
  };

  // Cancel Booking action
  const handleCancelBooking = async (bookingId: string, equipName: string) => {
    if (!window.confirm(`Sei sicuro di voler cancellare la prenotazione di "${equipName}"?`)) return;
    try {
      await deleteDoc(doc(db, 'equipment_bookings', bookingId));
      await logActivity(
        `Cancellata prenotazione attrezzatura: "${equipName}"`,
        'equipment',
        profile
      );
      alert('Prenotazione cancellata con successo!');
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `equipment_bookings/${bookingId}`);
    }
  };

  return (
    <div className="bg-stone-50 min-h-screen pb-16">
      
      {/* Dynamic ASD Member Stats Bar */}
      <div className="grid grid-cols-4 gap-2 p-4 bg-white border-b border-stone-200 animate-none">
        <div className="bg-stone-50 p-2.5 rounded-2xl text-center flex flex-col justify-center items-center">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Registrati</span>
          <span className="text-lg font-black text-stone-900 mt-0.5">{counters.total}</span>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 p-2.5 rounded-2xl text-center flex flex-col justify-center items-center">
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">Disponibili</span>
          <span className="text-lg font-black text-emerald-600 mt-0.5">{counters.available}</span>
        </div>
        <div className="bg-red-50 border border-red-100 p-2.5 rounded-2xl text-center flex flex-col justify-center items-center">
          <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider block">In Uso</span>
          <span className="text-lg font-black text-red-600 mt-0.5">{counters.borrowed}</span>
        </div>
        <div className="bg-amber-50 border border-amber-100 p-2.5 rounded-2xl text-center flex flex-col justify-center items-center">
          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">Manutenzione</span>
          <span className="text-lg font-black text-amber-600 mt-0.5">{counters.maintenance}</span>
        </div>
      </div>

      {/* Internal Ribbon Navigation */}
      <div className="p-3 bg-white border-b border-stone-200/60 sticky top-0 z-10 flex gap-2 overflow-x-auto">
        <button
          onClick={() => setTab('list')}
          className={`px-4 py-2.5 rounded-xl text-center font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shrink-0 ${
            tab === 'list' ? 'bg-stone-900 text-white shadow-sm' : 'bg-stone-100 text-stone-500 hover:text-stone-700'
          }`}
        >
          <Package className="w-3.5 h-3.5" /> Inventario o Magazzino
        </button>
        <button
          onClick={() => setTab('bookings')}
          className={`px-4 py-2.5 rounded-xl text-center font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shrink-0 ${
            tab === 'bookings' ? 'bg-stone-900 text-white shadow-sm' : 'bg-stone-100 text-stone-500 hover:text-stone-700'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" /> Le mie Prenotazioni
        </button>
        {profile?.role === 'admin' && (
          <button
            onClick={() => setTab('add')}
            className={`px-4 py-2.5 rounded-xl text-center font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shrink-0 ${
              tab === 'add' ? 'bg-stone-900 text-white shadow-sm' : 'bg-stone-100 text-stone-500 hover:text-stone-700'
            }`}
          >
            <Plus className="w-3.5 h-3.5" /> Nuovo Attrezzo
          </button>
        )}
        {profile?.role === 'admin' && (
          <button
            onClick={() => setTab('history')}
            className={`px-4 py-2.5 rounded-xl text-center font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shrink-0 ${
              tab === 'history' ? 'bg-stone-900 text-white shadow-sm' : 'bg-stone-100 text-stone-500 hover:text-stone-700'
            }`}
          >
            <History className="w-3.5 h-3.5" /> Storico Movimenti
          </button>
        )}
      </div>

      {/* Main Content Render */}
      <div className="p-4">
        
        {/* TAB 1: LIST / CATALOG */}
        {tab === 'list' && (
          <div className="space-y-4 animate-none">
            
            {/* Quick Action: Return Equipment (Rientro Attrezzatura) */}
            <div className="bg-emerald-50/60 border border-emerald-100 p-4 rounded-3xl shadow-sm text-stone-800 space-y-3">
              <div className="flex justify-between items-start">
                <div className="space-y-0.5">
                  <span className="text-[8px] font-black tracking-widest text-emerald-600 uppercase">Magazzino ASD</span>
                  <h3 className="font-extrabold text-sm uppercase leading-none text-stone-905">Rientro Attrezzatura</h3>
                  <p className="text-[10px] text-stone-500 font-semibold leading-tight">Gestisci la riconsegna e lo stato degli attrezzi presi in prestito.</p>
                </div>
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                </div>
              </div>

              {myBorrowedItems.length > 0 ? (
                <div className="space-y-2 pt-1.5 border-t border-emerald-100">
                  <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider block">I tuoi prestiti attivi ({myBorrowedItems.length}):</span>
                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                    {myBorrowedItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between bg-white p-2 rounded-xl border border-emerald-100/80 shadow-xs">
                        <div className="min-w-0 pr-2">
                          <p className="text-[11px] font-extrabold text-stone-850 truncate leading-none">{item.name}</p>
                          <p className="text-[8px] font-bold text-stone-400 uppercase tracking-tight mt-0.5">{item.category}</p>
                        </div>
                        <button
                          onClick={() => {
                            setReturnItem(item);
                            setReturnCondition('available');
                            setReturnNotes('');
                            setReturnError('');
                            setShowReturnModal(true);
                          }}
                          className="px-2.5 py-1 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-black text-[9px] uppercase tracking-wider rounded-lg transition-all shadow-xs shrink-0 flex items-center gap-1 cursor-pointer border-0"
                        >
                          Fai Rientrare
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="pt-2 border-t border-emerald-100/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <p className="text-[10px] text-stone-500 font-semibold leading-tight">Al momento non hai attrezzatura in carico.</p>
                  <button
                    onClick={() => {
                      setStatusFilter('my-borrowed');
                    }}
                    className="px-3 py-1.5 bg-stone-900 hover:bg-stone-850 active:scale-95 text-white font-black text-[9px] uppercase tracking-wider rounded-xl transition-all shadow-xs flex items-center gap-1 cursor-pointer border-0"
                  >
                    Mostra Tutti i Prestiti
                  </button>
                </div>
              )}
            </div>

            {/* Search and Quick Filters */}
            <div className="bg-white p-4 rounded-3xl border border-stone-200 shadow-sm space-y-3">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  type="text"
                  placeholder="Cerca per nome, categoria o n. serie..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-stone-900 outline-none"
                />
              </div>

              <div className="flex gap-2 leading-none overflow-x-auto pb-1">
                <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest self-center shrink-0 mr-1">Stato:</span>
                {(['all', 'available', 'borrowed', 'my-borrowed', 'maintenance'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg border transition-all shrink-0 ${
                      statusFilter === st 
                        ? 'bg-stone-900 border-stone-900 text-white' 
                        : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'
                    }`}
                  >
                    {st === 'all' ? 'Tutti' : st === 'available' ? 'Liberi' : st === 'borrowed' ? 'In Prestito' : st === 'my-borrowed' ? 'Prese da me' : 'Manutenz.'}
                  </button>
                ))}
              </div>

              {uniqueCategories.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pt-1 border-t border-stone-100 pb-1">
                  <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest self-center shrink-0 mr-1">Cat:</span>
                  <button
                    onClick={() => setCategoryFilter('all')}
                    className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg border transition-all shrink-0 ${
                      categoryFilter === 'all' 
                        ? 'bg-stone-900 border-stone-900 text-white' 
                        : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'
                    }`}
                  >
                    Tutte
                  </button>
                  {uniqueCategories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg border transition-all shrink-0 ${
                        categoryFilter === cat 
                          ? 'bg-stone-900 border-stone-900 text-white' 
                          : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* List Rendition */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
                <span className="text-xs text-stone-400 font-bold uppercase tracking-wider">Caricamento inventario...</span>
              </div>
            ) : filteredEquipment.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-[2rem] p-8 text-center space-y-2">
                <Package className="w-8 h-8 text-stone-300 mx-auto" />
                <p className="text-xs font-black text-stone-400 uppercase tracking-widest">Nessun attrezzo trovato</p>
                <p className="text-[10px] text-stone-400 max-w-xs mx-auto">
                  Modifica i parametri di ricerca o registra una nuova attrezzatura tramite il modulo in alto.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredEquipment.map(item => (
                  <div 
                    key={item.id} 
                    className="bg-white border-2 border-stone-200/50 rounded-[2rem] p-4 flex flex-col justify-between gap-4 shadow-sm hover:border-stone-300 transition-all text-stone-800"
                  >
                    
                    {/* Item Details */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="relative shrink-0 mt-0.5">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border shadow-inner ${
                          item.status === 'available' ? 'bg-emerald-50 border-emerald-100 text-emerald-500' :
                          item.status === 'borrowed' ? 'bg-red-50 border-red-100 text-red-500' : 
                          'bg-amber-50 border-amber-100 text-amber-500'
                        }`}>
                          <Package className="w-5 h-5" />
                        </div>
                        {/* Little absolute status indicator badge */}
                        <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${
                          item.status === 'available' ? 'bg-emerald-500' :
                          item.status === 'borrowed' ? 'bg-red-500' : 
                          'bg-amber-500'
                        }`} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="font-black text-stone-900 text-sm truncate flex items-center gap-1.5">
                          {item.name}
                        </div>
                        <div className="text-[10px] font-bold text-stone-400 uppercase tracking-tight mt-0.5">{item.category}</div>
                        {item.serialNumber && (
                          <div className="text-[9px] font-mono text-stone-500 mt-0.5">N. Serie: {item.serialNumber}</div>
                        )}
                        
                        <div className="flex gap-2 items-center mt-1.5">
                          <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${
                            item.status === 'available' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                            item.status === 'borrowed' ? 'bg-red-50 text-red-600 border border-red-100' : 
                            'bg-amber-50 text-amber-600 border border-amber-100'
                          }`}>
                            {item.status === 'available' ? 'Disponibile' :
                             item.status === 'borrowed' ? 'In Uso' : 
                             'In Manutenzione'}
                          </span>
                          <span className="text-[8px] font-mono text-stone-300">ID: {item.id.slice(0, 8)}</span>
                        </div>

                        {/* Booking Status and Availability */}
                        <div className="mt-3.5 pt-2.5 border-t border-stone-100 space-y-2">
                          <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block">Disponibilità Calendario:</span>
                          {/* Active reservation today */}
                          {(() => {
                            const activeBooking = getActiveBookingToday(item.id);
                            if (activeBooking) {
                              return (
                                <div className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-100/60 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 max-w-max">
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  <span>Riservato oggi da: <strong className="font-extrabold">{activeBooking.userDisplayName}</strong></span>
                                </div>
                              );
                            }
                            return (
                              <div className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100/60 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 max-w-max">
                                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                <span>Disponibile oggi in magazzino</span>
                              </div>
                            );
                          })()}

                          {/* Upcoming bookings list */}
                          {(() => {
                            const upcoming = getUpcomingBookings(item.id);
                            if (upcoming.length > 0) {
                              return (
                                <div className="text-[9px] text-stone-500 font-medium pl-1">
                                  <span className="font-bold text-stone-400">Prossime date riservate:</span>
                                  <div className="flex flex-wrap gap-1.5 mt-1">
                                    {upcoming.slice(0, 4).map(b => (
                                      <span key={b.id} className="bg-stone-100/80 text-stone-600 border border-stone-200/60 rounded-lg px-2 py-0.5" title={`Prenotato da ${b.userDisplayName}`}>
                                        dal {b.startDate} al {b.endDate} ({b.userDisplayName.split(' ')[0]})
                                      </span>
                                    ))}
                                    {upcoming.length > 4 && (
                                      <span className="text-[8px] font-bold text-stone-400 self-center">+{upcoming.length - 4} altre</span>
                                    )}
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <p className="text-[9px] text-stone-400 italic pl-1">Nessuna prenotazione futura registrata.</p>
                            );
                          })()}
                        </div>

                      </div>
                    </div>

                    {/* Action buttons list */}
                    <div className="flex flex-wrap items-center justify-end gap-2 shrink-0 pt-2 border-t border-stone-100/60">
                      
                      {/* Return button if borrowed by me OR if admin and status is borrowed */}
                      {(isBorrowedByMe(item) || (profile?.role === 'admin' && item.status === 'borrowed')) && (
                        <button
                          onClick={() => {
                            setReturnItem(item);
                            setReturnCondition('available');
                            setReturnNotes('');
                            setReturnError('');
                            setShowReturnModal(true);
                          }}
                          className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-1 cursor-pointer border-0"
                        >
                          <Check className="w-3.5 h-3.5" /> Fai Rientrare
                        </button>
                      )}

                      {/* Booking Action Button for everyone */}
                      {item.status !== 'maintenance' && (
                        <button
                          onClick={() => openBookingModal(item)}
                          className="px-3.5 py-2 bg-stone-900 hover:bg-stone-850 text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                        >
                          <Calendar className="w-3.5 h-3.5" /> Prenota Date
                        </button>
                      )}

                      {/* Admin Controls Block */}
                      {profile?.role === 'admin' && (
                        <div className="flex items-center gap-1.5 border-l border-stone-200 pl-2 ml-1">
                          
                          {/* Borrow Quick button */}
                          {item.status === 'available' && (
                            <button
                              onClick={() => openMovementModal(item, 'borrow')}
                              className="px-2.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-[9px] uppercase tracking-wider rounded-xl transition-colors shadow-sm flex items-center gap-1 cursor-pointer"
                            >
                              <ArrowRightLeft className="w-3 h-3" /> Presta
                            </button>
                          )}

                          {/* Send to Maintenance option */}
                          {item.status !== 'maintenance' ? (
                            <button
                              onClick={() => handleQuickMaintenance(item)}
                              title="Sposta in Manutenzione"
                              className="p-2 hover:bg-amber-50 text-amber-600 rounded-xl transition-all border border-transparent hover:border-amber-100 cursor-pointer"
                            >
                              <Wrench className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => openMovementModal(item, 'return')}
                              className="px-2.5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-black text-[9px] uppercase tracking-wider rounded-xl transition-colors shadow-sm flex items-center gap-1 cursor-pointer"
                            >
                              <Check className="w-3 h-3" /> Sblocca
                            </button>
                          )}

                          {/* Delete option */}
                          <button
                            onClick={() => handleDeleteItem(item)}
                            title="Elimina"
                            className="p-2 hover:bg-red-50 text-red-500 hover:text-red-700 rounded-xl transition-all border border-transparent hover:border-red-100 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

        {/* TAB 2: MY BOOKINGS LIST */}
        {tab === 'bookings' && (
          <div className="space-y-4 animate-none">
            
            <div className="bg-white p-4 rounded-3xl border border-stone-200 shadow-sm space-y-1">
              <h3 className="font-black text-stone-900 uppercase tracking-wider text-sm flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-emerald-500" /> Le Mie Prenotazioni
              </h3>
              <p className="text-[10px] text-stone-400 font-semibold leading-relaxed">
                Visualizza le attrezzature che hai riservato per le tue uscite. Puoi cancellare una prenotazione se i tuoi piani cambiano.
              </p>
            </div>

            {(() => {
              const myBookings = bookings.filter(b => b.userId === profile.uid).sort((a, b) => b.startDate.localeCompare(a.startDate));
              if (myBookings.length === 0) {
                return (
                  <div className="bg-white border border-stone-200 rounded-[2rem] p-8 text-center space-y-2">
                    <Calendar className="w-8 h-8 text-stone-300 mx-auto animate-none" />
                    <p className="text-xs font-black text-stone-400 uppercase tracking-widest">Nessuna prenotazione attiva</p>
                    <p className="text-[10px] text-stone-400 max-w-xs mx-auto">
                      Vai alla sezione "Inventario o Magazzino" per scegliere un attrezzo e prenotarlo per le date desiderate.
                    </p>
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  {myBookings.map(b => (
                    <div key={b.id} className="bg-white border-2 border-stone-200/50 rounded-[2rem] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm text-stone-800">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl bg-stone-50 border border-stone-100 flex items-center justify-center shrink-0 mt-0.5">
                          <Package className="w-5 h-5 text-stone-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="font-black text-stone-900 text-sm block truncate">{b.equipmentName}</span>
                          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-tight block mt-0.5">
                            Periodo: dal <strong className="text-stone-700">{b.startDate}</strong> al <strong className="text-stone-700">{b.endDate}</strong>
                          </span>
                          <div className="flex gap-2 items-center mt-1.5">
                            <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-100">
                              Approvata / Attiva
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleCancelBooking(b.id, b.equipmentName)}
                        className="px-3 py-2 bg-red-50 hover:bg-red-150 text-red-600 font-bold text-[9px] uppercase tracking-wider rounded-xl transition-colors border border-transparent hover:border-red-100 self-end sm:self-center shrink-0 cursor-pointer"
                      >
                        Cancella Prenotazione
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}

          </div>
        )}

        {/* TAB 3: ADD NEW EQUIPMENT (Admins Only) */}
        {tab === 'add' && profile?.role === 'admin' && (
          <div className="max-w-xl mx-auto">
            <div className="bg-white rounded-[2rem] p-6 border-2 border-stone-200/60 shadow-sm space-y-6">
              
              <div className="space-y-1">
                <h3 className="font-black text-stone-900 uppercase tracking-wider text-base">Registra Nuova Attrezzatura</h3>
                <p className="text-xs text-stone-400 font-semibold leading-relaxed">
                  Compila i dettagli del macchinario, corda o strumento dell'associazione per inserirlo all'interno dei registri per il prestito.
                </p>
              </div>

              <form onSubmit={handleAddEquipment} className="space-y-4">
                
                {/* Name */}
                <div className="space-y-1.5 animate-none">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 block">Nome Attrezzatura *</label>
                  <input
                    type="text"
                    required
                    placeholder="Es: Corda Beal Booster III 9.7mm, Crash Pad Grivel"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl text-xs font-semibold focus:ring-2 focus:ring-stone-950 outline-none"
                  />
                </div>

                {/* Category Preset & Manual Input */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 block">Categoria *</label>
                  
                  {/* Category presets helper */}
                  <div className="flex flex-wrap gap-1.5 bg-stone-50 p-2.5 rounded-2xl border border-stone-100">
                    <span className="text-[8px] font-black uppercase tracking-widest text-stone-400 block w-full mb-1">Seleziona Preset Rapido:</span>
                    {categoryPresets.map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setNewCategory(preset)}
                        className={`px-2 py-1 text-[9px] font-bold rounded-lg border transition-all cursor-pointer ${
                          newCategory === preset 
                            ? 'bg-stone-900 border-stone-900 text-white' 
                            : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    required
                    placeholder="Oppure inserisci categoria personalizzata..."
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl text-xs font-semibold focus:ring-2 focus:ring-stone-950 outline-none"
                  />
                </div>

                {/* Serial Number */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 block">Numero di Serie o Codice Inventario (Opzionale)</label>
                  <input
                    type="text"
                    placeholder="Es: BEAL-2026-04, GRIV8912"
                    value={newSerial}
                    onChange={(e) => setNewSerial(e.target.value)}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl text-xs font-mono text-stone-600 focus:ring-2 focus:ring-stone-950 outline-none"
                  />
                </div>

                {formError && (
                  <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-2xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {formError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={adding}
                  className="w-full py-4 bg-stone-900 hover:bg-stone-850 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-md disabled:bg-stone-400 cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.01] duration-150"
                >
                  {adding ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Salvataggio...
                    </>
                  ) : (
                    <>
                      <ClipboardCheck className="w-4 h-4" /> Registra Attrezzo
                    </>
                  )}
                </button>

              </form>

            </div>
          </div>
        )}

        {/* TAB 4: MOVEMENT LOG HISTORY (Admins Only) */}
        {tab === 'history' && profile?.role === 'admin' && (
          <div className="space-y-4 animate-none">
            
            {/* Log filters */}
            <div className="bg-white p-4 rounded-3xl border border-stone-200 shadow-sm space-y-3">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  type="text"
                  placeholder="Filtra per socio, attrezzo o note..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-stone-900 outline-none"
                />
              </div>

              <div className="flex gap-2">
                <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest self-center shrink-0">Tipo Azione:</span>
                {(['all', 'borrow', 'return', 'maintenance'] as const).map(act => (
                  <button
                    key={act}
                    onClick={() => setHistoryActionFilter(act)}
                    className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg border transition-all shrink-0 cursor-pointer ${
                      historyActionFilter === act 
                        ? 'bg-stone-900 border-stone-900 text-white' 
                        : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'
                    }`}
                  >
                    {act === 'all' ? 'Tutte' : act === 'borrow' ? 'Prestiti' : act === 'return' ? 'Resi' : 'Manutenz.'}
                  </button>
                ))}
              </div>
            </div>

            {/* List of logs */}
            {filteredHistory.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-[2rem] p-8 text-center space-y-2">
                <FileText className="w-8 h-8 text-stone-300 mx-auto animate-none" />
                <p className="text-xs font-black text-stone-400 uppercase tracking-widest">Nessun log trovato</p>
                <p className="text-[10px] text-stone-400 max-w-xs mx-auto">
                  I movimenti degli attrezzi eseguiti dagli amministratori verranno visualizzati qui.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredHistory.map(log => {
                  const dateStr = log.dateTime?.seconds ? new Date(log.dateTime.seconds * 1000).toLocaleString('it-IT') : 'Data non disponibile';
                  
                  return (
                    <div key={log.id} className="bg-white border border-stone-200 rounded-2xl p-4 flex flex-col gap-2 shadow-sm text-xs text-stone-800">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[10px] uppercase tracking-wider shrink-0 ${
                            log.action === 'borrow' ? 'bg-red-50 text-red-600 border border-red-100' : 
                            log.action === 'return' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 
                            'bg-amber-50 text-amber-600 border border-amber-100'
                          }`}>
                            {log.action === 'borrow' ? 'OUT' : log.action === 'return' ? 'IN' : 'MT'}
                          </div>
                          <span className="font-black text-stone-900 truncate max-w-[150px] sm:max-w-[300px]" title={log.equipmentName}>
                            {log.equipmentName}
                          </span>
                        </div>
                        <span className="text-[9px] font-semibold text-stone-400 whitespace-nowrap">{dateStr}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-100">
                        <div>
                          <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest block">Affidatario / Responsabile:</span>
                          <span className="font-bold text-stone-700 block mt-0.5 truncate flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-stone-400" /> {log.personName}
                          </span>
                        </div>
                        <div>
                          <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest block">Operatore (Admin):</span>
                          <span className="font-mono text-[9px] text-stone-500 block mt-0.5 truncate">
                            {log.adminId.slice(0, 8)}
                          </span>
                        </div>
                      </div>

                      {log.notes && (
                        <div className="mt-1.5 p-2 bg-stone-50 rounded-xl text-[10px] text-stone-500 leading-relaxed font-semibold italic border border-stone-100">
                          Note: {log.notes}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            
          </div>
        )}

      </div>

      {/* MODAL 1: BORROW / RETURN MOVEMENT FORM */}
      <AnimatePresence>
        {showLogModal && selectedItem && (
          <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] w-full max-w-md p-6 border-2 border-stone-300 shadow-2xl relative overflow-hidden"
            >
              
              <button 
                onClick={() => { setShowLogModal(false); setSelectedItem(null); }}
                className="absolute top-4 right-4 p-2 bg-stone-100 hover:bg-stone-200 text-stone-500 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="space-y-4">
                
                {/* Header status */}
                <div className="flex items-center gap-2.5">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold uppercase tracking-wider ${
                    logActionType === 'borrow' ? 'bg-red-50 text-red-500 border border-red-100' :
                    logActionType === 'return' ? 'bg-emerald-50 text-emerald-500 border border-emerald-100' :
                    'bg-amber-50 text-amber-500 border border-amber-100'
                  }`}>
                    <ArrowRightLeft className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-stone-900 uppercase tracking-wider text-sm">
                      {logActionType === 'borrow' ? 'Registra Prestito' : 
                       logActionType === 'return' ? 'Registra Rientro' : 'Sposta in Manutenzione'}
                    </h4>
                    <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">{selectedItem.name}</p>
                  </div>
                </div>

                <form onSubmit={handleProcessMovement} className="space-y-4 pt-2 border-t border-stone-100">
                  
                  {/* Person/Socio */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 block">
                      {logActionType === 'maintenance' ? 'Responsabile / Fornitore' : 'Socio Affidatario *'}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Es: Mario Rossi, ASD Climbing Shop..."
                      value={personName}
                      onChange={(e) => setPersonName(e.target.value)}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl text-xs font-semibold focus:ring-2 focus:ring-stone-950 outline-none"
                    />
                  </div>

                  {/* Notes */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 block">Note Aggiuntive (Opzionale)</label>
                    <textarea
                      placeholder="Es: Cessione provvisoria, controllare corde al rientro, usura media..."
                      value={movementNotes}
                      onChange={(e) => setMovementNotes(e.target.value)}
                      rows={3}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl text-xs font-semibold focus:ring-2 focus:ring-stone-950 outline-none resize-none"
                    />
                  </div>

                  {movementError && (
                    <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-2xl flex items-center gap-2">
                       <AlertCircle className="w-4 h-4" />
                       {movementError}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => { setShowLogModal(false); setSelectedItem(null); }}
                      className="flex-1 py-3 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl font-bold text-xs uppercase tracking-widest transition-colors cursor-pointer"
                    >
                      Annulla
                    </button>
                    <button
                      type="submit"
                      disabled={submittingMovement}
                      className="flex-1 py-3 bg-stone-900 hover:bg-stone-850 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:bg-stone-400 cursor-pointer"
                    >
                      {submittingMovement ? 'Salvataggio...' : 'Conferma'}
                    </button>
                  </div>

                </form>

              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 3: BOOKING FORM */}
      <AnimatePresence>
        {showBookingModal && selectedItem && (
          <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] w-full max-w-md p-6 border-2 border-stone-300 shadow-2xl relative overflow-hidden"
            >
              
              <button 
                onClick={() => { setShowBookingModal(false); setSelectedItem(null); }}
                className="absolute top-4 right-4 p-2 bg-stone-100 hover:bg-stone-200 text-stone-500 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="space-y-4">
                
                {/* Header */}
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-stone-900 text-white flex items-center justify-center">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-stone-900 uppercase tracking-wider text-sm">
                      Prenota Attrezzatura
                    </h4>
                    <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">{selectedItem.name}</p>
                  </div>
                </div>

                <form onSubmit={handleCreateBooking} className="space-y-4 pt-2 border-t border-stone-100">
                  
                  {/* Select Equipment (Checkboxes) */}
                  <div className="space-y-1.5 py-1 text-stone-800">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 block">
                      Seleziona Attrezzi
                    </label>
                    <div className="max-h-40 overflow-y-auto border border-stone-200 p-3 rounded-2xl bg-stone-50 space-y-1.5">
                      {equipmentList.map(eq => {
                        const isMainClicked = eq.id === selectedItem.id;
                        const isMaintenance = eq.status === 'maintenance';
                        return (
                          <label key={eq.id} className={`flex items-center gap-2.5 px-2 py-1.5 rounded-xl text-xs font-semibold ${isMaintenance ? 'opacity-50 select-none' : 'hover:bg-stone-100 cursor-pointer text-stone-805'}`}>
                            <input
                              type="checkbox"
                              disabled={isMaintenance}
                              checked={selectedEquipmentIds.includes(eq.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedEquipmentIds(prev => [...prev, eq.id]);
                                } else {
                                  if (isMainClicked) return; // Keeping main clicked selected
                                  setSelectedEquipmentIds(prev => prev.filter(id => id !== eq.id));
                                }
                              }}
                              className="rounded border-stone-300 text-stone-900 focus:ring-stone-900 w-4 h-4 cursor-pointer"
                            />
                            <span className="flex-1 select-none">
                              {eq.name} <span className="text-[9px] text-stone-400 font-bold uppercase pb-0.5">({eq.category})</span>
                            </span>
                            {isMaintenance && <span className="text-[9px] text-red-500 font-extrabold font-mono uppercase">[IN MANUTENZIONE]</span>}
                            {isMainClicked && <span className="text-[9px] text-emerald-600 font-extrabold font-mono uppercase">[FONDAMENTALE]</span>}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Start Date */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 block">
                      Data Inizio *
                    </label>
                    <input
                      type="date"
                      required
                      value={bookingStartDate}
                      onChange={(e) => setBookingStartDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl text-xs font-semibold focus:ring-2 focus:ring-stone-950 outline-none text-stone-850"
                    />
                  </div>

                  {/* End Date */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 block">
                      Data Fine *
                    </label>
                    <input
                      type="date"
                      required
                      value={bookingEndDate}
                      onChange={(e) => setBookingEndDate(e.target.value)}
                      min={bookingStartDate || new Date().toISOString().split('T')[0]}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl text-xs font-semibold focus:ring-2 focus:ring-stone-950 outline-none text-stone-850"
                    />
                  </div>

                  {bookingError && (
                    <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-2xl flex items-center gap-2">
                       <AlertCircle className="w-4 h-4" />
                       {bookingError}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => { setShowBookingModal(false); setSelectedItem(null); }}
                      className="flex-1 py-3 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl font-bold text-xs uppercase tracking-widest transition-colors cursor-pointer"
                    >
                      Annulla
                    </button>
                    <button
                      type="submit"
                      disabled={submittingBooking}
                      className="flex-1 py-3 bg-stone-900 hover:bg-stone-850 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:bg-stone-400 cursor-pointer font-bold"
                    >
                      {submittingBooking ? 'Registrazione...' : 'Conferma Prenotazione'}
                    </button>
                  </div>

                </form>

              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 4: QUICK BORROW / PRENDI ATTREZZATURA FORM */}
      <AnimatePresence>
        {showQuickBorrowModal && (
          <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] w-full max-w-md p-6 border-2 border-stone-300 shadow-2xl relative overflow-hidden text-stone-800"
            >
              
              <button 
                type="button"
                onClick={() => setShowQuickBorrowModal(false)}
                className="absolute top-4 right-4 p-2 bg-stone-100 hover:bg-stone-200 text-stone-500 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="space-y-4">
                
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-500 border border-emerald-100">
                    <ArrowRightLeft className="w-5 h-5 animate-pulse text-emerald-600" />
                  </div>
                  <div>
                    <h4 className="font-black text-stone-905 uppercase tracking-wider text-sm">
                      Prelievo Giornaliero Magazzino
                    </h4>
                    <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">Scegli le attrezzature prelevate oggi</p>
                  </div>
                </div>

                <form onSubmit={handleQuickBorrowSubmit} className="space-y-4 pt-2 border-t border-stone-100">
                  
                  {/* Select Equipment (Checkboxes) */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 block">Scegli Attrezzatura/e *</label>
                    <div className="max-h-40 overflow-y-auto border border-stone-200 p-3 rounded-2xl bg-stone-100/50 space-y-1.5">
                      {equipmentList.filter(eq => eq.status === 'available').map(eq => (
                        <label key={eq.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl text-xs font-semibold hover:bg-stone-200 cursor-pointer text-stone-800">
                          <input
                            type="checkbox"
                            checked={quickBorrowEquipmentIds.includes(eq.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setQuickBorrowEquipmentIds(prev => [...prev, eq.id]);
                              } else {
                                setQuickBorrowEquipmentIds(prev => prev.filter(id => id !== eq.id));
                              }
                            }}
                            className="rounded border-stone-300 text-stone-900 focus:ring-stone-900 w-4 h-4 cursor-pointer"
                          />
                          <span className="flex-1 select-none">
                            {eq.name} <span className="text-[9px] text-stone-400 font-bold uppercase">({eq.category})</span> {eq.serialNumber ? <span className="text-[9px] text-stone-400 font-mono font-bold">- S/N: {eq.serialNumber}</span> : ''}
                          </span>
                        </label>
                      ))}
                      {equipmentList.filter(eq => eq.status === 'available').length === 0 && (
                        <p className="text-[10px] font-semibold text-rose-500 py-1 text-center">Nessun attrezzo è attualmente disponibile in magazzino.</p>
                      )}
                    </div>
                  </div>

                  {/* Person/User */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 block font-bold">Chi Preleva l'Attrezzatura? *</label>
                    <input
                      type="text"
                      required
                      placeholder="Nome e Cognome o Socio..."
                      value={quickBorrowPerson}
                      onChange={(e) => setQuickBorrowPerson(e.target.value)}
                      disabled={profile?.role !== 'admin'}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl text-xs font-semibold focus:ring-2 focus:ring-stone-950 outline-none disabled:bg-stone-100 disabled:text-stone-500 font-bold"
                    />
                    {profile?.role !== 'admin' && (
                      <p className="text-[9px] text-stone-400 mt-1">Inserito automaticamente con il tuo nome di profilo.</p>
                    )}
                  </div>

                  {/* Optional Notes */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 block">Note o Destinazione (Opzionale)</label>
                    <input
                      type="text"
                      placeholder="Es: Uscita Remenno, lezione scuola..."
                      value={quickBorrowNotes}
                      onChange={(e) => setQuickBorrowNotes(e.target.value)}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl text-xs font-semibold focus:ring-2 focus:ring-stone-950 outline-none"
                    />
                  </div>

                  {quickBorrowError && (
                    <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-2xl flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {quickBorrowError}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowQuickBorrowModal(false)}
                      className="flex-1 py-3 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl font-bold text-xs uppercase tracking-widest transition-colors cursor-pointer"
                    >
                      Annulla
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingQuickBorrow || quickBorrowEquipmentIds.length === 0}
                      className="flex-1 py-3 bg-stone-900 hover:bg-stone-850 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:bg-stone-400 cursor-pointer font-extrabold"
                    >
                      {isSubmittingQuickBorrow ? 'Caricamento...' : 'Invia Prelievo'}
                    </button>
                  </div>

                </form>

              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 5: CUSTOM RETURN FORM */}
      <AnimatePresence>
        {showReturnModal && returnItem && (
          <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] w-full max-w-md p-6 border-2 border-stone-300 shadow-2xl relative overflow-hidden text-stone-800"
            >
              
              <button 
                type="button"
                onClick={() => { setShowReturnModal(false); setReturnItem(null); }}
                className="absolute top-4 right-4 p-2 bg-stone-100 hover:bg-stone-200 text-stone-500 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="space-y-4">
                
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-500 border border-emerald-100">
                    <History className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h4 className="font-black text-stone-900 uppercase tracking-wider text-sm">
                      Fai Rientrare Attrezzatura
                    </h4>
                    <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">Registra il rientro a magazzino</p>
                  </div>
                </div>

                <div className="p-3 bg-stone-50 rounded-2xl border border-stone-150">
                  <div className="text-xs font-black text-stone-800 uppercase tracking-wide">{returnItem.name}</div>
                  <div className="text-[9px] font-bold text-stone-400 uppercase tracking-tight mt-0.5">{returnItem.category}</div>
                  {returnItem.serialNumber && (
                    <div className="text-[9px] font-mono text-stone-500 mt-0.5">S/N: {returnItem.serialNumber}</div>
                  )}
                </div>

                <form onSubmit={handleReturnSubmit} className="space-y-4 pt-2 border-t border-stone-100">
                  
                  {/* Select Condition / Status on Return */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 block">Stato dell'attrezzatura al rientro *</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setReturnCondition('available')}
                        className={`p-3 rounded-2xl border text-xs font-extrabold uppercase tracking-wider transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                          returnCondition === 'available'
                            ? 'bg-emerald-500 border-emerald-500 text-white font-extrabold'
                            : 'bg-stone-50 border-stone-200 text-stone-500 hover:border-stone-300'
                        }`}
                      >
                        <Check className="w-4 h-4 mx-auto" />
                        <span>Ottimo Stato</span>
                        <span className="text-[8px] font-normal tracking-wide normal-case mt-0.5">Pronta per altri prestiti</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setReturnCondition('maintenance')}
                        className={`p-3 rounded-2xl border text-xs font-extrabold uppercase tracking-wider transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                          returnCondition === 'maintenance'
                            ? 'bg-amber-500 border-amber-500 text-white font-extrabold'
                            : 'bg-stone-50 border-stone-200 text-stone-500 hover:border-stone-300'
                        }`}
                      >
                        <Wrench className="w-4 h-4 mx-auto" />
                        <span>Manutenzione</span>
                        <span className="text-[8px] font-normal tracking-wide normal-case mt-0.5">Segnala problemi o guasti</span>
                      </button>
                    </div>
                  </div>

                  {/* Notes / Condition details */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 block">Note e Condizioni al rientro (Opzionale)</label>
                    <textarea
                      placeholder="Es: Corda pulita, sacca intonsa, segnalo usura capocorda..."
                      value={returnNotes}
                      onChange={(e) => setReturnNotes(e.target.value)}
                      rows={3}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl text-xs font-semibold focus:ring-2 focus:ring-stone-950 outline-none resize-none text-stone-850"
                    />
                  </div>

                  {returnError && (
                    <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-2xl flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {returnError}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => { setShowReturnModal(false); setReturnItem(null); }}
                      className="flex-1 py-3 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl font-bold text-xs uppercase tracking-widest transition-colors cursor-pointer"
                    >
                      Annulla
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingReturn}
                      className="flex-1 py-3 bg-stone-900 hover:bg-stone-850 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:bg-stone-400 cursor-pointer font-extrabold"
                    >
                      {isSubmittingReturn ? 'Caricamento...' : 'Accetta Rientro'}
                    </button>
                  </div>

                </form>

              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
