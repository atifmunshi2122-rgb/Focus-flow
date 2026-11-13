import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { formatCurrency, toPaise } from '../../lib/currency.ts';
import {
  ThemeBadge,
  ThemeButton,
  ThemeCard,
  ThemeInput,
  ThemeModal,
  ThemeSegmentedControl,
  ThemeSelect,
} from '../ui/ThemePrimitives.tsx';
import { buildCsvContent, downloadCsvFile } from '../../lib/exportReports.ts';
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
  ChevronLeft,
  ChevronRight,
  Trash2,
  Edit2,
  Eye,
  Download,
  ArrowUpDown,
  Filter,
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
  const { currency, refreshKey, showToast, triggerRefresh, confirmAction } = useApp();
  const { isDisabled, intensity } = useMotionPreferences();
  const factor = getIntensityFactor(intensity);
  const [transactions, setTransactions] = useState<UnifiedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [incomeCursor, setIncomeCursor] = useState<string | null>(null);
  const [expenseCursor, setExpenseCursor] = useState<string | null>(null);
  const [hasMoreIncomes, setHasMoreIncomes] = useState(false);
  const [hasMoreExpenses, setHasMoreExpenses] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense' | 'fixed' | 'variable'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'name_asc'>('date_desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Detail Modal
  const [selectedTxForDetails, setSelectedTxForDetails] = useState<UnifiedTransaction | null>(null);

  // Edit Modal
  const [editingTx, setEditingTx] = useState<UnifiedTransaction | null>(null);
  const [editName, setEditName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Reset to first page when filtering or searching
  useEffect(() => {
    setCurrentPage(1);
  }, [search, typeFilter, dateFilter, categoryFilter, paymentMethodFilter, sortBy]);

  const uniqueCategories = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) {
      if (t.category) set.add(t.category);
    }
    return Array.from(set).sort();
  }, [transactions]);

  const handleOpenEdit = (t: UnifiedTransaction) => {
    setEditingTx(t);
    setEditName(t.name);
    setEditAmount(String(Math.round(t.amountPaise / 100)));
    setEditDate(t.date);
    setEditCategory(t.category);
    setEditPaymentMethod(t.paymentMethod || 'upi_bank');
    setEditNotes(t.notes || '');
    setSelectedTxForDetails(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;
    const amountNum = Number(editAmount);
    if (!editName.trim() || !Number.isFinite(amountNum) || amountNum <= 0) {
      showToast('Enter a valid description and positive amount', 'error');
      return;
    }
    setIsSavingEdit(true);
    try {
      if (editingTx.type === 'income') {
        await api.updateIncome(editingTx.id, {
          source: editName.trim(),
          amountPaise: toPaise(amountNum),
          date: editDate,
          category: editCategory,
          notes: editNotes,
        });
      } else {
        await api.updateExpense(editingTx.id, {
          description: editName.trim(),
          amountPaise: toPaise(amountNum),
          date: editDate,
          categoryName: editCategory,
          paymentMethod: editPaymentMethod as any,
          notes: editNotes,
        });
      }
      showToast(`Updated transaction "${editName}"`, 'success');
      setEditingTx(null);
      triggerRefresh();
      loadTransactions();
    } catch {
      showToast('Failed to save transaction changes', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleExportFilteredCsv = () => {
    const headers = ['Type', 'Date', 'Description / Source', 'Category', 'Payment Method', 'Amount (INR)', 'Notes'];
    const rows = filtered.map((t) => [
      t.type,
      t.date,
      t.name,
      t.category,
      t.paymentMethod || '',
      ((t.type === 'income' ? t.amountPaise : -t.amountPaise) / 100).toFixed(2),
      t.notes || '',
    ]);
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadCsvFile(`transactions-ledger-${dateStamp}.csv`, buildCsvContent(headers, rows));
  };

  const mapUnified = (
    incomes: Awaited<ReturnType<typeof api.getIncomesPage>>['items'],
    expenses: Awaited<ReturnType<typeof api.getExpensesPage>>['items']
  ): UnifiedTransaction[] => {
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

    return [...unifiedInc, ...unifiedExp].sort((a, b) => b.date.localeCompare(a.date));
  };

  const loadTransactions = () => {
    setLoading(true);
    Promise.all([api.getIncomesPage(25, null), api.getExpensesPage(25, null)])
      .then(([incPage, expPage]) => {
        setIncomeCursor(incPage.nextCursor);
        setHasMoreIncomes(incPage.hasMore);
        setExpenseCursor(expPage.nextCursor);
        setHasMoreExpenses(expPage.hasMore);
        setTransactions(mapUnified(incPage.items, expPage.items));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const handleLoadMoreCloud = async () => {
    if (!hasMoreIncomes && !hasMoreExpenses) return;
    setLoadingMore(true);
    try {
      const [incPage, expPage] = await Promise.all([
        hasMoreIncomes
          ? api.getIncomesPage(25, incomeCursor)
          : Promise.resolve({ items: [], nextCursor: null, hasMore: false }),
        hasMoreExpenses
          ? api.getExpensesPage(25, expenseCursor)
          : Promise.resolve({ items: [], nextCursor: null, hasMore: false }),
      ]);
      setIncomeCursor(incPage.nextCursor);
      setHasMoreIncomes(incPage.hasMore);
      setExpenseCursor(expPage.nextCursor);
      setHasMoreExpenses(expPage.hasMore);

      const nextChunk = mapUnified(incPage.items, expPage.items);
      setTransactions((prev) => {
        const seen = new Set(prev.map((x) => `${x.type}:${x.id}`));
        const deduped = nextChunk.filter((x) => !seen.has(`${x.type}:${x.id}`));
        return [...prev, ...deduped].sort((a, b) => b.date.localeCompare(a.date));
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load older records', 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, [refreshKey]);

  const handleDeleteTransaction = async (t: UnifiedTransaction) => {
    const confirmed = await confirmAction({
      title: 'Delete Transaction',
      message: 'Move this financial transaction to Trash? You can restore it later from the Trash Bin.',
      itemLabel: `${t.name} · ${formatCurrency(t.amountPaise, currency)} (${t.date})`,
      confirmLabel: 'Move to Trash',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      if (t.type === 'income') {
        await api.deleteIncome(t.id);
      } else {
        await api.deleteExpense(t.id);
      }
      showToast(`Moved "${t.name}" to Trash`, 'info');
      triggerRefresh();
      loadTransactions();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete transaction', 'error');
    }
  };

  const handleClearAllTransactions = async () => {
    const confirmed = await confirmAction({
      title: 'Clear Loaded Transactions',
      message: `Move all ${transactions.length} loaded transactions to Trash? You can restore individual items from the Trash Bin if needed.`,
      confirmLabel: `Move ${transactions.length} to Trash`,
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await Promise.all([
        ...transactions.filter((t) => t.type === 'income').map((t) => api.deleteIncome(t.id)),
        ...transactions.filter((t) => t.type !== 'income').map((t) => api.deleteExpense(t.id)),
      ]);
      showToast('Loaded transactions moved to Trash', 'success');
      triggerRefresh();
      loadTransactions();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to clear transactions', 'error');
    }
  };

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const currentMonthStr = useMemo(() => todayStr.slice(0, 7), [todayStr]);
  const oneWeekAgoStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  }, []);

  const filtered = transactions.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase()) ||
      (t.notes && t.notes.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;

    if (typeFilter === 'income' && t.type !== 'income') return false;
    if (typeFilter === 'expense' && t.type === 'income') return false;
    if (typeFilter === 'fixed' && t.type !== 'fixed') return false;
    if (typeFilter === 'variable' && t.type !== 'variable') return false;

    if (dateFilter === 'today' && t.date !== todayStr) return false;
    if (dateFilter === 'week' && t.date < oneWeekAgoStr) return false;
    if (dateFilter === 'month' && !t.date.startsWith(currentMonthStr)) return false;

    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
    if (paymentMethodFilter !== 'all' && t.paymentMethod !== paymentMethodFilter) return false;

    return true;
  }).sort((a, b) => {
    if (sortBy === 'date_desc') return b.date.localeCompare(a.date);
    if (sortBy === 'date_asc') return a.date.localeCompare(b.date);
    if (sortBy === 'amount_desc') return b.amountPaise - a.amountPaise;
    if (sortBy === 'amount_asc') return a.amountPaise - b.amountPaise;
    if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
    return 0;
  });

  const filteredInflowPaise = useMemo(
    () => filtered.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amountPaise, 0),
    [filtered]
  );
  const filteredOutflowPaise = useMemo(
    () => filtered.filter((t) => t.type !== 'income').reduce((sum, t) => sum + t.amountPaise, 0),
    [filtered]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentDisplayPage = Math.min(currentPage, totalPages);
  const startIndex = (currentDisplayPage - 1) * pageSize;
  const paginatedItems = filtered.slice(startIndex, startIndex + pageSize);

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

        <div className="flex items-center gap-2 flex-wrap">
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
          {transactions.length > 0 && (
            <ThemeButton
              variant="danger"
              size="sm"
              onClick={() => void handleClearAllTransactions()}
              title="Clear all loaded transactions"
              aria-label="Clear all transactions"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All</span>
            </ThemeButton>
          )}
        </div>
      </div>

      {/* Secondary Filters & Sort Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-[var(--ff-surface-subtle)] p-2.5 rounded-xl border border-[var(--ff-border-color)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-[var(--ff-text-muted)]" />
            <ThemeSelect
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-xs py-1 px-2"
              aria-label="Filter by category"
            >
              <option value="all">All Categories</option>
              {uniqueCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </ThemeSelect>
          </div>

          <ThemeSelect
            value={paymentMethodFilter}
            onChange={(e) => setPaymentMethodFilter(e.target.value)}
            className="text-xs py-1 px-2"
            aria-label="Filter by payment method"
          >
            <option value="all">All Payment Methods</option>
            <option value="upi_bank">UPI / NetBanking</option>
            <option value="credit_card">Credit Card</option>
            <option value="debit_card">Debit Card</option>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
          </ThemeSelect>

          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-[var(--ff-text-muted)]" />
            <ThemeSelect
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-xs py-1 px-2"
              aria-label="Sort transactions"
            >
              <option value="date_desc">Newest Date First</option>
              <option value="date_asc">Oldest Date First</option>
              <option value="amount_desc">Highest Amount</option>
              <option value="amount_asc">Lowest Amount</option>
              <option value="name_asc">Title (A-Z)</option>
            </ThemeSelect>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeButton variant="secondary" size="xs" onClick={handleExportFilteredCsv}>
            <Download className="w-3.5 h-3.5" /> Export CSV ({filtered.length})
          </ThemeButton>
        </div>
      </div>

      {/* Quick Date Filters & Realtime Aggregation Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs px-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold text-[var(--ff-text-muted)] mr-1">Timeframe:</span>
          {(['all', 'today', 'week', 'month'] as const).map((df) => {
            const active = dateFilter === df;
            const labels: Record<string, string> = { all: 'All Time', today: 'Today', week: 'Last 7 Days', month: 'This Month' };
            return (
              <button
                key={df}
                type="button"
                onClick={() => setDateFilter(df)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors"
                style={{
                  background: active ? 'var(--ff-accent-soft)' : 'var(--ff-surface-subtle)',
                  borderColor: active ? 'var(--ff-accent-border)' : 'var(--ff-border-color)',
                  color: active ? 'var(--ff-accent-text)' : 'var(--ff-text-secondary)',
                }}
              >
                {labels[df]}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="text-[var(--ff-text-muted)]">{filtered.length} entries</span>
          <span className="text-[var(--ff-success)]">+{formatCurrency(filteredInflowPaise, currency, { compact: true })}</span>
          <span className="text-[var(--ff-text-muted)]">/</span>
          <span className="text-[var(--ff-danger)]">-{formatCurrency(filteredOutflowPaise, currency, { compact: true })}</span>
        </div>
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
              {paginatedItems.map((t) => {
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
                    className="ff-row-hover"
                  >
                    {/* Mobile Card View (< 640px) */}
                    <div className="flex sm:hidden flex-col gap-2.5 p-3.5">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
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
                            <span className="text-[10px] text-[var(--ff-text-muted)] uppercase tracking-wider font-semibold">
                              {isIncome ? 'Income' : isFixed ? 'Fixed Bill' : 'Variable Spend'}
                            </span>
                          </div>
                        </div>

                        <span
                          className="text-base font-bold font-mono tabular-nums shrink-0"
                          style={{
                            color: isIncome ? 'var(--ff-success)' : 'var(--ff-text-primary)',
                          }}
                        >
                          {isIncome ? '+' : '-'}
                          {formatCurrency(t.amountPaise, currency)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--ff-border-color)] text-[11px] text-[var(--ff-text-muted)]">
                        <div className="flex items-center gap-2 flex-wrap">
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

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedTxForDetails(t)}
                            className="min-w-[40px] min-h-[40px] flex items-center justify-center p-2 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-accent-text)] hover:bg-[var(--ff-surface-subtle)] transition-colors shrink-0"
                            title="View Details"
                            aria-label={`View details of ${t.name}`}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(t)}
                            className="min-w-[40px] min-h-[40px] flex items-center justify-center p-2 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-accent-text)] hover:bg-[var(--ff-surface-subtle)] transition-colors shrink-0"
                            title="Edit"
                            aria-label={`Edit ${t.name}`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteTransaction(t)}
                            className="min-w-[40px] min-h-[40px] flex items-center justify-center p-2 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-danger)] hover:bg-[var(--ff-danger-soft)] transition-colors shrink-0"
                            title={`Delete ${t.name}`}
                            aria-label={`Delete ${t.name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Desktop Row View (>= 640px) */}
                    <div
                      className="hidden sm:flex items-center justify-between gap-4 w-full"
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

                      <div className="flex items-center gap-2.5 shrink-0">
                        <div className="text-right">
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
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedTxForDetails(t)}
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center p-2 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-accent-text)] hover:bg-[var(--ff-surface-subtle)] transition-colors"
                            title="View Details"
                            aria-label={`View details of ${t.name}`}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(t)}
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center p-2 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-accent-text)] hover:bg-[var(--ff-surface-subtle)] transition-colors"
                            title="Edit"
                            aria-label={`Edit ${t.name}`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteTransaction(t)}
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center p-2 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-danger)] hover:bg-[var(--ff-danger-soft)] transition-colors"
                            title={`Delete ${t.name}`}
                            aria-label={`Delete ${t.name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Pagination Toolbar */}
        {!loading && filtered.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t ff-divider text-xs text-[var(--ff-text-muted)]">
            <div className="flex items-center gap-2">
              <span>
                Showing <strong className="text-[var(--ff-text-primary)] font-mono">{startIndex + 1}</strong> to{' '}
                <strong className="text-[var(--ff-text-primary)] font-mono">
                  {Math.min(filtered.length, startIndex + pageSize)}
                </strong>{' '}
                of <strong className="text-[var(--ff-text-primary)] font-mono">{filtered.length}</strong> transactions
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {(hasMoreIncomes || hasMoreExpenses) && (
                <ThemeButton
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleLoadMoreCloud()}
                  loading={loadingMore}
                  loadingText="Loading..."
                >
                  Load Older Records
                </ThemeButton>
              )}

              <div className="flex items-center gap-1.5">
                <span>Rows:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="ff-input text-xs py-1 px-2 rounded cursor-pointer"
                  style={{
                    backgroundColor: 'var(--ff-card-bg)',
                    borderColor: 'var(--ff-border)',
                    color: 'var(--ff-text-primary)',
                  }}
                  aria-label="Transactions per page"
                >
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <ThemeButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentDisplayPage <= 1}
                  aria-label="Previous page"
                  className="p-1.5"
                >
                  <ChevronLeft className="w-4 h-4" />
                </ThemeButton>
                <span className="font-mono px-2 text-[var(--ff-text-primary)] font-semibold">
                  {currentDisplayPage} / {totalPages}
                </span>
                <ThemeButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentDisplayPage >= totalPages}
                  aria-label="Next page"
                  className="p-1.5"
                >
                  <ChevronRight className="w-4 h-4" />
                </ThemeButton>
              </div>
            </div>
          </div>
        )}
      </ThemeCard>

      {/* Transaction Details Modal */}
      {selectedTxForDetails && (
        <ThemeModal
          isOpen={Boolean(selectedTxForDetails)}
          onClose={() => setSelectedTxForDetails(null)}
          title="Transaction Details"
          subtitle={`Verified ledger entry #${selectedTxForDetails.id.slice(0, 8)}`}
        >
          <div className="space-y-4 pt-1">
            <div className="p-4 rounded-xl text-center space-y-1 bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)]">
              <span className="text-[11px] font-bold text-[var(--ff-text-muted)] uppercase tracking-wider block">
                {selectedTxForDetails.type === 'income' ? 'Income Credited' : selectedTxForDetails.type === 'fixed' ? 'Fixed Obligation' : 'Variable Expense'}
              </span>
              <div
                className="text-3xl font-bold font-mono"
                style={{
                  color: selectedTxForDetails.type === 'income' ? 'var(--ff-success)' : 'var(--ff-danger)',
                }}
              >
                {selectedTxForDetails.type === 'income' ? '+' : '-'}
                {formatCurrency(selectedTxForDetails.amountPaise, currency)}
              </div>
              <h3 className="text-sm font-semibold text-[var(--ff-text-primary)] mt-1">
                {selectedTxForDetails.name}
              </h3>
            </div>

            <div className="divide-y ff-divider text-xs">
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-[var(--ff-text-muted)]">Category</span>
                <span className="font-semibold text-[var(--ff-text-primary)]">{selectedTxForDetails.category}</span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-[var(--ff-text-muted)]">Transaction Date</span>
                <span className="font-mono font-semibold text-[var(--ff-text-primary)]">{selectedTxForDetails.date}</span>
              </div>
              {selectedTxForDetails.paymentMethod && (
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-[var(--ff-text-muted)]">Payment Method</span>
                  <span className="uppercase font-semibold text-[var(--ff-text-primary)]">
                    {selectedTxForDetails.paymentMethod.replace('_', ' ')}
                  </span>
                </div>
              )}
              {selectedTxForDetails.notes && (
                <div className="py-2.5 space-y-1">
                  <span className="text-[var(--ff-text-muted)] block">Notes &amp; Details</span>
                  <p className="text-[var(--ff-text-secondary)] bg-[var(--ff-surface-subtle)] p-2 rounded-lg italic">
                    {selectedTxForDetails.notes}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--ff-border-color)]">
              <ThemeButton
                variant="secondary"
                size="sm"
                onClick={() => handleOpenEdit(selectedTxForDetails)}
              >
                <Edit2 className="w-3.5 h-3.5" /> Edit Record
              </ThemeButton>
              <ThemeButton
                variant="danger"
                size="sm"
                onClick={() => {
                  const tx = selectedTxForDetails;
                  setSelectedTxForDetails(null);
                  void handleDeleteTransaction(tx);
                }}
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </ThemeButton>
            </div>
          </div>
        </ThemeModal>
      )}

      {/* Transaction Edit Modal */}
      {editingTx && (
        <ThemeModal
          isOpen={Boolean(editingTx)}
          onClose={() => setEditingTx(null)}
          title={`Edit ${editingTx.type === 'income' ? 'Income' : 'Expense'}`}
          subtitle="Updates will recalculate all budgets and analytics automatically"
        >
          <form onSubmit={handleSaveEdit} className="space-y-3.5 pt-1">
            <div>
              <label className="text-[11px] font-bold text-[var(--ff-text-muted)] uppercase tracking-wider block mb-1">
                Description / Source
              </label>
              <ThemeInput
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Description"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-[var(--ff-text-muted)] uppercase tracking-wider block mb-1">
                  Amount (₹)
                </label>
                <ThemeInput
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  placeholder="Amount"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[var(--ff-text-muted)] uppercase tracking-wider block mb-1">
                  Date
                </label>
                <ThemeInput
                  type="date"
                  required
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-[var(--ff-text-muted)] uppercase tracking-wider block mb-1">
                  Category
                </label>
                <ThemeInput
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  placeholder="Category"
                />
              </div>

              {editingTx.type !== 'income' && (
                <div>
                  <label className="text-[11px] font-bold text-[var(--ff-text-muted)] uppercase tracking-wider block mb-1">
                    Payment Method
                  </label>
                  <ThemeSelect
                    value={editPaymentMethod}
                    onChange={(e) => setEditPaymentMethod(e.target.value)}
                  >
                    <option value="upi_bank">UPI / Bank</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="debit_card">Debit Card</option>
                    <option value="cash">Cash</option>
                    <option value="other">Other</option>
                  </ThemeSelect>
                </div>
              )}
            </div>

            <div>
              <label className="text-[11px] font-bold text-[var(--ff-text-muted)] uppercase tracking-wider block mb-1">
                Notes
              </label>
              <ThemeInput
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Optional memo or transaction ref"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--ff-border-color)]">
              <ThemeButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setEditingTx(null)}
              >
                Cancel
              </ThemeButton>
              <ThemeButton
                type="submit"
                variant="primary"
                size="sm"
                loading={isSavingEdit}
              >
                Save Changes
              </ThemeButton>
            </div>
          </form>
        </ThemeModal>
      )}
    </div>
  );
};
