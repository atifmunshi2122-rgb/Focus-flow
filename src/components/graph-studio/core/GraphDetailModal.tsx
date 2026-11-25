import React, { useEffect, useMemo } from 'react';
import { X, Download, Table, BarChart2 } from 'lucide-react';
import { ThemeButton, ThemeBadge } from '../../ui/ThemePrimitives.tsx';
import { useApp } from '../../../context/AppContext.tsx';
import { formatCurrency } from '../../../lib/currency.ts';

export interface GraphDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  domain: string;
  tableHeaders: string[];
  tableRows: (string | number)[][];
  onExportCsv?: () => void;
  onExportPng?: () => void;
  children: React.ReactNode;
}

export const GraphDetailModal: React.FC<GraphDetailModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  domain,
  tableHeaders,
  tableRows,
  onExportCsv,
  onExportPng,
  children,
}) => {
  const { currency } = useApp();

  const { displayHeaders, formattedRows } = useMemo(() => {
    const paiseColIndices = new Set<number>();
    const headers = tableHeaders.map((h, idx) => {
      if (/paise/i.test(h)) {
        paiseColIndices.add(idx);
        return h.replace(/\s*\(?paise\)?/i, '').trim() || 'Amount';
      }
      return h;
    });

    const dateIdx = tableHeaders.findIndex((h) => /^date$/i.test(h.trim()));
    const sorted =
      dateIdx >= 0
        ? [...tableRows].sort((a, b) => String(a[dateIdx] ?? '').localeCompare(String(b[dateIdx] ?? '')))
        : tableRows;

    const rows = sorted.map((row) =>
      row.map((cell, cIdx) => {
        if (paiseColIndices.has(cIdx) && typeof cell === 'number' && Number.isFinite(cell)) {
          return formatCurrency(cell, currency);
        }
        return cell;
      })
    );

    return { displayHeaders: headers, formattedRows: rows };
  }, [tableHeaders, tableRows, currency]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Detailed View: ${title}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--ff-surface-card)',
          borderColor: 'var(--ff-border-color)',
        }}
      >
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[var(--ff-border-color)]">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-[var(--ff-accent-text)]" />
              <h2 className="text-base sm:text-lg font-bold text-[var(--ff-text-primary)]">
                {title}
              </h2>
              <ThemeBadge tone="accent">{domain.toUpperCase()}</ThemeBadge>
            </div>
            {subtitle && (
              <p className="text-xs text-[var(--ff-text-muted)]">{subtitle}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onExportCsv && (
              <ThemeButton variant="secondary" size="sm" onClick={onExportCsv}>
                <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
              </ThemeButton>
            )}
            {onExportPng && (
              <ThemeButton variant="secondary" size="sm" onClick={onExportPng}>
                <Download className="w-3.5 h-3.5 mr-1" /> Export PNG
              </ThemeButton>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] transition-all"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          {/* Main Visualizer Container */}
          <div className="p-4 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] min-h-[300px]">
            {children}
          </div>

          {/* Aggregated Data Table */}
          {tableRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--ff-text-primary)]">
                <Table className="w-4 h-4 text-[var(--ff-accent-text)]" />
                <span>Aggregated Data Ledger ({tableRows.length} points)</span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-[var(--ff-border-color)] max-h-64">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)] font-semibold border-b border-[var(--ff-border-color)] sticky top-0">
                    <tr>
                      {displayHeaders.map((header, idx) => (
                        <th key={idx} className="py-2 px-3">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--ff-border-color)] font-mono">
                    {formattedRows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-[var(--ff-surface-subtle)]">
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="py-2 px-3 text-[var(--ff-text-primary)]">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
