import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  User,
  UserSettings,
  Task,
  Habit,
  CurrencyCode,
  ThemeConfig,
  SavedCustomTheme,
} from '../types/index.ts';
import { api } from '../lib/api.ts';
import { playFocusCompleteSound, playBreakEndSound, playClickSound, unlockAudioContext } from '../lib/sound.ts';
import {
  auth,
  signInWithGoogle as fbSignInWithGoogle,
  authorizeGoogleSheets as fbAuthorizeGoogleSheets,
  signOut as fbSignOut,
  initAuthListener,
  getAccessToken,
  setAccessToken as fbSetAccessToken,
  testConnection,
} from '../lib/firebase.ts';
import { User as FirebaseUser } from 'firebase/auth';
import { AuthDiagnostic, classifyFirebaseAuthError } from '../lib/authDiagnostics.ts';
import { googleSheetsService } from '../lib/googleSheetsService.ts';
import { firestoreService } from '../lib/firestoreService.ts';
import { offlineOutbox } from '../lib/offlineOutbox.ts';
import type { ConfirmDialogOptions } from '../components/common/ConfirmDialogModal.tsx';
import {
  AmbientPreset,
  startSoundscape,
  stopSoundscape,
  setSoundscapeVolume,
} from '../lib/ambientAudio.ts';
import {
  AppNotificationItem,
  evaluateDeterministicNotifications,
} from '../lib/notificationsEngine.ts';
import { DEFAULT_THEME_CONFIG } from '../theme/stylesRegistry.ts';
import {
  THEME_CACHE_KEY,
  applyThemeToDocument,
  getSystemColorMode,
  resolveColorMode,
  sanitizeThemeConfig,
} from '../theme/themeEngine.ts';

export type NavTab =
  | 'dashboard'
  | 'calendar'
  | 'focus'
  | 'timeblocks'
  | 'tasks'
  | 'habits'
  | 'study'
  | 'finance'
  | 'transactions'
  | 'bills'
  | 'envelopes'
  | 'subscriptions'
  | 'analytics'
  | 'recovery'
  | 'settings';

export const VALID_NAV_TABS: readonly NavTab[] = [
  'dashboard',
  'calendar',
  'focus',
  'timeblocks',
  'tasks',
  'habits',
  'study',
  'finance',
  'transactions',
  'bills',
  'envelopes',
  'subscriptions',
  'analytics',
  'recovery',
  'settings',
] as const;

function readInitialTabFromHash(): NavTab {
  if (typeof window !== 'undefined') {
    const rawHash = window.location.hash.replace(/^#\/?/, '').trim();
    if (VALID_NAV_TABS.includes(rawHash as NavTab)) {
      return rawHash as NavTab;
    }
  }
  return 'dashboard';
}

import {
  TimerEngineMode,
  TimerMode,
  loadInitialTimerState,
  saveTimerState,
  broadcastTimerEvent,
  acquireCompletionLock,
  TimerBroadcastMessage,
  TIMER_BROADCAST_CHANNEL,
} from '../lib/timerEngine.ts';
export type { TimerEngineMode, TimerMode };

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export type ThemeSyncState = 'local' | 'syncing' | 'cloud-synced' | 'offline';

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

function readCachedThemeConfig(): ThemeConfig {
  try {
    const raw = localStorage.getItem(THEME_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.config) {
        return sanitizeThemeConfig(parsed.config);
      }
    }
  } catch {
    // ignore storage parse failures
  }
  return { ...DEFAULT_THEME_CONFIG };
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
  clearAllData: () => Promise<void>;

  // Advanced Design System & Theme Studio
  themeConfig: ThemeConfig;
  effectiveThemeConfig: ThemeConfig;
  previewThemeConfig: ThemeConfig | null;
  isFullAppPreview: boolean;
  resolvedThemeMode: 'light' | 'dark';
  systemColorMode: 'light' | 'dark';
  savedThemes: SavedCustomTheme[];
  activeSavedThemeId: string | null;
  themeSyncState: ThemeSyncState;
  applyThemeConfig: (
    nextConfig: ThemeConfig,
    savedThemeId?: string | null,
    silentToast?: boolean
  ) => Promise<void>;
  startFullAppPreview: (config: ThemeConfig) => void;
  stopFullAppPreview: () => void;
  saveCustomTheme: (
    name: string,
    config: ThemeConfig,
    description?: string
  ) => Promise<SavedCustomTheme>;
  applySavedTheme: (themeId: string) => Promise<void>;
  duplicateSavedTheme: (themeId: string) => Promise<SavedCustomTheme | null>;
  renameCustomTheme: (themeId: string, newName: string) => Promise<void>;
  deleteSavedTheme: (themeId: string) => Promise<void>;
  resetThemeToDefault: () => Promise<void>;
  toggleFavoriteStyle: (styleId: string) => Promise<void>;
  toggleFavoriteTheme: (themeId: string) => Promise<void>;

  // Workspace UX & Focus Extras
  commandCenterOpen: boolean;
  setCommandCenterOpen: (open: boolean) => void;
  fullScreenFocus: boolean;
  setFullScreenFocus: (open: boolean) => void;
  trashModalOpen: boolean;
  setTrashModalOpen: (open: boolean) => void;
  ambientPreset: AmbientPreset;
  ambientVolume: number;
  setAmbientSound: (preset: AmbientPreset, volume?: number) => Promise<void>;
  isOnline: boolean;
  offlineOutboxCount: number;
  reconcileOutboxNow: () => Promise<{ reconciled: number; failed: number }>;
  syncLastError: string | null;
  notifications: AppNotificationItem[];
  activeNotifications: AppNotificationItem[];
  readNotificationIds: string[];
  unreadNotificationCount: number;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  clearNotifications: () => void;

  // Smart Navigation & Shortcuts
  recentTabs: NavTab[];
  favoriteTabs: NavTab[];
  toggleFavoriteTab: (tab: NavTab) => void;
  keyboardShortcutsGuideOpen: boolean;
  setKeyboardShortcutsGuideOpen: (open: boolean) => void;
  quickActionInitialType: 'task' | 'expense' | 'income' | 'bill' | 'habit' | 'envelope' | 'goal';
  setQuickActionInitialType: (type: 'task' | 'expense' | 'income' | 'bill' | 'habit' | 'envelope' | 'goal') => void;

  // In-app Confirmation Modal
  confirmAction: (options: ConfirmDialogOptions) => Promise<boolean>;
  confirmDialogState: (ConfirmDialogOptions & { isOpen: boolean }) | null;
  resolveConfirmDialog: (confirmed: boolean) => void;

  // Firebase Auth
  firebaseUser: FirebaseUser | null;
  isAuthenticated: boolean;
  isSigningIn: boolean;
  authError: AuthDiagnostic | null;
  clearAuthError: () => void;
  googleAccessToken: string | null;
  signInWithGoogle: () => Promise<void>;
  authorizeGoogleSheets: () => Promise<string | null>;
  signOutGoogle: () => Promise<void>;

  // Google Sheets Integration
  googleSpreadsheetId: string | null;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  syncQueueCount: number;
  createOrConnectSpreadsheet: () => Promise<string>;
  syncNowToGoogleSheets: () => Promise<void>;
  historicalResyncToGoogleSheets: () => Promise<void>;
  reapplySheetFormatting: () => Promise<void>;

  // Timer State
  timerEngine: TimerEngineMode;
  setTimerEngine: (engine: TimerEngineMode) => void;
  timerMode: TimerMode;
  timeLeft: number;
  totalDuration: number;
  stopwatchElapsed: number;
  isRunning: boolean;
  completedCycleCount: number;
  activeTaskId: string | null;
  activeTask: Task | null;
  startTimer: () => void;
  pauseTimer: () => void;
  resetTimer: () => void;
  saveStopwatchSession: () => Promise<void>;
  switchTimerMode: (mode: TimerMode, durationMinutes?: number) => void;
  setActiveTaskId: (id: string | null) => void;
  setCustomDuration: (minutes: number) => void;

  // Refresh
  refreshKey: number;
  triggerRefresh: () => void;

  // Habits Cache
  habits: Habit[];

  // Toasts
  toasts: ToastItem[];
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTab, setCurrentTabState] = useState<NavTab>(() => readInitialTabFromHash());
  const [recentTabs, setRecentTabs] = useState<NavTab[]>(() => {
    try {
      const stored = localStorage.getItem('focusflow_recent_tabs');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed.filter((t: any) => VALID_NAV_TABS.includes(t));
      }
    } catch {}
    return ['dashboard', 'focus', 'tasks', 'finance'];
  });
  const [favoriteTabs, setFavoriteTabs] = useState<NavTab[]>(() => {
    try {
      const stored = localStorage.getItem('focusflow_favorite_tabs');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed.filter((t: any) => VALID_NAV_TABS.includes(t));
      }
    } catch {}
    return ['dashboard', 'tasks', 'finance'];
  });
  const [keyboardShortcutsGuideOpen, setKeyboardShortcutsGuideOpen] = useState(false);
  const [quickActionInitialType, setQuickActionInitialType] = useState<
    'task' | 'expense' | 'income' | 'bill' | 'habit' | 'envelope' | 'goal'
  >('task');

  const toggleFavoriteTab = useCallback((tab: NavTab) => {
    setFavoriteTabs((prev) => {
      const next = prev.includes(tab) ? prev.filter((t) => t !== tab) : [...prev, tab];
      try {
        localStorage.setItem('focusflow_favorite_tabs', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const setCurrentTab = useCallback((tab: NavTab) => {
    setCurrentTabState(tab);
    setRecentTabs((prev) => {
      const filtered = prev.filter((t) => t !== tab);
      const next = [tab, ...filtered].slice(0, 8);
      try {
        localStorage.setItem('focusflow_recent_tabs', JSON.stringify(next));
      } catch {}
      return next;
    });
    if (typeof window !== 'undefined') {
      const nextHash = `#${tab}`;
      if (window.location.hash !== nextHash) {
        window.history.pushState(null, '', nextHash);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHashChange = () => {
      const rawHash = window.location.hash.replace(/^#\/?/, '').trim();
      if (VALID_NAV_TABS.includes(rawHash as NavTab)) {
        setCurrentTabState(rawHash as NavTab);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onHashChange);
    };
  }, []);
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Theme Engine state
  const [themeConfig, setThemeConfig] = useState<ThemeConfig>(() => readCachedThemeConfig());
  const [previewThemeConfig, setPreviewThemeConfig] = useState<ThemeConfig | null>(null);
  const [savedThemes, setSavedThemes] = useState<SavedCustomTheme[]>([]);
  const [activeSavedThemeId, setActiveSavedThemeId] = useState<string | null>(null);
  const [systemColorMode, setSystemColorMode] = useState<'light' | 'dark'>(() =>
    getSystemColorMode()
  );
  const [themeSyncState, setThemeSyncState] = useState<ThemeSyncState>('local');

  // Track hydration so refreshes don't clobber active theme changes
  const initialThemeLoadedRef = useRef(false);
  const restoredFirebaseUidRef = useRef<string | null>(null);

  // Firebase Auth state
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<AuthDiagnostic | null>(null);
  const clearAuthError = useCallback(() => setAuthError(null), []);

  // Google Sheets Sync state
  const [googleSpreadsheetId, setGoogleSpreadsheetId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncQueueCount, setSyncQueueCount] = useState<number>(0);

  // Tasks and Habits cache for linking timer & study view
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(() => loadInitialTimerState().activeTaskId);

  // Command Center, Full-Screen Focus, Trash, Audio & Offline/Notifications state
  const [commandCenterOpen, setCommandCenterOpen] = useState(false);
  const [fullScreenFocus, setFullScreenFocus] = useState(false);
  const [trashModalOpen, setTrashModalOpen] = useState(false);
  const [ambientPreset, setAmbientPreset] = useState<AmbientPreset>('off');
  const [ambientVolume, setAmbientVolume] = useState<number>(0.35);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [offlineOutboxCount, setOfflineOutboxCount] = useState<number>(0);
  const [confirmDialogState, setConfirmDialogState] = useState<
    (ConfirmDialogOptions & { isOpen: boolean }) | null
  >(null);
  const confirmResolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [syncLastError, setSyncLastError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotificationItem[]>([]);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('focusflow_read_notifications');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('focusflow_dismissed_notifications');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const markNotificationAsRead = useCallback((id: string) => {
    setReadNotificationIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      try {
        localStorage.setItem('focusflow_read_notifications', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const markAllNotificationsAsRead = useCallback(() => {
    setReadNotificationIds((prev) => {
      const allIds = Array.from(new Set([...prev, ...notifications.map((n) => n.id)]));
      try {
        localStorage.setItem('focusflow_read_notifications', JSON.stringify(allIds));
      } catch {}
      return allIds;
    });
  }, [notifications]);

  const clearNotifications = useCallback(() => {
    setDismissedNotificationIds((prev) => {
      const allIds = Array.from(new Set([...prev, ...notifications.map((n) => n.id)]));
      try {
        localStorage.setItem('focusflow_dismissed_notifications', JSON.stringify(allIds));
      } catch {}
      return allIds;
    });
  }, [notifications]);

  const activeNotifications = useMemo<AppNotificationItem[]>(() => {
    return notifications.filter((n: AppNotificationItem) => !dismissedNotificationIds.includes(n.id));
  }, [notifications, dismissedNotificationIds]);

  const unreadNotificationCount = useMemo<number>(() => {
    return activeNotifications.filter((n: AppNotificationItem) => !readNotificationIds.includes(n.id)).length;
  }, [activeNotifications, readNotificationIds]);

  // Timer state (with Sleep/Wake, Refresh Resilience, and Cross-Tab sync)
  const initialTimer = useMemo(() => loadInitialTimerState(), []);
  const [timerEngine, setTimerEngineState] = useState<TimerEngineMode>(initialTimer.timerEngine);
  const [timerMode, setTimerMode] = useState<TimerMode>(initialTimer.timerMode);
  const [timeLeft, setTimeLeft] = useState<number>(initialTimer.timeLeft);
  const [totalDuration, setTotalDuration] = useState<number>(initialTimer.totalDuration);
  const [stopwatchElapsed, setStopwatchElapsed] = useState<number>(initialTimer.stopwatchElapsed);
  const [isRunning, setIsRunning] = useState<boolean>(initialTimer.isRunning);
  const [completedCycleCount, setCompletedCycleCount] = useState<number>(0);
  const sessionStartTimeRef = useRef<string | null>(initialTimer.sessionStartTime);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSwitchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetEndTimeMsRef = useRef<number | null>(initialTimer.targetEndTimeMs);
  const stopwatchStartMsRef = useRef<number | null>(initialTimer.stopwatchStartMs);
  const stopwatchElapsedRef = useRef<number>(initialTimer.stopwatchElapsed);
  const completionHandledRef = useRef<boolean>(false);
  const timerModifiedByUserRef = useRef<boolean>(initialTimer.isRunning || initialTimer.timeLeft !== 25 * 60);
  const timeLeftRef = useRef<number>(timeLeft);
  const totalDurationRef = useRef<number>(totalDuration);
  timeLeftRef.current = timeLeft;
  totalDurationRef.current = totalDuration;
  stopwatchElapsedRef.current = stopwatchElapsed;

  const isFullAppPreview = previewThemeConfig !== null;
  const effectiveThemeConfig = previewThemeConfig ?? themeConfig;
  const resolvedThemeMode: 'light' | 'dark' =
    effectiveThemeConfig.colorMode === 'system'
      ? systemColorMode
      : effectiveThemeConfig.colorMode;

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setSyncQueueCount(googleSheetsService.getQueueLength());
    void googleSheetsService.refreshQueueCount();
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

  const resolveConfirmDialog = useCallback((confirmed: boolean) => {
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmDialogState(null);
    if (resolver) resolver(confirmed);
  }, []);

  const confirmAction = useCallback((options: ConfirmDialogOptions): Promise<boolean> => {
    if (confirmResolverRef.current) {
      confirmResolverRef.current(false);
      confirmResolverRef.current = null;
    }
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmDialogState({ ...options, isOpen: true });
    });
  }, []);

  const reconcileOutboxNow = useCallback(async () => {
    const uid = firebaseUser?.uid;
    if (!uid) return { reconciled: 0, failed: 0 };
    const result = await api.reconcileOfflineOutbox(uid);
    if (result.reconciled > 0) {
      showToast(
        `Reconciled ${result.reconciled} queued offline operation${result.reconciled > 1 ? 's' : ''} to Firestore.`,
        'success'
      );
      triggerRefresh();
    } else if (result.failed > 0) {
      showToast(
        `${result.failed} queued offline write${result.failed > 1 ? 's' : ''} still awaiting Firestore connectivity.`,
        'info'
      );
    }
    return result;
  }, [firebaseUser?.uid, showToast, triggerRefresh]);

  // Listen to OS prefers-color-scheme changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemColorMode(e.matches ? 'dark' : 'light');
    };
    setSystemColorMode(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  // Sync theme changes across browser tabs via localStorage storage events
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_CACHE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed?.config) {
            setThemeConfig(sanitizeThemeConfig(parsed.config));
          }
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Apply effective theme tokens to document root
  useEffect(() => {
    applyThemeToDocument(effectiveThemeConfig, resolvedThemeMode, !isFullAppPreview);
  }, [effectiveThemeConfig, resolvedThemeMode, isFullAppPreview]);

  // Persist theme payload helper (local API + Firestore)
  const persistThemeState = useCallback(
    async (
      nextConfig: ThemeConfig,
      nextSavedThemes: SavedCustomTheme[],
      nextActiveSavedId: string | null,
      targetFbUser: FirebaseUser | null
    ) => {
      const payload: Partial<UserSettings> = {
        theme: nextConfig.colorMode,
        themeConfig: nextConfig,
        savedThemes: nextSavedThemes,
        activeSavedThemeId: nextActiveSavedId,
      };

      try {
        const res = await api.updateSettings(payload);
        setSettings(res.settings);
      } catch (err) {
        console.error('Failed to persist theme to local API:', err);
      }

      if (targetFbUser && auth.currentUser?.uid === targetFbUser.uid) {
        setThemeSyncState('syncing');
        try {
          await firestoreService.saveSettings(targetFbUser.uid, payload);
          setThemeSyncState('cloud-synced');
        } catch (err) {
          console.warn('Firestore theme sync deferred/offline:', err);
          setThemeSyncState('offline');
        }
      } else {
        setThemeSyncState('local');
      }
    },
    []
  );

  const applyThemeConfig = useCallback(
    async (
      nextConfig: ThemeConfig,
      savedThemeId: string | null = null,
      silentToast = false
    ) => {
      const sanitized = sanitizeThemeConfig(nextConfig);
      setPreviewThemeConfig(null);
      setThemeConfig(sanitized);
      setActiveSavedThemeId(savedThemeId);
      await persistThemeState(sanitized, savedThemes, savedThemeId, firebaseUser);
      if (!silentToast) {
        showToast('Theme applied', 'success');
      }
    },
    [savedThemes, firebaseUser, persistThemeState, showToast]
  );

  const startFullAppPreview = useCallback((config: ThemeConfig) => {
    setPreviewThemeConfig(sanitizeThemeConfig(config));
  }, []);

  const stopFullAppPreview = useCallback(() => {
    setPreviewThemeConfig(null);
  }, []);

  const saveCustomTheme = useCallback(
    async (name: string, config: ThemeConfig, description?: string): Promise<SavedCustomTheme> => {
      const trimmedName = name.trim() || 'Custom Theme';
      const now = new Date().toISOString();
      const sanitized = sanitizeThemeConfig(config);
      const newTheme: SavedCustomTheme = {
        id: `thm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: trimmedName,
        description: description?.trim() || undefined,
        config: sanitized,
        createdAt: now,
        updatedAt: now,
      };
      const nextList = [newTheme, ...savedThemes];
      setSavedThemes(nextList);
      setPreviewThemeConfig(null);
      setThemeConfig(sanitized);
      setActiveSavedThemeId(newTheme.id);
      await persistThemeState(sanitized, nextList, newTheme.id, firebaseUser);
      showToast(`Saved custom theme "${trimmedName}"`, 'success');
      return newTheme;
    },
    [savedThemes, firebaseUser, persistThemeState, showToast]
  );

  const applySavedTheme = useCallback(
    async (themeId: string) => {
      const found = savedThemes.find((t) => t.id === themeId);
      if (!found) return;
      const sanitized = sanitizeThemeConfig(found.config);
      setPreviewThemeConfig(null);
      setThemeConfig(sanitized);
      setActiveSavedThemeId(found.id);
      await persistThemeState(sanitized, savedThemes, found.id, firebaseUser);
      showToast(`Applied "${found.name}"`, 'success');
    },
    [savedThemes, firebaseUser, persistThemeState, showToast]
  );

  const deleteSavedTheme = useCallback(
    async (themeId: string) => {
      const target = savedThemes.find((t) => t.id === themeId);
      const nextList = savedThemes.filter((t) => t.id !== themeId);
      const nextActiveId = activeSavedThemeId === themeId ? null : activeSavedThemeId;
      setSavedThemes(nextList);
      setActiveSavedThemeId(nextActiveId);
      await persistThemeState(themeConfig, nextList, nextActiveId, firebaseUser);
      if (target) {
        showToast(`Deleted "${target.name}"`, 'info');
      }
    },
    [savedThemes, activeSavedThemeId, themeConfig, firebaseUser, persistThemeState, showToast]
  );

  const resetThemeToDefault = useCallback(async () => {
    const freshDefault: ThemeConfig = { ...DEFAULT_THEME_CONFIG };
    setPreviewThemeConfig(null);
    setThemeConfig(freshDefault);
    setActiveSavedThemeId(null);
    await persistThemeState(freshDefault, savedThemes, null, firebaseUser);
    showToast('Theme reset to default', 'info');
  }, [savedThemes, firebaseUser, persistThemeState, showToast]);

  const duplicateSavedTheme = useCallback(
    async (themeId: string): Promise<SavedCustomTheme | null> => {
      const source = savedThemes.find((t) => t.id === themeId);
      if (!source) return null;
      return saveCustomTheme(
        `${source.name} (Copy)`,
        sanitizeThemeConfig(source.config),
        source.description
      );
    },
    [savedThemes, saveCustomTheme]
  );

  const renameCustomTheme = useCallback(
    async (themeId: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed) return;
      const nextList = savedThemes.map((t) =>
        t.id === themeId ? { ...t, name: trimmed, updatedAt: new Date().toISOString() } : t
      );
      setSavedThemes(nextList);
      await persistThemeState(themeConfig, nextList, activeSavedThemeId, firebaseUser);
      showToast(`Renamed theme to "${trimmed}"`, 'success');
    },
    [savedThemes, activeSavedThemeId, themeConfig, firebaseUser, persistThemeState, showToast]
  );

  const toggleFavoriteStyle = useCallback(
    async (styleId: string) => {
      const current = settings?.favoriteStyleIds || [];
      const next = current.includes(styleId)
        ? current.filter((id) => id !== styleId)
        : [...current, styleId];
      try {
        const res = await api.updateSettings({ favoriteStyleIds: next });
        setSettings(res.settings);
      } catch (err) {
        console.warn('Failed to toggle favorite style:', err);
      }
    },
    [settings]
  );

  const toggleFavoriteTheme = useCallback(
    async (themeId: string) => {
      const current = settings?.favoriteThemeIds || [];
      const next = current.includes(themeId)
        ? current.filter((id) => id !== themeId)
        : [...current, themeId];
      try {
        const res = await api.updateSettings({ favoriteThemeIds: next });
        setSettings(res.settings);
      } catch (err) {
        console.warn('Failed to toggle favorite theme:', err);
      }
    },
    [settings]
  );

  const setAmbientSound = useCallback(
    async (preset: AmbientPreset, volume?: number) => {
      const nextVol = volume !== undefined ? volume : ambientVolume;
      if (volume !== undefined) setAmbientVolume(nextVol);
      if (preset === 'off') {
        stopSoundscape();
        setAmbientPreset('off');
        return;
      }
      if (preset === ambientPreset && volume !== undefined) {
        setSoundscapeVolume(nextVol);
        return;
      }
      const started = await startSoundscape(preset, nextVol);
      setAmbientPreset(started);
    },
    [ambientPreset, ambientVolume]
  );

  const reconcileRef = useRef(reconcileOutboxNow);
  reconcileRef.current = reconcileOutboxNow;

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      void reconcileRef.current();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      stopSoundscape();
    };
  }, []);

  // Subscribe to real durable Google Sheets sync queue length & per-user offline outbox count
  useEffect(() => {
    const unsubQueue = googleSheetsService.subscribeQueue(setSyncQueueCount);
    void googleSheetsService.refreshQueueCount();
    return () => unsubQueue();
  }, [firebaseUser?.uid]);

  useEffect(() => {
    if (!firebaseUser?.uid) {
      setOfflineOutboxCount(0);
      return;
    }
    return offlineOutbox.subscribe(firebaseUser.uid, setOfflineOutboxCount);
  }, [firebaseUser?.uid]);

  const toggleTheme = useCallback(() => {
    const nextColorMode: 'light' | 'dark' = resolvedThemeMode === 'dark' ? 'light' : 'dark';
    const nextConfig: ThemeConfig = {
      ...themeConfig,
      colorMode: nextColorMode,
    };
    void applyThemeConfig(nextConfig, activeSavedThemeId, true);
  }, [resolvedThemeMode, themeConfig, activeSavedThemeId, applyThemeConfig]);

  // Load user & settings from API & check Firebase test connection
  useEffect(() => {
    testConnection().catch(console.error);

    api
      .getMe()
      .then(({ user: u, settings: s }) => {
        setUser((prev) => prev || u);
        setSettings(s);

        if (!initialThemeLoadedRef.current) {
          initialThemeLoadedRef.current = true;
          if (s.themeConfig) {
            setThemeConfig(sanitizeThemeConfig(s.themeConfig));
          } else if (s.theme === 'light' || s.theme === 'dark' || s.theme === 'system') {
            setThemeConfig((prev) => ({ ...prev, colorMode: s.theme }));
          }
          if (Array.isArray(s.savedThemes)) {
            setSavedThemes(s.savedThemes);
          }
          if (s.activeSavedThemeId !== undefined) {
            setActiveSavedThemeId(s.activeSavedThemeId ?? null);
          }
        }

        if (s.googleSpreadsheetId) {
          setGoogleSpreadsheetId(s.googleSpreadsheetId);
        }
        if (s.lastSyncedAt) {
          setLastSyncedAt(s.lastSyncedAt);
        }
        const rawWorkMin = Number(s.pomodoroWorkDuration);
        const safeWorkMin =
          Number.isFinite(rawWorkMin) && rawWorkMin >= 1 ? Math.min(180, Math.round(rawWorkMin)) : 25;
        const initialSecs = safeWorkMin * 60;
        if (!isRunning && !timerModifiedByUserRef.current) {
          setTimeLeft(initialSecs);
          setTotalDuration(initialSecs);
        }
      })
      .catch((err) => {
        console.error('Failed to load user info:', err);
      });
  }, [refreshKey]);

  // Listen to Firebase Auth state & restore user's last selected theme on login
  useEffect(() => {
    const unsubscribe = initAuthListener(
      async (fbUser, token) => {
        setFirebaseUser(fbUser);
        if (token) setGoogleAccessToken(token);

        setUser({
          id: fbUser.uid,
          email: fbUser.email || 'user@gmail.com',
          name: fbUser.displayName || 'Focus User',
          avatarUrl: fbUser.photoURL || '',
          createdAt: new Date().toISOString(),
        });

        if (restoredFirebaseUidRef.current !== fbUser.uid) {
          restoredFirebaseUidRef.current = fbUser.uid;
          setThemeSyncState('syncing');
          try {
            if (auth.currentUser?.uid !== fbUser.uid) return;
            const remoteSettings = await firestoreService.getSettings(fbUser.uid);
            if (auth.currentUser?.uid !== fbUser.uid) return;

            if (remoteSettings && (remoteSettings.themeConfig || remoteSettings.savedThemes || remoteSettings.theme)) {
              const restoredConfig = remoteSettings.themeConfig
                ? sanitizeThemeConfig(remoteSettings.themeConfig)
                : sanitizeThemeConfig({
                    ...DEFAULT_THEME_CONFIG,
                    colorMode: remoteSettings.theme || 'dark',
                  });

              const restoredSaved = Array.isArray(remoteSettings.savedThemes)
                ? remoteSettings.savedThemes
                : [];
              const restoredActiveId = remoteSettings.activeSavedThemeId ?? null;

              setThemeConfig(restoredConfig);
              setSavedThemes(restoredSaved);
              setActiveSavedThemeId(restoredActiveId);
              setSettings((prev) =>
                prev
                  ? {
                      ...prev,
                      theme: restoredConfig.colorMode,
                      themeConfig: restoredConfig,
                      savedThemes: restoredSaved,
                      activeSavedThemeId: restoredActiveId,
                    }
                  : prev
              );
              setThemeSyncState('cloud-synced');
            } else {
              // First login for this user: back up current active theme config to Firestore
              const current = readCachedThemeConfig();
              await firestoreService.saveSettings(fbUser.uid, {
                userId: fbUser.uid,
                theme: current.colorMode,
                themeConfig: current,
                savedThemes,
                activeSavedThemeId,
              });
              setThemeSyncState('cloud-synced');
            }
          } catch (err) {
            console.warn('Could not restore theme from Firestore (offline or unavailable):', err);
            setThemeSyncState('offline');
          }
          if (auth.currentUser?.uid === fbUser.uid && offlineOutbox.count(fbUser.uid) > 0) {
            const recResult = await api.reconcileOfflineOutbox(fbUser.uid).catch(() => ({
              reconciled: 0,
              failed: 0,
            }));
            if (recResult.reconciled > 0) {
              showToast(
                `Synced ${recResult.reconciled} pending offline record${recResult.reconciled > 1 ? 's' : ''} to Firestore.`,
                'success'
              );
            }
          }
          triggerRefresh();
        }
      },
      () => {
        const hadFbUser = restoredFirebaseUidRef.current !== null;
        setFirebaseUser(null);
        setGoogleAccessToken(null);
        restoredFirebaseUidRef.current = null;
        setThemeSyncState('local');
        if (hadFbUser) {
          setUser(null);
          triggerRefresh();
        }
      }
    );

    return () => unsubscribe();
  }, []);

  // Load tasks & evaluate deterministic notifications
  useEffect(() => {
    Promise.all([
      api.getTasks().catch(() => [] as Task[]),
      api.getBills().catch(() => []),
      api.getDashboard().catch(() => null),
      api.getFinanceSummary().catch(() => null),
      api.getSavingsGoals().catch(() => []),
      api.getExpenses().catch(() => []),
      api.getHabits().catch(() => [] as Habit[]),
    ])
      .then(([taskList, billList, dashData, finSummary, goalList, expenseList, habitList]) => {
        setTasks(taskList);
        setHabits(habitList);
        const items = evaluateDeterministicNotifications({
          settings,
          tasks: taskList,
          bills: billList,
          dashboard: dashData,
          financeSummary: finSummary,
          savingsGoals: goalList,
          expenses: expenseList,
          syncLastError,
          habits: habitList,
        });
        setNotifications(items);
      })
      .catch(console.error);
  }, [refreshKey, settings, syncLastError]);

  const activeTask = tasks.find((t) => t.id === activeTaskId) || null;

  const updateSettings = async (newSettings: Partial<UserSettings>) => {
    try {
      const res = await api.updateSettings(newSettings);
      setSettings(res.settings);
      if (newSettings.themeConfig) {
        setThemeConfig(sanitizeThemeConfig(newSettings.themeConfig));
      } else if (newSettings.theme) {
        setThemeConfig((prev) => ({ ...prev, colorMode: newSettings.theme! }));
      }
      if (newSettings.googleSpreadsheetId) setGoogleSpreadsheetId(newSettings.googleSpreadsheetId);
      if (newSettings.lastSyncedAt) setLastSyncedAt(newSettings.lastSyncedAt);

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

  const clearAllData = async () => {
    try {
      await api.clearWorkspace();
      showToast('All workspace records cleared successfully', 'success');
      triggerRefresh();
    } catch {
      showToast('Failed to clear workspace data', 'error');
    }
  };

  // Google Sign-In, Incremental Sheets Auth & Sign-Out handlers
  const signInWithGoogle = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      const { user: fbUser, accessToken } = await fbSignInWithGoogle();
      setFirebaseUser(fbUser);
      if (accessToken) {
        setGoogleAccessToken(accessToken);
      }
      showToast(`Welcome back, ${fbUser.displayName || 'User'}!`, 'success');
      triggerRefresh();
    } catch (err: unknown) {
      console.error('Sign in failed:', err);
      const diagnostic = classifyFirebaseAuthError(err, {
        scopeMode: 'basic',
        userEmail: firebaseUser?.email,
      });
      setAuthError(diagnostic);
      showToast(`${diagnostic.title} (${diagnostic.code})`, 'error');
    } finally {
      setIsSigningIn(false);
    }
  };

  const authorizeGoogleSheets = async (): Promise<string | null> => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      const { user: fbUser, accessToken } = await fbAuthorizeGoogleSheets(firebaseUser?.email);
      setFirebaseUser(fbUser);
      setGoogleAccessToken(accessToken);
      showToast('Google Sheets permissions granted!', 'success');
      triggerRefresh();
      return accessToken;
    } catch (err: unknown) {
      console.error('Google Sheets authorization failed:', err);
      const diagnostic = classifyFirebaseAuthError(err, {
        scopeMode: 'sheets',
        userEmail: firebaseUser?.email,
      });
      setAuthError(diagnostic);
      showToast(`${diagnostic.title} (${diagnostic.code})`, 'error');
      return null;
    } finally {
      setIsSigningIn(false);
    }
  };

  const signOutGoogle = async () => {
    try {
      await fbSignOut();
      setFirebaseUser(null);
      setGoogleAccessToken(null);
      setAuthError(null);
      restoredFirebaseUidRef.current = null;
      setThemeSyncState('local');
      showToast('Signed out of Google account', 'info');
      triggerRefresh();
    } catch {
      showToast('Sign out failed', 'error');
    }
  };

  const handleSheetsSyncError = (err: unknown, fallbackLabel: string): string => {
    setSyncStatus('error');
    const msg = err instanceof Error ? err.message : fallbackLabel;
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code?: unknown }).code || '')
        : '';
    const status =
      err && typeof err === 'object' && 'status' in err
        ? Number((err as { status?: unknown }).status || 0)
        : 0;

    setSyncLastError(msg);

    if (
      code === 'SHEETS_AUTH_REQUIRED' ||
      status === 401 ||
      /\b401\b|UNAUTHENTICATED|invalid authentication credentials|Invalid Credentials|insufficient authentication scopes/i.test(
        msg
      )
    ) {
      fbSetAccessToken(null);
      setGoogleAccessToken(null);
      setAuthError(
        classifyFirebaseAuthError(
          { code: 'auth/access-denied', message: msg },
          { scopeMode: 'sheets', userEmail: firebaseUser?.email }
        )
      );
    }

    return msg;
  };

  // Google Sheets Workbook Management
  const createOrConnectSpreadsheet = async (): Promise<string> => {
    let token: string | null = googleAccessToken;
    if (!token) {
      token = await getAccessToken();
    }
    if (!token) {
      token = await authorizeGoogleSheets();
    }
    if (!token) {
      return '';
    }

    setSyncStatus('syncing');
    try {
      showToast('Creating executive master workbook with 23 styled worksheets, charts & live formulas...', 'info');
      const spreadsheetId = await googleSheetsService.createMasterWorkbook(token);
      setGoogleSpreadsheetId(spreadsheetId);

      await updateSettings({
        googleSpreadsheetId: spreadsheetId,
        lastSyncedAt: new Date().toISOString(),
      });

      await syncNowToGoogleSheets(spreadsheetId, token);

      showToast('Executive Google Sheets workbook initialized with all 23 worksheets!', 'success');
      setSyncStatus('synced');
      return spreadsheetId;
    } catch (err: unknown) {
      const msg = handleSheetsSyncError(err, 'Spreadsheet setup failed');
      showToast(msg, 'error');
      throw err;
    }
  };

  const syncNowToGoogleSheets = async (targetSheetId?: string, overrideToken?: string) => {
    const sId = targetSheetId || googleSpreadsheetId;
    let token: string | null = overrideToken || googleAccessToken;

    if (!token) {
      token = await getAccessToken();
    }
    if (!token) {
      token = await authorizeGoogleSheets();
    }
    if (!token) {
      return;
    }
    if (!sId) {
      showToast('Please initialize your Google Sheets master workbook first', 'info');
      return;
    }

    setSyncStatus('syncing');
    try {
      const [
        sessions,
        focusStats,
        incomes,
        recurring,
        expenses,
        bills,
        paymentHistory,
        financeSummary,
        tasks,
        envelopes,
        savingsGoals,
        syncQueue,
      ] = await Promise.all([
        api.getFocusSessions(),
        api.getFocusStats(),
        api.getIncomes(),
        api.getRecurringExpenses(),
        api.getExpenses(),
        api.getBills(),
        api.getPaymentHistory(),
        api.getFinanceSummary(),
        api.getTasks(),
        api.getEnvelopes(),
        api.getSavingsGoals(),
        api.getSyncQueue().catch(() => []),
      ]);

      await googleSheetsService.syncAllData(sId, token, {
        sessions,
        focusStats,
        incomes,
        recurring,
        expenses,
        bills,
        paymentHistory,
        financeSummary,
        tasks,
        envelopes,
        savingsGoals,
        syncQueue,
        userSettings: settings,
      });

      const flushed = await googleSheetsService.flushQueue(sId, token);
      if (flushed > 0) {
        console.log(`[Sync] Flushed ${flushed} pending durable sync operations.`);
      }

      const nowIso = new Date().toISOString();
      setLastSyncedAt(nowIso);
      setSyncStatus('synced');
      const activeOps = (await api.getSyncQueue().catch(() => [])).filter((o) => o.status !== 'completed');
      setSyncQueueCount(activeOps.length);
      setSyncLastError(googleSheetsService.getLastError());
      await updateSettings({ lastSyncedAt: nowIso });
      showToast('Executive Google Sheets workbook synchronized successfully!', 'success');
    } catch (err: unknown) {
      const msg = handleSheetsSyncError(err, 'Sync failed');
      showToast(`Sync failed: ${msg}`, 'error');
    }
  };

  const historicalResyncToGoogleSheets = async () => {
    if (!googleSpreadsheetId) {
      showToast('Please initialize your Google Sheets master workbook first', 'info');
      return;
    }
    let token: string | null = googleAccessToken;
    if (!token) {
      token = await getAccessToken();
    }
    if (!token) {
      token = await authorizeGoogleSheets();
    }
    if (!token) {
      return;
    }

    const confirmed = await confirmAction({
      title: 'Confirm Historical Resync',
      message:
        'This verifies your spreadsheet metadata, dynamically clears synced ledger ranges while preserving your charts, formatting, formulas, and column widths, and rebuilds all 23 worksheets from Firestore.',
      itemLabel: `Spreadsheet ID: ${googleSpreadsheetId}`,
      confirmLabel: 'Yes, Run Historical Resync',
      cancelLabel: 'Cancel',
      tone: 'warning',
    });
    if (!confirmed) return;

    setSyncStatus('syncing');
    try {
      const [
        sessions,
        focusStats,
        incomes,
        recurring,
        expenses,
        bills,
        paymentHistory,
        financeSummary,
        tasks,
        envelopes,
        savingsGoals,
        syncQueue,
      ] = await Promise.all([
        api.getFocusSessions(),
        api.getFocusStats(),
        api.getIncomes(),
        api.getRecurringExpenses(),
        api.getExpenses(),
        api.getBills(),
        api.getPaymentHistory(),
        api.getFinanceSummary(),
        api.getTasks(),
        api.getEnvelopes(),
        api.getSavingsGoals(),
        api.getSyncQueue().catch(() => []),
      ]);

      await googleSheetsService.historicalResync(
        googleSpreadsheetId,
        token,
        {
          sessions,
          focusStats,
          incomes,
          recurring,
          expenses,
          bills,
          paymentHistory,
          financeSummary,
          tasks,
          envelopes,
          savingsGoals,
          syncQueue,
          userSettings: settings,
        },
        true
      );

      const nowIso = new Date().toISOString();
      setLastSyncedAt(nowIso);
      setSyncStatus('synced');
      const activeOps = (await api.getSyncQueue().catch(() => [])).filter((o) => o.status !== 'completed');
      setSyncQueueCount(activeOps.length);
      setSyncLastError(googleSheetsService.getLastError());
      await updateSettings({ lastSyncedAt: nowIso });
      showToast('Historical resync completed — all 23 worksheets rebuilt safely!', 'success');
    } catch (err: unknown) {
      const msg = handleSheetsSyncError(err, 'Resync failed');
      showToast(`Historical resync failed: ${msg}`, 'error');
    }
  };

  const reapplySheetFormatting = async () => {
    if (!googleSpreadsheetId) {
      showToast('Please initialize your Google Sheets master workbook first', 'info');
      return;
    }
    let token: string | null = googleAccessToken;
    if (!token) {
      token = await getAccessToken();
    }
    if (!token) {
      token = await authorizeGoogleSheets();
    }
    if (!token) {
      return;
    }
    setSyncStatus('syncing');
    try {
      await googleSheetsService.applyFormatting(googleSpreadsheetId, token, true);
      setSyncStatus('synced');
      showToast('Worksheet styling, number formats, and column widths re-applied.', 'success');
    } catch (err: unknown) {
      const msg = handleSheetsSyncError(err, 'Failed to apply formatting');
      showToast(`Formatting update failed: ${msg}`, 'error');
    }
  };

  const clearTimerHandles = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (autoSwitchTimeoutRef.current !== null) {
      clearTimeout(autoSwitchTimeoutRef.current);
      autoSwitchTimeoutRef.current = null;
    }
  }, []);

  // Cleanup active timer handles on unmount
  useEffect(() => {
    return () => clearTimerHandles();
  }, [clearTimerHandles]);

  // Timer controls
  const switchTimerMode = useCallback(
    (mode: TimerMode, durationMinutes?: number) => {
      clearTimerHandles();
      targetEndTimeMsRef.current = null;
      completionHandledRef.current = false;
      timerModifiedByUserRef.current = true;
      setIsRunning(false);
      setTimerMode(mode);

      let rawMinutes = 25;
      if (durationMinutes !== undefined) {
        rawMinutes = durationMinutes;
      } else if (settings) {
        if (mode === 'work') rawMinutes = settings.pomodoroWorkDuration || 25;
        else if (mode === 'short_break') rawMinutes = settings.shortBreakDuration || 5;
        else if (mode === 'long_break') rawMinutes = settings.longBreakDuration || 15;
      } else {
        if (mode === 'work') rawMinutes = 25;
        else if (mode === 'short_break') rawMinutes = 5;
        else if (mode === 'long_break') rawMinutes = 15;
      }

      const clampedMinutes = Number.isFinite(rawMinutes)
        ? Math.max(1, Math.min(180, Math.round(rawMinutes)))
        : mode === 'work'
        ? 25
        : mode === 'short_break'
        ? 5
        : 15;

      const totalSec = clampedMinutes * 60;
      timeLeftRef.current = totalSec;
      totalDurationRef.current = totalSec;
      setTimeLeft(totalSec);
      setTotalDuration(totalSec);
      sessionStartTimeRef.current = null;

      saveTimerState({
        timerEngine,
        timerMode: mode,
        isRunning: false,
        timeLeft: totalSec,
        totalDuration: totalSec,
        targetEndTimeMs: null,
        stopwatchStartMs: null,
        sessionStartTime: null,
      });
      broadcastTimerEvent({
        type: 'TIMER_SYNC_MODE',
        payload: { mode, durationSecs: totalSec },
      });
    },
    [settings, clearTimerHandles, timerEngine]
  );

  const setCustomDuration = useCallback(
    (minutes: number) => {
      clearTimerHandles();
      targetEndTimeMsRef.current = null;
      completionHandledRef.current = false;
      timerModifiedByUserRef.current = true;
      setIsRunning(false);
      const safeMinutes = Number.isFinite(minutes)
        ? Math.max(1, Math.min(180, Math.round(minutes)))
        : 25;
      const secs = safeMinutes * 60;
      timeLeftRef.current = secs;
      totalDurationRef.current = secs;
      setTimeLeft(secs);
      setTotalDuration(secs);
      sessionStartTimeRef.current = null;

      saveTimerState({
        isRunning: false,
        timeLeft: secs,
        totalDuration: secs,
        targetEndTimeMs: null,
        sessionStartTime: null,
      });
      broadcastTimerEvent({
        type: 'TIMER_SYNC_MODE',
        payload: { mode: timerMode, durationSecs: secs },
      });
    },
    [clearTimerHandles, timerMode]
  );

  const setTimerEngine = useCallback(
    (engine: TimerEngineMode) => {
      clearTimerHandles();
      targetEndTimeMsRef.current = null;
      stopwatchStartMsRef.current = null;
      completionHandledRef.current = false;
      setIsRunning(false);
      setTimerEngineState(engine);
      if (engine === 'stopwatch') {
        stopwatchElapsedRef.current = 0;
        setStopwatchElapsed(0);
        sessionStartTimeRef.current = null;
        saveTimerState({
          timerEngine: 'stopwatch',
          isRunning: false,
          stopwatchElapsed: 0,
          stopwatchStartMs: null,
          sessionStartTime: null,
        });
      } else if (engine === 'countdown') {
        const secs = 15 * 60;
        timeLeftRef.current = secs;
        totalDurationRef.current = secs;
        setTimeLeft(secs);
        setTotalDuration(secs);
        saveTimerState({
          timerEngine: 'countdown',
          isRunning: false,
          timeLeft: secs,
          totalDuration: secs,
          targetEndTimeMs: null,
        });
      } else {
        const workMins = Math.max(1, Math.min(180, Math.round(settings?.pomodoroWorkDuration || 25)));
        const secs = workMins * 60;
        setTimerMode('work');
        timeLeftRef.current = secs;
        totalDurationRef.current = secs;
        setTimeLeft(secs);
        setTotalDuration(secs);
        saveTimerState({
          timerEngine: 'pomodoro',
          timerMode: 'work',
          isRunning: false,
          timeLeft: secs,
          totalDuration: secs,
          targetEndTimeMs: null,
        });
      }
      broadcastTimerEvent({
        type: 'TIMER_SYNC_ENGINE',
        payload: { engine },
      });
    },
    [clearTimerHandles, settings]
  );

  const startTimer = useCallback(() => {
    clearTimerHandles();
    unlockAudioContext();
    timerModifiedByUserRef.current = true;
    completionHandledRef.current = false;

    if (timerEngine === 'stopwatch') {
      const now = Date.now();
      const startMs = now - stopwatchElapsedRef.current * 1000;
      stopwatchStartMsRef.current = startMs;
      if (!sessionStartTimeRef.current) {
        sessionStartTimeRef.current = new Date().toISOString();
      }
      setIsRunning(true);
      playClickSound(settings?.soundEnabled ?? true);
      saveTimerState({
        timerEngine: 'stopwatch',
        isRunning: true,
        stopwatchStartMs: startMs,
        sessionStartTime: sessionStartTimeRef.current,
        activeTaskId,
      });
      broadcastTimerEvent({
        type: 'TIMER_SYNC_START',
        payload: {
          targetEndTimeMs: null,
          stopwatchStartMs: startMs,
          totalDuration: totalDurationRef.current,
          timerMode,
          timerEngine: 'stopwatch',
          sessionStartTime: sessionStartTimeRef.current,
          activeTaskId,
        },
      });
      return;
    }

    const currentRemaining = Math.max(0, Math.floor(timeLeftRef.current));
    const effectiveSecs =
      currentRemaining > 0 ? currentRemaining : Math.max(60, Math.floor(totalDurationRef.current) || 1500);
    if (currentRemaining <= 0) {
      timeLeftRef.current = effectiveSecs;
      setTimeLeft(effectiveSecs);
    }
    const targetEnd = Date.now() + effectiveSecs * 1000;
    targetEndTimeMsRef.current = targetEnd;

    if (!sessionStartTimeRef.current) {
      sessionStartTimeRef.current = new Date().toISOString();
    }
    setIsRunning(true);
    playClickSound(settings?.soundEnabled ?? true);

    saveTimerState({
      timerEngine,
      timerMode,
      isRunning: true,
      timeLeft: effectiveSecs,
      totalDuration: totalDurationRef.current,
      targetEndTimeMs: targetEnd,
      stopwatchStartMs: null,
      sessionStartTime: sessionStartTimeRef.current,
      activeTaskId,
    });
    broadcastTimerEvent({
      type: 'TIMER_SYNC_START',
      payload: {
        targetEndTimeMs: targetEnd,
        stopwatchStartMs: null,
        totalDuration: totalDurationRef.current,
        timerMode,
        timerEngine,
        sessionStartTime: sessionStartTimeRef.current,
        activeTaskId,
      },
    });
  }, [settings, clearTimerHandles, timerEngine, timerMode, activeTaskId]);

  const pauseTimer = useCallback(() => {
    clearTimerHandles();
    unlockAudioContext();
    timerModifiedByUserRef.current = true;
    if (timerEngine === 'stopwatch' && stopwatchStartMsRef.current !== null) {
      const elapsed = Math.max(0, Math.floor((Date.now() - stopwatchStartMsRef.current) / 1000));
      stopwatchElapsedRef.current = elapsed;
      setStopwatchElapsed(elapsed);
      stopwatchStartMsRef.current = null;
      saveTimerState({ isRunning: false, stopwatchElapsed: elapsed, stopwatchStartMs: null });
      broadcastTimerEvent({ type: 'TIMER_SYNC_PAUSE', payload: { timeLeft: 0, stopwatchElapsed: elapsed, timerEngine } });
    } else if (targetEndTimeMsRef.current !== null) {
      const remaining = Math.max(0, Math.ceil((targetEndTimeMsRef.current - Date.now()) / 1000));
      timeLeftRef.current = remaining;
      setTimeLeft(remaining);
      targetEndTimeMsRef.current = null;
      saveTimerState({ isRunning: false, timeLeft: remaining, targetEndTimeMs: null });
      broadcastTimerEvent({ type: 'TIMER_SYNC_PAUSE', payload: { timeLeft: remaining, stopwatchElapsed: 0, timerEngine } });
    }
    setIsRunning(false);
    playClickSound(settings?.soundEnabled ?? true);
  }, [settings, clearTimerHandles, timerEngine]);

  const resetTimer = useCallback(() => {
    clearTimerHandles();
    unlockAudioContext();
    targetEndTimeMsRef.current = null;
    stopwatchStartMsRef.current = null;
    completionHandledRef.current = false;
    timerModifiedByUserRef.current = true;
    setIsRunning(false);
    let safeTotal = 1500;
    if (timerEngine === 'stopwatch') {
      stopwatchElapsedRef.current = 0;
      setStopwatchElapsed(0);
    } else {
      safeTotal = Math.max(60, Math.floor(totalDurationRef.current) || 1500);
      timeLeftRef.current = safeTotal;
      setTimeLeft(safeTotal);
    }
    sessionStartTimeRef.current = null;
    playClickSound(settings?.soundEnabled ?? true);
    saveTimerState({
      isRunning: false,
      timeLeft: safeTotal,
      stopwatchElapsed: 0,
      targetEndTimeMs: null,
      stopwatchStartMs: null,
      sessionStartTime: null,
    });
    broadcastTimerEvent({
      type: 'TIMER_SYNC_RESET',
      payload: { totalDuration: safeTotal, timerEngine, timerMode },
    });
  }, [settings, clearTimerHandles, timerEngine, timerMode]);

  const saveStopwatchSession = useCallback(async () => {
    const secs = Math.max(0, Math.floor(stopwatchElapsedRef.current));
    if (secs < 30) {
      showToast('Record at least 30 seconds before saving a stopwatch focus session', 'info');
      return;
    }
    const mins = Math.max(1, Math.round(secs / 60));
    const startedAt = sessionStartTimeRef.current || new Date(Date.now() - secs * 1000).toISOString();
    const endedAt = new Date().toISOString();

    try {
      const created = await api.createFocusSession({
        taskId: activeTaskId,
        mode: 'work',
        durationMinutes: mins,
        durationSeconds: secs,
        completed: true,
        startedAt,
        endedAt,
      });
      void googleSheetsService.enqueueMutation(
        'Focus_Sessions',
        [
          created.id,
          created.startedAt.split('T')[0],
          'WORK',
          created.durationMinutes,
          created.taskTitle || 'Stopwatch Focus',
          'YES',
          created.startedAt,
          created.endedAt,
        ],
        'append',
        `Focus_Sessions_append_${created.id}`
      );
      if (googleSpreadsheetId && googleAccessToken) {
        googleSheetsService.flushQueue(googleSpreadsheetId, googleAccessToken).catch(console.error);
      }
      resetTimer();
      triggerRefresh();
      showToast(`Logged ${mins} min stopwatch focus session!`, 'success');
    } catch {
      showToast('Failed to log stopwatch session', 'error');
    }
  }, [activeTaskId, googleSpreadsheetId, googleAccessToken, resetTimer, showToast, triggerRefresh]);

  const latestTimerDepsRef = useRef({
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
  });
  latestTimerDepsRef.current = {
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
  };

  // Timestamp-based countdown / stopwatch loop (drift-free across background tabs)
  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    if (timerEngine === 'stopwatch') {
      if (stopwatchStartMsRef.current === null) {
        stopwatchStartMsRef.current = Date.now() - stopwatchElapsedRef.current * 1000;
      }
      const syncStopwatch = () => {
        if (stopwatchStartMsRef.current === null) return;
        const elapsed = Math.max(0, Math.floor((Date.now() - stopwatchStartMsRef.current) / 1000));
        setStopwatchElapsed((prev) => (prev === elapsed ? prev : elapsed));
      };
      syncStopwatch();
      intervalRef.current = setInterval(syncStopwatch, 250);
      document.addEventListener('visibilitychange', syncStopwatch);
      return () => {
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        document.removeEventListener('visibilitychange', syncStopwatch);
      };
    }

    if (targetEndTimeMsRef.current === null) {
      const baseSecs = Math.max(1, Math.floor(timeLeftRef.current) || 1);
      targetEndTimeMsRef.current = Date.now() + baseSecs * 1000;
    }

    const handleCompletion = () => {
      if (completionHandledRef.current) return;
      completionHandledRef.current = true;
      clearTimerHandles();
      targetEndTimeMsRef.current = null;
      setIsRunning(false);
      setCompletedCycleCount((c) => c + 1);

      const {
        timerMode: modeNow,
        totalDuration: durationNow,
        activeTaskId: taskNow,
        settings: settingsNow,
        firebaseUser: fbUserNow,
        googleSpreadsheetId: sheetIdNow,
        googleAccessToken: tokenNow,
        showToast: toastNow,
        switchTimerMode: switchModeNow,
        triggerRefresh: refreshNow,
      } = latestTimerDepsRef.current;

      const startedAt = sessionStartTimeRef.current || new Date().toISOString();
      const endedAt = new Date().toISOString();
      const safeDurationSecs = Math.max(60, Math.round(durationNow || 1500));
      const durationMin = Math.max(1, Math.round(safeDurationSecs / 60));

      const completionKey = `comp_${modeNow}_${startedAt}_${durationMin}`;
      const isLeader = acquireCompletionLock(completionKey);

      saveTimerState({
        isRunning: false,
        targetEndTimeMs: null,
        timeLeft: 0,
      });

      broadcastTimerEvent({
        type: 'TIMER_SYNC_COMPLETED',
        payload: { completionKey, completedAt: endedAt },
      });

      const isSound = settingsNow?.soundEnabled ?? true;
      if (modeNow === 'work') {
        playFocusCompleteSound(isSound);
        toastNow('Focus session complete! Great work!', 'success');

        if (isLeader) {
          api
            .createFocusSession({
              taskId: taskNow,
              mode: 'work',
              durationMinutes: durationMin,
              durationSeconds: safeDurationSecs,
              completed: true,
              startedAt,
              endedAt,
            })
            .then((newSession) => {
              void googleSheetsService.enqueueMutation(
                'Focus_Sessions',
                [
                  newSession.id,
                  newSession.startedAt.split('T')[0],
                  'WORK',
                  newSession.durationMinutes,
                  newSession.taskTitle || 'Focus Session',
                  'YES',
                  newSession.startedAt,
                  newSession.endedAt,
                ],
                'append',
                `Focus_Sessions_append_${newSession.id}`
              );

              if (sheetIdNow && tokenNow) {
                googleSheetsService
                  .flushQueue(sheetIdNow, tokenNow)
                  .then(() => setSyncStatus('synced'))
                  .catch(() => setSyncStatus('error'));
              }

              refreshNow();
            })
            .catch(console.error);
        }

        switchModeNow('short_break');
        if (settingsNow?.autoSwitchSessions) {
          const breakMinutes = Math.max(
            1,
            Math.min(180, Math.round(settingsNow.shortBreakDuration || 5))
          );
          autoSwitchTimeoutRef.current = setTimeout(() => {
            autoSwitchTimeoutRef.current = null;
            completionHandledRef.current = false;
            targetEndTimeMsRef.current = Date.now() + breakMinutes * 60 * 1000;
            sessionStartTimeRef.current = new Date().toISOString();
            setIsRunning(true);
          }, 1000);
        }
      } else {
        playBreakEndSound(isSound);
        toastNow('Break finished! Ready to focus?', 'info');
        switchModeNow('work');
        if (settingsNow?.autoSwitchSessions) {
          const workMinutes = Math.max(
            1,
            Math.min(180, Math.round(settingsNow.pomodoroWorkDuration || 25))
          );
          autoSwitchTimeoutRef.current = setTimeout(() => {
            autoSwitchTimeoutRef.current = null;
            completionHandledRef.current = false;
            targetEndTimeMsRef.current = Date.now() + workMinutes * 60 * 1000;
            sessionStartTimeRef.current = new Date().toISOString();
            setIsRunning(true);
          }, 1000);
        }
      }
    };

    const syncClock = () => {
      if (targetEndTimeMsRef.current === null) return;
      const remaining = Math.max(0, Math.ceil((targetEndTimeMsRef.current - Date.now()) / 1000));
      setTimeLeft((prev) => (prev === remaining ? prev : remaining));
      if (remaining <= 0) {
        handleCompletion();
      }
    };

    syncClock();
    intervalRef.current = setInterval(syncClock, 250);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncClock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isRunning, timerEngine, clearTimerHandles]);

  // Cross-tab timer event synchronization
  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(TIMER_BROADCAST_CHANNEL);
      channel.onmessage = (event: MessageEvent<TimerBroadcastMessage>) => {
        const msg = event.data;
        if (!msg || !msg.type) return;

        switch (msg.type) {
          case 'TIMER_SYNC_START': {
            clearTimerHandles();
            targetEndTimeMsRef.current = msg.payload.targetEndTimeMs;
            stopwatchStartMsRef.current = msg.payload.stopwatchStartMs;
            sessionStartTimeRef.current = msg.payload.sessionStartTime;
            completionHandledRef.current = false;
            setTimerMode(msg.payload.timerMode);
            setTimerEngineState(msg.payload.timerEngine);
            setTotalDuration(msg.payload.totalDuration);
            totalDurationRef.current = msg.payload.totalDuration;
            if (msg.payload.activeTaskId !== undefined) {
              setActiveTaskId(msg.payload.activeTaskId);
            }
            setIsRunning(true);
            break;
          }
          case 'TIMER_SYNC_PAUSE': {
            clearTimerHandles();
            targetEndTimeMsRef.current = null;
            stopwatchStartMsRef.current = null;
            setIsRunning(false);
            if (msg.payload.timerEngine === 'stopwatch') {
              stopwatchElapsedRef.current = msg.payload.stopwatchElapsed;
              setStopwatchElapsed(msg.payload.stopwatchElapsed);
            } else {
              timeLeftRef.current = msg.payload.timeLeft;
              setTimeLeft(msg.payload.timeLeft);
            }
            break;
          }
          case 'TIMER_SYNC_RESET': {
            clearTimerHandles();
            targetEndTimeMsRef.current = null;
            stopwatchStartMsRef.current = null;
            completionHandledRef.current = false;
            sessionStartTimeRef.current = null;
            setIsRunning(false);
            setTimerEngineState(msg.payload.timerEngine);
            setTimerMode(msg.payload.timerMode);
            totalDurationRef.current = msg.payload.totalDuration;
            setTotalDuration(msg.payload.totalDuration);
            timeLeftRef.current = msg.payload.totalDuration;
            setTimeLeft(msg.payload.totalDuration);
            stopwatchElapsedRef.current = 0;
            setStopwatchElapsed(0);
            break;
          }
          case 'TIMER_SYNC_MODE': {
            setTimerMode(msg.payload.mode);
            totalDurationRef.current = msg.payload.durationSecs;
            setTotalDuration(msg.payload.durationSecs);
            timeLeftRef.current = msg.payload.durationSecs;
            setTimeLeft(msg.payload.durationSecs);
            break;
          }
          case 'TIMER_SYNC_ENGINE': {
            setTimerEngineState(msg.payload.engine);
            break;
          }
          case 'TIMER_SYNC_COMPLETED': {
            completionHandledRef.current = true;
            clearTimerHandles();
            targetEndTimeMsRef.current = null;
            setIsRunning(false);
            setCompletedCycleCount((c) => c + 1);
            break;
          }
        }
      };
    } catch {
      // safe fallback
    }

    return () => {
      if (channel) {
        channel.close();
      }
    };
  }, [clearTimerHandles]);

  const currency = settings?.currency || 'INR';

  // Ensure initial resolved mode resolves cleanly even on SSR/test
  void resolveColorMode;

  return (
    <AppContext.Provider
      value={{
        currentTab,
        setCurrentTab,
        user,
        settings,
        currency,
        updateSettings,
        theme: resolvedThemeMode,
        toggleTheme,
        reseedData,
        clearAllData,

        // Theme Studio
        themeConfig,
        effectiveThemeConfig,
        previewThemeConfig,
        isFullAppPreview,
        resolvedThemeMode,
        systemColorMode,
        savedThemes,
        activeSavedThemeId,
        themeSyncState,
        applyThemeConfig,
        startFullAppPreview,
        stopFullAppPreview,
        saveCustomTheme,
        applySavedTheme,
        duplicateSavedTheme,
        renameCustomTheme,
        deleteSavedTheme,
        resetThemeToDefault,
        toggleFavoriteStyle,
        toggleFavoriteTheme,

        // Workspace UX & Focus Extras
        commandCenterOpen,
        setCommandCenterOpen,
        fullScreenFocus,
        setFullScreenFocus,
        trashModalOpen,
        setTrashModalOpen,
        ambientPreset,
        ambientVolume,
        setAmbientSound,
        isOnline,
        offlineOutboxCount,
        reconcileOutboxNow,
        syncLastError,
        notifications,
        activeNotifications,
        readNotificationIds,
        unreadNotificationCount,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        clearNotifications,

        // Smart Navigation & Shortcuts
        recentTabs,
        favoriteTabs,
        toggleFavoriteTab,
        keyboardShortcutsGuideOpen,
        setKeyboardShortcutsGuideOpen,
        quickActionInitialType,
        setQuickActionInitialType,

        // In-app Confirmation Modal
        confirmAction,
        confirmDialogState,
        resolveConfirmDialog,

        // Firebase Auth
        firebaseUser,
        isAuthenticated: !!firebaseUser,
        isSigningIn,
        authError,
        clearAuthError,
        googleAccessToken,
        signInWithGoogle,
        authorizeGoogleSheets,
        signOutGoogle,

        // Google Sheets
        googleSpreadsheetId,
        syncStatus,
        lastSyncedAt,
        syncQueueCount,
        createOrConnectSpreadsheet,
        syncNowToGoogleSheets,
        historicalResyncToGoogleSheets,
        reapplySheetFormatting,

        // Timer
        timerEngine,
        setTimerEngine,
        timerMode,
        timeLeft,
        totalDuration,
        stopwatchElapsed,
        isRunning,
        completedCycleCount,
        activeTaskId,
        activeTask,
        startTimer,
        pauseTimer,
        resetTimer,
        saveStopwatchSession,
        switchTimerMode,
        setActiveTaskId,
        setCustomDuration,

        // Refresh
        refreshKey,
        triggerRefresh,

        // Habits
        habits,

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
