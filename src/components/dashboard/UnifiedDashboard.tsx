import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { DashboardData } from '../../types/index.ts';
import { formatCurrency } from '../../lib/currency.ts';
import { ThemeBadge, ThemeButton, ThemeCard } from '../ui/ThemePrimitives.tsx';
import {
  AnimatedNumber,
  EmptyStateIllustration,
  InteractiveSurface3D,
  MotionStaggerGrid,
  MotionStaggerItem,
  SkeletonDashboard,
} from '../ui/MotionPrimitives.tsx';
import {
  CheckCircle2,
  Flame,
  TrendingUp,
  TrendingDown,
  Scale,
  CreditCard,
  Play,
  ArrowRight,
  Clock,
  Sparkles,
  FileSpreadsheet,
  ExternalLink,
} from 'lucide-react';

interface UnifiedDashboardProps {
  onOpenQuickAction: () => void;
}

export const UnifiedDashboard: React.FC<UnifiedDashboardProps> = ({ onOpenQuickAction }) => {
  const {
    currency,
    refreshKey,
    setCurrentTab,
    startTimer,
    switchTimerMode,
    isRunning,
    googleSpreadsheetId,
    createOrConnectSpreadsheet,
  } = useApp();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .getDashboard()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const handleStartQuickFocus = () => {
    switchTimerMode('work');
    startTimer();
    setCurrentTab('focus');
  };

  if (loading && !data) {
    return <SkeletonDashboard />;
  }

  return (
    <div className="flex flex-col" style={{ gap: 'var(--ff-section-gap)' }}>
      {/* SECTION 1: HERO FOCUS & FINANCE PULSE BANNER */}
      <InteractiveSurface3D maxTilt={4}>
        <ThemeCard variant="hero">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div
                className="flex items-center gap-2 text-xs font-semibold"
                style={{ color: 'var(--ff-hero-muted)' }}
              >
                <Sparkles className="w-4 h-4" />
                <span>Unified Command Center</span>
              </div>
              <h1
                className="ff-heading text-2xl sm:text-3xl font-extrabold text-balance"
                style={{ color: 'var(--ff-hero-text)' }}
              >
                Focus Deeply. Manage Wealth Intelligently.
              </h1>
              <p
                className="text-xs sm:text-sm leading-relaxed"
                style={{ color: 'var(--ff-hero-muted)' }}
              >
                Your personal productivity engine and financial ledger synchronized in real time.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              {googleSpreadsheetId ? (
                <a
                  href={`https://docs.google.com/spreadsheets/d/${googleSpreadsheetId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ff-btn px-3.5 py-2.5 text-xs backdrop-blur-md border"
                  style={{
                    background: 'rgba(16, 185, 129, 0.22)',
                    borderColor: 'rgba(16, 185, 129, 0.45)',
                    color: 'var(--ff-hero-text)',
                  }}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Open Master Sheets</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : (
                <ThemeButton variant="success" size="md" onClick={() => void createOrConnectSpreadsheet()}>
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Initialize 12 Sheets</span>
                </ThemeButton>
              )}

              <ThemeButton variant="primary" size="md" onClick={handleStartQuickFocus}>
                <Play className="w-4 h-4 fill-current ml-0.5" />
                <span>{isRunning ? 'View Active Timer' : 'Launch 25m Focus'}</span>
              </ThemeButton>

              <button
                type="button"
                onClick={onOpenQuickAction}
                className="ff-btn px-3.5 py-2.5 text-xs border backdrop-blur-md"
                style={{
                  background: 'rgba(255, 255, 255, 0.14)',
                  borderColor: 'rgba(255, 255, 255, 0.26)',
                  color: 'var(--ff-hero-text)',
                }}
              >
                Quick Entry
              </button>
            </div>
          </div>
        </ThemeCard>
      </InteractiveSurface3D>

      {/* SECTION 2: FOCUS METRICS (3 CARDS) */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-[var(--ff-text-primary)]">
            Focus &amp; Productivity Intelligence
          </h2>
          <button
            type="button"
            onClick={() => setCurrentTab('focus')}
            className="flex items-center gap-1 text-xs font-semibold hover:underline"
            style={{ color: 'var(--ff-accent-text)' }}
          >
            <span>Open Focus Lab</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <MotionStaggerGrid className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 'var(--ff-grid-gap)' }}>
          {/* Today's Focus Time */}
          <MotionStaggerItem>
            <ThemeCard variant="interactive" className="flex items-center justify-between h-full">
              <div>
                <span className="text-xs font-medium text-[var(--ff-text-muted)] block mb-1">
                  Today&apos;s Focus Time
                </span>
                <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                  <AnimatedNumber
                    value={data?.todayFocusMinutes || 0}
                    format={(mins) => `${Math.floor(mins / 60)}h ${Math.round(mins) % 60}m`}
                  />
                </div>
                <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
                  {data?.todayFocusMinutes || 0} active minutes logged
                </span>
              </div>
              <div
                className="w-11 h-11 flex items-center justify-center shrink-0"
                style={{
                  borderRadius: 'var(--ff-radius-button)',
                  background: 'var(--ff-accent-soft)',
                  color: 'var(--ff-accent-text)',
                }}
              >
                <Clock className="w-5 h-5" />
              </div>
            </ThemeCard>
          </MotionStaggerItem>

          {/* Completed Pomodoro Sessions */}
          <MotionStaggerItem>
            <ThemeCard variant="interactive" className="flex items-center justify-between h-full">
              <div>
                <span className="text-xs font-medium text-[var(--ff-text-muted)] block mb-1">
                  Completed Pomodoros
                </span>
                <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                  <AnimatedNumber value={data?.completedPomodoroSessions || 0} />
                </div>
                <span
                  className="text-[11px] font-semibold mt-1 block"
                  style={{ color: 'var(--ff-success)' }}
                >
                  25-minute deep focus cycles
                </span>
              </div>
              <div
                className="w-11 h-11 flex items-center justify-center shrink-0"
                style={{
                  borderRadius: 'var(--ff-radius-button)',
                  background: 'var(--ff-success-soft)',
                  color: 'var(--ff-success)',
                }}
              >
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </ThemeCard>
          </MotionStaggerItem>

          {/* Current Focus Streak */}
          <MotionStaggerItem>
            <ThemeCard variant="interactive" className="flex items-center justify-between h-full">
              <div>
                <span className="text-xs font-medium text-[var(--ff-text-muted)] block mb-1">
                  Current Focus Streak
                </span>
                <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                  <AnimatedNumber
                    value={data?.focusStreakDays || 1}
                    format={(d) => `${Math.round(d)} Days`}
                  />
                </div>
                <span
                  className="text-[11px] font-semibold mt-1 block"
                  style={{ color: 'var(--ff-warning)' }}
                >
                  Daily discipline streak
                </span>
              </div>
              <div
                className="w-11 h-11 flex items-center justify-center shrink-0"
                style={{
                  borderRadius: 'var(--ff-radius-button)',
                  background: 'var(--ff-warning-soft)',
                  color: 'var(--ff-warning)',
                }}
              >
                <Flame className="w-5 h-5" />
              </div>
            </ThemeCard>
          </MotionStaggerItem>
        </MotionStaggerGrid>
      </div>

      {/* SECTION 3: PERSONAL FINANCE CORE CARDS */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-[var(--ff-text-primary)]">
            Monthly Financial Standing
          </h2>
          <button
            type="button"
            onClick={() => setCurrentTab('finance')}
            className="flex items-center gap-1 text-xs font-semibold hover:underline"
            style={{ color: 'var(--ff-accent-text)' }}
          >
            <span>View Full Financial Ledger</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <MotionStaggerGrid
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
          style={{ gap: 'var(--ff-grid-gap)' }}
        >
          {/* Monthly Income */}
          <MotionStaggerItem>
            <ThemeCard variant="interactive" className="h-full">
              <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
                <span className="text-xs font-medium">Monthly Inflow</span>
                <TrendingUp className="w-4 h-4" style={{ color: 'var(--ff-success)' }} />
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                <AnimatedNumber
                  value={data?.monthlyIncomePaise || 0}
                  format={(paise) => formatCurrency(Math.round(paise), currency)}
                />
              </div>
              <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
                Direct salary &amp; revenue
              </span>
            </ThemeCard>
          </MotionStaggerItem>

          {/* Monthly Expenses */}
          <MotionStaggerItem>
            <ThemeCard variant="interactive" className="h-full">
              <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
                <span className="text-xs font-medium">Monthly Outflow</span>
                <TrendingDown className="w-4 h-4" style={{ color: 'var(--ff-danger)' }} />
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                <AnimatedNumber
                  value={data?.monthlyExpensesPaise || 0}
                  format={(paise) => formatCurrency(Math.round(paise), currency)}
                />
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11px] text-[var(--ff-text-muted)]">
                <span>
                  Fixed: {formatCurrency(data?.fixedExpensesPaise || 0, currency, { compact: true })}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Variable:{' '}
                  {formatCurrency(data?.variableExpensesPaise || 0, currency, { compact: true })}
                </span>
              </div>
            </ThemeCard>
          </MotionStaggerItem>

          {/* Remaining Balance */}
          <MotionStaggerItem>
            <ThemeCard variant="interactive" className="h-full">
              <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
                <span className="text-xs font-medium">Remaining Balance</span>
                <Scale className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
              </div>
              <div
                className="text-2xl font-bold font-mono tabular-nums"
                style={{
                  color:
                    (data?.remainingBalancePaise || 0) >= 0
                      ? 'var(--ff-text-primary)'
                      : 'var(--ff-danger)',
                }}
              >
                <AnimatedNumber
                  value={data?.remainingBalancePaise || 0}
                  format={(paise) => formatCurrency(Math.round(paise), currency)}
                />
              </div>
              <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
                Net savings after expenses
              </span>
            </ThemeCard>
          </MotionStaggerItem>

          {/* Bills Status */}
          <MotionStaggerItem>
            <ThemeCard variant="interactive" className="h-full">
              <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-2">
                <span className="text-xs font-medium">Bills Status</span>
                <CreditCard className="w-4 h-4" style={{ color: 'var(--ff-warning)' }} />
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
                <AnimatedNumber
                  value={data?.totalUnpaidAmountPaise || 0}
                  format={(paise) => formatCurrency(Math.round(paise), currency)}
                />
              </div>
              <div className="flex items-center gap-1.5 mt-1 text-[11px]">
                <span className="font-semibold" style={{ color: 'var(--ff-warning)' }}>
                  {data?.unpaidBillsCount || 0} Unpaid
                </span>
                <span aria-hidden="true" className="text-[var(--ff-text-muted)]">
                  ·
                </span>
                <span className="font-semibold" style={{ color: 'var(--ff-success)' }}>
                  {data?.paidBillsCount || 0} Paid
                </span>
              </div>
            </ThemeCard>
          </MotionStaggerItem>
        </MotionStaggerGrid>
      </div>

      {/* SECTION 4: 2-COLUMN VIEW: UPCOMING PAYMENTS & RECENT TRANSACTIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 'var(--ff-grid-gap)' }}>
        {/* Upcoming Payments Card */}
        <ThemeCard className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
                <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                  Upcoming Bill Obligations
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCurrentTab('bills')}
                className="text-xs font-semibold hover:underline"
                style={{ color: 'var(--ff-accent-text)' }}
              >
                Manage Bills
              </button>
            </div>

            {!data?.upcomingPayments || data.upcomingPayments.length === 0 ? (
              <EmptyStateIllustration
                icon={<CreditCard className="w-6 h-6" />}
                title="All bills settled"
                description="All bills for this period are completely paid! Great financial discipline."
              />
            ) : (
              <div className="divide-y ff-divider">
                {data.upcomingPayments.map((bill) => (
                  <div
                    key={bill.id}
                    className="py-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--ff-text-primary)] truncate">
                        {bill.name}
                      </p>
                      <div className="flex items-center gap-1.5 text-[var(--ff-text-muted)] text-[11px] mt-0.5">
                        <span className="font-mono">Due {bill.dueDate}</span>
                        {bill.status === 'OVERDUE' && (
                          <ThemeBadge tone="danger">Overdue</ThemeBadge>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono tabular-nums font-bold text-[var(--ff-text-primary)] block">
                        {formatCurrency(bill.amountPaise, currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentTab('bills')}
                        className="text-[11px] font-semibold hover:underline"
                        style={{ color: 'var(--ff-accent-text)' }}
                      >
                        Pay Now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ThemeCard>

        {/* Recent Transactions Card */}
        <ThemeCard className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4" style={{ color: 'var(--ff-success)' }} />
                <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                  Recent Financial Flow
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCurrentTab('transactions')}
                className="text-xs font-semibold hover:underline"
                style={{ color: 'var(--ff-accent-text)' }}
              >
                View Ledger
              </button>
            </div>

            {!data?.recentTransactions || data.recentTransactions.length === 0 ? (
              <EmptyStateIllustration
                icon={<Scale className="w-6 h-6" />}
                title="No recent transactions"
                description="Log an expense or income entry to see your live financial flow here."
              />
            ) : (
              <div className="divide-y ff-divider">
                {data.recentTransactions.map((tx) => {
                  const isIncome = tx.type === 'income';

                  return (
                    <div
                      key={tx.id}
                      className="py-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--ff-text-primary)] truncate">
                          {tx.name}
                        </p>
                        <div className="flex items-center gap-1.5 text-[var(--ff-text-muted)] text-[11px] mt-0.5">
                          <span>{tx.category}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{tx.date}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className="font-mono tabular-nums font-bold"
                          style={{
                            color: isIncome ? 'var(--ff-success)' : 'var(--ff-text-primary)',
                          }}
                        >
                          {isIncome ? '+' : '-'}
                          {formatCurrency(tx.amountPaise, currency)}
                        </span>
                        <span className="block text-[10px] text-[var(--ff-text-muted)] uppercase font-medium">
                          {tx.type}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ThemeCard>
      </div>
    </div>
  );
};
