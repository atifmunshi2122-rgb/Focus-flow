import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { formatCurrency } from '../../lib/currency.ts';
import {
  ThemeCard,
  ThemeInput,
  ThemeSegmentedControl,
} from '../ui/ThemePrimitives.tsx';
import {
  EmptyStateIllustration,
  SkeletonList,
  useMotionPreferences,
} from '../ui/MotionPrimitives.tsx';
import { MOTION_DURATION, MOTION_EASING, getIntensityFactor } from '../../theme/motionTokens.ts';
import {
  ReceiptText,
  Search,
  TrendingUp,
  TrendingDown,
  Repeat,
  Calendar,
  Tag,
} from 'lucide-react';

interface UnifiedTransaction {
  id: string;
  type: 'income' | 'fixed' | 'variable';
  name: string;
  category: string;
  amountPaise: number;
  date: string;
  notes?: string;
  paymentMethod?: string;
}

export const TransactionsLedger: React.FC = () => {
  const { currency, refreshKey } = useApp();
  const { isDisabled, intensity } = useMotionPreferences();
  const factor = getIntensityFactor(intensity);
  const [transactions, setTransactions] = useState<UnifiedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense' | 'fixed' | 'variable'>('all');

  useEffect(() => {
    setLoading(true);
    Promise.all([api.getIncomes(), api.getExpenses()])
      .then(([incomes, expenses]) => {
        const unifiedInc: UnifiedTransaction[] = incomes.map((i) => ({
          id: i.id,
          type: 'income',
          name: i.source,
          category: i.category,
          amountPaise: i.amountPaise,
          date: i.date,
          notes: i.notes,
        }));

        const unifiedExp: UnifiedTransaction[] = expenses.map((e) => ({
          id: e.id,
          type: e.type,
          name: e.description,
          category: e.categoryName || 'General',
          amountPaise: e.amountPaise,
          date: e.date,
          notes: e.notes,
          paymentMethod: e.paymentMethod,
        }));

        const combined = [...unifiedInc, ...unifiedExp].sort((a, b) => b.date.localeCompare(a.date));
        setTransactions(combined);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const filtered = transactions.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase()) ||
      (t.notes && t.notes.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;

    if (typeFilter === 'income') return t.type === 'income';
    if (typeFilter === 'expense') return t.type === 'fixed' || t.type === 'variable';
    if (typeFilter === 'fixed') return t.type === 'fixed';
    if (typeFilter === 'variable') return t.type === 'variable';
    return true;
  });

  return (
    <div className="flex flex-col" style={{ gap: 'var(--ff-section-gap)' }}>
      {/* Search & Filter Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ff-text-muted)]" />
          <ThemeInput
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by description, source, or category..."
            aria-label="Search transactions"
            className="pl-9 pr-4 py-2 text-xs"
          />
        </div>

        <ThemeSegmentedControl<'all' | 'income' | 'fixed' | 'variable'>
          ariaLabel="Filter transactions by type"
          value={typeFilter === 'expense' ? 'all' : typeFilter}
          onChange={setTypeFilter}
          options={[
            { id: 'all', label: 'All Activity' },
            { id: 'income', label: 'Income Only' },
            { id: 'fixed', label: 'Fixed (Bills)' },
            { id: 'variable', label: 'Variable' },
          ]}
        />
      </div>

      {/* Ledger Table */}
      <ThemeCard noPadding>
        {loading && transactions.length === 0 ? (
          <SkeletonList rows={5} />
        ) : filtered.length === 0 ? (
          <EmptyStateIllustration
            icon={<ReceiptText className="w-6 h-6" />}
            title="No transactions match your search"
            description="Try adjusting your filters or search keywords."
          />
        ) : (
          <div className="divide-y ff-divider">
            <AnimatePresence initial={false}>
              {filtered.map((t) => {
                const isIncome = t.type === 'income';
                const isFixed = t.type === 'fixed';

                return (
                  <motion.div
                    key={t.id}
                    layout={isDisabled ? false : 'position'}
                    initial={isDisabled ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={
                      isDisabled
                        ? { opacity: 0 }
                        : { opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, overflow: 'hidden' }
                    }
                    transition={{
                      duration: MOTION_DURATION.card * Math.max(0.5, factor || 0.01),
                      ease: MOTION_EASING.decelerate,
                    }}
                    className="ff-row-hover flex items-center justify-between gap-4"
                    style={{ padding: 'var(--ff-row-pad)' }}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className="w-9 h-9 flex items-center justify-center shrink-0"
                        style={{
                          borderRadius: 'var(--ff-radius-button)',
                          background: isIncome
                            ? 'var(--ff-success-soft)'
                            : isFixed
                            ? 'var(--ff-accent-soft)'
                            : 'var(--ff-danger-soft)',
                          color: isIncome
                            ? 'var(--ff-success)'
                            : isFixed
                            ? 'var(--ff-accent-text)'
                            : 'var(--ff-danger)',
                        }}
                      >
                        {isIncome ? (
                          <TrendingUp className="w-4 h-4" />
                        ) : isFixed ? (
                          <Repeat className="w-4 h-4" />
                        ) : (
                          <TrendingDown className="w-4 h-4" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[var(--ff-text-primary)] truncate">
                          {t.name}
                        </p>

                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[var(--ff-text-muted)]">
                          <div className="flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            <span>{t.category}</span>
                          </div>
                          <span aria-hidden="true">·</span>
                          <div className="flex items-center gap-1 font-mono">
                            <Calendar className="w-3 h-3" />
                            <span>{t.date}</span>
                          </div>
                          {t.paymentMethod && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="uppercase text-[10px] font-medium">
                                {t.paymentMethod.replace('_', ' ')}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className="text-base font-bold font-mono tabular-nums"
                        style={{
                          color: isIncome ? 'var(--ff-success)' : 'var(--ff-text-primary)',
                        }}
                      >
                        {isIncome ? '+' : '-'}
                        {formatCurrency(t.amountPaise, currency)}
                      </span>
                      <span className="block text-[10px] text-[var(--ff-text-muted)] uppercase tracking-wider font-semibold">
                        {isIncome ? 'Income' : isFixed ? 'Fixed Bill' : 'Variable Spend'}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </ThemeCard>
    </div>
  );
};
