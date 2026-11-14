import React from 'react';
import { ThemeModal, ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import { Command, Keyboard, Zap, Layers, Sparkles, X } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface ShortcutItem {
  keys: string[];
  description: string;
  category: 'General' | 'Quick Create' | 'Navigation';
}

export const SHORTCUTS_REGISTRY: ShortcutItem[] = [
  // General
  { keys: ['⌘', 'K'], description: 'Open Universal Command Palette & Search', category: 'General' },
  { keys: ['Ctrl', 'K'], description: 'Open Command Palette (Windows / Linux)', category: 'General' },
  { keys: ['?'], description: 'Open Keyboard Shortcuts Guide', category: 'General' },
  { keys: ['Esc'], description: 'Close active modal, drawer, or palette', category: 'General' },

  // Quick Create
  { keys: ['N'], description: 'Quick Create Task', category: 'Quick Create' },
  { keys: ['E'], description: 'Quick Log Expense', category: 'Quick Create' },
  { keys: ['I'], description: 'Quick Record Income', category: 'Quick Create' },
  { keys: ['F'], description: 'Toggle Focus / Pomodoro Timer', category: 'Quick Create' },

  // Navigation
  { keys: ['Alt', '1'], description: 'Jump to Executive Dashboard', category: 'Navigation' },
  { keys: ['Alt', '2'], description: 'Jump to Focus Lab & Pomodoro', category: 'Navigation' },
  { keys: ['Alt', '3'], description: 'Jump to Task Management', category: 'Navigation' },
  { keys: ['Alt', '4'], description: 'Jump to Finance Overview', category: 'Navigation' },
  { keys: ['Alt', '5'], description: 'Jump to Transactions Ledger', category: 'Navigation' },
  { keys: ['Alt', '6'], description: 'Jump to Bills & Recurring Payments', category: 'Navigation' },
  { keys: ['Alt', '7'], description: 'Jump to Unified Analytics & Reports', category: 'Navigation' },
  { keys: ['Alt', '8'], description: 'Jump to Settings & Theme Studio', category: 'Navigation' },
  { keys: ['Alt', '9'], description: 'Jump to Study OS & Academic Intelligence', category: 'Navigation' },
  { keys: ['Alt', 'H'], description: 'Jump to Habit Tracker & Streaks', category: 'Navigation' },
  { keys: ['Alt', 'C'], description: 'Jump to Productivity Calendar', category: 'Navigation' },
  { keys: ['Alt', 'B'], description: 'Jump to Daily Time-block Planner', category: 'Navigation' },
  { keys: ['Alt', 'E'], description: 'Jump to Envelope Budgets', category: 'Navigation' },
  { keys: ['Alt', 'S'], description: 'Jump to Subscriptions Manager', category: 'Navigation' },
  { keys: ['Alt', 'R'], description: 'Jump to Data Recovery Center', category: 'Navigation' },
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const categories = ['General', 'Quick Create', 'Navigation'] as const;

  return (
    <ThemeModal
      isOpen={isOpen}
      onClose={onClose}
      title="Keyboard Shortcuts Cheat-Sheet"
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--ff-border-color)]">
          <p className="text-xs text-[var(--ff-text-muted)]">
            Press keys directly from anywhere in the application. Shortcuts are automatically paused when typing inside form fields.
          </p>
          <ThemeBadge tone="accent">Desktop Grade</ThemeBadge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {categories.map((cat) => {
            const items = SHORTCUTS_REGISTRY.filter((s) => s.category === cat);
            return (
              <div key={cat} className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--ff-text-muted)] flex items-center gap-1.5">
                  {cat === 'General' && <Command className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />}
                  {cat === 'Quick Create' && <Zap className="w-3.5 h-3.5 text-amber-500" />}
                  {cat === 'Navigation' && <Layers className="w-3.5 h-3.5 text-indigo-500" />}
                  <span>{cat}</span>
                </span>

                <div className="p-2.5 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-card)] divide-y divide-[var(--ff-border-color)]/40">
                  {items.map((item, idx) => (
                    <div key={idx} className="py-1.5 px-1 flex items-center justify-between gap-3 text-xs">
                      <span className="text-[var(--ff-text-secondary)] truncate">
                        {item.description}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {item.keys.map((k, kIdx) => (
                          <kbd
                            key={kIdx}
                            className="px-1.5 py-0.5 rounded font-mono font-bold text-[11px] border border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] text-[var(--ff-text-primary)] shadow-sm"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end pt-3 border-t border-[var(--ff-border-color)]">
          <ThemeButton variant="primary" size="sm" onClick={onClose}>
            <span>Got it</span>
          </ThemeButton>
        </div>
      </div>
    </ThemeModal>
  );
};
