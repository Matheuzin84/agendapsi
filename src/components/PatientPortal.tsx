import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  Timestamp, 
  orderBy,
  getDocs
} from 'firebase/firestore';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Video, 
  MapPin, 
  Plus, 
  User as UserIcon,
  LogOut,
  ChevronRight,
  Package,
  History,
  CheckCircle2,
  CalendarCheck
} from 'lucide-react';
import { format, parseISO, isAfter, isBefore, addHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { db } from '../firebase';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface PatientPortalProps {
  user: any;
  profile: any;
  onLogout: () => void;
}

export default function PatientPortal({ user, profile, onLogout }: PatientPortalProps) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'appointments' | 'profile'>('appointments');
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile.patientId) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'sessions'), 
      where('patientId', '==', profile.patientId),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSessions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    return unsubscribe;
  }, [profile.patientId]);

  if (!profile.patientId) {
    return <PatientRegistration user={user} profile={profile} />;
  }

  const upcomingSessions = sessions.filter(s => isAfter(parseISO(s.date), new Date()) || (s.date === format(new Date(), 'yyyy-MM-dd') && s.status !== 'cancelled' && s.status !== 'completed'));
  const pastSessions = sessions.filter(s => isBefore(parseISO(s.date), new Date()) || s.status === 'completed' || s.status === 'cancelled');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* Navbar */}
      <nav className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold italic">
              P
            </div>
            <span className="font-bold text-slate-800 dark:text-white hidden sm:inline">Portal do Paciente</span>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={onLogout}
              className="p-2 text-slate-500 hover:text-red-500 transition-colors"
              title="Sair"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Olá, {profile.name}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Bem-vindo à sua área de acompanhamento terapêutico.
          </p>
        </header>

        {/* Action Button */}
        <button 
          onClick={() => setIsBookingModalOpen(true)}
          className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-2xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all active:scale-95"
        >
          <CalendarCheck size={20} />
          Agendar Nova Consulta
        </button>

        {/* Content Tabs */}
        <div className="space-y-4">
          <div className="flex items-center gap-4 border-b border-slate-200 dark:border-slate-800">
            <button 
              onClick={() => setActiveTab('appointments')}
              className={cn(
                "pb-2 text-sm font-bold transition-all border-b-2",
                activeTab === 'appointments' ? "text-primary border-primary" : "text-slate-400 border-transparent"
              )}
            >
              Meus Agendamentos
            </button>
            <button 
              onClick={() => setActiveTab('profile')}
              className={cn(
                "pb-2 text-sm font-bold transition-all border-b-2",
                activeTab === 'profile' ? "text-primary border-primary" : "text-slate-400 border-transparent"
              )}
            >
              Meu Perfil
            </button>
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'appointments' ? (
              <motion.div 
                key="appointments"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Upcoming */}
                <section className="space-y-3">
                  <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Clock size={14} /> Próximas Sessões
                  </h2>
                  <div className="grid gap-3">
                    {upcomingSessions.length > 0 ? upcomingSessions.map(session => (
                      <AppointmentCard key={session.id} session={session} isUpcoming />
                    )) : (
                      <EmptyState message="Você não tem sessões agendadas." />
                    )}
                  </div>
                </section>

                {/* Past */}
                <section className="space-y-3">
                  <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <History size={14} /> Histórico
                  </h2>
                  <div className="grid gap-3 opacity-80 scale-[0.98]">
                    {pastSessions.slice(0, 5).map(session => (
                      <AppointmentCard key={session.id} session={session} />
                    ))}
                  </div>
                </section>
              </motion.div>
            ) : (
              <motion.div 
                key="profile"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="glass-card p-6 space-y-4"
              >
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400 border-2 border-primary/20">
                    <UserIcon size={32} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">{profile.name}</h3>
                    <p className="text-sm text-slate-500">{profile.email}</p>
                  </div>
                </div>
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid gap-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">ID do Usuário</span>
                    <span className="font-mono text-slate-400">{profile.uid.slice(0, 8)}...</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Tipo de Conta</span>
                    <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-md font-bold text-[10px] uppercase">Paciente</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Booking Modal */}
      {isBookingModalOpen && (
        <BookingModal 
          isOpen={isBookingModalOpen} 
          onClose={() => setIsBookingModalOpen(false)} 
          profile={profile}
        />
      )}
    </div>
  );
}

function AppointmentCard({ session, isUpcoming }: { session: any, isUpcoming?: boolean }) {
  return (
    <div className={cn(
      "glass-card p-4 flex items-center justify-between gap-4 border-l-4 transition-all hover:translate-x-1",
      isUpcoming ? "border-l-primary" : "border-l-slate-300 dark:border-l-slate-700"
    )}>
      <div className="flex items-center gap-4">
        <div className={cn(
          "w-12 h-12 rounded-xl flex flex-col items-center justify-center text-center",
          isUpcoming ? "bg-primary/10 text-primary" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
        )}>
          <span className="text-[10px] font-bold uppercase">{format(parseISO(session.date), 'MMM', { locale: ptBR })}</span>
          <span className="text-lg font-bold leading-none">{format(parseISO(session.date), 'dd')}</span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-900 dark:text-white">{session.time}</h3>
            {session.type === 'online' ? (
              <Video size={14} className="text-emerald-500" />
            ) : (
              <MapPin size={14} className="text-amber-500" />
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
            {format(parseISO(session.date), 'EEEE', { locale: ptBR })} • {session.type === 'online' ? 'Online' : 'Presencial'}
          </p>
        </div>
      </div>
      
      <div className="flex flex-col items-end gap-2">
        <StatusBadge status={session.status} />
        {isUpcoming && session.meetingLink && session.status === 'confirmed' && (
          <a 
            href={session.meetingLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-primary font-bold hover:underline"
          >
            Acessar Link
          </a>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: any = {
    pending: { label: 'Pendente', class: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    confirmed: { label: 'Confirmado', class: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    cancelled: { label: 'Cancelado', class: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    completed: { label: 'Realizado', class: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  };
  const config = configs[status] || configs.pending;
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase", config.class)}>
      {config.label}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 bg-white/30 dark:bg-white/5 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
      <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-400">
        <History size={24} />
      </div>
      <p className="text-sm text-slate-500 italic px-6">{message}</p>
    </div>
  );
}

function BookingModal({ isOpen, onClose, profile }: any) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [type, setType] = useState<'online' | 'physical'>('online');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !time) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'sessions'), {
        patientId: profile.patientId,
        patientName: profile.name,
        date,
        time,
        type,
        status: 'pending',
        psychologistId: profile.psychologistId || 'admin', // Need to handle this better
        createdAt: Timestamp.now()
      });
      onClose();
    } catch (error) {
      console.error("Error booking session:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white dark:bg-slate-900 w-full max-w-md p-6 rounded-3xl shadow-2xl space-y-6"
      >
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Novo Agendamento</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Data</label>
            <input 
              type="date" 
              required
              min={format(new Date(), 'yyyy-MM-dd')}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-slate-900 dark:text-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Horário</label>
            <input 
              type="time" 
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-slate-900 dark:text-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Modalidade</label>
            <div className="grid grid-cols-2 gap-2">
              <button 
                type="button"
                onClick={() => setType('online')}
                className={cn(
                  "p-3 rounded-xl border text-sm font-bold flex flex-col items-center gap-1 transition-all",
                  type === 'online' ? "bg-primary/10 border-primary text-primary" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400"
                )}
              >
                <Video size={18} /> Online
              </button>
              <button 
                type="button"
                onClick={() => setType('physical')}
                className={cn(
                  "p-3 rounded-xl border text-sm font-bold flex flex-col items-center gap-1 transition-all",
                  type === 'physical' ? "bg-primary/10 border-primary text-primary" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400"
                )}
              >
                <MapPin size={18} /> Presencial
              </button>
            </div>
          </div>

          <p className="text-[10px] text-slate-400 italic text-center">
            * O agendamento ficará pendente de aprovação pelo psicólogo.
          </p>

          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
          >
            {isSubmitting ? "Solicitando..." : "Confirmar Solicitação"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function PatientRegistration({ user, profile }: any) {
  const [name, setName] = useState(user.displayName || '');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(user.email || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // Find psychologist (for simplicity, we assume the first one or a default)
      const psychs = await getDocs(query(collection(db, 'userProfiles'), where('role', '==', 'psychologist')));
      const psychId = psychs.empty ? 'admin' : psychs.docs[0].id;

      // Create Patient doc
      const patientRef = await addDoc(collection(db, 'patients'), {
        name,
        phone,
        email,
        userId: user.uid,
        psychologistId: psychId,
        createdAt: Timestamp.now(),
        notes: "Cadastro realizado pelo próprio paciente."
      });

      // Update Profile
      await updateDoc(doc(db, 'userProfiles', user.uid), {
        name,
        email,
        patientId: patientRef.id,
        psychologistId: psychId
      });

    } catch (error) {
      console.error("Registration failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card max-w-md w-full p-8 space-y-6"
      >
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mx-auto">
            <Plus size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Finalizar Cadastro</h2>
          <p className="text-sm text-slate-500">Complete seus dados para acessar o portal.</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Nome Completo</label>
            <input 
              type="text" 
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">WhatsApp / Telefone</label>
            <input 
              type="tel" 
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(00) 00000-0000"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Email</label>
            <input 
              type="email" 
              readOnly
              value={email}
              className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-slate-500 cursor-not-allowed outline-none"
            />
          </div>

          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus size={18} />}
            Confirmar Cadastro
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function Loader2({ className }: any) {
  return <Clock className={cn("animate-spin", className)} />;
}
