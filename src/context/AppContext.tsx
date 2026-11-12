import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  User,
  UserSettings,
  Task,
  CurrencyCode,
  ThemeConfig,
  SavedCustomTheme,
} from '../types/index.ts';
import { api } from '../lib/api.ts';
import { playFocusCompleteSound, playBreakEndSound, playClickSound, unlockAudioContext } from '../lib/sound.ts';
import {
  signInWithGoogle as fbSignInWithGoogle,
  signOut as fbSignOut,
  initAuthListener,
  getAccessToken,
  testConnection,
} from '../lib/firebase.ts';
import { User as FirebaseUser } from 'firebase/auth';
import { googleSheetsService } from '../lib/googleSheetsService.ts';
import { firestoreService } from '../lib/firestoreService.ts';
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
  | 'focus'
  | 'tasks'
  | 'finance'
  | 'transactions'
  | 'bills'
  | 'analytics'
  | 'settings';

export type TimerMode = 'work' | 'short_break' | 'long_break';
export type TimerEngineMode = 'pomodoro' | 'stopwatch' | 'countdown';

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
  syncLastError: string | null;
  notifications: AppNotificationItem[];

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

  // Google Sheets Sync state
  const [googleSpreadsheetId, setGoogleSpreadsheetId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncQueueCount, setSyncQueueCount] = useState<number>(0);

  // Tasks cache for linking timer
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Command Center, Full-Screen Focus, Trash, Audio & Offline/Notifications state
  const [commandCenterOpen, setCommandCenterOpen] = useState(false);
  const [fullScreenFocus, setFullScreenFocus] = useState(false);
  const [trashModalOpen, setTrashModalOpen] = useState(false);
  const [ambientPreset, setAmbientPreset] = useState<AmbientPreset>('off');
  const [ambientVolume, setAmbientVolume] = useState<number>(0.35);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [syncLastError, setSyncLastError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotificationItem[]>([]);

  // Timer state
  const [timerEngine, setTimerEngineState] = useState<TimerEngineMode>('pomodoro');
  const [timerMode, setTimerMode] = useState<TimerMode>('work');
  const [timeLeft, setTimeLeft] = useState<number>(25 * 60);
  const [totalDuration, setTotalDuration] = useState<number>(25 * 60);
  const [stopwatchElapsed, setStopwatchElapsed] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [completedCycleCount, setCompletedCycleCount] = useState<number>(0);
  const sessionStartTimeRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSwitchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetEndTimeMsRef = useRef<number | null>(null);
  const stopwatchStartMsRef = useRef<number | null>(null);
  const stopwatchElapsedRef = useRef<number>(0);
  const completionHandledRef = useRef<boolean>(false);
  const timerModifiedByUserRef = useRef<boolean>(false);
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

      if (targetFbUser) {
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

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      stopSoundscape();
    };
  }, []);

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
            const remoteSettings = await firestoreService.getSettings(fbUser.uid);
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
              setThemeSyncState('cloud-synced');

              // Mirror restored cloud theme into local API & settings state
              api
                .updateSettings({
                  theme: restoredConfig.colorMode,
                  themeConfig: restoredConfig,
                  savedThemes: restoredSaved,
                  activeSavedThemeId: restoredActiveId,
                })
                .then((res) => setSettings(res.settings))
                .catch(console.error);
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
    ])
      .then(([taskList, billList, dashData, finSummary]) => {
        setTasks(taskList);
        const items = evaluateDeterministicNotifications({
          settings,
          tasks: taskList,
          bills: billList,
          dashboard: dashData,
          financeSummary: finSummary,
          syncLastError,
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

      if (firebaseUser) {
        firestoreService.saveSettings(firebaseUser.uid, newSettings).catch(console.error);
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
      restoredFirebaseUidRef.current = null;
      setThemeSyncState('local');
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

      await googleSheetsService.flushQueue(sId, token);

      const nowIso = new Date().toISOString();
      setLastSyncedAt(nowIso);
      setSyncStatus('synced');
      setSyncQueueCount(googleSheetsService.getQueueLength());
      setSyncLastError(googleSheetsService.getLastError());
      await updateSettings({ lastSyncedAt: nowIso });
      showToast('Google Sheets synchronized successfully!', 'success');
    } catch (err: unknown) {
      setSyncStatus('error');
      const msg = err instanceof Error ? err.message : 'Sync failed';
      setSyncLastError(msg);
      showToast(`Sync failed: ${msg}`, 'error');
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
    },
    [settings, clearTimerHandles]
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
    },
    [clearTimerHandles]
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
      } else if (engine === 'countdown') {
        const secs = 15 * 60;
        timeLeftRef.current = secs;
        totalDurationRef.current = secs;
        setTimeLeft(secs);
        setTotalDuration(secs);
      } else {
        const workMins = Math.max(1, Math.min(180, Math.round(settings?.pomodoroWorkDuration || 25)));
        const secs = workMins * 60;
        setTimerMode('work');
        timeLeftRef.current = secs;
        totalDurationRef.current = secs;
        setTimeLeft(secs);
        setTotalDuration(secs);
      }
    },
    [clearTimerHandles, settings]
  );

  const startTimer = useCallback(() => {
    clearTimerHandles();
    unlockAudioContext();
    timerModifiedByUserRef.current = true;
    completionHandledRef.current = false;

    if (timerEngine === 'stopwatch') {
      stopwatchStartMsRef.current = Date.now() - stopwatchElapsedRef.current * 1000;
      if (!sessionStartTimeRef.current) {
        sessionStartTimeRef.current = new Date().toISOString();
      }
      setIsRunning(true);
      playClickSound(settings?.soundEnabled ?? true);
      return;
    }

    const currentRemaining = Math.max(0, Math.floor(timeLeftRef.current));
    const effectiveSecs =
      currentRemaining > 0 ? currentRemaining : Math.max(60, Math.floor(totalDurationRef.current) || 1500);
    if (currentRemaining <= 0) {
      timeLeftRef.current = effectiveSecs;
      setTimeLeft(effectiveSecs);
    }
    targetEndTimeMsRef.current = Date.now() + effectiveSecs * 1000;

    if (!sessionStartTimeRef.current) {
      sessionStartTimeRef.current = new Date().toISOString();
    }
    setIsRunning(true);
    playClickSound(settings?.soundEnabled ?? true);
  }, [settings, clearTimerHandles, timerEngine]);

  const pauseTimer = useCallback(() => {
    clearTimerHandles();
    unlockAudioContext();
    timerModifiedByUserRef.current = true;
    if (timerEngine === 'stopwatch' && stopwatchStartMsRef.current !== null) {
      const elapsed = Math.max(0, Math.floor((Date.now() - stopwatchStartMsRef.current) / 1000));
      stopwatchElapsedRef.current = elapsed;
      setStopwatchElapsed(elapsed);
      stopwatchStartMsRef.current = null;
    } else if (targetEndTimeMsRef.current !== null) {
      const remaining = Math.max(0, Math.ceil((targetEndTimeMsRef.current - Date.now()) / 1000));
      timeLeftRef.current = remaining;
      setTimeLeft(remaining);
      targetEndTimeMsRef.current = null;
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
    if (timerEngine === 'stopwatch') {
      stopwatchElapsedRef.current = 0;
      setStopwatchElapsed(0);
    } else {
      const safeTotal = Math.max(60, Math.floor(totalDurationRef.current) || 1500);
      timeLeftRef.current = safeTotal;
      setTimeLeft(safeTotal);
    }
    sessionStartTimeRef.current = null;
    playClickSound(settings?.soundEnabled ?? true);
  }, [settings, clearTimerHandles, timerEngine]);

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
      if (firebaseUser) {
        firestoreService.saveFocusSession(firebaseUser.uid, created).catch(console.error);
      }
      resetTimer();
      triggerRefresh();
      showToast(`Logged ${mins} min stopwatch focus session!`, 'success');
    } catch {
      showToast('Failed to log stopwatch session', 'error');
    }
  }, [activeTaskId, firebaseUser, resetTimer, showToast, triggerRefresh]);

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

      const isSound = settingsNow?.soundEnabled ?? true;
      if (modeNow === 'work') {
        playFocusCompleteSound(isSound);
        toastNow('Focus session complete! Great work!', 'success');

        const startedAt = sessionStartTimeRef.current || new Date().toISOString();
        const endedAt = new Date().toISOString();
        const safeDurationSecs = Math.max(60, Math.round(durationNow || 1500));
        const durationMin = Math.max(1, Math.round(safeDurationSecs / 60));

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
            if (fbUserNow) {
              firestoreService.saveFocusSession(fbUserNow.uid, newSession).catch(console.error);
            }

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

            if (sheetIdNow && tokenNow) {
              googleSheetsService
                .flushQueue(sheetIdNow, tokenNow)
                .then(() => setSyncStatus('synced'))
                .catch(() => setSyncStatus('error'));
            }

            refreshNow();
          })
          .catch(console.error);

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
        syncLastError,
        notifications,

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
