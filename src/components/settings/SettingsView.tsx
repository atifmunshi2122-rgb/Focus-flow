import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { CurrencyCode, NotificationPreferences } from '../../types/index.ts';
import { ThemeStudio } from './ThemeStudio.tsx';
import { DataRecoveryCenter } from './DataRecoveryCenter.tsx';
import { detectEmbeddedIframe, getCurrentAppUrl } from '../../lib/authDiagnostics.ts';
import {
  ThemeBadge,
  ThemeButton,
  ThemeCard,
  ThemeInput,
  ThemeSegmentedControl,
  ThemeSelect,
} from '../ui/ThemePrimitives.tsx';
import { useMotionPreferences } from '../ui/MotionPrimitives.tsx';
import { MOTION_DURATION, MOTION_EASING, getIntensityFactor } from '../../theme/motionTokens.ts';
import {
  playClickSound,
  playSaveSuccessSound,
  playTaskCompleteSound,
  unlockAudioContext,
} from '../../lib/sound.ts';
import {
  Bell,
  Check,
  CheckSquare,
  ChevronRight,
  Database,
  DollarSign,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  Info,
  Keyboard,
  LayoutDashboard,
  Lock,
  Moon,
  Palette,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sun,
  Target,
  Timer,
  Trash2,
  Upload,
  User,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

export type SettingsCategory =
  | 'account'
  | 'appearance'
  | 'personalization'
  | 'focus'
  | 'tasks'
  | 'finance'
  | 'notifications'
  | 'sync'
  | 'security'
  | 'backup'
  | 'accessibility'
  | 'about';

export interface CategoryMeta {
  id: SettingsCategory;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeTone?: 'accent' | 'success' | 'warning' | 'info' | 'neutral';
}

export const SETTINGS_CATEGORIES: CategoryMeta[] = [
  {
    id: 'account',
    label: 'Account & Profile',
    shortLabel: 'Account',
    description: 'User identity, Google OAuth session, and Firebase connection.',
    icon: User,
  },
  {
    id: 'appearance',
    label: 'Appearance & Themes',
    shortLabel: 'Themes',
    description: '19 design systems, 100 color palettes, gradients, and fusion.',
    icon: Palette,
    badge: '19 Styles',
    badgeTone: 'accent',
  },
  {
    id: 'personalization',
    label: 'Personalization & Layout',
    shortLabel: 'Layout',
    description: 'Dashboard layouts, widget sizing, density, and view preferences.',
    icon: LayoutDashboard,
  },
  {
    id: 'focus',
    label: 'Focus & Productivity',
    shortLabel: 'Focus',
    description: 'Pomodoro timer intervals, audio chimes, goals, and shortcuts.',
    icon: Timer,
    badge: '25m',
    badgeTone: 'neutral',
  },
  {
    id: 'tasks',
    label: 'Tasks & Planning',
    shortLabel: 'Tasks',
    description: 'Task defaults, priorities, recurrence, and checklist automation.',
    icon: CheckSquare,
  },
  {
    id: 'finance',
    label: 'Finance Preferences',
    shortLabel: 'Finance',
    description: 'Active currency standard, integer paise math, and budget caps.',
    icon: DollarSign,
    badge: 'INR ₹',
    badgeTone: 'success',
  },
  {
    id: 'notifications',
    label: 'Notifications & Rules',
    shortLabel: 'Alerts',
    description: 'Deterministic deadline, bill lead time, and threshold alerts.',
    icon: Bell,
  },
  {
    id: 'sync',
    label: 'Data & Google Sheets',
    shortLabel: 'Sheets Sync',
    description: '23-Worksheet executive workbook, durable sync queue, and logs.',
    icon: FileSpreadsheet,
    badge: '23 Tabs',
    badgeTone: 'accent',
  },
  {
    id: 'security',
    label: 'Privacy & Security',
    shortLabel: 'Security',
    description: 'Token validation, rate limiting, log sanitization, and audit.',
    icon: ShieldCheck,
  },
  {
    id: 'backup',
    label: 'Backup & Recovery',
    shortLabel: 'Backups',
    description: 'Offline JSON dumps, Trash Bin restoration, and Cloud exports.',
    icon: Database,
  },
  {
    id: 'accessibility',
    label: 'Accessibility & Motion',
    shortLabel: 'A11y',
    description: 'Animation intensity, font scaling, contrast, and focus states.',
    icon: Eye,
  },
  {
    id: 'about',
    label: 'About & Architecture',
    shortLabel: 'About',
    description: `Release v${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown'}, deterministic tech stack, and documentation.`,
    icon: Info,
  },
];

export interface SearchIndexItem {
  id: string;
  categoryId: SettingsCategory;
  categoryLabel: string;
  title: string;
  description: string;
  keywords: string[];
}

export const SEARCH_INDEX: SearchIndexItem[] = [
  {
    id: 'profile_info',
    categoryId: 'account',
    categoryLabel: 'Account & Profile',
    title: 'User Profile Identity',
    description: 'Display name, email address, avatar, and authentication provider.',
    keywords: ['profile', 'user', 'name', 'email', 'avatar', 'account', 'identity'],
  },
  {
    id: 'google_auth',
    categoryId: 'account',
    categoryLabel: 'Account & Profile',
    title: 'Google OAuth & Authentication',
    description: 'Sign in, switch account, Google Drive permissions, and token status.',
    keywords: ['google', 'oauth', 'auth', 'sign in', 'login', 'token', 'switch account'],
  },
  {
    id: 'theme_studio',
    categoryId: 'appearance',
    categoryLabel: 'Appearance & Themes',
    title: 'Theme Studio & Design Styles',
    description: 'Switch between 19 design systems (Glassmorphism, Claymorphism, Brutalism, Cyberpunk, OLED).',
    keywords: ['theme', 'style', 'glassmorphism', 'claymorphism', 'brutalism', 'cyberpunk', 'oled', 'aurora', 'minimalism'],
  },
  {
    id: 'color_palettes',
    categoryId: 'appearance',
    categoryLabel: 'Appearance & Themes',
    title: '100 Curated Color Palettes',
    description: 'Browse 100 color palettes across 20 aesthetic categories with live preview.',
    keywords: ['color', 'colour', 'palette', 'accent', 'swatch', 'hue', 'curated'],
  },
  {
    id: 'style_fusion',
    categoryId: 'appearance',
    categoryLabel: 'Appearance & Themes',
    title: 'Style Fusion Mixer',
    description: 'Blend two design systems together with custom translucency and border specularity.',
    keywords: ['fusion', 'mixer', 'blend', 'hybrid', 'glazed clay', 'cyber glass', 'soft glass'],
  },
  {
    id: 'dashboard_presets',
    categoryId: 'personalization',
    categoryLabel: 'Personalization & Layout',
    title: 'Dashboard Layout Presets',
    description: 'Executive Balanced, Focus First, Finance Pulse, and Minimal Brief layouts.',
    keywords: ['dashboard', 'layout', 'preset', 'widgets', 'reorder', 'customize'],
  },
  {
    id: 'interface_density',
    categoryId: 'personalization',
    categoryLabel: 'Personalization & Layout',
    title: 'Interface Density',
    description: 'Compact, Comfortable, and Spacious padding and card spacing scales.',
    keywords: ['density', 'compact', 'comfortable', 'spacious', 'padding', 'spacing'],
  },
  {
    id: 'pomodoro_intervals',
    categoryId: 'focus',
    categoryLabel: 'Focus & Productivity',
    title: 'Pomodoro & Break Intervals',
    description: 'Configure work session (default 25m), short break (5m), and long break (15m).',
    keywords: ['pomodoro', 'work', 'break', 'timer', 'duration', 'interval', 'minutes'],
  },
  {
    id: 'audio_alerts',
    categoryId: 'focus',
    categoryLabel: 'Focus & Productivity',
    title: 'Synthesized Audio Alerts',
    description: 'Web Audio API focus completion, break chimes, and cash sound effects.',
    keywords: ['sound', 'audio', 'chime', 'bell', 'alert', 'beep', 'music'],
  },
  {
    id: 'productivity_goals',
    categoryId: 'focus',
    categoryLabel: 'Focus & Productivity',
    title: 'Daily & Weekly Focus Goals',
    description: 'Set daily focus minute targets and weekly deep work milestones.',
    keywords: ['goal', 'target', 'daily focus', 'weekly focus', 'streak', 'milestone'],
  },
  {
    id: 'global_shortcuts',
    categoryId: 'focus',
    categoryLabel: 'Focus & Productivity',
    title: 'Keyboard Navigation Shortcuts',
    description: 'Enable Cmd/Ctrl+K for Command Center and Alt+1..8 for direct tab routing.',
    keywords: ['keyboard', 'shortcut', 'cmd+k', 'hotkey', 'navigation', 'quick command'],
  },
  {
    id: 'task_defaults',
    categoryId: 'tasks',
    categoryLabel: 'Tasks & Planning',
    title: 'Task Defaults & Priorities',
    description: 'Default priority levels, pomodoro estimates, and category defaults.',
    keywords: ['task', 'priority', 'checklist', 'subtask', 'planning', 'todo'],
  },
  {
    id: 'currency_standard',
    categoryId: 'finance',
    categoryLabel: 'Finance Preferences',
    title: 'Currency Standard (INR / USD / EUR / GBP)',
    description: 'Set primary active currency; all math strictly runs in integer paise/cents.',
    keywords: ['currency', 'inr', 'rupee', 'usd', 'dollar', 'eur', 'euro', 'gbp', 'paise', 'money'],
  },
  {
    id: 'budget_thresholds',
    categoryId: 'finance',
    categoryLabel: 'Finance Preferences',
    title: 'Envelope Budget Warnings',
    description: 'Set budget capacity alerts (50% to 100%) and fixed vs variable classifications.',
    keywords: ['budget', 'envelope', 'warning', 'threshold', 'capacity', 'expense cap'],
  },
  {
    id: 'notifications_rules',
    categoryId: 'notifications',
    categoryLabel: 'Notifications & Rules',
    title: 'Rule-Based Notification Triggers',
    description: 'Task deadlines, overdue bills, daily focus milestone, and sync error notices.',
    keywords: ['notification', 'alert', 'reminder', 'bill reminder', 'lead days', 'rules'],
  },
  {
    id: 'sheets_sync',
    categoryId: 'sync',
    categoryLabel: 'Data & Google Sheets',
    title: 'Google Sheets 23-Worksheet Sync',
    description: 'Synchronize 23 master worksheets, native charts, and durable backoff queue.',
    keywords: ['google sheets', 'sheets', 'sync', 'spreadsheet', 'drive', 'export', 're-apply'],
  },
  {
    id: 'security_protection',
    categoryId: 'security',
    categoryLabel: 'Privacy & Security',
    title: 'Rate Limiting & Token Validation',
    description: 'RSA-SHA256 JWT validation, 300 req/min rate limiter, and log sanitizer.',
    keywords: ['security', 'privacy', 'rate limit', 'jwt', 'sanitizer', 'pii', 'protection'],
  },
  {
    id: 'backup_json',
    categoryId: 'backup',
    categoryLabel: 'Backup & Recovery',
    title: 'One-Click JSON Workspace Backup',
    description: 'Export an encrypted offline JSON archive or restore full workspace state.',
    keywords: ['backup', 'export', 'restore', 'json', 'download', 'archive', 'recovery'],
  },
  {
    id: 'trash_restore',
    categoryId: 'backup',
    categoryLabel: 'Backup & Recovery',
    title: 'Soft-Deleted Trash Bin',
    description: 'Recover tasks, expenses, bills, and goals within the 30-day retention window.',
    keywords: ['trash', 'deleted', 'recover', 'restore', 'recycle bin'],
  },
  {
    id: 'accessibility_motion',
    categoryId: 'accessibility',
    categoryLabel: 'Accessibility & Motion',
    title: 'Reduced Motion & Animation Scaling',
    description: 'Configure motion intensity (none, subtle, standard, expressive) and font scale.',
    keywords: ['accessibility', 'a11y', 'motion', 'reduced motion', 'font scale', 'contrast'],
  },
  {
    id: 'about_release',
    categoryId: 'about',
    categoryLabel: 'About & Architecture',
    title: `Release Version v${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown'} & Documentation`,
    description: 'Inspect production release baseline, technical manuals, and architecture guides.',
    keywords: ['version', 'release', 'docs', 'manual', 'architecture', 'readme'],
  },
];

export const SettingsView: React.FC = () => {
  const {
    user,
    settings,
    updateSettings,
    theme,
    toggleTheme,
    reseedData,
    clearAllData,
    firebaseUser,
    isAuthenticated,
    isSigningIn,
    googleAccessToken,
    signInWithGoogle,
    authorizeGoogleSheets,
    signOutGoogle,
    googleSpreadsheetId,
    syncStatus,
    syncQueueCount,
    lastSyncedAt,
    createOrConnectSpreadsheet,
    syncNowToGoogleSheets,
    historicalResyncToGoogleSheets,
    reapplySheetFormatting,
    offlineOutboxCount,
    reconcileOutboxNow,
    setTrashModalOpen,
    showToast,
    confirmAction,
  } = useApp();

  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('appearance');
  const [searchQuery, setSearchQuery] = useState('');

  // Form states
  const [currency, setCurrency] = useState<CurrencyCode>(settings?.currency || 'INR');
  const [workDuration, setWorkDuration] = useState(String(settings?.pomodoroWorkDuration || 25));
  const [shortBreak, setShortBreak] = useState(String(settings?.shortBreakDuration || 5));
  const [longBreak, setLongBreak] = useState(String(settings?.longBreakDuration || 15));
  const [dailyGoalMin, setDailyGoalMin] = useState(String(settings?.dailyFocusGoalMinutes || 100));
  const [weeklyGoalMin, setWeeklyGoalMin] = useState(String(settings?.weeklyFocusGoalMinutes || 500));
  const [shortcutsEnabled, setShortcutsEnabled] = useState(settings?.keyboardShortcutsEnabled ?? true);
  const [autoSwitch, setAutoSwitch] = useState(settings?.autoSwitchSessions || false);
  const [sound, setSound] = useState(settings?.soundEnabled ?? true);
  const [soundVolume, setSoundVolume] = useState(settings?.soundVolume ?? 70);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(
    settings?.notificationPrefs || {
      enabled: true,
      taskDeadlines: true,
      upcomingBills: true,
      billLeadDays: 3,
      overdueBills: true,
      focusCompletion: true,
      dailyFocusGoal: true,
      budgetWarnings: true,
      budgetWarningPercent: 80,
      syncFailures: true,
    }
  );

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isInitializingSheets, setIsInitializingSheets] = useState(false);

  const { isDisabled, intensity, profile } = useMotionPreferences();
  const factor = getIntensityFactor(intensity);

  // Sync state from settings prop
  useEffect(() => {
    if (settings) {
      setCurrency(settings.currency || 'INR');
      setWorkDuration(String(settings.pomodoroWorkDuration || 25));
      setShortBreak(String(settings.shortBreakDuration || 5));
      setLongBreak(String(settings.longBreakDuration || 15));
      setDailyGoalMin(String(settings.dailyFocusGoalMinutes || 100));
      setWeeklyGoalMin(String(settings.weeklyFocusGoalMinutes || 500));
      setShortcutsEnabled(settings.keyboardShortcutsEnabled ?? true);
      if (settings.notificationPrefs) setNotifPrefs(settings.notificationPrefs);
      setAutoSwitch(Boolean(settings.autoSwitchSessions));
      setSound(settings.soundEnabled ?? true);
      setSoundVolume(settings.soundVolume ?? 70);
    }
  }, [settings]);

  const clampInt = (raw: string, fallback: number, min: number, max: number) => {
    const n = Number(raw);
    if (!raw.trim() || !Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  };

  const handleSavePreferences = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    try {
      const nextWork = clampInt(workDuration, 25, 1, 120);
      const nextShort = clampInt(shortBreak, 5, 1, 30);
      const nextLong = clampInt(longBreak, 15, 1, 60);
      const nextDaily = clampInt(dailyGoalMin, 100, 5, 720);
      const nextWeekly = clampInt(weeklyGoalMin, 500, 15, 5000);
      setWorkDuration(String(nextWork));
      setShortBreak(String(nextShort));
      setLongBreak(String(nextLong));
      setDailyGoalMin(String(nextDaily));
      setWeeklyGoalMin(String(nextWeekly));
      await updateSettings({
        currency,
        pomodoroWorkDuration: nextWork,
        shortBreakDuration: nextShort,
        longBreakDuration: nextLong,
        dailyFocusGoalMinutes: nextDaily,
        weeklyFocusGoalMinutes: nextWeekly,
        keyboardShortcutsEnabled: shortcutsEnabled,
        notificationPrefs: notifPrefs,
        autoSwitchSessions: autoSwitch,
        soundEnabled: sound,
        soundVolume: soundVolume,
      });
      setSaveSuccess(true);
      playSaveSuccessSound(sound, soundVolume);
      showToast('Settings saved and synchronized', 'success');
      setTimeout(() => setSaveSuccess(false), 1600);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateWorkbook = async () => {
    setIsInitializingSheets(true);
    try {
      await createOrConnectSpreadsheet();
    } finally {
      setIsInitializingSheets(false);
    }
  };

  const handleReseed = async () => {
    const confirmed = await confirmAction({
      title: 'Load Sample Starter Data',
      message:
        'Reset database to initial pristine seed data? This will restore sample transactions, bills, and focus sessions.',
      confirmLabel: 'Load Sample Data',
      tone: 'warning',
    });
    if (confirmed) {
      await reseedData();
      showToast('Sample starter data loaded', 'success');
    }
  };

  const handleClearAllWorkspace = async () => {
    const confirmed = await confirmAction({
      title: 'Wipe Entire Workspace',
      message:
        'Delete ALL transactions, tasks, bills, time blocks, and subscriptions to start completely clean? This action cannot be undone.',
      confirmLabel: 'Wipe All Data',
      tone: 'danger',
    });
    if (confirmed) {
      await clearAllData();
      showToast('Workspace wiped successfully', 'info');
    }
  };

  // Search filtering
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return SEARCH_INDEX.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.categoryLabel.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  const activeCategoryMeta = useMemo(
    () => SETTINGS_CATEGORIES.find((c) => c.id === activeCategory) || SETTINGS_CATEGORIES[0],
    [activeCategory]
  );

  return (
    <div className="space-y-6 w-full max-w-[1920px] mx-auto pb-12">
      {/* Settings Center Header & Universal Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--ff-border-color)]">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--ff-text-muted)] mb-1">
            <span>Settings</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span style={{ color: 'var(--ff-accent-text)' }}>{activeCategoryMeta.label}</span>
          </div>
          <h1 className="ff-heading text-xl sm:text-2xl font-extrabold text-[var(--ff-text-primary)]">
            Settings &amp; Preferences Center
          </h1>
          <p className="text-xs text-[var(--ff-text-muted)] mt-0.5">
            Manage your profile, 19 design systems, focus timers, Google Sheets synchronization, and data safety.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Quick theme mode toggle */}
          <ThemeButton variant="secondary" size="sm" onClick={toggleTheme} title="Toggle Dark/Light Mode">
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5" style={{ color: 'var(--ff-warning)' }} />
                <span className="hidden sm:inline">Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Dark</span>
              </>
            )}
          </ThemeButton>

          {/* Master Save Button */}
          <ThemeButton
            variant="primary"
            size="sm"
            onClick={() => void handleSavePreferences()}
            loading={saving}
            success={saveSuccess}
            loadingText="Saving..."
          >
            {saveSuccess ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Saved!</span>
              </>
            ) : (
              <span>Save Preferences</span>
            )}
          </ThemeButton>
        </div>
      </div>

      {/* Settings Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ff-text-muted)]" />
        <ThemeInput
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search settings (e.g., Theme, Pomodoro, Currency, Google Sheets, Backup, Sound)..."
          className="pl-10 pr-9 py-2.5 text-xs rounded-xl shadow-xs"
          aria-label="Search settings"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] p-0.5"
            aria-label="Clear settings search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Live Search Results Dropdown/Banner */}
      {searchQuery.trim().length > 0 && (
        <ThemeCard className="p-4 space-y-2 border-2 border-[var(--ff-accent-border)]">
          <div className="flex items-center justify-between text-xs font-bold text-[var(--ff-text-primary)]">
            <span>Search Results ({searchResults.length})</span>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-xs text-[var(--ff-accent-text)] hover:underline"
            >
              Dismiss Search
            </button>
          </div>
          {searchResults.length === 0 ? (
            <p className="text-xs text-[var(--ff-text-muted)] py-2">
              No settings match &quot;{searchQuery}&quot;. Try searching for <em>theme</em>, <em>currency</em>, <em>pomodoro</em>, <em>sync</em>, or <em>backup</em>.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => {
                    setActiveCategory(result.categoryId);
                    setSearchQuery('');
                  }}
                  className="ff-row-hover p-2.5 rounded-lg border border-[var(--ff-border-color)] text-left flex items-start justify-between gap-3 transition-colors"
                >
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ff-accent-text)] block">
                      {result.categoryLabel}
                    </span>
                    <span className="text-xs font-semibold text-[var(--ff-text-primary)] block">
                      {result.title}
                    </span>
                    <span className="text-[11px] text-[var(--ff-text-muted)] block line-clamp-1">
                      {result.description}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[var(--ff-text-muted)] shrink-0 mt-1" />
                </button>
              ))}
            </div>
          )}
        </ThemeCard>
      )}

      {/* Mobile Category Selector (Scrollable Horizontal Pill Navigation) */}
      <div className="lg:hidden overflow-x-auto pb-1 scrollbar-none">
        <div className="flex items-center gap-1.5 min-w-max">
          {SETTINGS_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`relative flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  isActive
                    ? 'text-[var(--ff-accent-contrast)] border-transparent'
                    : 'bg-[var(--ff-surface-subtle)] border-[var(--ff-border-color)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)]'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="settings-mobile-pill"
                    transition={profile.spring}
                    className="absolute inset-0 rounded-lg bg-[var(--ff-accent)] shadow-xs pointer-events-none"
                  />
                )}
                <Icon className="relative z-10 w-3.5 h-3.5 shrink-0" />
                <span className="relative z-10">{cat.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Settings Grid: Left Navigation (Desktop) + Right Content Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left-Side Settings Navigation Sidebar (Desktop) */}
        <nav
          aria-label="Settings Categories"
          className="hidden lg:block lg:col-span-4 xl:col-span-3 sticky top-24 space-y-1 bg-[var(--ff-surface-subtle)] p-2 rounded-2xl border border-[var(--ff-border-color)] max-h-[calc(100dvh-7rem)] overflow-y-auto scrollbar-thin"
        >
          <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
            Settings Directory
          </div>
          {SETTINGS_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`relative w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-left transition-colors ${
                  isActive
                    ? 'text-[var(--ff-accent-contrast)]'
                    : 'text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)]'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="settings-nav-pill"
                    transition={profile.spring}
                    className="absolute inset-0 rounded-xl bg-[var(--ff-accent)] shadow-xs pointer-events-none"
                  />
                )}
                <div className="relative z-10 flex items-center gap-2.5 truncate">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{cat.label}</span>
                </div>
                {cat.badge && (
                  <span
                    className={`relative z-10 px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 font-bold ${
                      isActive
                        ? 'bg-black/20 text-white'
                        : 'bg-[var(--ff-surface-card)] text-[var(--ff-text-muted)] border border-[var(--ff-border-color)]'
                    }`}
                  >
                    {cat.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Main Content Area */}
        <div className="lg:col-span-8 xl:col-span-9 min-w-0">
          <AnimatePresence mode="popLayout" initial={false}>
            {/* CATEGORY A: ACCOUNT & PROFILE */}
            {activeCategory === 'account' && (
              <motion.div
                key="cat-account"
                initial={isDisabled ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: MOTION_DURATION.card * Math.max(0.5, factor || 0.01) }}
                className="space-y-6"
              >
                <ThemeCard className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                    <User className="w-4 h-4 text-[var(--ff-accent-text)]" />
                    <span>User Profile Identity</span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div
                      className="w-16 h-16 rounded-2xl font-bold text-xl flex items-center justify-center overflow-hidden shrink-0 shadow-md"
                      style={{
                        background: 'linear-gradient(135deg, var(--ff-accent), var(--ff-accent-secondary))',
                        color: 'var(--ff-accent-contrast)',
                      }}
                    >
                      {firebaseUser?.photoURL ? (
                        <img
                          src={firebaseUser.photoURL}
                          alt={user?.name || 'User'}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>{user?.name ? user.name.slice(0, 2).toUpperCase() : 'AM'}</span>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      <h2 className="text-base font-bold text-[var(--ff-text-primary)]">
                        {firebaseUser?.displayName || user?.name || 'Operator'}
                      </h2>
                      <p className="text-xs text-[var(--ff-text-muted)]">
                        {firebaseUser?.email || user?.email || 'user@focusflow.local'}
                      </p>
                      <div className="flex items-center gap-1.5 pt-1 text-[11px] font-medium text-[var(--ff-success)]">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Cloud Firestore Database Active &amp; Isolated</span>
                      </div>
                    </div>
                  </div>
                </ThemeCard>

                <ThemeCard className="space-y-3">
                  <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                    Authentication &amp; Session Management
                  </h3>
                  <p className="text-xs text-[var(--ff-text-muted)]">
                    Sign in with Google for Firebase &amp; Firestore cloud sync. Google Sheets &amp; Drive permissions are requested separately only when you initialize or sync a spreadsheet.
                  </p>
                  <div className="p-3.5 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="font-semibold text-[var(--ff-text-primary)] block">
                        Account Status: {isAuthenticated ? 'Signed In (Firebase)' : 'Guest / Local Session'}
                      </span>
                      <span className="text-[var(--ff-text-muted)] text-[11px] block">
                        {isAuthenticated
                          ? `Signed in as ${firebaseUser?.displayName || firebaseUser?.email}`
                          : 'You are currently using local storage and Firestore in guest mode.'}
                      </span>
                      <span className="text-[var(--ff-text-muted)] text-[11px] block mt-0.5">
                        Sheets OAuth Token: {googleAccessToken ? 'Granted for this session' : 'Requested on Sheets sync'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {!isAuthenticated ? (
                        <ThemeButton
                          variant="primary"
                          size="sm"
                          loading={isSigningIn}
                          loadingText="Signing in..."
                          onClick={signInWithGoogle}
                        >
                          Sign in with Google
                        </ThemeButton>
                      ) : (
                        <>
                          {!googleAccessToken && (
                            <ThemeButton
                              variant="secondary"
                              size="sm"
                              loading={isSigningIn}
                              loadingText="Authorizing..."
                              onClick={() => void authorizeGoogleSheets()}
                            >
                              Authorize Google Sheets
                            </ThemeButton>
                          )}
                          <ThemeButton variant="secondary" size="sm" onClick={signOutGoogle}>
                            Switch Account / Sign Out
                          </ThemeButton>
                        </>
                      )}
                    </div>
                  </div>
                  {detectEmbeddedIframe() && !isAuthenticated && (
                    <div
                      className="p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      style={{
                        background: 'var(--ff-warning-soft)',
                        borderColor: 'color-mix(in oklab, var(--ff-warning) 35%, transparent)',
                      }}
                    >
                      <span className="text-[var(--ff-text-secondary)]">
                        Running inside an embedded preview frame. If the Google Sign-In popup closes immediately or is blocked, open FocusFlow in a dedicated tab:
                      </span>
                      <a
                        href={getCurrentAppUrl() || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ff-btn ff-btn-secondary px-3 py-1.5 text-xs inline-flex items-center gap-1.5 shrink-0"
                      >
                        <span>Open in New Tab</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </ThemeCard>
              </motion.div>
            )}

            {/* CATEGORY B: APPEARANCE & THEMES (Direct embedded ThemeStudio) */}
            {activeCategory === 'appearance' && (
              <motion.div
                key="cat-appearance"
                initial={isDisabled ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: MOTION_DURATION.card * Math.max(0.5, factor || 0.01) }}
              >
                <ThemeStudio />
              </motion.div>
            )}

            {/* CATEGORY C: PERSONALIZATION & LAYOUT */}
            {activeCategory === 'personalization' && (
              <motion.div
                key="cat-personalization"
                initial={isDisabled ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: MOTION_DURATION.card * Math.max(0.5, factor || 0.01) }}
                className="space-y-6"
              >
                <ThemeCard className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                    <LayoutDashboard className="w-4 h-4 text-[var(--ff-accent-text)]" />
                    <span>Dashboard Layout &amp; Card Personalization</span>
                  </div>
                  <p className="text-xs text-[var(--ff-text-secondary)] leading-relaxed">
                    Choose an executive layout preset or customize which metrics appear on your main command center.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {[
                      { id: 'executive', title: 'Executive Balanced', desc: 'Equal distribution of focus metrics and financial cashflow.' },
                      { id: 'focus_first', title: 'Focus First', desc: 'Prioritizes Pomodoro streaks, tasks, and productivity milestones.' },
                      { id: 'finance_pulse', title: 'Finance Pulse', desc: 'Elevates cashflow, upcoming bills, and envelope budget caps.' },
                      { id: 'minimal', title: 'Minimal Brief', desc: 'Compact headline metrics with reduced visual density.' },
                    ].map((preset) => (
                      <div
                        key={preset.id}
                        className="p-3.5 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] space-y-1"
                      >
                        <span className="text-xs font-bold text-[var(--ff-text-primary)] block">
                          {preset.title}
                        </span>
                        <span className="text-[11px] text-[var(--ff-text-muted)] block">
                          {preset.desc}
                        </span>
                      </div>
                    ))}
                  </div>
                </ThemeCard>
              </motion.div>
            )}

            {/* CATEGORY D: FOCUS & PRODUCTIVITY */}
            {activeCategory === 'focus' && (
              <motion.div
                key="cat-focus"
                initial={isDisabled ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: MOTION_DURATION.card * Math.max(0.5, factor || 0.01) }}
                className="space-y-6"
              >
                <ThemeCard className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                    <Timer className="w-4 h-4 text-[var(--ff-accent-text)]" />
                    <span>Pomodoro Interval Preferences</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="pref-work" className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                        Work Session (min)
                      </label>
                      <ThemeInput
                        id="pref-work"
                        type="number"
                        min="1"
                        max="120"
                        value={workDuration}
                        onChange={(e) => setWorkDuration(e.target.value)}
                        className="font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label htmlFor="pref-short" className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                        Short Break (min)
                      </label>
                      <ThemeInput
                        id="pref-short"
                        type="number"
                        min="1"
                        max="30"
                        value={shortBreak}
                        onChange={(e) => setShortBreak(e.target.value)}
                        className="font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label htmlFor="pref-long" className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                        Long Break (min)
                      </label>
                      <ThemeInput
                        id="pref-long"
                        type="number"
                        min="1"
                        max="60"
                        value={longBreak}
                        onChange={(e) => setLongBreak(e.target.value)}
                        className="font-mono tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[var(--ff-border-color)] space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoSwitch}
                        onChange={(e) => setAutoSwitch(e.target.checked)}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-xs text-[var(--ff-text-secondary)] font-medium">
                        Auto-switch sessions (automatically start break after work interval ends)
                      </span>
                    </label>

                    <div className="space-y-3 pt-1">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={sound}
                            onChange={(e) => {
                              const next = e.target.checked;
                              setSound(next);
                              if (next) {
                                unlockAudioContext();
                                playClickSound(true, soundVolume);
                              }
                            }}
                            className="w-4 h-4 rounded"
                          />
                          <div className="flex items-center gap-2">
                            {sound ? (
                              <Volume2 className="w-4 h-4 text-[var(--ff-accent-text)]" />
                            ) : (
                              <VolumeX className="w-4 h-4 text-[var(--ff-text-muted)]" />
                            )}
                            <span className="text-xs text-[var(--ff-text-secondary)] font-medium">
                              Synthesized UI Audio Alerts &amp; Sound Effects
                            </span>
                          </div>
                        </label>

                        <ThemeButton
                          variant="ghost"
                          size="xs"
                          disabled={!sound}
                          onClick={() => {
                            unlockAudioContext();
                            playTaskCompleteSound(true, soundVolume);
                          }}
                          className="text-[11px] font-semibold self-start sm:self-center"
                          title="Preview sound at current volume"
                        >
                          Test Sound
                        </ThemeButton>
                      </div>

                      {sound && (
                        <div className="pt-2 pl-7 flex items-center gap-4">
                          <div className="flex-1 max-w-sm">
                            <div className="flex justify-between text-[11px] text-[var(--ff-text-muted)] mb-1">
                              <span>Alert Volume</span>
                              <span className="font-mono font-bold text-[var(--ff-text-primary)]">
                                {soundVolume}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="5"
                              value={soundVolume}
                              onChange={(e) => setSoundVolume(Number(e.target.value))}
                              className="w-full accent-[var(--ff-accent)] h-1.5 bg-[var(--ff-surface-muted)] rounded-lg cursor-pointer"
                              aria-label="Sound effects volume"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </ThemeCard>

                <ThemeCard className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                    <Target className="w-4 h-4 text-[var(--ff-accent-text)]" />
                    <span>Productivity Targets &amp; Navigation Shortcuts</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                        Daily Focus Goal (minutes)
                      </label>
                      <ThemeInput
                        type="number"
                        min="5"
                        max="720"
                        value={dailyGoalMin}
                        onChange={(e) => setDailyGoalMin(e.target.value)}
                        className="font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                        Weekly Focus Goal (minutes)
                      </label>
                      <ThemeInput
                        type="number"
                        min="15"
                        max="5000"
                        value={weeklyGoalMin}
                        onChange={(e) => setWeeklyGoalMin(e.target.value)}
                        className="font-mono tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[var(--ff-border-color)]">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={shortcutsEnabled}
                        onChange={(e) => setShortcutsEnabled(e.target.checked)}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-xs text-[var(--ff-text-secondary)] font-medium flex items-center gap-1.5">
                        <Keyboard className="w-3.5 h-3.5" /> Enable Global Shortcuts (Cmd/Ctrl+K, Alt+1..8)
                      </span>
                    </label>
                  </div>
                </ThemeCard>
              </motion.div>
            )}

            {/* CATEGORY E: TASKS & PLANNING */}
            {activeCategory === 'tasks' && (
              <motion.div
                key="cat-tasks"
                initial={isDisabled ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: MOTION_DURATION.card * Math.max(0.5, factor || 0.01) }}
                className="space-y-6"
              >
                <ThemeCard className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                    <CheckSquare className="w-4 h-4 text-[var(--ff-accent-text)]" />
                    <span>Task Execution &amp; Planning Rules</span>
                  </div>
                  <p className="text-xs text-[var(--ff-text-secondary)]">
                    Configure checklist behavior, recurrence idempotency keys, and default pomodoro interval estimates.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] space-y-1">
                      <span className="font-bold text-[var(--ff-text-primary)] block">Idempotent Recurrence</span>
                      <span className="text-[11px] text-[var(--ff-text-muted)] block">
                        Prevents duplicate task creation across daily, weekly, and monthly recurrence boundaries.
                      </span>
                    </div>
                    <div className="p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] space-y-1">
                      <span className="font-bold text-[var(--ff-text-primary)] block">30-Day Trash Soft-Delete</span>
                      <span className="text-[11px] text-[var(--ff-text-muted)] block">
                        Deleted tasks remain safely restorable for 30 days before permanent purging.
                      </span>
                    </div>
                  </div>
                </ThemeCard>
              </motion.div>
            )}

            {/* CATEGORY F: FINANCE PREFERENCES */}
            {activeCategory === 'finance' && (
              <motion.div
                key="cat-finance"
                initial={isDisabled ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: MOTION_DURATION.card * Math.max(0.5, factor || 0.01) }}
                className="space-y-6"
              >
                <ThemeCard className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                    <DollarSign className="w-4 h-4 text-[var(--ff-success)]" />
                    <span>Currency Standard &amp; Arithmetic Engine</span>
                  </div>

                  <div className="max-w-sm space-y-2">
                    <label htmlFor="pref-currency" className="block text-xs font-semibold text-[var(--ff-text-secondary)]">
                      Active Currency Standard
                    </label>
                    <ThemeSelect
                      id="pref-currency"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                    >
                      <option value="INR">INR (₹) - Indian Rupee</option>
                      <option value="USD">USD ($) - US Dollar</option>
                      <option value="EUR">EUR (€) - Euro</option>
                      <option value="GBP">GBP (£) - British Pound</option>
                    </ThemeSelect>
                    <span className="text-[11px] text-[var(--ff-text-muted)] block">
                      All calculations use exact integer paise arithmetic ($1.00 = 100 units / cents / paise) with 0.00 drift across 10,000 chained operations.
                    </span>
                  </div>
                </ThemeCard>
              </motion.div>
            )}

            {/* CATEGORY G: NOTIFICATIONS & RULES */}
            {activeCategory === 'notifications' && (
              <motion.div
                key="cat-notifications"
                initial={isDisabled ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: MOTION_DURATION.card * Math.max(0.5, factor || 0.01) }}
                className="space-y-6"
              >
                <ThemeCard className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                      <Bell className="w-4 h-4 text-[var(--ff-warning)]" />
                      <span>Deterministic Notification Rules</span>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notifPrefs.enabled}
                        onChange={(e) => setNotifPrefs((p) => ({ ...p, enabled: e.target.checked }))}
                        className="w-4 h-4 rounded"
                      />
                      <span>Active</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                    {(
                      [
                        ['taskDeadlines', 'Task due & overdue alerts'],
                        ['upcomingBills', 'Upcoming bill due reminders'],
                        ['overdueBills', 'Overdue bill urgent warnings'],
                        ['dailyFocusGoal', 'Daily focus goal milestone notice'],
                        ['budgetWarnings', 'Budget threshold capacity alerts'],
                        ['syncFailures', 'Google Sheets sync error alerts'],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2.5 cursor-pointer p-2.5 rounded-lg bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)]">
                        <input
                          type="checkbox"
                          checked={Boolean(notifPrefs[key])}
                          onChange={(e) => setNotifPrefs((p) => ({ ...p, [key]: e.target.checked }))}
                          className="w-4 h-4 rounded"
                        />
                        <span className="text-[var(--ff-text-secondary)] font-medium">{label}</span>
                      </label>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-[var(--ff-border-color)]">
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--ff-text-muted)] mb-1">
                        Bill Reminder Lead Days (1–14)
                      </label>
                      <ThemeInput
                        type="number"
                        min="1"
                        max="14"
                        value={String(notifPrefs.billLeadDays)}
                        onChange={(e) =>
                          setNotifPrefs((p) => ({
                            ...p,
                            billLeadDays: Math.min(14, Math.max(1, Number(e.target.value) || 3)),
                          }))
                        }
                        className="font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--ff-text-muted)] mb-1">
                        Budget Warning Percent (50–100%)
                      </label>
                      <ThemeInput
                        type="number"
                        min="50"
                        max="100"
                        value={String(notifPrefs.budgetWarningPercent)}
                        onChange={(e) =>
                          setNotifPrefs((p) => ({
                            ...p,
                            budgetWarningPercent: Math.min(100, Math.max(50, Number(e.target.value) || 80)),
                          }))
                        }
                        className="font-mono tabular-nums"
                      />
                    </div>
                  </div>
                </ThemeCard>
              </motion.div>
            )}

            {/* CATEGORY H: DATA & GOOGLE SHEETS */}
            {activeCategory === 'sync' && (
              <motion.div
                key="cat-sync"
                initial={isDisabled ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: MOTION_DURATION.card * Math.max(0.5, factor || 0.01) }}
                className="space-y-6"
              >
                <ThemeCard className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 shadow-xs"
                        style={{ background: 'var(--ff-success)', color: '#ffffff' }}
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-[var(--ff-text-primary)]">
                          Google Sheets Executive Synchronization
                        </h2>
                        <p className="text-xs text-[var(--ff-text-muted)]">
                          23 master worksheets, 5 native interactive charts, INR currency formatting, and decoupled cell styling.
                        </p>
                      </div>
                    </div>
                    <ThemeBadge tone={googleSpreadsheetId ? 'success' : 'neutral'}>
                      {googleSpreadsheetId ? 'Connected' : 'Not Connected'}
                    </ThemeBadge>
                  </div>

                  {googleSpreadsheetId ? (
                    <ThemeCard
                      variant="inset"
                      className="p-4 space-y-3"
                      style={{
                        background: 'var(--ff-success-soft)',
                        borderColor: 'color-mix(in oklab, var(--ff-success) 35%, transparent)',
                      }}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold block" style={{ color: 'var(--ff-success)' }}>
                              Master Ledger Active in Google Drive
                            </span>
                            {syncQueueCount > 0 && (
                              <ThemeBadge tone="warning">
                                {syncQueueCount} queued {syncQueueCount === 1 ? 'op' : 'ops'}
                              </ThemeBadge>
                            )}
                            {offlineOutboxCount > 0 && (
                              <ThemeBadge tone="danger">{offlineOutboxCount} offline pending</ThemeBadge>
                            )}
                          </div>
                          <span className="text-[11px] font-mono text-[var(--ff-text-secondary)] block mt-0.5 truncate max-w-md">
                            Sheet ID: {googleSpreadsheetId}
                          </span>
                          {lastSyncedAt && (
                            <span className="text-[11px] text-[var(--ff-text-muted)] block mt-1">
                              Last synchronized: {new Date(lastSyncedAt).toLocaleString()}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <a
                            href={`https://docs.google.com/spreadsheets/d/${googleSpreadsheetId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ff-btn ff-btn-secondary px-3.5 py-2 text-xs"
                          >
                            <span>Open in Sheets</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>

                          <ThemeButton
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => void reapplySheetFormatting()}
                            disabled={syncStatus === 'syncing'}
                            title="Re-apply header styling, filters, conditional formatting, and column sizing"
                          >
                            <Palette className="w-3.5 h-3.5" />
                            <span>Re-apply Formatting</span>
                          </ThemeButton>

                          <ThemeButton
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => void historicalResyncToGoogleSheets()}
                            disabled={syncStatus === 'syncing'}
                            title="Safely verify, clear dynamic ranges, and perform full historical rebuild"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Historical Resync</span>
                          </ThemeButton>

                          <ThemeButton
                            type="button"
                            variant="success"
                            size="sm"
                            onClick={() => void syncNowToGoogleSheets()}
                            disabled={syncStatus === 'syncing'}
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                            <span>{syncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}</span>
                          </ThemeButton>
                        </div>
                      </div>

                      {offlineOutboxCount > 0 && (
                        <div className="pt-2 border-t border-[var(--ff-border-color)] flex items-center justify-between gap-2 text-xs">
                          <span className="text-[var(--ff-text-secondary)]">
                            {offlineOutboxCount} offline write{offlineOutboxCount === 1 ? '' : 's'} waiting to reconcile to Firestore.
                          </span>
                          <ThemeButton type="button" variant="secondary" size="xs" onClick={() => void reconcileOutboxNow()}>
                            Reconcile Outbox
                          </ThemeButton>
                        </div>
                      )}
                    </ThemeCard>
                  ) : (
                    <ThemeCard variant="inset" className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-bold text-[var(--ff-text-primary)] block">
                          Initialize Executive Master Spreadsheet
                        </span>
                        <span className="text-[11px] text-[var(--ff-text-muted)] block mt-0.5">
                          Automatically generate all 23 formatted worksheets with executive dashboards, frozen headers, INR currency styling, and live formulas.
                        </span>
                      </div>
                      <ThemeButton
                        variant="success"
                        size="sm"
                        onClick={handleCreateWorkbook}
                        loading={isInitializingSheets}
                        loadingText="Creating 23 Tabs..."
                        className="shrink-0"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>Create Master Workbook</span>
                      </ThemeButton>
                    </ThemeCard>
                  )}

                  {/* 23 Worksheets Catalog Grid */}
                  <div className="pt-2">
                    <span className="text-[11px] font-semibold text-[var(--ff-text-muted)] uppercase tracking-wider block mb-2">
                      The 23 Master Worksheets Architecture
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-[11px] text-[var(--ff-text-secondary)] font-mono">
                      {[
                        '1. Executive_Dashboard ★',
                        '2. Finance_Dashboard',
                        '3. Productivity_Dashboard',
                        '4. Focus_Sessions',
                        '5. Focus_Daily',
                        '6. Focus_Weekly',
                        '7. Focus_Monthly',
                        '8. Tasks',
                        '9. Task_Analytics',
                        '10. Productivity_Goals',
                        '11. Income',
                        '12. Fixed_Expenses',
                        '13. Variable_Expenses',
                        '14. Bills_Payments',
                        '15. Budgets',
                        '16. Savings_Goals',
                        '17. Finance_Daily',
                        '18. Finance_Weekly',
                        '19. Finance_Monthly',
                        '20. Sync_Control',
                        '21. Sync_Error_Log',
                        '22. Data_Dictionary',
                        '23. Settings',
                      ].map((sheet) => (
                        <span
                          key={sheet}
                          className={`p-1.5 rounded-md border truncate ${
                            sheet.includes('★')
                              ? 'bg-[var(--ff-accent-soft)] border-[var(--ff-accent-text)] text-[var(--ff-accent-text)] font-bold'
                              : 'bg-[var(--ff-surface-inset)] border-[var(--ff-border-color)]'
                          }`}
                        >
                          {sheet}
                        </span>
                      ))}
                    </div>
                  </div>
                </ThemeCard>
              </motion.div>
            )}

            {/* CATEGORY I: PRIVACY & SECURITY */}
            {activeCategory === 'security' && (
              <motion.div
                key="cat-security"
                initial={isDisabled ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: MOTION_DURATION.card * Math.max(0.5, factor || 0.01) }}
                className="space-y-6"
              >
                <ThemeCard className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                    <ShieldCheck className="w-4 h-4 text-[var(--ff-accent-text)]" />
                    <span>Security &amp; Multi-Tenant Isolation Status</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] space-y-1">
                      <span className="font-bold text-[var(--ff-text-primary)] block">RSA-SHA256 Token Auth</span>
                      <span className="text-[11px] text-[var(--ff-text-muted)] block">
                        Server-side signature verification against Google public x509 certs.
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] space-y-1">
                      <span className="font-bold text-[var(--ff-text-primary)] block">Sliding-Window Rate Limiting</span>
                      <span className="text-[11px] text-[var(--ff-text-muted)] block">
                        Throttles API requests to 300 req/min per IP to prevent brute-force attacks.
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] space-y-1">
                      <span className="font-bold text-[var(--ff-text-primary)] block">Console Log Sanitization</span>
                      <span className="text-[11px] text-[var(--ff-text-muted)] block">
                        Tokens, passwords, and payment identifiers are automatically redacted.
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] space-y-1">
                      <span className="font-bold text-[var(--ff-text-primary)] block">Subcollection Isolation</span>
                      <span className="text-[11px] text-[var(--ff-text-muted)] block">
                        Cloud Firestore rules enforce strict user-level boundaries across all 15 collections.
                      </span>
                    </div>
                  </div>
                </ThemeCard>
              </motion.div>
            )}

            {/* CATEGORY J: BACKUP & RECOVERY */}
            {activeCategory === 'backup' && (
              <motion.div
                key="cat-backup"
                initial={isDisabled ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: MOTION_DURATION.card * Math.max(0.5, factor || 0.01) }}
                className="space-y-6"
              >
                <ThemeCard className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                    <Database className="w-4 h-4 text-[var(--ff-accent-text)]" />
                    <span>Workspace Data Safety, Backups &amp; Trash</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <ThemeButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setTrashModalOpen(true)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Open Trash Bin (30-day restore)</span>
                    </ThemeButton>

                    <ThemeButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        try {
                          const [tasks, sessions, incomes, expenses, bills, goals] = await Promise.all([
                            api.getTasks(),
                            api.getFocusSessions(),
                            api.getIncomes(),
                            api.getExpenses(),
                            api.getBills(),
                            api.getSavingsGoals(),
                          ]);
                          const payload = JSON.stringify(
                            { exportedAt: new Date().toISOString(), settings, tasks, sessions, incomes, expenses, bills, savingsGoals: goals },
                            null,
                            2
                          );
                          const blob = new Blob([payload], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `focusflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
                          a.click();
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                          showToast('Workspace JSON backup downloaded', 'success');
                        } catch {
                          showToast('Failed to create JSON backup', 'error');
                        }
                      }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export JSON Backup</span>
                    </ThemeButton>
                  </div>
                </ThemeCard>

                {/* Embedded Live Data Recovery Center */}
                <DataRecoveryCenter />

                {/* Danger Zone */}
                <ThemeCard className="space-y-3 border border-[var(--ff-danger)]/40 bg-[var(--ff-danger-soft)]/20">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--ff-danger)]">
                    <ShieldAlert className="w-4 h-4" />
                    <span>Danger Zone &amp; Workspace Reset</span>
                  </div>
                  <p className="text-xs text-[var(--ff-text-secondary)]">
                    Wipe your workspace data or load initial sample data. These actions are guarded by confirmation modals.
                  </p>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <ThemeButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleClearAllWorkspace}
                      style={{ color: 'var(--ff-danger)' }}
                      title="Wipe all data and start with an empty workspace"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Wipe All Data</span>
                    </ThemeButton>

                    <ThemeButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleReseed}
                      style={{ color: 'var(--ff-text-muted)' }}
                      title="Load sample starter data"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Load Sample Data</span>
                    </ThemeButton>
                  </div>
                </ThemeCard>
              </motion.div>
            )}

            {/* CATEGORY K: ACCESSIBILITY & MOTION */}
            {activeCategory === 'accessibility' && (
              <motion.div
                key="cat-accessibility"
                initial={isDisabled ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: MOTION_DURATION.card * Math.max(0.5, factor || 0.01) }}
                className="space-y-6"
              >
                <ThemeCard className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                    <Eye className="w-4 h-4 text-[var(--ff-accent-text)]" />
                    <span>Accessibility &amp; Motor Ergonomics</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] space-y-1">
                      <span className="font-bold text-[var(--ff-text-primary)] block">Reduced-Motion Compliance</span>
                      <span className="text-[11px] text-[var(--ff-text-muted)] block">
                        Respects OS <code>prefers-reduced-motion</code> setting, disabling transforms and spring physics.
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] space-y-1">
                      <span className="font-bold text-[var(--ff-text-primary)] block">WCAG 2.1 AA Contrast</span>
                      <span className="text-[11px] text-[var(--ff-text-muted)] block">
                        All 19 design styles enforce a minimum 4.5:1 text contrast ratio (averaging 7:1+).
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] space-y-1">
                      <span className="font-bold text-[var(--ff-text-primary)] block">Mobile Touch Ergonomics</span>
                      <span className="text-[11px] text-[var(--ff-text-muted)] block">
                        All buttons and interactive targets maintain a minimum bounding box of &ge; 44&times;44px.
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] space-y-1">
                      <span className="font-bold text-[var(--ff-text-primary)] block">High-Contrast Focus Rings</span>
                      <span className="text-[11px] text-[var(--ff-text-muted)] block">
                        Accessible <code>:focus-visible</code> indicators ensure full keyboard-only navigation.
                      </span>
                    </div>
                  </div>
                </ThemeCard>
              </motion.div>
            )}

            {/* CATEGORY L: ABOUT & SUPPORT */}
            {activeCategory === 'about' && (
              <motion.div
                key="cat-about"
                initial={isDisabled ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: MOTION_DURATION.card * Math.max(0.5, factor || 0.01) }}
                className="space-y-6"
              >
                <ThemeCard className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)]">
                    <Info className="w-4 h-4 text-[var(--ff-accent-text)]" />
                    <span>FocusFlow &amp; Finance Platform Overview</span>
                  </div>

                  <div className="space-y-2 text-xs text-[var(--ff-text-secondary)] leading-relaxed">
                    <p>
                      <strong>Version:</strong> v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown'} (Production Release Baseline)
                    </p>
                    <p>
                      <strong>Architecture:</strong> 100% deterministic, zero-AI software engine. Powered by React 19, TypeScript 5, Tailwind CSS v4, Motion, Cloud Firestore, Express security proxy, and Google Sheets API v4.
                    </p>
                    <p>
                      <strong>Technical Guides:</strong>
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-[11px] pt-1">
                      {[
                        'README.md',
                        'CHANGELOG.md',
                        'RELEASE_PROCESS.md',
                        'BACKUP_RECOVERY_GUIDE.md',
                        'MAINTENANCE_GUIDE.md',
                        'DATABASE_MIGRATION_GUIDE.md',
                        'INCIDENT_RESPONSE_GUIDE.md',
                        'SYSTEM_ARCHITECTURE.md',
                      ].map((doc) => (
                        <span key={doc} className="p-2 rounded border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] truncate">
                          {doc}
                        </span>
                      ))}
                    </div>
                  </div>
                </ThemeCard>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
