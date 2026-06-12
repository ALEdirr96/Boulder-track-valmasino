import React, { useState, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Users, 
  Wrench, Check, Trash2, Clock, MapPin, Loader2, CalendarDays, KeyRound,
  X, AlertCircle, Sparkles, AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc,
  deleteDoc, 
  doc, 
  updateDoc,
  setDoc,
  orderBy,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { db } from '../firebase';
import { logActivity } from '../lib/logger';
import { CalendarEvent, EquipmentBooking, UserProfile } from '../types';

interface CalendarViewProps {
  profile: UserProfile;
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
  };
}

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null, userId: string) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: userId,
    },
    operationType,
    path
  };
  console.error('Firestore Error in Calendar: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
};

interface EquipmentItem {
  id: string;
  name: string;
  category: string;
  status: 'available' | 'borrowed' | 'maintenance';
}

export const CalendarView: React.FC<CalendarViewProps> = ({ profile }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  // Data lists
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [bookings, setBookings] = useState<EquipmentBooking[]>([]);
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>([]);
  
  const [loading, setLoading] = useState(true);
  
  // Modals / forms
  const [showEventModal, setShowEventModal] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  
  // Event Form State
  const [eventTitle, setEventTitle] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [eventTime, setEventTime] = useState('09:00');
  const [eventType, setEventType] = useState<'cleaning_day' | 'general' | 'gathering' | 'meeting'>('cleaning_day');
  const [eventLocation, setEventLocation] = useState('');
  const [submittingEvent, setSubmittingEvent] = useState(false);

  // Booking Form State
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('');
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);
  const [bookingStartDate, setBookingStartDate] = useState('');
  const [bookingEndDate, setBookingEndDate] = useState('');
  const [submittingBooking, setSubmittingBooking] = useState(false);

  // Alert State
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Handle quick float button event additions
  useEffect(() => {
    const handleAddClick = () => {
      setShowEventModal(true);
    };
    window.addEventListener('app-add-calendar-event', handleAddClick);
    return () => {
      window.removeEventListener('app-add-calendar-event', handleAddClick);
    };
  }, []);

  // Load calendar events
  useEffect(() => {
    setLoading(true);
    const qEvents = query(collection(db, 'events'));
    const unsubscribeEvents = onSnapshot(qEvents, (snapshot) => {
      const evList: CalendarEvent[] = [];
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        evList.push({
          id: docSnap.id,
          title: d.title || '',
          description: d.description || '',
          date: d.date || '',
          time: d.time || '',
          type: d.type || 'cleaning_day',
          location: d.location || '',
          createdBy: d.createdBy || '',
          createdByDisplayName: d.createdByDisplayName || '',
          participants: d.participants || [],
          createdAt: d.createdAt
        });
      });
      setEvents(evList);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'events', profile.uid);
    });

    return () => unsubscribeEvents();
  }, [profile.uid]);

  // Load equipment bookings
  useEffect(() => {
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
      handleFirestoreError(error, OperationType.GET, 'equipment_bookings', profile.uid);
    });

    return () => unsubscribeBookings();
  }, [profile.uid]);

  // Load equipment list for dropdown
  useEffect(() => {
    const qEquip = query(collection(db, 'equipment'));
    const unsubscribeEquip = onSnapshot(qEquip, (snapshot) => {
      const eqList: EquipmentItem[] = [];
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        eqList.push({
          id: docSnap.id,
          name: d.name || '',
          category: d.category || '',
          status: d.status || 'available'
        });
      });
      setEquipmentList(eqList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'equipment', profile.uid);
    });

    return () => unsubscribeEquip();
  }, [profile.uid]);

  // Temporal Auto-Dismiss Alert
  useEffect(() => {
    if (alertMsg) {
      const timer = setTimeout(() => {
        setAlertMsg(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [alertMsg]);

  // Calendar Logic
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    // 0 = Sunday, 1 = Monday, etc. Let's make 0 = Monday in Italy!
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1; 
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = getDaysInMonth(year, month);
  const firstDayIndex = getFirstDayOfMonth(year, month);

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const formatDateString = (dt: Date) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const selectedDateStr = formatDateString(selectedDate);

  // Month Names in Italian
  const monthNames = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
  ];

  // Days of week
  const weekDays = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

  // Group events/bookings by date
  const selectedDayEvents = events.filter(e => e.date === selectedDateStr);
  const selectedDayBookings = bookings.filter(b => {
    // A booking spans from startDate to endDate inclusive
    return selectedDateStr >= b.startDate && selectedDateStr <= b.endDate && b.status !== 'cancelled';
  });

  // Action: Add Event (Cleaning day / social)
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim() || !eventDesc.trim() || !eventLocation.trim()) {
      setAlertMsg({ type: 'error', text: 'Tutti i campi sono obbligatori.' });
      return;
    }

    setSubmittingEvent(true);
    const formattedDate = formatDateString(selectedDate);

    try {
      const eventData = {
        title: eventTitle.trim(),
        description: eventDesc.trim(),
        date: formattedDate,
        time: eventTime,
        type: eventType,
        location: eventLocation.trim(),
        createdBy: profile.uid,
        createdByDisplayName: profile.displayName || '',
        participants: [profile.uid], // Creator is the first participant
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'events'), eventData);
      
      await logActivity(
        `Nuovo evento calendario: "${eventTitle.trim()}" in data ${formattedDate}`,
        'user',
        profile
      );

      setAlertMsg({ type: 'success', text: 'Evento creato con successo!' });
      
      // Reset form & state
      setEventTitle('');
      setEventDesc('');
      setEventTime('09:00');
      setEventType('cleaning_day');
      setEventLocation('');
      setShowEventModal(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'events', profile.uid);
      setAlertMsg({ type: 'error', text: 'Errore durante la creazione dell\'evento.' });
    } finally {
      setSubmittingEvent(false);
    }
  };

  // Action: Join or Leave Event
  const toggleParticipation = async (event: CalendarEvent) => {
    const isParticipating = event.participants.includes(profile.uid);
    const eventRef = doc(db, 'events', event.id);

    try {
      if (isParticipating) {
        // Remove from participation array
        await updateDoc(eventRef, {
          participants: arrayRemove(profile.uid)
        });
        await logActivity(
          `Disiscritto da evento: "${event.title}" del ${event.date}`,
          'user',
          profile
        );
        setAlertMsg({ type: 'success', text: 'Ti sei disiscritto dall\'evento.' });
      } else {
        // Add to participation array
        await updateDoc(eventRef, {
          participants: arrayUnion(profile.uid)
        });
        await logActivity(
          `Iscritto a evento di pulizia/gruppo: "${event.title}" del ${event.date}`,
          'user',
          profile
        );
        setAlertMsg({ type: 'success', text: 'Grande! Ti sei iscritto all\'evento!' });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `events/${event.id}`, profile.uid);
      setAlertMsg({ type: 'error', text: 'Errore nell\'aggiornare la partecipazione.' });
    }
  };

  // Action: Create Equipment Booking
  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEquipmentIds.length === 0) {
      setAlertMsg({ type: 'error', text: 'Seleziona almeno un attrezzo.' });
      return;
    }
    if (!bookingStartDate || !bookingEndDate) {
      setAlertMsg({ type: 'error', text: 'Seleziona date valide.' });
      return;
    }

    if (bookingStartDate > bookingEndDate) {
      setAlertMsg({ type: 'error', text: 'La data di fine non può antecedere quella di inizio.' });
      return;
    }

    setSubmittingBooking(true);

    // Validate all chosen equipment (maintenance & overlap)
    const maintenanceNames: string[] = [];
    const overlappingNames: string[] = [];

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
      setAlertMsg({ type: 'error', text: `I seguenti attrezzi sono in manutenzione: ${maintenanceNames.join(', ')}` });
      setSubmittingBooking(false);
      return;
    }

    if (overlappingNames.length > 0) {
      setAlertMsg({ type: 'error', text: `I seguenti attrezzi sono già prenotati nelle date selezionate: ${overlappingNames.join(', ')}` });
      setSubmittingBooking(false);
      return;
    }

    try {
      for (const id of selectedEquipmentIds) {
        const selectedEquip = equipmentList.find(eq => eq.id === id);
        if (!selectedEquip) continue;

        const bookingData = {
          equipmentId: id,
          equipmentName: selectedEquip.name,
          userId: profile.uid,
          userDisplayName: profile.displayName || profile.email || 'Membro ASD',
          startDate: bookingStartDate,
          endDate: bookingEndDate,
          status: 'approved', // Automatically approved for members
          createdAt: serverTimestamp()
        };

        await addDoc(collection(db, 'equipment_bookings'), bookingData);

        // Log activity
        await logActivity(
          `Prenotazione attrezzatura "${selectedEquip.name}" dal ${bookingStartDate} al ${bookingEndDate}`,
          'equipment',
          profile
        );
      }

      setAlertMsg({ type: 'success', text: 'Attrezzatura/e riservata/e con successo!' });
      
      // Reset form
      setSelectedEquipmentIds([]);
      setBookingStartDate('');
      setBookingEndDate('');
      setShowBookingModal(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'equipment_bookings', profile.uid);
      setAlertMsg({ type: 'error', text: 'Impossibile completare la prenotazione.' });
    } finally {
      setSubmittingBooking(false);
    }
  };

  // Action: Cancel Booking (by Owner or Admin)
  const handleCancelBooking = async (bookingId: string, equipName: string) => {
    const bookingRef = doc(db, 'equipment_bookings', bookingId);
    try {
      await deleteDoc(bookingRef);
      await logActivity(
        `Eliminata o cancellata prenotazione di: "${equipName}"`,
        'equipment',
        profile
      );
      setAlertMsg({ type: 'success', text: 'Prenotazione eliminata con successo.' });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `equipment_bookings/${bookingId}`, profile.uid);
      setAlertMsg({ type: 'error', text: 'Errore nell\'eliminazione della prenotazione.' });
    }
  };

  // Action: Delete Event (by Creator or Admin)
  const handleDeleteEvent = async (eventId: string, title: string) => {
    const eventRef = doc(db, 'events', eventId);
    try {
      await deleteDoc(eventRef);
      await logActivity(
        `Cancellato evento calendario: "${title}"`,
        'user',
        profile
      );
      setAlertMsg({ type: 'success', text: 'Evento cancellato.' });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `events/${eventId}`, profile.uid);
      setAlertMsg({ type: 'error', text: 'Errore nella cancellazione dell\'evento.' });
    }
  };

  // Helper: check if a specific day has events or bookings
  const getDayClassesAndDots = (dayNum: number) => {
    const checkDate = new Date(year, month, dayNum);
    const checkStr = formatDateString(checkDate);
    
    const dayEvents = events.filter(e => e.date === checkStr);
    const dayBookings = bookings.filter(b => checkStr >= b.startDate && checkStr <= b.endDate && b.status !== 'cancelled');

    const hasCleaning = dayEvents.some(e => e.type === 'cleaning_day');
    const hasOtherEvent = dayEvents.some(e => e.type !== 'cleaning_day');
    const hasBooking = dayBookings.length > 0;

    return {
      hasCleaning,
      hasOtherEvent,
      hasBooking
    };
  };

  // Render Calendar Matrix Grid Cells
  const renderCalendarCells = () => {
    const cells = [];
    const todayStr = formatDateString(new Date());

    // Empty spaces for padding
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push(
        <div key={`empty-${i}`} className="h-12 bg-transparent border border-stone-800/20" />
      );
    }

    // Days numbers
    for (let day = 1; day <= daysInMonth; day++) {
      const checkDate = new Date(year, month, day);
      const checkStr = formatDateString(checkDate);
      const isSelected = checkStr === selectedDateStr;
      const isToday = checkStr === todayStr;

      const { hasCleaning, hasOtherEvent, hasBooking } = getDayClassesAndDots(day);

      cells.push(
        <button
          key={`day-${day}`}
          onClick={() => setSelectedDate(checkDate)}
          className={`h-12 flex flex-col items-center justify-between p-1.5 border transition-all cursor-pointer relative ${
            isSelected 
              ? 'bg-emerald-600 border-emerald-500 text-white rounded-xl shadow-md z-10' 
              : isToday 
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 font-black' 
                : 'bg-stone-800/30 border-stone-800/40 text-stone-300 hover:bg-stone-850'
          }`}
        >
          <span className="text-xs font-bold font-mono">{day}</span>
          
          <div className="flex gap-1 justify-center w-full mt-0.5">
            {hasCleaning && (
              <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-emerald-500 animate-pulse'}`} />
            )}
            {hasOtherEvent && (
              <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-400'}`} />
            )}
            {hasBooking && (
              <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-amber-500'}`} />
            )}
          </div>
        </button>
      );
    }    return cells;
  };

  const todayStr = formatDateString(new Date());

  const upcomingEvents = [...events]
    .filter(e => e.date >= todayStr)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    });

  const myUpcomingBookings = bookings.filter(b => 
    b.userId === profile.uid && b.endDate >= todayStr && b.status !== 'cancelled'
  );

  const upcomingCleaningDaysCount = upcomingEvents.filter(e => e.type === 'cleaning_day').length;

  const getFriendlyEventDate = (dateStr: string) => {
    if (dateStr === todayStr) return 'Oggi';
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomStr = formatDateString(tomorrow);
    if (dateStr === tomStr) return 'Domani';

    const [y, m, d] = dateStr.split('-');
    const mIdx = parseInt(m, 10) - 1;
    const monthsAbbr = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    return `${parseInt(d, 10)} ${monthsAbbr[mIdx] || m}`;
  };

  return (
    <div className="flex flex-col h-full bg-stone-900 text-white pb-6 overflow-y-auto">
      {/* HEADER SECTION */}
      <header className="p-4 bg-stone-900 border-b border-stone-800/80 sticky top-0 z-20" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[9px] font-black tracking-widest text-emerald-505 uppercase">Val Masino Climbing ASD</span>
            <h2 className="text-xl font-black uppercase tracking-tighter italic flex items-center gap-1.5">
              <CalendarIcon className="w-5 h-5 text-emerald-500" /> Calendario Sociale
            </h2>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setBookingStartDate(selectedDateStr);
                setBookingEndDate(selectedDateStr);
                setSelectedEquipmentIds([]);
                setShowBookingModal(true);
              }}
              className="px-3 py-2 bg-stone-800 border-2 border-stone-700 hover:border-emerald-500 rounded-xl text-[9px] tracking-wider font-extrabold uppercase transition-all flex items-center gap-1 cursor-pointer"
            >
              <Wrench className="w-3.5 h-3.5 text-emerald-400" /> Riserva
            </button>
            <button
              onClick={() => setShowEventModal(true)}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-[9px] tracking-wider font-extrabold uppercase transition-all flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Nuovo Evento
            </button>
          </div>
        </div>
      </header>

      {/* FEEDBACK SUCCESS/ERROR POPUP */}
      <AnimatePresence>
        {alertMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`mx-6 mt-4 p-3.5 rounded-2xl border flex items-center gap-3 shadow-lg ${
              alertMsg.type === 'success' 
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400' 
                : 'bg-red-950/20 border-red-500/30 text-red-400'
            }`}
          >
            {alertMsg.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span className="text-[10px] font-bold uppercase tracking-wider">{alertMsg.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* RIEPILOGO IMPEGNI IN ALTO */}
      <div className="px-6 pt-5 pb-0.5 space-y-4">
        <div className="bg-gradient-to-r from-stone-900 via-stone-850/60 to-stone-900 border border-stone-800 rounded-3xl p-5 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div>
              <span className="text-[8px] font-black tracking-widest text-emerald-500 uppercase">Overview</span>
              <h3 className="text-md font-black text-white uppercase italic tracking-tighter flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-500" /> Riepilogo Impegni e Attività
              </h3>
              <p className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider">Un colpo d'occhio sulle attività programmate nel club</p>
            </div>

            {/* Micro Stats Row */}
            <div className="flex gap-4">
              <div className="bg-stone-850/60 border border-stone-800 px-3.5 py-1.5 rounded-2xl flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <div className="text-left">
                  <p className="text-[8px] font-bold text-stone-500 uppercase leading-none">In programma</p>
                  <p className="text-xs font-black text-stone-200 mt-0.5">{upcomingEvents.length}</p>
                </div>
              </div>

              <div className="bg-stone-850/60 border border-stone-800 px-3.5 py-1.5 rounded-2xl flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <div className="text-left">
                  <p className="text-[8px] font-bold text-stone-500 uppercase leading-none">I miei prestiti</p>
                  <p className="text-xs font-black text-stone-200 mt-0.5">{myUpcomingBookings.length}</p>
                </div>
              </div>

              <div className="bg-stone-850/60 border border-stone-800 px-3.5 py-1.5 rounded-2xl flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <div className="text-left">
                  <p className="text-[8px] font-bold text-stone-500 uppercase leading-none">Pulizie Massi</p>
                  <p className="text-xs font-black text-stone-200 mt-0.5">{upcomingCleaningDaysCount}</p>
                </div>
              </div>
            </div>
          </div>

          {upcomingEvents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {upcomingEvents.slice(0, 3).map(ev => {
                const isAttendee = ev.participants.includes(profile.uid);
                const friendlyDate = getFriendlyEventDate(ev.date);
                const isCleaning = ev.type === 'cleaning_day';

                return (
                  <div
                    key={ev.id}
                    onClick={() => {
                      const [y, m, d] = ev.date.split('-');
                      const targetDate = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
                      setSelectedDate(targetDate);
                      setCurrentDate(new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1));
                    }}
                    className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all hover:scale-[1.01] flex flex-col justify-between group active:scale-[0.99] ${
                      isCleaning 
                        ? 'bg-emerald-950/15 border-emerald-500/20 hover:border-emerald-500/40' 
                        : 'bg-stone-800/40 border-stone-800/80 hover:border-stone-700/80'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className={`px-1.5 py-0.5 text-[7px] font-extrabold uppercase tracking-wider rounded-md ${
                          isCleaning ? 'bg-emerald-500/20 text-emerald-400' : 'bg-stone-700 text-stone-300'
                        }`}>
                          {isCleaning ? '🧹 Pulizia Massi' : '🤝 Evento/Sociale'}
                        </span>
                        
                        <div className="flex items-center gap-1 bg-stone-900/60 px-2 py-0.5 rounded-full border border-stone-800/50">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span className="text-[8.5px] font-extrabold tracking-wide text-stone-200">{friendlyDate}</span>
                        </div>
                      </div>

                      <h4 className="text-[12.5px] font-black uppercase text-stone-100 group-hover:text-emerald-400 transition-colors line-clamp-1 leading-tight">{ev.title}</h4>
                      <p className="text-[9px] text-stone-400 font-bold uppercase tracking-wide line-clamp-1 mt-0.5">{ev.description}</p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-stone-800/30 flex items-center justify-between text-[8px] font-extrabold uppercase tracking-wider">
                      <div className="flex items-center gap-1.5 text-stone-400">
                        <Clock className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span>{ev.time}</span>
                        <span className="text-stone-600">|</span>
                        <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                        <span className="max-w-[70px] truncate">{ev.location}</span>
                      </div>

                      <div className="flex items-center gap-1">
                        {isAttendee ? (
                          <span className="text-[8px] font-black text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md border border-emerald-500/20 flex items-center gap-0.5 shrink-0 animate-none">
                            <Check className="w-2.5 h-2.5" /> Tu partecipi
                          </span>
                        ) : (
                          <span className="text-[8px] font-medium text-stone-400 bg-stone-800 px-1.5 py-0.5 rounded-md">
                            {ev.participants.length} iscritti
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-6 flex flex-col items-center justify-center text-center text-stone-500 border border-dashed border-stone-800 rounded-2xl">
              <CalendarDays className="w-6 h-6 text-stone-750 mb-1" />
              <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">Nessun impegno pianificato per i prossimi giorni</p>
            </div>
          )}
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* MONTH VIEW CALENDAR CARD (lg:col-span-7) */}
        <div className="lg:col-span-7 bg-stone-850/40 border border-stone-800 rounded-[2rem] p-5 shadow-inner">
          <div className="flex items-center justify-between mb-4 px-2">
            <span className="text-sm font-black uppercase italic tracking-tighter text-emerald-400">
              {monthNames[month]} {year}
            </span>
            <div className="flex items-center gap-1.5">
              <button 
                onClick={prevMonth}
                className="p-2 transition-transform active:scale-90 bg-stone-800 rounded-xl hover:bg-stone-700"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setCurrentDate(new Date());
                  setSelectedDate(new Date());
                }}
                className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest bg-stone-800 hover:bg-stone-700 rounded-xl"
              >
                Oggi
              </button>
              <button 
                onClick={nextMonth}
                className="p-2 transition-transform active:scale-90 bg-stone-800 rounded-xl hover:bg-stone-700"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* WEEK DAYS LABELS */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {weekDays.map(dayLabel => (
              <div key={dayLabel} className="text-[9px] font-black tracking-widest uppercase text-stone-500 py-1.5">
                {dayLabel}
              </div>
            ))}
          </div>

          {/* GRID OF DAYS */}
          <div className="grid grid-cols-7 gap-1">
            {renderCalendarCells()}
          </div>

          <div className="mt-4 flex items-center justify-between bg-stone-900/40 p-3 rounded-2xl border border-stone-800/50">
            <span className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Legenda</span>
            <div className="flex gap-4">
              <div className="flex items-center gap-1 text-[9px] font-bold text-stone-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Pulizia Massi
              </div>
              <div className="flex items-center gap-1 text-[9px] font-bold text-stone-400">
                <span className="w-2 h-2 rounded-full bg-blue-400" /> Altro Evento
              </div>
              <div className="flex items-center gap-1 text-[9px] font-bold text-stone-400">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> Prenotazione
              </div>
            </div>
          </div>
        </div>

        {/* DETAILS PANEL (lg:col-span-5) */}
        <div className="lg:col-span-5 flex flex-col space-y-4">
          <div className="bg-stone-850/40 border border-stone-800 rounded-[2.2rem] p-6 space-y-4 shadow-sm relative flex-1">
            <div className="border-b border-stone-800 pb-3 flex items-center justify-between">
              <div>
                <span className="text-[8px] font-black text-stone-500 uppercase tracking-widest block">Eventi e Prenotazioni per</span>
                <span className="text-md font-black italic uppercase text-emerald-400 font-mono">
                  {selectedDate.getDate()} {monthNames[month]} {year}
                </span>
              </div>
              <span className="px-2 py-0.5 bg-stone-800 text-[10px] uppercase font-bold text-stone-400 rounded-lg">
                {selectedDateStr}
              </span>
            </div>

            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center text-stone-500">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-2" />
                <span className="text-[9px] tracking-widest font-black uppercase">Sincronizzazione in corso...</span>
              </div>
            ) : selectedDayEvents.length === 0 && selectedDayBookings.length === 0 ? (
              <div className="py-20 flex flex-col items-center text-center text-stone-600 px-6">
                <CalendarDays className="w-10 h-10 text-stone-800 mb-2" />
                <h4 className="text-xs font-black uppercase tracking-tight text-stone-500 mb-1">Nessuna attività programmata</h4>
                <p className="text-[10px] font-bold text-stone-650 max-w-xs leading-relaxed uppercase tracking-wider">
                  Usa i pulsanti in alto per pianificare una pulizia di gruppo o per prenotare crashpad e strumenti dell'associazione.
                </p>
              </div>
            ) : (
              <div className="space-y-4 pb-2 max-h-[460px] overflow-y-auto">
                {/* 1. EVENTS SECTION LIST */}
                {selectedDayEvents.map(ev => {
                  const isCreator = ev.createdBy === profile.uid;
                  const isAttendee = ev.participants.includes(profile.uid);

                  return (
                    <div 
                      key={ev.id} 
                      className={`p-4 rounded-3xl border transition-all ${
                        ev.type === 'cleaning_day' 
                          ? 'bg-emerald-950/10 border-emerald-500/20 hover:border-emerald-500/40' 
                          : 'bg-stone-800/40 border-stone-800/80 hover:border-stone-700/80'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-widest rounded-md ${
                            ev.type === 'cleaning_day' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-stone-750 text-stone-400'
                          }`}>
                            {ev.type === 'cleaning_day' ? '🧹 Pulizia Di Gruppo' : (ev.type === 'meeting' || ev.type === 'gathering') ? '🤝 Riunione' : '📢 Evento'}
                          </span>
                          <h4 className="text-sm font-black uppercase mt-1.5 text-stone-100">{ev.title}</h4>
                        </div>
                        
                        {(isCreator || profile.role === 'admin') && (
                          <button
                            onClick={() => handleDeleteEvent(ev.id, ev.title)}
                            className="p-1.5 text-stone-500 hover:text-red-500 transition-colors bg-stone-900/30 hover:bg-stone-900 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <p className="text-[10px] text-stone-400 leading-relaxed font-bold uppercase tracking-wide mb-3">
                        {ev.description}
                      </p>

                      <div className="grid grid-cols-2 gap-2 text-[9px] text-stone-400 border-t border-stone-800/40 pt-2.5 mb-3">
                        <div className="flex items-center gap-1 font-bold">
                          <Clock className="w-3.5 h-3.5 text-emerald-500" /> Ore {ev.time}
                        </div>
                        <div className="flex items-center gap-1 font-bold truncate">
                          <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> {ev.location}
                        </div>
                      </div>

                      {/* Attendee indicators */}
                      <div className="flex items-center justify-between bg-stone-900/50 p-2 border border-stone-800/40 rounded-2xl">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-stone-400" />
                          <span className="text-[9px] font-black uppercase text-stone-400 tracking-wider">
                            Partecipanti: {ev.participants.length}
                          </span>
                        </div>

                        <button
                          onClick={() => toggleParticipation(ev)}
                          className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                            isAttendee 
                              ? 'bg-red-500/10 hover:bg-red-500/25 text-red-400 border border-red-500/25' 
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          }`}
                        >
                          {isAttendee ? 'Abbandona' : 'Partecipa'}
                        </button>
                      </div>
                      
                      <div className="text-[8px] font-extrabold text-stone-600 uppercase tracking-widest mt-2 block-right">
                        Creato da: {ev.createdByDisplayName || 'Membro ASD'}
                      </div>
                    </div>
                  );
                })}

                {/* 2. BOOKINGS SECTION LIST */}
                {selectedDayBookings.map(book => {
                  const isBookingOwner = book.userId === profile.uid;

                  return (
                    <div 
                      key={book.id} 
                      className="p-4 bg-amber-950/5 border border-amber-500/20 hover:border-amber-500/40 rounded-3xl transition-all"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-[8px] font-black uppercase tracking-widest rounded-md">
                            📦 Prenotazione Attrezzatura
                          </span>
                          <h4 className="text-sm font-black uppercase mt-1.5 text-stone-150">{book.equipmentName}</h4>
                        </div>
                        
                        {(isBookingOwner || profile.role === 'admin') && (
                          <button
                            onClick={() => handleCancelBooking(book.id, book.equipmentName)}
                            className="p-1.5 text-stone-500 hover:text-red-500 transition-colors bg-stone-900/30 hover:bg-stone-900 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <p className="text-[9px] text-stone-400 font-bold uppercase tracking-wider mb-2">
                        Riservato da: <span className="text-amber-400 italic">{book.userDisplayName}</span>
                      </p>

                      <div className="text-[8px] text-amber-500/80 font-black tracking-widest uppercase">
                        Periodo: Dal {book.startDate} Al {book.endDate}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL: ADD EVENT */}
      <AnimatePresence>
        {showEventModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-stone-900 border border-stone-800 rounded-[2.5rem] w-full max-w-md p-6 relative shadow-2xl"
            >
              <button 
                onClick={() => setShowEventModal(false)}
                className="p-2 absolute right-4 top-4 text-stone-400 hover:text-white rounded-full bg-stone-800"
              >
                <X className="w-4 h-4" />
              </button>

              <h3 className="text-md font-black uppercase tracking-tighter italic border-b border-stone-800 pb-3 mb-4 flex items-center gap-2 text-emerald-400">
                <Sparkles className="w-5 h-5" /> Nuovo Evento ASD
              </h3>

              <form onSubmit={handleCreateEvent} className="space-y-4">
                <div>
                  <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest block mb-1">Tipo Di Evento</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'cleaning_day', label: '🧹 Pulizia' },
                      { value: 'meeting', label: '🤝 Riunione' },
                      { value: 'general', label: '📢 Sociale' }
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEventType(opt.value as any)}
                        className={`py-2 px-1 rounded-xl text-[9px] font-bold uppercase text-center border-2 transition-all cursor-pointer ${
                          eventType === opt.value 
                            ? 'bg-emerald-600/20 border-emerald-500 text-white' 
                            : 'bg-stone-800/40 border-transparent text-stone-400'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Titolo Evento</label>
                  <input
                    type="text"
                    required
                    placeholder="Es: Pulizia Massi Sasso Remenno"
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    maxLength={100}
                    className="w-full p-3 bg-stone-850 border border-stone-800 rounded-xl text-xs font-bold outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Data Selezionata</label>
                  <input
                    type="text"
                    disabled
                    value={selectedDateStr}
                    className="w-full p-3 bg-stone-800/50 border border-stone-800 text-stone-500 rounded-xl text-xs font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Ora Ritrovo</label>
                    <input
                      type="time"
                      required
                      value={eventTime}
                      onChange={(e) => setEventTime(e.target.value)}
                      className="w-full p-3 bg-stone-850 border border-stone-800 rounded-xl text-xs font-bold outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Punto Ritrovo (Location)</label>
                    <input
                      type="text"
                      required
                      placeholder="Es: Parcheggio Centro"
                      value={eventLocation}
                      onChange={(e) => setEventLocation(e.target.value)}
                      maxLength={120}
                      className="w-full p-3 bg-stone-850 border border-stone-800 rounded-xl text-xs font-bold outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Informazioni / Note</label>
                  <textarea
                    required
                    placeholder="Es: Portare cesoie, spazzole in acciaio e crashpad..."
                    value={eventDesc}
                    onChange={(e) => setEventDesc(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    className="w-full p-3 bg-stone-850 border border-stone-800 rounded-xl text-xs font-bold outline-none focus:border-emerald-500 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingEvent}
                  className="w-full mt-2 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest italic rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {submittingEvent ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Pubblica Evento
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: BOOK EQUIPMENT */}
      <AnimatePresence>
        {showBookingModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-stone-900 border border-stone-800 rounded-[2.5rem] w-full max-w-md p-6 relative shadow-2xl"
            >
              <button 
                onClick={() => setShowBookingModal(false)}
                className="p-2 absolute right-4 top-4 text-stone-400 hover:text-white rounded-full bg-stone-800"
              >
                <X className="w-4 h-4" />
              </button>

              <h3 className="text-md font-black uppercase tracking-tighter italic border-b border-stone-800 pb-3 mb-4 flex items-center gap-2 text-amber-400">
                <Wrench className="w-5 h-5" /> Riserva Attrezzatura ASD
              </h3>

              {equipmentList.length === 0 ? (
                <div className="py-6 text-center text-stone-500">
                  <AlertTriangle className="w-8 h-8 text-amber-500/80 mx-auto mb-2" />
                  <p className="text-[10px] uppercase font-bold">Nessuna attrezzatura nel registro dell'associazione.</p>
                </div>
              ) : (
                <form onSubmit={handleCreateBooking} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest block">Seleziona Attrezzatura/e</label>
                    <div className="max-h-40 overflow-y-auto border border-stone-800 p-3 rounded-xl bg-stone-850 space-y-1.5">
                      {equipmentList.map(eq => {
                        const isMaintenance = eq.status === 'maintenance';
                        return (
                          <label key={eq.id} className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs font-semibold ${isMaintenance ? 'opacity-50 select-none' : 'hover:bg-stone-800 cursor-pointer text-white'}`}>
                            <input
                              type="checkbox"
                              disabled={isMaintenance}
                              checked={selectedEquipmentIds.includes(eq.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedEquipmentIds(prev => [...prev, eq.id]);
                                } else {
                                  setSelectedEquipmentIds(prev => prev.filter(id => id !== eq.id));
                                }
                              }}
                              className="rounded border-stone-700 text-amber-500 focus:ring-amber-500 bg-stone-900 w-4 h-4 cursor-pointer"
                            />
                            <span className="flex-1 select-none text-stone-200">
                              {eq.name} <span className="text-[9px] text-stone-500 font-bold uppercase font-mono">({eq.category})</span>
                            </span>
                            {isMaintenance && <span className="text-[9px] text-red-500 font-extrabold uppercase font-mono">[IN MANUTENZIONE]</span>}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Dal (Data Inizio)</label>
                      <input
                        type="date"
                        required
                        value={bookingStartDate}
                        onChange={(e) => setBookingStartDate(e.target.value)}
                        className="w-full p-3 bg-stone-850 border border-stone-800 rounded-xl text-xs font-mono outline-none focus:border-amber-500 text-white cursor-pointer"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Al (Data Fine)</label>
                      <input
                        type="date"
                        required
                        value={bookingEndDate}
                        onChange={(e) => setBookingEndDate(e.target.value)}
                        className="w-full p-3 bg-stone-850 border border-stone-800 rounded-xl text-xs font-mono outline-none focus:border-amber-500 text-white cursor-pointer"
                      />
                    </div>
                  </div>

                  <p className="text-[8px] bg-stone-900 border border-stone-800 p-3 rounded-xl text-stone-400 font-bold uppercase tracking-wide leading-relaxed">
                    Nota: Gli operatori ASD verificano periodicamente lo stato e la disponibilità fisica. Restituisci l'attrezzatura pulita e in ottime condizioni per i blocchi successivi!
                  </p>

                  <button
                    type="submit"
                    disabled={submittingBooking}
                    className="w-full mt-2 py-3.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-[10px] uppercase tracking-widest italic rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {submittingBooking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Conferma Prenotazione
                  </button>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
