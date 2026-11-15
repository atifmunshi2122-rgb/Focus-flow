import React from 'react';
import {
  Bell,
  CheckSquare,
  Database,
  DollarSign,
  Eye,
  FileSpreadsheet,
  Info,
  LayoutDashboard,
  Palette,
  ShieldCheck,
  Timer,
  User,
} from 'lucide-react';

declare const __APP_VERSION__: string | undefined;

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

