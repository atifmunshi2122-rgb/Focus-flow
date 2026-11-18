import React from 'react';
import {
  Lock,
  AlertTriangle,
  CheckCircle2,
  Key,
  Layers,
  CheckSquare,
  HelpCircle,
  FileCode,
} from 'lucide-react';
import type {
  SheetColumnMapping,
  SheetFieldType,
  SheetSemanticRole,
} from '../../types/sheetHub.ts';
import { ThemeBadge, ThemeSelect } from '../ui/ThemePrimitives.tsx';

interface SchemaMappingEditorProps {
  columns: SheetColumnMapping[];
  identityStrategy?: string;
  selectedKeyColumns?: string[];
  onChangeColumns: (updated: SheetColumnMapping[]) => void;
  onToggleKeyColumn?: (fieldKey: string) => void;
  readOnly?: boolean;
}

const FIELD_TYPES: Array<{ value: SheetFieldType; label: string }> = [
  { value: 'text', label: 'Short Text' },
  { value: 'long_text', label: 'Long Text / Notes' },
  { value: 'boolean', label: 'Boolean (True / False)' },
  { value: 'checkbox', label: 'Checkbox (Native)' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'date', label: 'Date' },
  { value: 'status', label: 'Status Dropdown' },
  { value: 'priority', label: 'Priority' },
  { value: 'url', label: 'Web Link / URL' },
  { value: 'formula', label: 'Formula (Protected)' },
];

const SEMANTIC_ROLES: Array<{ value: SheetSemanticRole; label: string }> = [
  { value: 'title', label: 'Title / Item Name' },
  { value: 'group', label: 'Primary Group / Module' },
  { value: 'subgroup', label: 'Subgroup / Topic' },
  { value: 'done', label: 'Done / Completed (Checkbox)' },
  { value: 'notes', label: 'Notes / Comments' },
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'due_date', label: 'Due Date / Deadline' },
  { value: 'link', label: 'Resource / Link' },
  { value: 'id', label: 'Unique Identifier' },
  { value: 'metric', label: 'Metric / Calculation' },
  { value: 'custom', label: 'Custom' },
];

export const SchemaMappingEditor: React.FC<SchemaMappingEditorProps> = ({
  columns,
  selectedKeyColumns = [],
  onChangeColumns,
  onToggleKeyColumn,
  readOnly = false,
}) => {
  const handleTypeChange = (colIndex: number, newType: SheetFieldType) => {
    const next = columns.map((col, idx) => {
      if (idx !== colIndex) return col;
      const isFormula = newType === 'formula';
      return {
        ...col,
        confirmedType: newType,
        inferredType: newType,
        editable: !isFormula,
        readOnlyReason: isFormula ? 'Formula-derived column' : null,
        requiresConfirmation: false,
      };
    });
    onChangeColumns(next);
  };

  const handleRoleChange = (colIndex: number, newRole: SheetSemanticRole) => {
    const next = columns.map((col, idx) => {
      if (idx !== colIndex) return col;
      return {
        ...col,
        semanticRole: newRole,
        requiresConfirmation: false,
      };
    });
    onChangeColumns(next);
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)]">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)] font-semibold uppercase tracking-wider text-[10px]">
              {onToggleKeyColumn && <th className="p-2.5 w-10 text-center">Key</th>}
              <th className="p-2.5 w-12 text-center">Col</th>
              <th className="p-2.5">Header Name</th>
              <th className="p-2.5">Detected Type</th>
              <th className="p-2.5">Semantic Role</th>
              <th className="p-2.5">Editable / Lock</th>
              <th className="p-2.5 text-right">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ff-border-color)] text-[var(--ff-text-primary)]">
            {columns.map((col, idx) => {
              const isKeySelected = selectedKeyColumns.includes(col.fieldKey);
              const isFormula = col.inferredType === 'formula' || !col.editable;

              return (
                <tr
                  key={col.fieldKey || idx}
                  className={`hover:bg-[var(--ff-surface-hover)] transition-colors ${
                    col.requiresConfirmation ? 'bg-amber-500/5' : ''
                  }`}
                >
                  {onToggleKeyColumn && (
                    <td className="p-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={isKeySelected}
                        disabled={readOnly || isFormula}
                        onChange={() => onToggleKeyColumn(col.fieldKey)}
                        className="rounded accent-[var(--ff-accent)] w-3.5 h-3.5 cursor-pointer"
                        title="Include in row composite key"
                      />
                    </td>
                  )}

                  <td className="p-2.5 text-center font-mono font-bold text-[var(--ff-text-muted)]">
                    {col.colLetter}
                  </td>

                  <td className="p-2.5 font-medium max-w-[200px] truncate" title={col.headerName}>
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{col.headerName}</span>
                      {col.requiresConfirmation && (
                        <span
                          title="Ambiguous column detected: please review type & role"
                          className="shrink-0 text-amber-500"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="p-2.5 min-w-[140px]">
                    {readOnly ? (
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[var(--ff-surface-muted)]">
                        {col.confirmedType || col.inferredType}
                      </span>
                    ) : (
                      <select
                        value={col.confirmedType || col.inferredType}
                        onChange={(e) => handleTypeChange(idx, e.target.value as SheetFieldType)}
                        className="w-full text-xs py-1 px-2 rounded-lg bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
                      >
                        {FIELD_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>

                  <td className="p-2.5 min-w-[150px]">
                    {readOnly ? (
                      <span className="font-medium text-[11px] px-2 py-0.5 rounded bg-[var(--ff-surface-muted)] text-[var(--ff-accent-text)]">
                        {col.semanticRole}
                      </span>
                    ) : (
                      <select
                        value={col.semanticRole}
                        onChange={(e) => handleRoleChange(idx, e.target.value as SheetSemanticRole)}
                        className="w-full text-xs py-1 px-2 rounded-lg bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
                      >
                        {SEMANTIC_ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>

                  <td className="p-2.5 min-w-[120px]">
                    {isFormula ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded font-medium border border-amber-500/20">
                        <Lock className="w-3 h-3" /> Read-Only
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded font-medium">
                        <CheckCircle2 className="w-3 h-3" /> Read-Only (P2)
                      </span>
                    )}
                  </td>

                  <td className="p-2.5 text-right">
                    {col.confidence === 'high' ? (
                      <ThemeBadge tone="success" className="text-[10px] px-1.5 py-0.5">
                        High
                      </ThemeBadge>
                    ) : col.confidence === 'medium' ? (
                      <ThemeBadge tone="warning" className="text-[10px] px-1.5 py-0.5">
                        Review
                      </ThemeBadge>
                    ) : (
                      <ThemeBadge tone="danger" className="text-[10px] px-1.5 py-0.5">
                        Ambiguous
                      </ThemeBadge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ff-text-muted)] p-2 rounded-lg bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)]">
        <div className="flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-amber-500" />
          <span>Formula-computed columns are automatically locked to prevent overwriting formulas.</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Key className="w-3.5 h-3.5 text-[var(--ff-accent)]" />
          <span>Key columns establish logical row identity.</span>
        </div>
      </div>
    </div>
  );
};
