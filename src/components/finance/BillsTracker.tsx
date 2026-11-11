import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { Bill, PaymentHistory, ExpenseCategory } from '../../types/index.ts';
import { formatCurrency, toPaise } from '../../lib/currency.ts';
import { playCashSound } from '../../lib/sound.ts';
import {
  ThemeBadge,
  ThemeButton,
  ThemeCard,
  ThemeInput,
  ThemeModal,
  ThemeSegmentedControl,
  ThemeSelect,
} from '../ui/ThemePrimitives.tsx';
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Plus,
  Trash2,
  Calendar,
  History,
  Check,
  Tag,
} from 'lucide-react';
import { googleSheetsService } from '../../lib/googleSheetsService.ts';
import { firestoreService } from '../../lib/firestoreService.ts';

export const BillsTracker: React.FC = () => {
  const {
    currency,
    refreshKey,
    triggerRefresh,
    showToast,
    settings,
    firebaseUser,
    googleSpreadsheetId,
    googleAccessToken,
  } = useApp();
  const [bills, setBills] = useState<Bill[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistory[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNPAID' | 'OVERDUE' | 'PAID'>('ALL');
  const [showHistory, setShowHistory] = useState(false);

  const [addBillModal, setAddBillModal] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const [payingBill, setPayingBill] = useState<Bill | null>(null);
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'debit_card' | 'upi_bank' | 'cash'>('upi_bank');
  const [paymentNotes, setPaymentNotes] = useState('');

  const loadData = () => {
    setLoading(true);
    Promise.all([api.getBills(statusFilter), api.getPaymentHistory(), api.getCategories()])
      .then(([billsData, historyData, catData]) => {
        setBills(billsData);
        setPaymentHistory(historyData);
        setCategories(catData);
        if (catData.length > 0 && !categoryId) {
          setCategoryId(catData[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, refreshKey]);

  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !amount || !dueDate) {
      showToast('Please fill in all required bill fields', 'error');
      return;
    }

    try {
      await api.createBill({
        name,
        amountPaise: toPaise(amount),
        categoryId: categoryId || (categories[0]?.id ?? 'cat_1'),
        dueDate,
        notes,
      });
      showToast('Bill registered to schedule', 'success');
      setAddBillModal(false);
      setName('');
      setAmount('');
      setNotes('');
      triggerRefresh();
      loadData();
    } catch {
      showToast('Failed to register bill', 'error');
    }
  };

  const handlePayConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingBill) return;

    try {
      const res = await api.payBill(payingBill.id, payDate, paymentMethod, paymentNotes);
      playCashSound(settings?.soundEnabled);
      showToast(`Payment of ${formatCurrency(payingBill.amountPaise, currency)} recorded!`, 'success');

      if (firebaseUser) {
        firestoreService.saveBill(firebaseUser.uid, res.bill).catch(console.error);
      }

      googleSheetsService.enqueueMutation('Bills_Payments', [
        res.bill.id,
        res.bill.dueDate,
        res.bill.name,
        res.bill.categoryName || 'Bill',
        res.bill.amountPaise / 100,
        'PAID',
        payDate,
        paymentMethod.replace('_', ' ').toUpperCase(),
        paymentNotes || 'Settled via Tracker',
      ]);

      if (googleSpreadsheetId && googleAccessToken) {
        googleSheetsService.flushQueue(googleSpreadsheetId, googleAccessToken).catch(console.error);
      }

      setPayingBill(null);
      triggerRefresh();
      loadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to record payment', 'error');
    }
  };

  const handleUndoPayment = async (billId: string, billName: string) => {
    if (!window.confirm(`Undo payment for "${billName}" and mark it as unpaid?`)) return;

    try {
      await api.undoBillPayment(billId);
      showToast('Payment undone; bill restored to pending status', 'info');
      triggerRefresh();
      loadData();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to undo payment', 'error');
    }
  };

  const handleDeleteBill = async (billId: string) => {
    if (!window.confirm('Delete this bill from the tracker?')) return;
    try {
      await api.deleteBill(billId);
      showToast('Bill deleted', 'info');
      triggerRefresh();
      loadData();
    } catch {
      showToast('Failed to delete bill', 'error');
    }
  };

  const unpaidCount = bills.filter((b) => b.status === 'UNPAID' || b.status === 'OVERDUE').length;
  const overdueCount = bills.filter((b) => b.status === 'OVERDUE').length;
  const paidCount = bills.filter((b) => b.status === 'PAID').length;

  const totalUnpaidAmount = bills
    .filter((b) => b.status === 'UNPAID' || b.status === 'OVERDUE')
    .reduce((sum, b) => sum + b.amountPaise, 0);

  const totalPaidAmount = bills
    .filter((b) => b.status === 'PAID')
    .reduce((sum, b) => sum + b.amountPaise, 0);

  return (
    <div className="flex flex-col" style={{ gap: 'var(--ff-section-gap)' }}>
      {/* Top Action & KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 'var(--ff-grid-gap)' }}>
        <ThemeCard variant="interactive">
          <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-1">
            <span className="text-xs font-medium">Pending &amp; Overdue</span>
            <AlertTriangle className="w-4 h-4" style={{ color: 'var(--ff-warning)' }} />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
            {formatCurrency(totalUnpaidAmount, currency)}
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[var(--ff-text-muted)]">
            <span>{unpaidCount} bills due</span>
            {overdueCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-bold" style={{ color: 'var(--ff-danger)' }}>
                  {overdueCount} Overdue!
                </span>
              </>
            )}
          </div>
        </ThemeCard>

        <ThemeCard variant="interactive">
          <div className="flex items-center justify-between text-[var(--ff-text-muted)] mb-1">
            <span className="text-xs font-medium">Settled Payments</span>
            <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--ff-success)' }} />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-[var(--ff-text-primary)]">
            {formatCurrency(totalPaidAmount, currency)}
          </div>
          <span className="text-[11px] font-semibold mt-1 block" style={{ color: 'var(--ff-success)' }}>
            {paidCount} bills paid this period
          </span>
        </ThemeCard>

        <ThemeCard className="flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--ff-text-muted)]">Bills Overview</span>
            <CreditCard className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <ThemeButton
              variant="primary"
              size="sm"
              onClick={() => setAddBillModal(true)}
              className="flex-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Bill</span>
            </ThemeButton>
            <ThemeButton
              variant={showHistory ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              title="Payment Audit History"
              aria-label="Toggle payment audit history"
            >
              <History className="w-4 h-4" />
            </ThemeButton>
          </div>
        </ThemeCard>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <ThemeSegmentedControl<'ALL' | 'UNPAID' | 'OVERDUE' | 'PAID'>
          ariaLabel="Filter bills by status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { id: 'ALL', label: 'All Bills' },
            { id: 'UNPAID', label: 'Pending & Overdue' },
            { id: 'OVERDUE', label: 'Overdue Only' },
            { id: 'PAID', label: 'Paid' },
          ]}
        />

        <span className="text-xs text-[var(--ff-text-muted)] font-mono">
          Showing {bills.length} records
        </span>
      </div>

      {/* Payment Audit History Drawer */}
      {showHistory && (
        <ThemeCard
          variant="inset"
          style={{
            background: 'var(--ff-accent-soft)',
            borderColor: 'var(--ff-accent-border)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
              <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                Payment Audit History
              </h3>
            </div>
            <ThemeButton variant="ghost" size="xs" onClick={() => setShowHistory(false)}>
              Close History
            </ThemeButton>
          </div>

          {paymentHistory.length === 0 ? (
            <div className="p-4 text-center text-xs text-[var(--ff-text-muted)]">
              No payment logs recorded yet.
            </div>
          ) : (
            <div className="divide-y ff-divider text-xs">
              {paymentHistory.map((hist) => (
                <div key={hist.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-[var(--ff-text-primary)]">
                      {hist.billName || 'Bill Payment'}
                    </span>
                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--ff-text-muted)]">
                      <span>Paid on {hist.paidDate}</span>
                      <span aria-hidden="true">·</span>
                      <span className="uppercase">{hist.paymentMethod.replace('_', ' ')}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{hist.transactionRef}</span>
                    </div>
                  </div>
                  <span
                    className="font-mono tabular-nums font-bold"
                    style={{ color: 'var(--ff-success)' }}
                  >
                    {formatCurrency(hist.amountPaise, currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ThemeCard>
      )}

      {/* Bills Ledger Table */}
      <ThemeCard noPadding>
        {loading ? (
          <div className="p-8 text-center text-xs text-[var(--ff-text-muted)]">
            Loading bills...
          </div>
        ) : bills.length === 0 ? (
          <div className="p-12 text-center">
            <CreditCard className="w-8 h-8 text-[var(--ff-text-muted)] mx-auto mb-2 opacity-50" />
            <h3 className="text-sm font-semibold text-[var(--ff-text-primary)]">
              No bills match your criteria
            </h3>
            <p className="text-xs text-[var(--ff-text-muted)] mt-1">
              Add recurring expenses or log a new bill above.
            </p>
          </div>
        ) : (
          <div className="divide-y ff-divider">
            {bills.map((bill) => {
              const isPaid = bill.status === 'PAID';
              const isOverdue = bill.status === 'OVERDUE';

              return (
                <div
                  key={bill.id}
                  className={`ff-row-hover flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    isPaid ? 'opacity-75' : ''
                  }`}
                  style={{ padding: 'var(--ff-row-pad)' }}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <button
                      type="button"
                      onClick={() =>
                        isPaid ? void handleUndoPayment(bill.id, bill.name) : setPayingBill(bill)
                      }
                      className="mt-1 w-6 h-6 flex items-center justify-center transition-all shrink-0 border-2"
                      style={{
                        borderRadius: 'var(--ff-radius-badge)',
                        background: isPaid ? 'var(--ff-success)' : 'transparent',
                        borderColor: isPaid ? 'var(--ff-success)' : 'var(--ff-border-strong)',
                        color: '#ffffff',
                      }}
                      title={isPaid ? 'Click to undo payment' : 'Click to mark as paid'}
                      aria-label={isPaid ? 'Undo payment' : 'Mark as paid'}
                    >
                      {isPaid && <Check className="w-4 h-4 stroke-[3]" />}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-[var(--ff-text-primary)]">
                          {bill.name}
                        </span>

                        <ThemeBadge
                          tone={isPaid ? 'success' : isOverdue ? 'danger' : 'warning'}
                        >
                          {isPaid ? 'PAID' : isOverdue ? 'OVERDUE' : 'UNPAID'}
                        </ThemeBadge>

                        {bill.recurringExpenseId && (
                          <ThemeBadge tone="accent">Recurring</ThemeBadge>
                        )}
                      </div>

                      {bill.notes && (
                        <p className="text-xs text-[var(--ff-text-muted)] mt-0.5 line-clamp-1">
                          {bill.notes}
                        </p>
                      )}

                      <div className="flex items-center gap-2 mt-1 text-[11px] text-[var(--ff-text-muted)]">
                        <div className="flex items-center gap-1">
                          <Tag className="w-3 h-3" />
                          <span>{bill.categoryName || 'General'}</span>
                        </div>
                        <span aria-hidden="true">·</span>
                        <div className="flex items-center gap-1 font-mono">
                          <Calendar className="w-3 h-3" />
                          <span>Due {bill.dueDate}</span>
                        </div>
                        {isPaid && bill.paymentDate && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium" style={{ color: 'var(--ff-success)' }}>
                              Paid {bill.paymentDate}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-end md:self-center shrink-0">
                    <div className="text-right">
                      <span className="text-base font-bold font-mono tabular-nums text-[var(--ff-text-primary)] block">
                        {formatCurrency(bill.amountPaise, currency)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {!isPaid ? (
                        <ThemeButton
                          variant="success"
                          size="xs"
                          onClick={() => setPayingBill(bill)}
                          className="whitespace-nowrap"
                        >
                          Mark as Paid
                        </ThemeButton>
                      ) : (
                        <ThemeButton
                          variant="ghost"
                          size="xs"
                          onClick={() => void handleUndoPayment(bill.id, bill.name)}
                          title="Undo payment"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Undo</span>
                        </ThemeButton>
                      )}

                      <button
                        type="button"
                        onClick={() => void handleDeleteBill(bill.id)}
                        className="p-1.5 text-[var(--ff-text-muted)] hover:text-[var(--ff-danger)] rounded-lg transition-colors"
                        title="Delete bill"
                        aria-label={`Delete ${bill.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ThemeCard>

      {/* Modal: Mark Bill as Paid confirmation */}
      <ThemeModal
        isOpen={!!payingBill}
        onClose={() => setPayingBill(null)}
        title="Mark Bill as Paid"
        subtitle={
          payingBill
            ? `Recording payment for ${payingBill.name} (${formatCurrency(payingBill.amountPaise, currency)})`
            : undefined
        }
        maxWidthClass="max-w-sm"
      >
        <form onSubmit={handlePayConfirm} className="space-y-3.5">
          <div>
            <label
              htmlFor="bill-pay-date"
              className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
            >
              Payment Date
            </label>
            <ThemeInput
              id="bill-pay-date"
              type="date"
              required
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
            />
          </div>

          <div>
            <label
              htmlFor="bill-pay-method"
              className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
            >
              Payment Method
            </label>
            <ThemeSelect
              id="bill-pay-method"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
            >
              <option value="upi_bank">UPI / Bank Transfer</option>
              <option value="credit_card">Credit Card</option>
              <option value="debit_card">Debit Card</option>
              <option value="cash">Cash</option>
            </ThemeSelect>
          </div>

          <div>
            <label
              htmlFor="bill-pay-notes"
              className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
            >
              Notes / Reference (Optional)
            </label>
            <ThemeInput
              id="bill-pay-notes"
              type="text"
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              placeholder="e.g., Transaction ID, bank receipt note"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <ThemeButton variant="ghost" size="sm" onClick={() => setPayingBill(null)}>
              Cancel
            </ThemeButton>
            <ThemeButton type="submit" variant="success" size="sm">
              Confirm Payment
            </ThemeButton>
          </div>
        </form>
      </ThemeModal>

      {/* Modal: Add New Bill */}
      <ThemeModal
        isOpen={addBillModal}
        onClose={() => setAddBillModal(false)}
        title="Add New Bill"
      >
        <form onSubmit={handleCreateBill} className="space-y-3.5">
          <div>
            <label
              htmlFor="new-bill-name"
              className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
            >
              Bill Name
            </label>
            <ThemeInput
              id="new-bill-name"
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Electricity Bill, Mobile Postpaid"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="new-bill-amount"
                className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
              >
                Amount ({currency})
              </label>
              <ThemeInput
                id="new-bill-amount"
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="font-mono tabular-nums"
              />
            </div>

            <div>
              <label
                htmlFor="new-bill-due"
                className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
              >
                Due Date
              </label>
              <ThemeInput
                id="new-bill-due"
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="new-bill-cat"
              className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
            >
              Category
            </label>
            <ThemeSelect
              id="new-bill-cat"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </ThemeSelect>
          </div>

          <div>
            <label
              htmlFor="new-bill-notes"
              className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
            >
              Notes (Optional)
            </label>
            <ThemeInput
              id="new-bill-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional payment details..."
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <ThemeButton variant="ghost" size="sm" onClick={() => setAddBillModal(false)}>
              Cancel
            </ThemeButton>
            <ThemeButton type="submit" variant="primary" size="sm">
              Save Bill
            </ThemeButton>
          </div>
        </form>
      </ThemeModal>
    </div>
  );
};
