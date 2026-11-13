import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { SubscriptionPlan, ExpenseCategory } from '../../types/index.ts';
import { DEFAULT_TIMEZONE, getTodayDateString, computeNextRecurrenceDueDate } from '../../lib/dateTime.ts';
import { formatCurrency, toPaise, toMajorCurrency } from '../../lib/currency.ts';
import { ThemeCard, ThemeButton, ThemeInput, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import { AnimatedNumber, MotionStaggerGrid, MotionStaggerItem, useMotionPreferences } from '../ui/MotionPrimitives.tsx';
import { getSpringTransition, MOTION_DURATION } from '../../theme/motionTokens.ts';
import {
  CreditCard,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  ExternalLink,
  PauseCircle,
  PlayCircle,
  XCircle,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  Sparkles,
} from 'lucide-react';

export const SubscriptionManager: React.FC = () => {
  const { currency, settings, showToast, refreshKey, triggerRefresh, confirmAction } = useApp();
  const { intensity, isDisabled } = useMotionPreferences();
  const tz = settings?.timezone || DEFAULT_TIMEZONE;
  const todayStr = useMemo(() => getTodayDateString(tz), [tz]);

  const [subscriptions, setSubscriptions] = useState<SubscriptionPlan[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<SubscriptionPlan | null>(null);
  const [formName, setFormName] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formCycle, setFormCycle] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [formNextRenewal, setFormNextRenewal] = useState(todayStr);
  const [formReminderDays, setFormReminderDays] = useState('3');
  const [formAutoRenew, setFormAutoRenew] = useState(true);
  const [formStatus, setFormStatus] = useState<'active' | 'paused' | 'cancelled'>('active');
  const [formUrl, setFormUrl] = useState('');
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    Promise.all([api.getSubscriptions(), api.getCategories()])
      .then(([subs, cats]) => {
        if (!isMounted) return;
        setSubscriptions(subs);
        setCategories(cats);
      })
      .catch((err) => {
        if (isMounted) showToast('Failed to load subscriptions', 'error');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [refreshKey, showToast]);

  const openCreateModal = () => {
    setEditingSub(null);
    setFormName('');
    setFormAmount('');
    setFormCategoryId(categories[0]?.id || 'cat_subscriptions');
    setFormCycle('monthly');
    setFormNextRenewal(todayStr);
    setFormReminderDays('3');
    setFormAutoRenew(true);
    setFormStatus('active');
    setFormUrl('');
    setFormNotes('');
    setIsModalOpen(true);
  };

  const openEditModal = (sub: SubscriptionPlan) => {
    setEditingSub(sub);
    setFormName(sub.name);
    setFormAmount(String(toMajorCurrency(sub.amountPaise)));
    setFormCategoryId(sub.categoryId);
    setFormCycle(sub.billingCycle);
    setFormNextRenewal(sub.nextRenewalDate);
    setFormReminderDays(String(sub.reminderDays));
    setFormAutoRenew(sub.autoRenew);
    setFormStatus(sub.status);
    setFormUrl(sub.websiteUrl || '');
    setFormNotes(sub.notes || '');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast('Please enter a subscription name', 'error');
      return;
    }

    const amountPaise = toPaise(formAmount);
    if (amountPaise <= 0) {
      showToast('Please enter a positive subscription fee', 'error');
      return;
    }

    try {
      if (editingSub) {
        await api.updateSubscription(editingSub.id, {
          name: formName.trim(),
          amountPaise,
          categoryId: formCategoryId,
          billingCycle: formCycle,
          nextRenewalDate: formNextRenewal,
          reminderDays: Number(formReminderDays) || 3,
          autoRenew: formAutoRenew,
          status: formStatus,
          websiteUrl: formUrl.trim(),
          notes: formNotes.trim(),
        });
        showToast('Subscription updated', 'success');
      } else {
        await api.createSubscription({
          name: formName.trim(),
          amountPaise,
          categoryId: formCategoryId,
          billingCycle: formCycle,
          nextRenewalDate: formNextRenewal,
          reminderDays: Number(formReminderDays) || 3,
          autoRenew: formAutoRenew,
          status: formStatus,
          websiteUrl: formUrl.trim(),
          notes: formNotes.trim(),
        });
        showToast('Subscription plan tracked', 'success');
      }
      setIsModalOpen(false);
      triggerRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save subscription';
      showToast(msg, 'error');
    }
  };

  const handleToggleStatus = async (sub: SubscriptionPlan) => {
    const nextStatus = sub.status === 'active' ? 'paused' : 'active';
    try {
      await api.updateSubscription(sub.id, { status: nextStatus });
      showToast(`Subscription ${nextStatus === 'active' ? 'resumed' : 'paused'}`, 'info');
      triggerRefresh();
    } catch {
      showToast('Failed to update subscription status', 'error');
    }
  };

  const handleDelete = async (sub: SubscriptionPlan) => {
    const confirmed = await confirmAction({
      title: 'Delete Subscription Plan',
      message: 'Move this tracked subscription to Trash? You can restore it later from the Trash Bin.',
      itemLabel: `${sub.name} · ${formatCurrency(sub.amountPaise, currency)}/${sub.billingCycle}`,
      confirmLabel: 'Move to Trash',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.deleteSubscription(sub.id);
      showToast('Subscription moved to trash', 'info');
      triggerRefresh();
    } catch {
      showToast('Failed to delete subscription', 'error');
    }
  };

  // Cost projections
  const activeSubs = subscriptions.filter((s) => s.status === 'active');
  const monthlyProjectedPaise = activeSubs.reduce((sum, s) => {
    if (s.billingCycle === 'monthly') return sum + s.amountPaise;
    if (s.billingCycle === 'quarterly') return sum + Math.round(s.amountPaise / 3);
    if (s.billingCycle === 'yearly') return sum + Math.round(s.amountPaise / 12);
    return sum;
  }, 0);

  const annualProjectedPaise = monthlyProjectedPaise * 12;

  // Upcoming renewals (within 7 days)
  const renewalsNear = activeSubs.filter((s) => {
    const diffDays = Math.round(
      (new Date(`${s.nextRenewalDate}T12:00:00Z`).getTime() - new Date(`${todayStr}T12:00:00Z`).getTime()) /
        86400000
    );
    return diffDays >= 0 && diffDays <= 7;
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 flex items-center justify-center rounded-xl"
            style={{ backgroundColor: 'var(--ff-accent-soft)', color: 'var(--ff-accent-text)' }}
          >
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--ff-text-primary)]">
              Subscription Manager
            </h1>
            <p className="text-xs text-[var(--ff-text-muted)]">
              Track recurring software subscriptions, renewals, notice windows and annual commitments
            </p>
          </div>
        </div>

        <ThemeButton variant="primary" size="sm" onClick={openCreateModal}>
          <Plus className="w-4 h-4 mr-1.5" />
          Add Subscription
        </ThemeButton>
      </div>

      {/* Financial Projections Banner */}
      <MotionStaggerGrid className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MotionStaggerItem className="p-4 rounded-xl bg-[var(--ff-card-bg)] border ff-divider flex items-center justify-between">
          <div>
            <span className="text-xs text-[var(--ff-text-muted)] uppercase font-semibold">Active Subscriptions</span>
            <p className="text-lg font-bold font-mono text-[var(--ff-text-primary)] mt-0.5">
              <AnimatedNumber value={activeSubs.length} /> of {subscriptions.length}
            </p>
          </div>
          <ThemeBadge tone="neutral">{subscriptions.filter((s) => s.status === 'paused').length} Paused</ThemeBadge>
        </MotionStaggerItem>

        <MotionStaggerItem className="p-4 rounded-xl bg-[var(--ff-card-bg)] border ff-divider flex items-center justify-between">
          <div>
            <span className="text-xs text-[var(--ff-text-muted)] uppercase font-semibold">Monthly Outflow</span>
            <p className="text-lg font-bold font-mono text-[var(--ff-text-primary)] mt-0.5">
              <AnimatedNumber
                value={monthlyProjectedPaise / 100}
                format={(v) => `${formatCurrency(Math.round(v * 100), currency)}/mo`}
              />
            </p>
          </div>
          <ThemeBadge tone="neutral">Normalized</ThemeBadge>
        </MotionStaggerItem>

        <MotionStaggerItem className="p-4 rounded-xl bg-[var(--ff-card-bg)] border ff-divider flex items-center justify-between">
          <div>
            <span className="text-xs text-[var(--ff-text-muted)] uppercase font-semibold">Annual Projected Cost</span>
            <p className="text-lg font-bold font-mono text-[var(--ff-accent-text)] mt-0.5">
              <AnimatedNumber
                value={annualProjectedPaise / 100}
                format={(v) => `${formatCurrency(Math.round(v * 100), currency)}/yr`}
              />
            </p>
          </div>
          <TrendingUp className="w-5 h-5 text-[var(--ff-accent)]" />
        </MotionStaggerItem>
      </MotionStaggerGrid>

      {/* Near Renewal Alert */}
      <AnimatePresence>
        {renewalsNear.length > 0 && (
          <motion.div
            key="renewals-near-alert"
            initial={isDisabled ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={isDisabled ? undefined : { opacity: 0, y: -6 }}
            transition={getSpringTransition(intensity, isDisabled)}
            className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
            <div className="flex-1 text-xs">
              <span className="font-bold text-amber-600 dark:text-amber-400">
                {renewalsNear.length} Subscription{renewalsNear.length > 1 ? 's' : ''} Renewing in the Next 7 Days:
              </span>{' '}
              <span className="text-[var(--ff-text-secondary)]">
                {renewalsNear.map((s) => `${s.name} (${s.nextRenewalDate})`).join(', ')}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subscriptions Grid */}
      {subscriptions.length === 0 ? (
        <ThemeCard className="text-center py-12">
          <CreditCard className="w-10 h-10 mx-auto text-[var(--ff-text-muted)] mb-3" />
          <h3 className="text-base font-bold text-[var(--ff-text-primary)]">No Active Subscriptions Tracked</h3>
          <p className="text-xs text-[var(--ff-text-muted)] max-w-sm mx-auto mt-1 mb-4">
            Keep tabs on Netflix, GitHub, AWS, Spotify, or Google One to stay aware of renewals.
          </p>
          <ThemeButton variant="primary" size="sm" onClick={openCreateModal}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Your First Subscription
          </ThemeButton>
        </ThemeCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subscriptions.map((sub) => {
            const isPaused = sub.status === 'paused';
            const isCancelled = sub.status === 'cancelled';
            const diffDays = Math.round(
              (new Date(`${sub.nextRenewalDate}T12:00:00Z`).getTime() - new Date(`${todayStr}T12:00:00Z`).getTime()) /
                86400000
            );

            return (
              <motion.div
                key={sub.id}
                layout
                transition={getSpringTransition(intensity, isDisabled)}
                whileHover={isDisabled ? undefined : { y: -2 }}
                className={`flex flex-col justify-between p-5 rounded-2xl bg-[var(--ff-card-bg)] border transition-all ${
                  isPaused || isCancelled ? 'opacity-60 border-[var(--ff-border)]' : 'hover:shadow-md border-[var(--ff-border)]'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h3 className="text-base font-bold text-[var(--ff-text-primary)] flex items-center gap-1.5">
                      {sub.name}
                      {sub.websiteUrl && (
                        <a
                          href={sub.websiteUrl.startsWith('http') ? sub.websiteUrl : `https://${sub.websiteUrl}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--ff-text-muted)] hover:text-[var(--ff-accent)]"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </h3>
                    <span className="text-[11px] text-[var(--ff-text-muted)] capitalize">
                      {sub.billingCycle} Cycle • Auto-renew: {sub.autoRenew ? 'On' : 'Off'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleToggleStatus(sub)}
                      className="p-1 rounded-md text-[var(--ff-text-muted)] hover:text-[var(--ff-accent)]"
                      title={isPaused ? 'Resume subscription' : 'Pause subscription'}
                      aria-label={`${isPaused ? 'Resume' : 'Pause'} ${sub.name}`}
                    >
                      {isPaused ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(sub)}
                      className="p-1 rounded-md text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
                      title="Edit subscription"
                      aria-label={`Edit ${sub.name}`}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(sub)}
                      className="p-1 rounded-md text-[var(--ff-text-muted)] hover:text-[var(--ff-danger)]"
                      title="Delete subscription"
                      aria-label={`Delete ${sub.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Amount */}
                <div className="my-2">
                  <span className="text-xl font-bold font-mono text-[var(--ff-text-primary)]">
                    {formatCurrency(sub.amountPaise, currency)}
                  </span>
                  <span className="text-xs text-[var(--ff-text-muted)] ml-1">
                    /{sub.billingCycle === 'monthly' ? 'mo' : sub.billingCycle === 'quarterly' ? 'quarter' : 'yr'}
                  </span>
                </div>

                {/* Renewal Date Footer */}
                <div className="flex items-center justify-between pt-3 mt-1 border-t ff-divider text-xs">
                  <div className="flex items-center gap-1.5 text-[var(--ff-text-muted)] font-mono">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{sub.nextRenewalDate}</span>
                  </div>

                  <ThemeBadge
                    tone={diffDays <= 3 && !isPaused ? 'danger' : isPaused ? 'neutral' : 'accent'}
                  >
                    {isPaused
                      ? 'Paused'
                      : diffDays < 0
                      ? 'Due Now'
                      : diffDays === 0
                      ? 'Renews Today'
                      : `In ${diffDays} day${diffDays > 1 ? 's' : ''}`}
                  </ThemeBadge>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Subscription Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            key="sub-modal-backdrop"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
            initial={isDisabled ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={isDisabled ? undefined : { opacity: 0 }}
            transition={{ duration: MOTION_DURATION.overlay }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsModalOpen(false);
            }}
          >
            <motion.form
              onSubmit={handleSave}
              className="w-full max-w-md bg-[var(--ff-card-bg)] border ff-divider rounded-2xl shadow-xl flex flex-col overflow-hidden"
              initial={isDisabled ? false : { opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={isDisabled ? undefined : { opacity: 0, scale: 0.95, y: 12 }}
              transition={getSpringTransition(intensity, isDisabled)}
            >
            <div className="flex items-center justify-between px-6 py-4 border-b ff-divider">
              <h3 className="text-base font-bold text-[var(--ff-text-primary)]">
                {editingSub ? 'Edit Subscription' : 'New Subscription Plan'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
              >
                ✕
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                  Service / Tool Name
                </label>
                <ThemeInput
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. GitHub Copilot, Netflix, Google One"
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                    Fee Amount ({currency})
                  </label>
                  <ThemeInput
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                    Billing Cycle
                  </label>
                  <select
                    value={formCycle}
                    onChange={(e) => setFormCycle(e.target.value as any)}
                    className="ff-input w-full text-xs py-2 px-3 rounded-lg"
                    style={{
                      backgroundColor: 'var(--ff-card-bg)',
                      borderColor: 'var(--ff-border)',
                      color: 'var(--ff-text-primary)',
                    }}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                    Next Renewal Date
                  </label>
                  <ThemeInput
                    type="date"
                    value={formNextRenewal}
                    onChange={(e) => setFormNextRenewal(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                    Alert Days Prior
                  </label>
                  <ThemeInput
                    type="number"
                    min="0"
                    max="30"
                    value={formReminderDays}
                    onChange={(e) => setFormReminderDays(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--ff-text-secondary)] mb-1">
                  Website / Management URL (Optional)
                </label>
                <ThemeInput
                  type="text"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="sub-auto-renew"
                  checked={formAutoRenew}
                  onChange={(e) => setFormAutoRenew(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="sub-auto-renew" className="text-xs text-[var(--ff-text-secondary)]">
                  Automatic Renewal Active
                </label>
              </div>
            </div>

            <div className="p-4 border-t ff-divider flex items-center justify-end gap-2">
              <ThemeButton type="button" variant="ghost" size="sm" onClick={() => setIsModalOpen(false)}>
                Cancel
              </ThemeButton>
              <ThemeButton type="submit" variant="primary" size="sm">
                {editingSub ? 'Save Changes' : 'Track Subscription'}
              </ThemeButton>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  );
};
