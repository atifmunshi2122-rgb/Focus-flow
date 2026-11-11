import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { IncomeTransaction } from '../../types/index.ts';
import { formatCurrency, toPaise } from '../../lib/currency.ts';
import { playCashSound } from '../../lib/sound.ts';
import {
  ThemeButton,
  ThemeCard,
  ThemeInput,
  ThemeModal,
  ThemeSelect,
} from '../ui/ThemePrimitives.tsx';
import { Plus, TrendingUp, Trash2, Edit2, Calendar, Tag } from 'lucide-react';
import { googleSheetsService } from '../../lib/googleSheetsService.ts';
import { firestoreService } from '../../lib/firestoreService.ts';

export const IncomeManager: React.FC = () => {
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
  const [incomes, setIncomes] = useState<IncomeTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingIncome, setEditingIncome] = useState<IncomeTransaction | null>(null);
  const [source, setSource] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState('Salary');
  const [notes, setNotes] = useState('');

  const loadIncomes = () => {
    setLoading(true);
    api
      .getIncomes()
      .then(setIncomes)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadIncomes();
  }, [refreshKey]);

  const openCreateModal = () => {
    setEditingIncome(null);
    setSource('');
    setAmount('');
    setDate(new Date().toISOString().split('T')[0]);
    setCategory('Salary');
    setNotes('');
    setModalOpen(true);
  };

  const openEditModal = (inc: IncomeTransaction) => {
    setEditingIncome(inc);
    setSource(inc.source);
    setAmount(String(inc.amountPaise / 100));
    setDate(inc.date);
    setCategory(inc.category);
    setNotes(inc.notes);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!source.trim() || !amount) {
      showToast('Source and amount are required', 'error');
      return;
    }

    try {
      if (editingIncome) {
        const updated = await api.updateIncome(editingIncome.id, {
          source,
          amountPaise: toPaise(amount),
          date,
          category,
          notes,
        });
        if (firebaseUser) {
          firestoreService.saveIncome(firebaseUser.uid, updated).catch(console.error);
        }
        showToast('Income record updated', 'success');
      } else {
        const created = await api.createIncome({
          source,
          amountPaise: toPaise(amount),
          date,
          category,
          notes,
        });
        if (firebaseUser) {
          firestoreService.saveIncome(firebaseUser.uid, created).catch(console.error);
        }
        googleSheetsService.enqueueMutation('Income', [
          created.id,
          created.date,
          created.source,
          created.category,
          created.amountPaise / 100,
          created.notes || '',
        ]);
        if (googleSpreadsheetId && googleAccessToken) {
          googleSheetsService.flushQueue(googleSpreadsheetId, googleAccessToken).catch(console.error);
        }
        playCashSound(settings?.soundEnabled);
        showToast('Income recorded & synchronized', 'success');
      }
      setModalOpen(false);
      triggerRefresh();
      loadIncomes();
    } catch {
      showToast('Failed to save income record', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this income record?')) return;
    try {
      await api.deleteIncome(id);
      showToast('Income record deleted', 'info');
      triggerRefresh();
      loadIncomes();
    } catch {
      showToast('Failed to delete income', 'error');
    }
  };

  const totalIncome = incomes.reduce((sum, inc) => sum + inc.amountPaise, 0);

  return (
    <div className="flex flex-col" style={{ gap: 'var(--ff-section-gap)' }}>
      {/* Top action and summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-[var(--ff-text-primary)]">Income Streams</h2>
          <p className="text-xs text-[var(--ff-text-muted)]">
            Total recorded income:{' '}
            <strong className="font-mono" style={{ color: 'var(--ff-success)' }}>
              {formatCurrency(totalIncome, currency)}
            </strong>
          </p>
        </div>

        <ThemeButton variant="success" size="md" onClick={openCreateModal} className="shrink-0">
          <Plus className="w-4 h-4" />
          <span>Add Income</span>
        </ThemeButton>
      </div>

      {/* Income Records List */}
      <ThemeCard noPadding>
        {loading ? (
          <div className="p-8 text-center text-xs text-[var(--ff-text-muted)]">
            Loading income logs...
          </div>
        ) : incomes.length === 0 ? (
          <div className="p-12 text-center">
            <TrendingUp className="w-8 h-8 text-[var(--ff-text-muted)] mx-auto mb-2 opacity-50" />
            <h3 className="text-sm font-semibold text-[var(--ff-text-primary)]">
              No income recorded yet
            </h3>
            <p className="text-xs text-[var(--ff-text-muted)] mt-1">
              Log your salary, freelance, or dividend payments above.
            </p>
          </div>
        ) : (
          <div className="divide-y ff-divider">
            {incomes.map((inc) => (
              <div
                key={inc.id}
                className="ff-row-hover flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                style={{ padding: 'var(--ff-row-pad)' }}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className="w-9 h-9 flex items-center justify-center shrink-0"
                    style={{
                      borderRadius: 'var(--ff-radius-button)',
                      background: 'var(--ff-success-soft)',
                      color: 'var(--ff-success)',
                    }}
                  >
                    <TrendingUp className="w-4 h-4" />
                  </div>

                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-[var(--ff-text-primary)] truncate">
                      {inc.source}
                    </h4>

                    {inc.notes && (
                      <p className="text-xs text-[var(--ff-text-muted)] mt-0.5 line-clamp-1">
                        {inc.notes}
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-1 text-[11px] text-[var(--ff-text-muted)]">
                      <div className="flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        <span>{inc.category}</span>
                      </div>
                      <span aria-hidden="true">·</span>
                      <div className="flex items-center gap-1 font-mono">
                        <Calendar className="w-3 h-3" />
                        <span>{inc.date}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                  <span
                    className="text-base font-bold font-mono tabular-nums"
                    style={{ color: 'var(--ff-success)' }}
                  >
                    +{formatCurrency(inc.amountPaise, currency)}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditModal(inc)}
                      className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] transition-colors"
                      title="Edit income"
                      aria-label={`Edit ${inc.source}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(inc.id)}
                      className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-danger)] transition-colors"
                      title="Delete income"
                      aria-label={`Delete ${inc.source}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ThemeCard>

      {/* Modal: Add / Edit Income */}
      <ThemeModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingIncome ? 'Edit Income Stream' : 'Record Income'}
      >
        <form onSubmit={handleSave} className="space-y-3.5">
          <div>
            <label
              htmlFor="inc-source-input"
              className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
            >
              Income Source / Payer
            </label>
            <ThemeInput
              id="inc-source-input"
              type="text"
              required
              autoFocus
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="e.g., Monthly Engineering Salary, Client Project"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="inc-amount-input"
                className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
              >
                Amount ({currency})
              </label>
              <ThemeInput
                id="inc-amount-input"
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
                htmlFor="inc-date-input"
                className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
              >
                Date Received
              </label>
              <ThemeInput
                id="inc-date-input"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="inc-category-select"
              className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
            >
              Category
            </label>
            <ThemeSelect
              id="inc-category-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="Salary">Salary</option>
              <option value="Freelance">Freelance &amp; Consulting</option>
              <option value="Investments">Investments &amp; Dividends</option>
              <option value="Business">Business Revenue</option>
              <option value="Bonus">Performance Bonus</option>
              <option value="Other">Other Income</option>
            </ThemeSelect>
          </div>

          <div>
            <label
              htmlFor="inc-notes-input"
              className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
            >
              Notes (Optional)
            </label>
            <ThemeInput
              id="inc-notes-input"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reference or bank note..."
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <ThemeButton variant="ghost" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </ThemeButton>
            <ThemeButton type="submit" variant="success" size="sm">
              {editingIncome ? 'Save Changes' : 'Record Income'}
            </ThemeButton>
          </div>
        </form>
      </ThemeModal>
    </div>
  );
};
