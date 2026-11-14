import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bell,
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  Settings2,
  CheckCheck,
  Trash2,
  Clock,
  Wallet,
  CreditCard,
  Flame,
  Layers,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { useMotionPreferences } from '../ui/MotionPrimitives.tsx';
import { MOTION_DURATION, MOTION_EASING } from '../../theme/motionTokens.ts';
import { ThemeBadge, ThemeButton } from '../ui/ThemePrimitives.tsx';

type NotificationFilter = 'all' | 'unread' | 'urgent';

export const NotificationCenter: React.FC = () => {
  const {
    activeNotifications,
    readNotificationIds,
    unreadNotificationCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    clearNotifications,
    setCurrentTab,
    showToast,
  } = useApp();

  const { isDisabled } = useMotionPreferences();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const onOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, []);

  // Filtered notifications
  const displayedNotifications = useMemo(() => {
    return activeNotifications.filter((n) => {
      if (filter === 'unread') return !readNotificationIds.includes(n.id);
      if (filter === 'urgent') return n.severity === 'danger' || n.severity === 'warning';
      return true;
    });
  }, [activeNotifications, readNotificationIds, filter]);

  const urgentCount = activeNotifications.filter(
    (n) => (n.severity === 'danger' || n.severity === 'warning') && !readNotificationIds.includes(n.id)
  ).length;

  const getCategoryIcon = (category: string, severity: string) => {
    if (category === 'task') return <Clock className="w-4 h-4 text-[var(--ff-accent-text)]" />;
    if (category === 'bill') return <CreditCard className="w-4 h-4 text-rose-500" />;
    if (category === 'habit') return <Flame className="w-4 h-4 text-amber-500" />;
    if (category === 'budget') return <Layers className="w-4 h-4 text-purple-500" />;

    if (severity === 'danger') return <XCircle className="w-4 h-4 text-[var(--ff-danger)]" />;
    if (severity === 'warning') return <AlertTriangle className="w-4 h-4 text-[var(--ff-warning)]" />;
    if (severity === 'success') return <CheckCircle2 className="w-4 h-4 text-[var(--ff-success)]" />;
    return <Info className="w-4 h-4 text-[var(--ff-accent-text)]" />;
  };

  const handleMarkAllRead = () => {
    markAllNotificationsAsRead();
    showToast('All notifications marked as read', 'info');
  };

  const handleClearAll = () => {
    clearNotifications();
    showToast('All notifications cleared', 'info');
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg border border-[var(--ff-border-color)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] transition-colors"
        aria-label="Open notifications center"
        title="Notifications & System Alerts"
      >
        <Bell className="w-4 h-4" />
        {unreadNotificationCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center animate-pulse"
            style={{
              background: urgentCount > 0 ? 'var(--ff-danger)' : 'var(--ff-accent)',
              color: '#ffffff',
            }}
          >
            {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={isDisabled ? false : { opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: MOTION_DURATION.dropdown, ease: MOTION_EASING.decelerate }}
            className="ff-card-elevated absolute right-0 mt-2 w-80 sm:w-96 z-50 overflow-hidden shadow-2xl border border-[var(--ff-border-color)]"
            style={{
              boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.4), 0 0 0 1px var(--ff-border-color)',
            }}
          >
            {/* Panel Header */}
            <div className="p-3.5 border-b border-[var(--ff-border-color)] bg-[var(--ff-surface-card)]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                    Notification Center
                  </h3>
                  {unreadNotificationCount > 0 && (
                    <ThemeBadge tone="accent">{unreadNotificationCount} new</ThemeBadge>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {unreadNotificationCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="p-1 rounded text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] text-xs flex items-center gap-1"
                      title="Mark all as read"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {activeNotifications.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="p-1 rounded text-[var(--ff-text-muted)] hover:text-[var(--ff-danger)] hover:bg-[var(--ff-surface-hover)] text-xs flex items-center gap-1"
                      title="Clear notifications"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--ff-surface-muted)]">
                {(['all', 'unread', 'urgent'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setFilter(tab)}
                    className={`flex-1 py-1 text-[11px] font-semibold rounded-md capitalize transition-colors ${
                      filter === tab
                        ? 'bg-[var(--ff-surface-card)] text-[var(--ff-text-primary)] shadow-sm'
                        : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-secondary)]'
                    }`}
                  >
                    {tab}
                    {tab === 'unread' && unreadNotificationCount > 0 && (
                      <span className="ml-1 text-[10px] text-[var(--ff-accent-text)]">
                        ({unreadNotificationCount})
                      </span>
                    )}
                    {tab === 'urgent' && urgentCount > 0 && (
                      <span className="ml-1 text-[10px] text-rose-500">
                        ({urgentCount})
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Notification Items List */}
            <div className="max-h-80 overflow-y-auto divide-y divide-[var(--ff-border-color)]">
              {displayedNotifications.length === 0 ? (
                <div className="px-4 py-10 text-center space-y-1.5">
                  <CheckCircle2 className="w-7 h-7 mx-auto text-[var(--ff-success)] opacity-80" />
                  <div className="text-xs font-bold text-[var(--ff-text-primary)]">
                    {filter === 'unread'
                      ? 'No unread notifications'
                      : filter === 'urgent'
                      ? 'No urgent alerts'
                      : 'All caught up!'}
                  </div>
                  <p className="text-[11px] text-[var(--ff-text-muted)] max-w-xs mx-auto">
                    {filter === 'unread'
                      ? 'You have read all your system alerts and reminders.'
                      : 'No overdue bills, due tasks, or budget threshold warnings.'}
                  </p>
                </div>
              ) : (
                displayedNotifications.map((item) => {
                  const isRead = readNotificationIds.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`px-4 py-3 flex items-start gap-3 transition-colors ${
                        isRead ? 'opacity-70 hover:opacity-100' : 'bg-[var(--ff-accent-soft)]/10 hover:bg-[var(--ff-surface-hover)]'
                      }`}
                    >
                      {/* Icon */}
                      <div className="mt-0.5 shrink-0">
                        {getCategoryIcon(item.category, item.severity)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className={`text-xs ${isRead ? 'font-medium' : 'font-bold'} text-[var(--ff-text-primary)] truncate`}>
                            {item.title}
                          </p>
                          {!isRead && (
                            <span className="w-2 h-2 rounded-full bg-[var(--ff-accent)] shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] text-[var(--ff-text-secondary)] mt-0.5 leading-relaxed">
                          {item.message}
                        </p>

                        <div className="flex items-center justify-between gap-2 mt-2 pt-1 border-t border-[var(--ff-border-color)]/30">
                          <button
                            type="button"
                            onClick={() => {
                              markNotificationAsRead(item.id);
                              setOpen(false);
                              setCurrentTab(item.targetTab);
                            }}
                            className="text-[11px] font-bold text-[var(--ff-accent-text)] hover:underline inline-flex items-center gap-1"
                          >
                            <span>{item.actionLabel}</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>

                          <button
                            type="button"
                            onClick={() => markNotificationAsRead(item.id)}
                            className="text-[10px] text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
                          >
                            {isRead ? 'Read' : 'Mark as read'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Panel Footer */}
            <div className="px-4 py-2.5 border-t border-[var(--ff-border-color)] bg-[var(--ff-surface-card)] flex items-center justify-between text-xs">
              <span className="text-[10px] text-[var(--ff-text-muted)]">
                {activeNotifications.length} active alerts
              </span>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setCurrentTab('settings');
                }}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] hover:underline"
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span>Notification Settings</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
