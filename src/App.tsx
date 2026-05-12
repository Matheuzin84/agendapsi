/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  RefreshCw,
  Calendar as CalendarIcon, 
  Users, 
  FileText, 
  LayoutDashboard, 
  LogOut, 
  Search, 
  Clock, 
  ChevronLeft, 
  ChevronRight,
  MoreVertical,
  CheckCircle2,
  XCircle,
  Sparkles,
  Loader2,
  Phone,
  Mail,
  History,
  MapPin,
  Video,
  Menu,
  X,
  Sun,
  Moon,
  AlertCircle,
  Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  Timestamp, 
  doc, 
  updateDoc, 
  deleteDoc,
  getDoc,
  getDocs,
  setDoc
} from 'firebase/firestore';
import PatientPortal from './components/PatientPortal';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, isToday, parseISO, addDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { auth, db } from './firebase';
import { generateMedicalRecord, GeneratedMedicalRecord, searchPlaces, PlaceSuggestion } from './services/aiService';
import { cn } from './lib/utils';

// --- Types ---

interface Patient {
  id: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  defaultPrice?: number;
  psychologistId: string;
  createdAt: any;
}

interface Session {
  id: string;
  patientId: string;
  patientName: string;
  date: string;
  time: string;
  location: string;
  locationUri?: string;
  meetingLink?: string;
  type: 'online' | 'physical';
  observation: string;
  price?: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  psychologistId: string;
}

interface MedicalRecord {
  id: string;
  patientId: string;
  sessionId: string;
  rawNotes: string;
  summary: string;
  clinicalObservations: string;
  evolution: string;
  nextSessionPlan: string;
  createdAt: any;
  psychologistId: string;
}

// --- Error Handling ---

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
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
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
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function Logo({ size = 'md', className, vertical = false }: { size?: 'sm' | 'md' | 'lg', className?: string, vertical?: boolean }) {
  const sizes = {
    sm: { container: 'w-10 h-10', icon: 20, text: 'text-xl' },
    md: { container: 'w-14 h-14', icon: 28, text: 'text-2xl' },
    lg: { container: 'w-24 h-24', icon: 48, text: 'text-5xl' }
  };

  return (
    <div className={cn(
      "flex items-center gap-4 group", 
      vertical ? "flex-col text-center" : "flex-row",
      className
    )}>
      <div className={cn(
        "relative flex items-center justify-center rounded-[22%] shadow-xl shadow-primary/20 overflow-hidden bg-gradient-to-tr from-primary via-primary to-emerald-400 transition-transform duration-500 group-hover:scale-105",
        sizes[size].container
      )}>
        <div className="absolute inset-0 opacity-10">
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <circle cx="20" cy="20" r="40" fill="white" />
            <circle cx="80" cy="80" r="30" fill="white" />
          </svg>
        </div>
        <svg 
          width={sizes[size].icon} 
          height={sizes[size].icon} 
          viewBox="0 0 40 40" 
          fill="none" 
          className="text-white relative z-10 drop-shadow-lg"
        >
          <path 
            d="M20 8V32M10 16C10 25 14 30 20 30C26 30 30 25 30 16" 
            stroke="currentColor" 
            strokeWidth="3.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          />
          <circle cx="20" cy="13" r="2.5" fill="currentColor" />
        </svg>
      </div>
      <div className={cn("flex flex-col", vertical ? "items-center" : "items-start")}>
        <div className={cn("font-black text-slate-900 dark:text-slate-100 tracking-tighter leading-none flex items-baseline", sizes[size].text)}>
          <span>Agenda</span>
          <span className="text-primary font-light">Psi</span>
        </div>
        {size === 'lg' && (
          <span className="text-slate-500 dark:text-slate-400 text-sm font-medium tracking-[0.2em] uppercase mt-2 opacity-70">Gestão Clínica</span>
        )}
      </div>
    </div>
  );
}

// --- Components ---

interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: 'psychologist' | 'patient';
  patientId?: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'calendar' | 'patients' | 'daily-schedule'>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedPatientForModal, setSelectedPatientForModal] = useState<Patient | null>(null);
  const [isPatientModalOpen, setIsPatientModalOpen] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  
  const [patients, setPatients] = useState<Patient[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [medicalRecords, setMedicalRecords] = useState<MedicalRecord[]>([]);
  const [darkMode, setDarkMode] = useState(() => {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('darkMode');
        if (saved !== null) return JSON.parse(saved);
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
    } catch (e) {
      console.warn("LocalStorage access denied", e);
    }
    return false;
  });

  // Dark Mode
  useEffect(() => {
    try {
      const root = window.document.documentElement;
      if (darkMode) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
      localStorage.setItem('darkMode', JSON.stringify(darkMode));
    } catch (e) {
      console.warn("Failed to save dark mode preference", e);
    }
  }, [darkMode]);

  // Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Profile Fetching
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    const unsubProfile = onSnapshot(doc(db, 'userProfiles', user.uid), (snapshot) => {
      if (snapshot.exists()) {
        setProfile(snapshot.data() as UserProfile);
      } else {
        setProfile(null);
      }
    });

    return unsubProfile;
  }, [user]);

  // Data Fetching
  useEffect(() => {
    if (!user || !profile || profile.role !== 'psychologist') return;

    const qPatients = query(collection(db, 'patients'), where('psychologistId', '==', user.uid), orderBy('name'));
    const unsubPatients = onSnapshot(qPatients, (snapshot) => {
      setPatients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Patient)));
    });

    const qSessions = query(collection(db, 'sessions'), where('psychologistId', '==', user.uid), orderBy('date'), orderBy('time'));
    const unsubSessions = onSnapshot(qSessions, (snapshot) => {
      setSessions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Session)));
    });

    const qRecords = query(collection(db, 'medicalRecords'), where('psychologistId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubRecords = onSnapshot(qRecords, (snapshot) => {
      setMedicalRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MedicalRecord)));
    });

    return () => {
      unsubPatients();
      unsubSessions();
      unsubRecords();
    };
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleSelectRole = async (role: 'psychologist' | 'patient') => {
    if (!user) return;
    const newProfile: UserProfile = {
      uid: user.uid,
      name: user.displayName || 'Usuário',
      email: user.email || '',
      role
    };
    await setDoc(doc(db, 'userProfiles', user.uid), newProfile);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="max-w-md w-full text-center space-y-8">
          <div className="flex flex-col items-center">
            <Logo size="lg" vertical />
            <p className="mt-6 text-slate-600 dark:text-slate-400 text-lg">A ferramenta essencial para psicólogos e seus pacientes.</p>
          </div>
          
          <div className="glass-card p-8 space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold dark:text-slate-100">Bem-vindo</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Entre para gerenciar sua clínica ou seus agendamentos.</p>
            </div>
            <div className="space-y-4">
              <button 
                onClick={handleLogin}
                className="w-full btn-primary py-3 text-lg"
              >
                Entrar com Google
              </button>

              <label className="flex items-center justify-center gap-2 cursor-pointer group">
                <div className="relative flex items-center">
                  <input 
                    type="checkbox" 
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="w-5 h-5 border-2 border-slate-300 dark:border-slate-700 rounded-md peer-checked:bg-primary peer-checked:border-primary transition-all" />
                  <CheckCircle2 className="absolute w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 left-[3px] transition-opacity" />
                </div>
                <span className="text-sm text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors">Mantenha-me conectado</span>
              </label>
            </div>
          </div>
          
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Psicólogos e pacientes utilizam a mesma conta para acessar suas áreas específicas.
          </p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="max-w-md w-full space-y-8 text-center bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl">
          <div className="flex justify-center mb-4">
            <Logo size="md" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold dark:text-white">Bem-vindo ao PsiFlow!</h2>
            <p className="text-slate-500 dark:text-slate-400">Escolha o seu tipo de acesso:</p>
          </div>
          <div className="grid gap-4">
            <button 
              onClick={() => handleSelectRole('psychologist')}
              className="flex items-center gap-4 p-6 bg-primary/5 hover:bg-primary/10 border-2 border-primary/20 rounded-2xl text-left transition-all group"
            >
              <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                <LayoutDashboard size={24} />
              </div>
              <div>
                <p className="font-bold text-lg text-primary">Sou Psicólogo(a)</p>
                <p className="text-xs text-slate-500">Gerenciar pacientes e agendas</p>
              </div>
            </button>
            <button 
              onClick={() => handleSelectRole('patient')}
              className="flex items-center gap-4 p-6 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl text-left transition-all group"
            >
              <div className="w-12 h-12 bg-slate-200 dark:bg-slate-700 rounded-xl flex items-center justify-center text-slate-500 group-hover:scale-110 transition-transform text-xs font-bold">
                P
              </div>
              <div>
                <p className="font-bold text-lg text-slate-900 dark:text-white">Sou Paciente</p>
                <p className="text-xs text-slate-500">Agendar sessões e ver histórico</p>
              </div>
            </button>
          </div>
          <button onClick={handleLogout} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-medium">Sair</button>
        </div>
      </div>
    );
  }

  if (profile.role === 'patient') {
    return <PatientPortal user={user} profile={profile} onLogout={handleLogout} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col lg:flex-row">
      {/* Mobile Header */}
      <header className="lg:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between sticky top-0 z-40">
        <Logo size="sm" />
        <button 
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
        >
          <Menu size={24} />
        </button>
      </header>

      {/* Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col fixed inset-y-0 left-0 z-50 transition-transform duration-300 lg:translate-x-0 lg:static lg:h-screen",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 flex items-center justify-between">
          <Logo size="sm" />
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          <NavItem 
            active={activeTab === 'dashboard'} 
            onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }}
            icon={<LayoutDashboard size={20} />}
            label="Dashboard"
          />
          <NavItem 
            active={activeTab === 'calendar'} 
            onClick={() => { setActiveTab('calendar'); setIsMobileMenuOpen(false); }}
            icon={<CalendarIcon size={20} />}
            label="Agenda"
          />
          <NavItem 
            active={activeTab === 'patients'} 
            onClick={() => { setActiveTab('patients'); setIsMobileMenuOpen(false); }}
            icon={<Users size={20} />}
            label="Pacientes"
          />
          <NavItem 
            active={activeTab === 'daily-schedule'} 
            onClick={() => { setActiveTab('daily-schedule'); setIsMobileMenuOpen(false); }}
            icon={<Clock size={20} />}
            label="Agenda Diária"
          />
          
          <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-all"
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              {darkMode ? 'Modo Claro' : 'Modo Escuro'}
            </button>
          </div>
        </nav>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 p-2 mb-2">
            <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{user.displayName}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-2 p-2 text-sm text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <LogOut size={18} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-x-hidden">
        {activeTab === 'dashboard' && (
          <Dashboard 
            sessions={sessions} 
            patients={patients} 
            onViewCalendar={() => setActiveTab('calendar')}
          />
        )}
        {activeTab === 'calendar' && (
          <Calendar sessions={sessions} patients={patients} user={user} />
        )}
        {activeTab === 'patients' && (
          <Patients 
            patients={patients} 
            sessions={sessions} 
            medicalRecords={medicalRecords} 
            user={user} 
            onOpenPatient={(p) => {
              setSelectedPatientForModal(p);
              setIsPatientModalOpen(true);
            }}
          />
        )}
        {activeTab === 'daily-schedule' && (
          <DailySchedule 
            sessions={sessions} 
            patients={patients} 
            onOpenPatient={(p) => {
              setSelectedPatientForModal(p);
              setIsPatientModalOpen(true);
            }}
          />
        )}
      </main>

      {isPatientModalOpen && (
        <PatientModal 
          isOpen={isPatientModalOpen} 
          onClose={() => setIsPatientModalOpen(false)} 
          patient={selectedPatientForModal}
          sessions={sessions.filter(s => s.patientId === selectedPatientForModal?.id)}
          medicalRecords={medicalRecords.filter(r => r.patientId === selectedPatientForModal?.id)}
          user={user}
        />
      )}
    </div>
  );
}

// --- Sub-components ---
// --- Sub-components ---

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
        active 
          ? "bg-primary text-white shadow-md shadow-primary/20" 
          : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function Dashboard({ sessions, patients, onViewCalendar }: { sessions: Session[], patients: Patient[], onViewCalendar: () => void }) {
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const today = format(new Date(), 'yyyy-MM-dd');
  
  const todaySessions = sessions.filter(s => s.date === today && (s.status === 'pending' || s.status === 'confirmed'));
  const upcomingSessions = sessions.filter(s => s.date > today && (s.status === 'pending' || s.status === 'confirmed')).slice(0, 5);
  
  const monthSessions = sessions.filter(s => s.date.startsWith(selectedMonth) && s.status === 'completed');
  const monthRevenue = monthSessions.reduce((acc, s) => acc + (s.price || 0), 0);
  const monthPatientsCount = new Set(monthSessions.map(s => s.patientId)).size;

  const selectedDate = parseISO(`${selectedMonth}-01`);

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Olá, Psicólogo(a)</h2>
          <p className="text-sm md:text-base text-slate-500 dark:text-slate-400">Aqui está o resumo do seu dia e desempenho mensal.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Filtrar Mês</span>
            <input 
              type="month" 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-white dark:bg-slate-900 px-3 py-1.5 md:px-4 md:py-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm text-xs md:text-sm font-semibold text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
            />
          </div>
          <div className="bg-white dark:bg-slate-900 px-3 py-1.5 md:px-4 md:py-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-2 self-start md:self-auto h-[38px] md:h-[44px] mt-auto">
            <CalendarIcon className="w-3.5 h-3.5 md:w-4 md:h-4 text-primary" />
            <span className="text-xs md:text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              {format(selectedDate, 'MMMM yyyy', { locale: ptBR })}
            </span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <StatCard 
          label="Sessões Hoje" 
          value={todaySessions.length} 
          icon={<Clock className="text-blue-600 dark:text-blue-400" />} 
          color="bg-blue-50 dark:bg-blue-900/20"
        />
        <StatCard 
          label="Próximas Sessões" 
          value={sessions.filter(s => s.status === 'pending' || s.status === 'confirmed').length} 
          icon={<CalendarIcon className="text-violet-600 dark:text-violet-400" />} 
          color="bg-violet-50 dark:bg-violet-900/20"
        />
        <StatCard 
          label={`Atendidos em ${format(selectedDate, 'MMM', { locale: ptBR })}`} 
          value={monthPatientsCount} 
          icon={<Users className="text-emerald-600 dark:text-emerald-400" />} 
          color="bg-emerald-50 dark:bg-emerald-900/20"
          subtext="Pacientes únicos"
        />
        <StatCard 
          label={`Faturamento ${format(selectedDate, 'MMM', { locale: ptBR })}`} 
          value={monthRevenue} 
          isCurrency
          icon={<Sparkles className="text-amber-600 dark:text-amber-400" />} 
          color="bg-amber-50 dark:bg-amber-900/20"
          subtext={`${monthSessions.length} sessões concluídas`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold dark:text-slate-100">Sessões de Hoje</h3>
            <button onClick={onViewCalendar} className="text-sm text-primary font-medium hover:underline">Ver agenda completa</button>
          </div>
          <div className="space-y-4">
            {todaySessions.length > 0 ? todaySessions.map(session => (
              <SessionItem key={session.id} session={session} />
            )) : (
              <p className="text-center py-8 text-slate-400 dark:text-slate-500">Nenhuma sessão agendada para hoje.</p>
            )}
          </div>
        </div>

        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold mb-6 dark:text-slate-100">Próximas Sessões</h3>
          <div className="space-y-4">
            {upcomingSessions.length > 0 ? upcomingSessions.map(session => (
              <SessionItem key={session.id} session={session} showDate />
            )) : (
              <p className="text-center py-8 text-slate-400 dark:text-slate-500">Sem sessões futuras agendadas.</p>
            )}
          </div>
        </div>
      </div>

      {/* Billing Detail Section */}
      <div className="glass-card p-4 md:p-6 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="space-y-1">
            <h3 className="text-base md:text-lg font-semibold dark:text-slate-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
              Detalhamento de Faturamento
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium capitalize">
              {format(selectedDate, 'MMMM yyyy', { locale: ptBR })}
            </p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 md:px-4 md:py-2 rounded-xl border border-emerald-100 dark:border-emerald-800/50 self-start sm:self-auto">
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider block">Total do Mês</span>
            <span className="text-lg md:text-xl font-bold text-emerald-700 dark:text-emerald-300">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(monthRevenue)}
            </span>
          </div>
        </div>
        
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-hidden">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50/50 dark:bg-slate-800/30">
              <tr>
                <th className="px-4 py-3 font-bold border-b border-slate-100 dark:border-slate-800">Data</th>
                <th className="px-4 py-3 font-bold border-b border-slate-100 dark:border-slate-800">Paciente</th>
                <th className="px-4 py-3 font-bold border-b border-slate-100 dark:border-slate-800 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {monthSessions.length > 0 ? (
                monthSessions
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map(session => (
                    <tr key={session.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors group">
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">
                        {format(parseISO(session.date), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                            {session.patientName[0]}
                          </div>
                          <span className="font-semibold text-slate-900 dark:text-slate-100">{session.patientName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(session.price || 0)}
                      </td>
                    </tr>
                  ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-slate-400 dark:text-slate-500 italic">
                    Nenhuma sessão concluída neste mês.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile List View */}
        <div className="md:hidden space-y-2">
          {monthSessions.length > 0 ? (
            monthSessions
              .sort((a, b) => b.date.localeCompare(a.date))
              .map(session => (
                <div key={session.id} className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-900/40 rounded-2xl border border-slate-100 dark:border-slate-800/60 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-xs font-bold text-slate-500 shrink-0 border border-slate-200/50 dark:border-slate-700/50">
                      {session.patientName[0]}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate max-w-[150px]">
                        {session.patientName}
                      </span>
                      <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <CalendarIcon size={10} className="text-primary/70" />
                        {format(parseISO(session.date), 'dd/MM/yyyy')}
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(session.price || 0)}
                    </span>
                    <span className="text-[8px] font-bold text-emerald-500/60 dark:text-emerald-400/40 uppercase tracking-tighter">Pago</span>
                  </div>
                </div>
              ))
          ) : (
            <div className="text-center py-10 bg-slate-50/30 dark:bg-slate-900/20 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
              <p className="text-slate-400 dark:text-slate-500 italic text-sm">
                Nenhuma sessão concluída neste mês.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color, isCurrency, subtext }: { label: string, value: number, icon: React.ReactNode, color: string, isCurrency?: boolean, subtext?: string }) {
  return (
    <div className="glass-card p-4 md:p-6 flex flex-col gap-3 md:gap-4">
      <div className="flex items-center gap-3 md:gap-4">
        <div className={cn("w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center shrink-0", color)}>
          {React.cloneElement(icon as React.ReactElement, { size: 18, className: (icon as React.ReactElement).props.className + " md:w-5 md:h-5" })}
        </div>
        <div>
          <p className="text-[10px] md:text-sm text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">{label}</p>
          <p className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">
            {isCurrency ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value) : value}
          </p>
        </div>
      </div>
      {subtext && (
        <div className="pt-2 md:pt-3 border-t border-slate-100 dark:border-slate-800">
          <p className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500 font-medium">{subtext}</p>
        </div>
      )}
    </div>
  );
}

function SessionItem({ session, showDate }: { session: Session, showDate?: boolean, key?: string }) {
  return (
    <div className="flex items-center gap-4 p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-700">
      <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold">
        {session.patientName[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{session.patientName}</p>
          {session.type === 'online' ? (
            <Video size={12} className="text-emerald-500" title="Atendimento Online" />
          ) : (
            <MapPin size={12} className="text-primary" title="Atendimento Presencial" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {showDate && `${format(parseISO(session.date), 'dd/MM')} às `}
            {session.time}
          </p>
          {session.type === 'online' ? (
            session.meetingLink && (
              <a 
                href={session.meetingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                Entrar na Reunião
              </a>
            )
          ) : (
            session.location && (
              <a 
                href={session.locationUri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(session.location)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                Ver Mapa
              </a>
            )
          )}
        </div>
      </div>
      <div className={cn(
        "px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md",
        session.status === 'pending' ? "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" :
        session.status === 'confirmed' ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" :
        session.status === 'completed' ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" :
        "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400"
      )}>
        {session.status === 'pending' ? 'Pendente' : 
         session.status === 'confirmed' ? 'Confirmado' :
         session.status === 'completed' ? 'Realizado' : 'Cancelado'}
      </div>
    </div>
  );
}

function Calendar({ sessions, patients, user }: { sessions: Session[], patients: Patient[], user: User }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const sessionsByDay = useMemo(() => {
    const map: Record<string, Session[]> = {};
    sessions.forEach(s => {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    });
    return map;
  }, [sessions]);

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  const handleAddSession = () => {
    setSelectedSession(null);
    setIsModalOpen(true);
  };

  const handleEditSession = (session: Session) => {
    setSelectedSession(session);
    setIsModalOpen(true);
  };

  const handleCompleteSession = (session: Session) => {
    setSelectedSession(session);
    setIsRecordModalOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Agenda</h2>
          <p className="text-slate-500 dark:text-slate-400 capitalize text-sm sm:text-base">{format(currentDate, 'MMMM yyyy', { locale: ptBR })}</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shrink-0">
            <button onClick={handlePrevMonth} className="p-1.5 sm:p-2 hover:bg-slate-50 dark:hover:bg-slate-800 border-r border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"><ChevronLeft size={18} /></button>
            <button onClick={() => setCurrentDate(new Date())} className="px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300">Hoje</button>
            <button onClick={handleNextMonth} className="p-1.5 sm:p-2 hover:bg-slate-50 dark:hover:bg-slate-800 border-l border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"><ChevronRight size={18} /></button>
          </div>
          <button onClick={handleAddSession} className="btn-primary shrink-0 whitespace-nowrap text-sm sm:text-base px-3 sm:px-4 py-1.5 sm:py-2">
            <Plus size={18} />
            <span className="hidden sm:inline">Agendar Sessão</span>
            <span className="sm:hidden">Agendar</span>
          </button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        {/* Desktop Grid View */}
        <div className="hidden lg:block">
          <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
              <div key={day} className="py-3 text-center text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarDays.map((day, i) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const daySessions = sessionsByDay[dateStr] || [];
              const isCurrentMonth = day.getMonth() === currentDate.getMonth();

              return (
                <div 
                  key={i} 
                  className={cn(
                    "min-h-[140px] border-r border-b border-slate-100 dark:border-slate-800 p-2 transition-colors",
                    !isCurrentMonth && "bg-slate-50/50 dark:bg-slate-900/50",
                    isToday(day) && "bg-blue-50/30 dark:bg-blue-900/10"
                  )}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className={cn(
                      "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                      isToday(day) ? "bg-primary text-white" : "text-slate-600 dark:text-slate-400"
                    )}>
                      {format(day, 'd')}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {daySessions.map(session => (
                      <button 
                        key={session.id}
                        onClick={() => handleEditSession(session)}
                        className={cn(
                          "w-full text-left px-2 py-1 rounded-md text-[10px] font-semibold truncate transition-all",
                          session.status === 'pending' ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60" :
                          session.status === 'confirmed' ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60" :
                          session.status === 'completed' ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" :
                          "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-500 line-through"
                        )}
                      >
                        {session.time} - {session.patientName}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mobile List View */}
        <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {calendarDays.filter(day => day.getMonth() === currentDate.getMonth()).map((day, i) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const daySessions = sessionsByDay[dateStr] || [];
            if (daySessions.length === 0) return null;

            return (
              <div key={i} className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0",
                    isToday(day) ? "bg-primary text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                  )}>
                    <span className="text-xs font-bold uppercase leading-none">{format(day, 'EEE', { locale: ptBR })}</span>
                    <span className="text-lg font-black leading-none">{format(day, 'd')}</span>
                  </div>
                  <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
                </div>
                <div className="space-y-2">
                  {daySessions.map(session => (
                    <div 
                      key={session.id}
                      onClick={() => handleEditSession(session)}
                      className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-3 shadow-sm active:scale-[0.98] transition-all"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-400">{session.time}</span>
                        <span className={cn(
                          "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                          session.status === 'pending' ? "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" :
                          session.status === 'confirmed' ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" :
                          session.status === 'completed' ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" :
                          "bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
                        )}>
                          {session.status === 'pending' ? 'Pendente' : session.status === 'confirmed' ? 'Confirmado' : session.status === 'completed' ? 'Concluído' : 'Cancelado'}
                        </span>
                      </div>
                      <p className="font-bold text-slate-900 dark:text-slate-100">{session.patientName}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {calendarDays.filter(day => day.getMonth() === currentDate.getMonth() && (sessionsByDay[format(day, 'yyyy-MM-dd')]?.length || 0) > 0).length === 0 && (
            <div className="py-20 text-center px-6">
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <CalendarIcon className="text-slate-300 dark:text-slate-600" size={32} />
              </div>
              <p className="text-slate-500 dark:text-slate-400 font-medium">Nenhuma sessão agendada para este mês.</p>
              <button onClick={handleAddSession} className="mt-4 text-primary font-bold text-sm">Agendar primeira sessão</button>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <SessionModal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          session={selectedSession} 
          patients={patients}
          user={user}
          onComplete={() => {
            setIsModalOpen(false);
            if (selectedSession) handleCompleteSession(selectedSession);
          }}
        />
      )}

      {isRecordModalOpen && selectedSession && (
        <RecordModal 
          isOpen={isRecordModalOpen} 
          onClose={() => setIsRecordModalOpen(false)} 
          session={selectedSession}
          user={user}
        />
      )}
    </div>
  );
}

function SessionModal({ isOpen, onClose, session, patients, user, onComplete }: { isOpen: boolean, onClose: () => void, session: Session | null, patients: Patient[], user: User, onComplete: () => void }) {
  const [patientId, setPatientId] = useState(session?.patientId || '');
  const [date, setDate] = useState(session?.date || format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(session?.time || '09:00');
  const [location, setLocation] = useState(session?.location || '');
  const [locationUri, setLocationUri] = useState(session?.locationUri || '');
  const [meetingLink, setMeetingLink] = useState(session?.meetingLink || '');
  const [type, setType] = useState<'online' | 'physical'>(session?.type || 'physical');
  const [observation, setObservation] = useState(session?.observation || '');
  const [status, setStatus] = useState<Session['status']>(session?.status || 'pending');
  const [price, setPrice] = useState(session?.price?.toString() || '');
  const [loading, setLoading] = useState(false);
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  
  // Return sessions state
  const [hasReturns, setHasReturns] = useState(false);
  const [returnCount, setReturnCount] = useState('1');
  const [returnInterval, setReturnInterval] = useState('7'); // Default 7 days

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (location.length >= 3) {
        setIsSearchingPlaces(true);
        const suggestions = await searchPlaces(location);
        setPlaceSuggestions(suggestions);
        setIsSearchingPlaces(false);
      } else {
        setPlaceSuggestions([]);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [location]);

  const handlePatientChange = (id: string) => {
    setPatientId(id);
    const patient = patients.find(p => p.id === id);
    if (patient && patient.defaultPrice && !price) {
      setPrice(patient.defaultPrice.toString());
    }
  };

  const handleWhatsAppReminder = () => {
    const patient = patients.find(p => p.id === patientId);
    if (!patient || !patient.phone) return;

    const formattedDate = format(parseISO(date), "dd/MM/yyyy", { locale: ptBR });
    const mapsLink = locationUri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
    
    const message = `Olá *${patient.name}*, confirmando nossa sessão:\n\n*Data:* ${formattedDate}\n*Horário:* ${time}\n\n${
      type === 'online' 
        ? `*Link da reunião:* ${meetingLink}` 
        : `*Local:* ${location}\n\n*Google Maps:* ${mapsLink}`
    }`;
    
    const encodedMessage = encodeURIComponent(message);
    const cleanPhone = patient.phone.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
    
    window.open(whatsappUrl, '_blank');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId) return;
    setLoading(true);

    const patient = patients.find(p => p.id === patientId);
    const data = {
      patientId,
      patientName: patient?.name || '',
      date,
      time,
      location,
      locationUri,
      meetingLink,
      type,
      observation,
      price: parseFloat(price) || 0,
      status,
      psychologistId: user.uid
    };

    try {
      if (session) {
        await updateDoc(doc(db, 'sessions', session.id), data);
      } else {
        // Create the main session
        await addDoc(collection(db, 'sessions'), data);
        
        // Create return sessions if requested
        if (hasReturns && parseInt(returnCount) > 0) {
          const count = parseInt(returnCount);
          const interval = parseInt(returnInterval);
          const baseDate = parseISO(date);
          
          for (let i = 1; i <= count; i++) {
            const nextDate = addDays(baseDate, interval * i);
            const returnData = {
              ...data,
              date: format(nextDate, 'yyyy-MM-dd'),
              observation: `Retorno ${i}/${count} - ${observation}`.trim()
            };
            await addDoc(collection(db, 'sessions'), returnData);
          }
        }
      }
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, session ? `sessions/${session.id}` : 'sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!session) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'sessions', session.id));
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `sessions/${session.id}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl w-full max-w-md shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-300 max-h-[95vh] overflow-y-auto">
        <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white dark:bg-slate-900 z-10">
          <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">{session ? 'Editar Agendamento' : 'Novo Agendamento'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><XCircle size={24} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Paciente</label>
            <select 
              value={patientId} 
              onChange={e => handlePatientChange(e.target.value)}
              className="input-field"
              required
            >
              <option value="" className="dark:bg-slate-900">Selecione um paciente</option>
              {patients.map(p => (
                <option key={p.id} value={p.id} className="dark:bg-slate-900">{p.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Horário</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className="input-field" required />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Tipo de Atendimento</label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setType('physical')}
                className={`py-2 text-sm font-medium rounded-lg transition-all ${
                  type === 'physical' 
                    ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                Presencial
              </button>
              <button
                type="button"
                onClick={() => setType('online')}
                className={`py-2 text-sm font-medium rounded-lg transition-all ${
                  type === 'online' 
                    ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                Online
              </button>
            </div>
          </div>

          {type === 'physical' ? (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Local</label>
                {location && (
                  <a 
                    href={locationUri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <MapPin size={12} />
                    Ver no Mapa
                  </a>
                )}
              </div>
              <input 
                type="text" 
                value={location} 
                onChange={e => setLocation(e.target.value)} 
                className="input-field" 
                placeholder="Ex: Consultório, Clínica, etc."
                required={type === 'physical'}
              />
              
              {/* Place Suggestions */}
              <div className="relative">
                {(isSearchingPlaces || placeSuggestions.length > 0) && (
                  <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    {isSearchingPlaces ? (
                      <div className="p-3 flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
                        <Loader2 size={16} className="animate-spin" />
                        <span>Buscando locais...</span>
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto">
                        {placeSuggestions.map((suggestion, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setLocation(suggestion.title);
                              setLocationUri(suggestion.uri);
                              setPlaceSuggestions([]);
                            }}
                            className="w-full p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700 flex items-start gap-3 border-b border-slate-50 dark:border-slate-700 last:border-0 transition-colors"
                          >
                            <MapPin size={16} className="text-slate-400 dark:text-slate-500 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{suggestion.title}</p>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{suggestion.uri}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Link da Reunião</label>
              <input 
                type="url" 
                value={meetingLink} 
                onChange={e => setMeetingLink(e.target.value)} 
                className="input-field" 
                placeholder="Ex: https://meet.google.com/xxx-xxxx-xxx"
                required={type === 'online'}
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Observação</label>
            <textarea 
              value={observation} 
              onChange={e => setObservation(e.target.value)} 
              className="input-field h-24 resize-none"
              placeholder="Ex: Primeira consulta, foco em ansiedade..."
            />
          </div>

          {session && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status da Sessão</label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                {(['pending', 'confirmed', 'cancelled', 'completed'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                      status === s 
                        ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' 
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    {s === 'pending' ? 'Pendente' : 
                     s === 'confirmed' ? 'Confirmado' : 
                     s === 'cancelled' ? 'Cancelado' : 'Realizado'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!session && (
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-900/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-semibold text-sm">
                  <RefreshCw size={18} className={hasReturns ? "animate-spin" : ""} />
                  Agendar Retornos?
                </div>
                <button 
                  type="button"
                  onClick={() => setHasReturns(!hasReturns)}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                    hasReturns ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-700"
                  )}
                >
                  <span className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    hasReturns ? "translate-x-6" : "translate-x-1"
                  )} />
                </button>
              </div>
              
              {hasReturns && (
                <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-bold text-indigo-400 mb-1">Qtd. Retornos</label>
                    <input 
                      type="number" 
                      min="1" 
                      max="12"
                      value={returnCount} 
                      onChange={e => setReturnCount(e.target.value)} 
                      className="w-full bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/30 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:text-slate-100" 
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-bold text-indigo-400 mb-1">Intervalo (Dias)</label>
                    <select 
                      value={returnInterval} 
                      onChange={e => setReturnInterval(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/30 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:text-slate-100"
                    >
                      <option value="7" className="dark:bg-slate-900">7 dias (Semanal)</option>
                      <option value="14" className="dark:bg-slate-900">14 dias (Quinzenal)</option>
                      <option value="21" className="dark:bg-slate-900">21 dias</option>
                      <option value="28" className="dark:bg-slate-900">28 dias (Mensal)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Valor da Sessão (R$)</label>
            <input 
              type="number"
              step="0.01"
              value={price}
              onChange={e => setPrice(e.target.value)}
              className="input-field"
              placeholder="0,00"
            />
          </div>

          <div className="pt-4 flex flex-col gap-3">
            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? <Loader2 className="animate-spin" /> : (session ? 'Salvar Alterações' : 'Confirmar Agendamento')}
            </button>
            
            {session && (session.status === 'pending' || session.status === 'confirmed') && (
              <div className="grid grid-cols-2 gap-3">
                <button 
                  type="button" 
                  onClick={onComplete}
                  className="btn-secondary w-full border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                >
                  <CheckCircle2 size={18} />
                  Finalizar Sessão
                </button>
                <button 
                  type="button" 
                  onClick={handleWhatsAppReminder}
                  className="btn-secondary w-full border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                >
                  <Phone size={18} />
                  Enviar Lembrete
                </button>
                <button 
                  type="button" 
                  onClick={async () => {
                    setLoading(true);
                    try {
                      await updateDoc(doc(db, 'sessions', session.id), { status: 'cancelled' });
                      onClose();
                    } catch (error) {
                      handleFirestoreError(error, OperationType.WRITE, `sessions/${session.id}`);
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="btn-secondary w-full border-red-200 text-red-600 hover:bg-red-50 col-span-2"
                >
                  <XCircle size={18} />
                  Cancelar Agendamento
                </button>
              </div>
            )}

            {session && (
              <button 
                type="button" 
                onClick={handleDelete} 
                className="text-sm font-medium py-2 w-full text-center transition-colors text-red-500 hover:text-red-700"
              >
                Excluir Agendamento
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function RecordModal({ isOpen, onClose, session, user }: { isOpen: boolean, onClose: () => void, session: Session, user: User }) {
  const [notes, setNotes] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratedMedicalRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const handleGenerate = async () => {
    if (!notes.trim()) return;
    setGenerating(true);
    try {
      const res = await generateMedicalRecord(notes);
      setResult(res);
    } catch (error) {
      alert("Erro ao gerar prontuário. Tente novamente.");
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'medicalRecords'), {
        patientId: session.patientId,
        sessionId: session.id,
        rawNotes: notes,
        ...result,
        psychologistId: user.uid,
        createdAt: Timestamp.now()
      });
      await updateDoc(doc(db, 'sessions', session.id), { status: 'completed' });
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, session.id ? `sessions/${session.id}` : 'sessions');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl w-full max-w-2xl shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-300 max-h-[95vh] flex flex-col">
        <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white dark:bg-slate-900 z-10">
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">Finalizar Sessão</h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">{session.patientName} - {format(parseISO(session.date), 'dd/MM/yyyy')}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><XCircle size={24} /></button>
        </div>
        
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {!result ? (
            <div className="space-y-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Anotações da Sessão</label>
              <textarea 
                value={notes} 
                onChange={e => setNotes(e.target.value)} 
                className="input-field h-64 resize-none"
                placeholder="Escreva aqui os pontos principais discutidos na sessão..."
              />
              <button 
                onClick={handleGenerate} 
                disabled={generating || !notes.trim()} 
                className="btn-primary w-full py-4 text-lg bg-indigo-600 hover:bg-indigo-700"
              >
                {generating ? <Loader2 className="animate-spin" /> : <><Sparkles size={20} /> Gerar Prontuário com IA</>}
              </button>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-900/30 rounded-xl">
                <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-bold text-xs uppercase tracking-widest mb-2">
                  <Sparkles size={14} />
                  Prontuário Gerado pela IA
                </div>
                <div className="space-y-4">
                  <RecordSection label="Resumo" content={result.summary} />
                  <RecordSection label="Observações Clínicas" content={result.clinicalObservations} />
                  <RecordSection label="Evolução" content={result.evolution} />
                  <RecordSection label="Plano para Próxima Sessão" content={result.nextSessionPlan} />
                </div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setResult(null)} className="btn-secondary flex-1">Editar Anotações</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                  {saving ? <Loader2 className="animate-spin" /> : 'Salvar Prontuário'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RecordSection({ label, content }: { label: string, content: string }) {
  return (
    <div>
      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">{label}</h4>
      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{content}</p>
    </div>
  );
}

function DailySchedule({ sessions, patients, onOpenPatient }: { sessions: Session[], patients: Patient[], onOpenPatient: (patient: Patient) => void }) {
  const groupedByDay = useMemo(() => {
    const groups: { [key: string]: Session[] } = {};
    const upcomingSessions = sessions
      .filter(s => s.status !== 'cancelled')
      .sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.time}`);
        const dateB = new Date(`${b.date}T${b.time}`);
        return dateA.getTime() - dateB.getTime();
      });

    upcomingSessions.forEach(session => {
      const dayKey = session.date;
      if (!groups[dayKey]) groups[dayKey] = [];
      groups[dayKey].push(session);
    });
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [sessions]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Agenda de Consultas</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Visualize suas sessões organizadas por dia</p>
      </div>

      {groupedByDay.length > 0 ? (
        <div className="space-y-10">
          {groupedByDay.map(([day, daySessions]) => (
            <div key={day} className="space-y-4">
              <div className="flex items-center gap-4">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 px-3 py-1 rounded-lg border border-slate-100 dark:border-slate-700">
                  {format(parseISO(day), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </span>
                <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800"></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {daySessions.map(s => {
                  const patient = patients.find(p => p.id === s.patientId);
                  return (
                    <div 
                      key={s.id}
                      onClick={() => patient && onOpenPatient(patient)}
                      className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 hover:border-primary/30 cursor-pointer transition-all flex items-center gap-3 group/item shadow-sm hover:shadow-md"
                    >
                      <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-400 group-hover/item:text-primary transition-colors">
                        {s.patientName[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{s.patientName}</p>
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{s.time}</p>
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            s.status === 'pending' ? "bg-amber-400" :
                            s.status === 'confirmed' ? "bg-blue-400" :
                            s.status === 'completed' ? "bg-emerald-400" : "bg-red-400"
                          )} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-card p-12 text-center">
          <CalendarIcon size={48} className="mx-auto text-slate-300 dark:text-slate-700 mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Nenhuma consulta agendada</h3>
          <p className="text-slate-500 dark:text-slate-400">Suas sessões futuras aparecerão aqui organizadas por dia.</p>
        </div>
      )}
    </div>
  );
}

function Patients({ patients, sessions, medicalRecords, user, onOpenPatient }: { patients: Patient[], sessions: Session[], medicalRecords: MedicalRecord[], user: User, onOpenPatient?: (patient: Patient) => void }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredPatients = patients.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleAddPatient = () => {
    setSelectedPatient(null);
    setIsModalOpen(true);
  };

  const handleViewPatient = (patient: Patient) => {
    if (onOpenPatient) {
      onOpenPatient(patient);
    } else {
      setSelectedPatient(patient);
      setIsModalOpen(true);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Pacientes</h2>
        <button onClick={handleAddPatient} className="btn-primary shrink-0 whitespace-nowrap text-sm sm:text-base px-3 sm:px-4 py-1.5 sm:py-2">
          <Plus size={18} />
          <span className="hidden sm:inline">Cadastrar Paciente</span>
          <span className="sm:hidden">Cadastrar</span>
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input 
          type="text" 
          placeholder="Buscar paciente pelo nome..." 
          className="input-field !pl-12 py-4"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPatients.map(patient => (
          <div 
            key={patient.id} 
            onClick={() => handleViewPatient(patient)}
            className="glass-card p-6 cursor-pointer hover:border-primary/30 transition-all group"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold text-xl group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                {patient.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 truncate">{patient.name}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{patient.email || 'Sem e-mail'}</p>
              </div>
            </div>
            <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <Phone size={14} className="text-slate-400 dark:text-slate-500" />
                {patient.phone || 'N/A'}
              </div>
              <div className="flex items-center gap-2">
                <CalendarIcon size={14} className="text-slate-400 dark:text-slate-500" />
                {(() => {
                  const nextSession = sessions
                    .filter(s => s.patientId === patient.id && s.status !== 'cancelled' && new Date(`${s.date}T${s.time}`) >= new Date())
                    .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime())[0];
                  return nextSession 
                    ? `Próxima: ${format(parseISO(nextSession.date), 'dd/MM')} às ${nextSession.time}`
                    : 'Sem consultas futuras';
                })()}
              </div>
              <div className="flex items-center gap-2">
                <History size={14} className="text-slate-400 dark:text-slate-500" />
                {sessions.filter(s => s.patientId === patient.id && s.status === 'completed').length} sessões realizadas
              </div>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <PatientModal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          patient={selectedPatient}
          sessions={sessions.filter(s => s.patientId === selectedPatient?.id)}
          medicalRecords={medicalRecords.filter(r => r.patientId === selectedPatient?.id)}
          user={user}
        />
      )}
    </div>
  );
}

function PatientModal({ isOpen, onClose, patient, sessions, medicalRecords, user }: { isOpen: boolean, onClose: () => void, patient: Patient | null, sessions: Session[], medicalRecords: MedicalRecord[], user: User }) {
  const [name, setName] = useState(patient?.name || '');
  const [phone, setPhone] = useState(patient?.phone || '+55');
  const [email, setEmail] = useState(patient?.email || '');
  const [notes, setNotes] = useState(patient?.notes || '');
  const [defaultPrice, setDefaultPrice] = useState(patient?.defaultPrice?.toString() || '');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'history'>('info');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const data = {
      name,
      phone,
      email,
      notes,
      defaultPrice: parseFloat(defaultPrice) || 0,
      psychologistId: user.uid,
      createdAt: patient?.createdAt || Timestamp.now()
    };

    try {
      if (patient) {
        await updateDoc(doc(db, 'patients', patient.id), data);
      } else {
        await addDoc(collection(db, 'patients'), data);
      }
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, patient ? `patients/${patient.id}` : 'patients');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl w-full max-w-3xl shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-300 max-h-[95vh] flex flex-col">
        <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white dark:bg-slate-900 z-10">
          <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">{patient ? 'Perfil do Paciente' : 'Novo Paciente'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><XCircle size={24} /></button>
        </div>

        {patient && (
          <div className="flex border-b border-slate-100 dark:border-slate-800 px-4 sm:px-6 sticky top-[60px] sm:top-[73px] bg-white dark:bg-slate-900 z-10">
            <button 
              onClick={() => setActiveTab('info')}
              className={cn("px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors", activeTab === 'info' ? "border-primary text-primary" : "border-transparent text-slate-500 dark:text-slate-400")}
            >
              Informações
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={cn("px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors", activeTab === 'history' ? "border-primary text-primary" : "border-transparent text-slate-500 dark:text-slate-400")}
            >
              Histórico e Prontuários
            </button>
          </div>
        )}

        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {activeTab === 'info' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome Completo</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} className="input-field" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Telefone</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="input-field" placeholder="(00) 00000-0000" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">E-mail</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field" placeholder="exemplo@email.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Valor Padrão da Sessão (R$)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={defaultPrice} 
                  onChange={e => setDefaultPrice(e.target.value)} 
                  className="input-field" 
                  placeholder="0,00" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Observações Gerais</label>
                <textarea 
                  value={notes} 
                  onChange={e => setNotes(e.target.value)} 
                  className="input-field h-32 resize-none"
                  placeholder="Histórico médico, queixas principais, etc..."
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                {loading ? <Loader2 className="animate-spin" /> : (patient ? 'Salvar Alterações' : 'Cadastrar Paciente')}
              </button>
              
              {patient && (
                <button 
                  type="button" 
                  onClick={async () => {
                    setLoading(true);
                    try {
                      await deleteDoc(doc(db, 'patients', patient.id));
                      onClose();
                    } catch (error) {
                      handleFirestoreError(error, OperationType.DELETE, `patients/${patient.id}`);
                    } finally {
                      setLoading(false);
                    }
                  }} 
                  className="text-sm font-medium py-2 w-full text-center transition-colors mt-2 text-red-500 hover:text-red-700"
                >
                  Excluir Paciente
                </button>
              )}
            </form>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl text-center">
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Total</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{sessions.length}</p>
                </div>
                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-center">
                  <p className="text-[10px] uppercase font-bold text-emerald-500 mb-1">Realizadas</p>
                  <p className="text-2xl font-bold text-emerald-600">{sessions.filter(s => s.status === 'completed').length}</p>
                </div>
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl text-center">
                  <p className="text-[10px] uppercase font-bold text-red-500 mb-1">Faltas</p>
                  <p className="text-2xl font-bold text-red-600">{sessions.filter(s => s.status === 'cancelled').length}</p>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <History size={16} />
                  Sessões Anteriores
                </h4>
                {sessions.length > 0 ? (
                  <div className="space-y-3">
                    {sessions
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map(session => (
                        <div key={session.id} className="p-4 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                {format(parseISO(session.date), 'dd/MM/yyyy')}
                              </span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                às {session.time}
                              </span>
                            </div>
                            <span className={cn(
                              "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                              session.status === 'completed' ? "bg-emerald-50 text-emerald-600" :
                              session.status === 'cancelled' ? "bg-slate-100 text-slate-500" :
                              session.status === 'pending' ? "bg-amber-50 text-amber-600" :
                              "bg-blue-50 text-blue-600"
                            )}>
                              {session.status === 'completed' ? 'Realizada' :
                               session.status === 'cancelled' ? 'Cancelada' :
                               session.status === 'pending' ? 'Pendente' : 'Confirmada'}
                            </span>
                          </div>
                          {session.observation && (
                            <p className="text-sm text-slate-600 dark:text-slate-400 italic">
                              "{session.observation}"
                            </p>
                          )}
                          {medicalRecords.find(r => r.sessionId === session.id) && (
                            <div className="mt-3 pt-3 border-t border-slate-50 dark:border-slate-700">
                              <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1">Resumo do Prontuário</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                                {medicalRecords.find(r => r.sessionId === session.id)?.summary}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-400 dark:text-slate-500">
                    <History size={48} className="mx-auto mb-4 opacity-20" />
                    <p>Nenhuma sessão registrada para este paciente.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

