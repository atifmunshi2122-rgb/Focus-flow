import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { Bill, PaymentHistory, ExpenseCategory } from '../../types/index.ts';
import { formatCurrency, toPaise } from '../../lib/currency.ts';
import { playCashSound } from '../../lib/sound.ts';
import {
  CreditCard,
  CheckCircle2,
  Clock,
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

  // Modal to add new bill
  const [addBillModal, setAddBillModal] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Modal to confirm payment details
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

  // KPI Calculations
  const totalBillsCount = bills.length;
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
    <div className="space-y-6">
      {/* Top Action & KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Pending &amp; Overdue</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatCurrency(totalUnpaidAmount, currency)}
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500">
            <span>{unpaidCount} bills due</span>
            {overdueCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-rose-600 dark:text-rose-400 font-bold">
                  {overdueCount} Overdue!
                </span>
              </>
            )}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Settled Payments</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {formatCurrency(totalPaidAmount, currency)}
          </div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1 block">
            {paidCount} bills paid this period
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Bills Overview</span>
            <CreditCard className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => setAddBillModal(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Bill</span>
            </button>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Payment Audit History"
            >
              <History className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
          {[
            { id: 'ALL', label: 'All Bills' },
            { id: 'UNPAID', label: 'Pending & Overdue' },
            { id: 'OVERDUE', label: 'Overdue Only' },
            { id: 'PAID', label: 'Paid' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as typeof statusFilter)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                statusFilter === tab.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
          Showing {bills.length} records
        </span>
      </div>

      {/* Payment Audit History Drawer if toggled */}
      {showHistory && (
        <div className="p-6 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/60 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-500" />
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Payment Audit History</h4>
            </div>
            <button
              onClick={() => setShowHistory(false)}
              className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              Close History
            </button>
          </div>

          {paymentHistory.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">No payment logs recorded yet.</div>
          ) : (
            <div className="divide-y divide-indigo-100 dark:divide-indigo-900/40 text-xs">
              {paymentHistory.map((hist) => (
                <div key={hist.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white">{hist.billName || 'Bill Payment'}</span>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <span>Paid on {hist.paidDate}</span>
                      <span aria-hidden="true">·</span>
                      <span className="uppercase">{hist.paymentMethod.replace('_', ' ')}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{hist.transactionRef}</span>
                    </div>
                  </div>
                  <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(hist.amountPaise, currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bills Ledger Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading bills...</div>
        ) : bills.length === 0 ? (
          <div className="p-12 text-center">
            <CreditCard className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">No bills match your criteria</h4>
            <p className="text-xs text-slate-500 mt-1">Add recurring expenses or log a new bill above.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {bills.map((bill) => {
              const isPaid = bill.status === 'PAID';
              const isOverdue = bill.status === 'OVERDUE';

              return (
                <div
                  key={bill.id}
                  className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                    isPaid ? 'bg-slate-50/40 dark:bg-slate-900/40' : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    {/* Interactive Direct Pay / Undo Checkbox Button */}
                    <button
                      onClick={() =>
                        isPaid ? handleUndoPayment(bill.id, bill.name) : setPayingBill(bill)
                      }
                      className={`mt-1 w-6 h-6 rounded-lg flex items-center justify-center transition-all shrink-0 ${
                        isPaid
                          ? 'bg-emerald-500 text-white shadow-xs'
                          : 'border-2 border-slate-300 dark:border-slate-600 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                      }`}
                      title={isPaid ? 'Click to undo payment' : 'Click to mark as paid'}
                      aria-label={isPaid ? 'Undo payment' : 'Mark as paid'}
                    >
                      {isPaid && <Check className="w-4 h-4 stroke-[3]" />}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          {bill.name}
                        </span>

                        {/* Status Label (Clean unboxed with dot / semantic color) */}
                        <span
                          className={`text-xs font-semibold ${
                            isPaid
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : isOverdue
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {isPaid ? 'PAID' : isOverdue ? 'OVERDUE' : 'UNPAID'}
                        </span>

                        {bill.recurringExpenseId && (
                          <span className="text-[11px] text-indigo-600 dark:text-indigo-400">
                            Recurring
                          </span>
                        )}
                      </div>

                      {bill.notes && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                          {bill.notes}
                        </p>
                      )}

                      {/* Metadata row with zero-pill discipline */}
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-1">
                          <Tag className="w-3 h-3 text-slate-400" />
                          <span>{bill.categoryName || 'General'}</span>
                        </div>
                        <span aria-hidden="true">·</span>
                        <div className="flex items-center gap-1 font-mono">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>Due {bill.dueDate}</span>
                        </div>
                        {isPaid && bill.paymentDate && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              Paid {bill.paymentDate}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Amount and Action Buttons */}
                  <div className="flex items-center gap-4 self-end md:self-center shrink-0">
                    <div className="text-right">
                      <span className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white block">
                        {formatCurrency(bill.amountPaise, currency)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {!isPaid ? (
                        <button
                          onClick={() => setPayingBill(bill)}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors whitespace-nowrap"
                        >
                          Mark as Paid
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUndoPayment(bill.id, bill.name)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          title="Undo payment"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Undo</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleDeleteBill(bill.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                        title="Delete bill"
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
      </div>

      {/* Modal: Mark Bill as Paid confirmation */}
      {payingBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
              Mark Bill as Paid
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Recording payment for <strong>{payingBill.name}</strong> ({formatCurrency(payingBill.amountPaise, currency)})
            </p>

            <form onSubmit={handlePayConfirm} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Payment Date
                </label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="upi_bank">UPI / Bank Transfer</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="debit_card">Debit Card</option>
                  <option value="cash">Cash</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Notes / Reference (Optional)
                </label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="e.g., Transaction ID, bank receipt note"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPayingBill(null)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add New Bill */}
      {addBillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
              Add New Bill
            </h3>

            <form onSubmit={handleCreateBill} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Bill Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Electricity Bill, Mobile Postpaid"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Amount ({currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Category
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional payment details..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddBillModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                >
                  Save Bill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
