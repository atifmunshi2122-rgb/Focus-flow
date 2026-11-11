import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User, UserSettings, Task, CurrencyCode } from '../types/index.ts';
import { api } from '../lib/api.ts';
import { playFocusCompleteSound, playBreakEndSound, playClickSound } from '../lib/sound.ts';
import {
  auth,
  signInWithGoogle as fbSignInWithGoogle,
  signOut as fbSignOut,
  initAuthListener,
  getAccessToken,
  testConnection,
} from '../lib/firebase.ts';
import { User as FirebaseUser } from 'firebase/auth';
import { googleSheetsService } from '../lib/googleSheetsService.ts';
import { firestoreService } from '../lib/firestoreService.ts';

export type NavTab =
  | 'dashboard'
  | 'focus'
  | 'tasks'
  | 'finance'
  | 'transactions'
  | 'bills'
  | 'analytics'
  | 'settings';

export type TimerMode = 'work' | 'short_break' | 'long_break';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface AppContextType {
  currentTab: NavTab;
  setCurrentTab: (tab: NavTab) => void;
  user: User | null;
  settings: UserSettings | null;
  currency: CurrencyCode;
  updateSettings: (newSettings: Partial<UserSettings>) => Promise<void>;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  reseedData: () => Promise<void>;

  // Firebase Auth
  firebaseUser: FirebaseUser | null;
  isAuthenticated: boolean;
  googleAccessToken: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutGoogle: () => Promise<void>;

  // Google Sheets Integration
  googleSpreadsheetId: string | null;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  syncQueueCount: number;
  createOrConnectSpreadsheet: () => Promise<string>;
  syncNowToGoogleSheets: () => Promise<void>;

  // Timer State
  timerMode: TimerMode;
  timeLeft: number;
  totalDuration: number;
  isRunning: boolean;
  activeTaskId: string | null;
  activeTask: Task | null;
  startTimer: () => void;
  pauseTimer: () => void;
  resetTimer: () => void;
  switchTimerMode: (mode: TimerMode, durationMinutes?: number) => void;
  setActiveTaskId: (id: string | null) => void;
  setCustomDuration: (minutes: number) => void;

  // Refresh
  refreshKey: number;
  triggerRefresh: () => void;

  // Toasts
  toasts: ToastItem[];
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Firebase Auth state
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);

  // Google Sheets Sync state
  const [googleSpreadsheetId, setGoogleSpreadsheetId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncQueueCount, setSyncQueueCount] = useState<number>(0);

  // Tasks cache for linking timer
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Timer state
  const [timerMode, setTimerMode] = useState<TimerMode>('work');
  const [timeLeft, setTimeLeft] = useState<number>(25 * 60);
  const [totalDuration, setTotalDuration] = useState<number>(25 * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const sessionStartTimeRef = useRef<string | null>(null);

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setSyncQueueCount(googleSheetsService.getQueueLength());
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = `toast_${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Theme application
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      if (settings) {
        api.updateSettings({ theme: next }).catch(console.error);
      }
      return next;
    });
  }, [settings]);

  // Load user & settings from API & check Firebase test connection
  useEffect(() => {
    testConnection().catch(console.error);

    api
      .getMe()
      .then(({ user: u, settings: s }) => {
        setUser(u);
        setSettings(s);
        if (s.theme === 'light' || s.theme === 'dark') {
          setTheme(s.theme);
        }
        if (s.googleSpreadsheetId) {
          setGoogleSpreadsheetId(s.googleSpreadsheetId);
        }
        if (s.lastSyncedAt) {
          setLastSyncedAt(s.lastSyncedAt);
        }
        const initialSecs = (s.pomodoroWorkDuration || 25) * 60;
        setTimeLeft(initialSecs);
        setTotalDuration(initialSecs);
      })
      .catch((err) => {
        console.error('Failed to load user info:', err);
      });
  }, [refreshKey]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = initAuthListener(
      (fbUser, token) => {
        setFirebaseUser(fbUser);
        if (token) setGoogleAccessToken(token);

        // Update user state with Google profile details
        setUser({
          id: fbUser.uid,
          email: fbUser.email || 'user@gmail.com',
          name: fbUser.displayName || 'Focus User',
          avatarUrl: fbUser.photoURL || '',
          createdAt: new Date().toISOString(),
        });
      },
      () => {
        setFirebaseUser(null);
        setGoogleAccessToken(null);
      }
    );

    return () => unsubscribe();
  }, []);

  // Load tasks for active task link
  useEffect(() => {
    api
      .getTasks()
      .then((data) => setTasks(data))
      .catch(console.error);
  }, [refreshKey]);

  const activeTask = tasks.find((t) => t.id === activeTaskId) || null;

  const updateSettings = async (newSettings: Partial<UserSettings>) => {
    try {
      const res = await api.updateSettings(newSettings);
      setSettings(res.settings);
      if (newSettings.theme) setTheme(newSettings.theme as 'light' | 'dark');
      if (newSettings.googleSpreadsheetId) setGoogleSpreadsheetId(newSettings.googleSpreadsheetId);
      if (newSettings.lastSyncedAt) setLastSyncedAt(newSettings.lastSyncedAt);

      if (firebaseUser) {
        await firestoreService.saveSettings(firebaseUser.uid, newSettings);
      }

      showToast('Settings saved successfully', 'success');
      triggerRefresh();
    } catch {
      showToast('Failed to update settings', 'error');
    }
  };

  const reseedData = async () => {
    try {
      await api.reseed();
      showToast('Database reset to premium demo state', 'success');
      triggerRefresh();
    } catch {
      showToast('Failed to reset data', 'error');
    }
  };

  // Google Sign-In & Sign-Out handlers
  const signInWithGoogle = async () => {
    try {
      const { user: fbUser, accessToken } = await fbSignInWithGoogle();
      setFirebaseUser(fbUser);
      setGoogleAccessToken(accessToken);
      showToast(`Welcome back, ${fbUser.displayName || 'User'}!`, 'success');
      triggerRefresh();
    } catch (err: unknown) {
      console.error('Sign in failed:', err);
      showToast('Google Sign-In was cancelled or failed', 'error');
    }
  };

  const signOutGoogle = async () => {
    try {
      await fbSignOut();
      setFirebaseUser(null);
      setGoogleAccessToken(null);
      showToast('Signed out of Google account', 'info');
      triggerRefresh();
    } catch {
      showToast('Sign out failed', 'error');
    }
  };

  // Google Sheets Workbook Management
  const createOrConnectSpreadsheet = async (): Promise<string> => {
    let token = googleAccessToken;
    if (!token) {
      token = await getAccessToken();
    }
    if (!token) {
      await signInWithGoogle();
      token = await getAccessToken();
    }
    if (!token) {
      throw new Error('Google authentication required to create spreadsheet');
    }

    setSyncStatus('syncing');
    try {
      showToast('Creating professional master workbook with 12 styled worksheets...', 'info');
      const spreadsheetId = await googleSheetsService.createMasterWorkbook(token);
      setGoogleSpreadsheetId(spreadsheetId);

      await updateSettings({
        googleSpreadsheetId: spreadsheetId,
        lastSyncedAt: new Date().toISOString(),
      });

      // Perform initial full sync into the newly created sheets
      await syncNowToGoogleSheets(spreadsheetId, token);

      showToast('Master Google Sheets workbook initialized with all 12 tabs!', 'success');
      setSyncStatus('synced');
      return spreadsheetId;
    } catch (err: unknown) {
      setSyncStatus('error');
      const msg = err instanceof Error ? err.message : 'Spreadsheet setup failed';
      showToast(msg, 'error');
      throw err;
    }
  };

  const syncNowToGoogleSheets = async (targetSheetId?: string, overrideToken?: string) => {
    const sId = targetSheetId || googleSpreadsheetId;
    let token = overrideToken || googleAccessToken;

    if (!token) {
      token = await getAccessToken();
    }
    if (!token) {
      showToast('Please sign in with Google to sync to Google Sheets', 'info');
      return;
    }
    if (!sId) {
      showToast('Please initialize your Google Sheets master workbook first', 'info');
      return;
    }

    setSyncStatus('syncing');
    try {
      const [sessions, focusStats, incomes, recurring, expenses, bills, financeSummary] =
        await Promise.all([
          api.getFocusSessions(),
          api.getFocusStats(),
          api.getIncomes(),
          api.getRecurringExpenses(),
          api.getExpenses(),
          api.getBills(),
          api.getFinanceSummary(),
        ]);

      await googleSheetsService.syncAllData(sId, token, {
        sessions,
        focusStats,
        incomes,
        recurring,
        expenses,
        bills,
        financeSummary,
      });

      // Flush any queued mutations
      await googleSheetsService.flushQueue(sId, token);

      const nowIso = new Date().toISOString();
      setLastSyncedAt(nowIso);
      setSyncStatus('synced');
      setSyncQueueCount(0);
      await updateSettings({ lastSyncedAt: nowIso });
      showToast('Google Sheets synchronized successfully!', 'success');
    } catch (err: unknown) {
      setSyncStatus('error');
      const msg = err instanceof Error ? err.message : 'Sync failed';
      showToast(`Sync failed: ${msg}`, 'error');
    }
  };

  // Timer controls
  const switchTimerMode = useCallback(
    (mode: TimerMode, durationMinutes?: number) => {
      setIsRunning(false);
      setTimerMode(mode);

      let minutes = 25;
      if (durationMinutes) {
        minutes = durationMinutes;
      } else if (settings) {
        if (mode === 'work') minutes = settings.pomodoroWorkDuration || 25;
        else if (mode === 'short_break') minutes = settings.shortBreakDuration || 5;
        else if (mode === 'long_break') minutes = settings.longBreakDuration || 15;
      } else {
        if (mode === 'work') minutes = 25;
        else if (mode === 'short_break') minutes = 5;
        else if (mode === 'long_break') minutes = 15;
      }

      const totalSec = minutes * 60;
      setTimeLeft(totalSec);
      setTotalDuration(totalSec);
      sessionStartTimeRef.current = null;
    },
    [settings]
  );

  const setCustomDuration = useCallback((minutes: number) => {
    setIsRunning(false);
    const secs = Math.max(1, minutes) * 60;
    setTimeLeft(secs);
    setTotalDuration(secs);
  }, []);

  const startTimer = useCallback(() => {
    if (!sessionStartTimeRef.current) {
      sessionStartTimeRef.current = new Date().toISOString();
    }
    setIsRunning(true);
    playClickSound(settings?.soundEnabled ?? true);
  }, [settings]);

  const pauseTimer = useCallback(() => {
    setIsRunning(false);
    playClickSound(settings?.soundEnabled ?? true);
  }, [settings]);

  const resetTimer = useCallback(() => {
    setIsRunning(false);
    setTimeLeft(totalDuration);
    sessionStartTimeRef.current = null;
    playClickSound(settings?.soundEnabled ?? true);
  }, [totalDuration, settings]);

  // Timer countdown hook
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (isRunning && timeLeft <= 0) {
      setIsRunning(false);

      const isSound = settings?.soundEnabled ?? true;
      if (timerMode === 'work') {
        playFocusCompleteSound(isSound);
        showToast('Focus session complete! Great work!', 'success');

        const startedAt = sessionStartTimeRef.current || new Date().toISOString();
        const endedAt = new Date().toISOString();
        const durationMin = Math.round(totalDuration / 60);

        // Record focus session to API
        api
          .createFocusSession({
            taskId: activeTaskId,
            mode: 'work',
            durationMinutes: durationMin,
            durationSeconds: totalDuration,
            completed: true,
            startedAt,
            endedAt,
          })
          .then((newSession) => {
            // Also save to Firestore if user is authenticated
            if (firebaseUser) {
              firestoreService.saveFocusSession(firebaseUser.uid, newSession).catch(console.error);
            }

            // Enqueue real-time mutation for Google Sheets
            googleSheetsService.enqueueMutation('Focus_Sessions', [
              newSession.id,
              newSession.startedAt.split('T')[0],
              'WORK',
              newSession.durationMinutes,
              newSession.taskTitle || 'Focus Session',
              'YES',
              newSession.startedAt,
              newSession.endedAt,
            ]);

            // Attempt immediate real-time sync if connected
            if (googleSpreadsheetId && googleAccessToken) {
              googleSheetsService
                .flushQueue(googleSpreadsheetId, googleAccessToken)
                .then(() => setSyncStatus('synced'))
                .catch(() => setSyncStatus('error'));
            }

            triggerRefresh();
          })
          .catch(console.error);

        if (settings?.autoSwitchSessions) {
          switchTimerMode('short_break');
          setTimeout(() => setIsRunning(true), 1000);
        } else {
          switchTimerMode('short_break');
        }
      } else {
        playBreakEndSound(isSound);
        showToast('Break finished! Ready to focus?', 'info');
        switchTimerMode('work');
        if (settings?.autoSwitchSessions) {
          setTimeout(() => setIsRunning(true), 1000);
        }
      }
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [
    isRunning,
    timeLeft,
    timerMode,
    totalDuration,
    activeTaskId,
    settings,
    firebaseUser,
    googleSpreadsheetId,
    googleAccessToken,
    showToast,
    switchTimerMode,
    triggerRefresh,
  ]);

  const currency = settings?.currency || 'INR';

  return (
    <AppContext.Provider
      value={{
        currentTab,
        setCurrentTab,
        user,
        settings,
        currency,
        updateSettings,
        theme,
        toggleTheme,
        reseedData,

        // Firebase Auth
        firebaseUser,
        isAuthenticated: !!firebaseUser,
        googleAccessToken,
        signInWithGoogle,
        signOutGoogle,

        // Google Sheets
        googleSpreadsheetId,
        syncStatus,
        lastSyncedAt,
        syncQueueCount,
        createOrConnectSpreadsheet,
        syncNowToGoogleSheets,

        // Timer
        timerMode,
        timeLeft,
        totalDuration,
        isRunning,
        activeTaskId,
        activeTask,
        startTimer,
        pauseTimer,
        resetTimer,
        switchTimerMode,
        setActiveTaskId,
        setCustomDuration,

        // Refresh
        refreshKey,
        triggerRefresh,

        // Toasts
        toasts,
        showToast,
        removeToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
