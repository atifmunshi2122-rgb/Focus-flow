import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { clientDataCache } from '../../lib/dataCache.ts';
import { formatCurrency } from '../../lib/currency.ts';
import { DEFAULT_TIMEZONE, getTodayDateString } from '../../lib/dateTime.ts';
import {
  Bill,
  BudgetEnvelope,
  ExpenseCategory,
  ExpenseTransaction,
  FocusSession,
  Habit,
  IncomeTransaction,
  SavingsGoal,
  SubscriptionPlan,
  Task,
  TimeBlock,
} from '../../types/index.ts';
import { StudySubject, StudyTopic, StudyRevision } from '../../types/study.ts';
import {
  Download,
  FileText,
  Table,
  FileSpreadsheet,
  FileCode,
  Calendar,
  CheckCircle2,
  Clock,
  Layers,
  Flame,
  GraduationCap,
  CreditCard,
  Receipt,
  Target,
  Sparkles,
  Search,
  Filter,
  RefreshCw,
  Info,
  Check,
  AlertCircle,
  FolderArchive,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { ThemeButton, ThemeCard, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import { useMotionPreferences, EmptyStateIllustration } from '../ui/MotionPrimitives.tsx';
import {
  ExportFormat,
  ExportModuleId,
  DateFilterPreset,
  ReportTemplateId,
  REPORT_TEMPLATES,
  UnifiedExportDataPayload,
  resolveDateFilterRange,
  filterPayloadByDateRange,
  generateModuleCsv,
  generateMasterXlsxWorkbook,
  printExecutivePdfReport,
  generateVersionedJsonBackup,
  downloadJsonFile,
} from '../../lib/unifiedExportEngine.ts';
import { downloadXlsxFile, downloadZipFile } from '../../lib/openXmlSpreadsheet.ts';
import { downloadCsvFile } from '../../lib/exportReports.ts';

interface ModuleOption {
  id: ExportModuleId;
  label: string;
  category: 'Finance' | 'Productivity' | 'Study' | 'Habits' | 'Calendar' | 'System';
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const MODULE_OPTIONS: ModuleOption[] = [
  // Finance
  { id: 'finance_overview', label: 'Financial Summary & Ledger', category: 'Finance', description: 'Consolidated income, expense, and net financial activity', icon: Receipt },
  { id: 'income', label: 'Income Records', category: 'Finance', description: 'Itemized salary, freelance, investments, and credited earnings', icon: CreditCard },
  { id: 'expenses', label: 'Expense Entries', category: 'Finance', description: 'Itemized daily, variable, and recurring expense transactions', icon: Receipt },
  { id: 'bills', label: 'Bills & Obligations', category: 'Finance', description: 'Scheduled recurring bills, payment dates, and due statuses', icon: Calendar },
  { id: 'envelopes', label: 'Envelope Budgets', category: 'Finance', description: 'Category budget limits, spent amounts, and remaining headroom', icon: Layers },
  { id: 'savings_goals', label: 'Savings Goals', category: 'Finance', description: 'Target amounts, accumulated balances, and completion progress', icon: Target },

  // Productivity
  { id: 'productivity_overview', label: 'Productivity Intelligence', category: 'Productivity', description: 'Integrated task execution, focus durations, and velocity', icon: CheckCircle2 },
  { id: 'tasks', label: 'Tasks Register', category: 'Productivity', description: 'Completed and open tasks with priority ratings and due dates', icon: CheckCircle2 },
  { id: 'focus_sessions', label: 'Focus & Pomodoro Cycles', category: 'Productivity', description: 'Recorded focus sessions, durations, and session modes', icon: Clock },

  // Habits
  { id: 'habits', label: 'Habits & Streaks', category: 'Habits', description: 'Habit roster, streak records, frequencies, and consistency logs', icon: Flame },

  // Study
  { id: 'study_os', label: 'Study OS Academics', category: 'Study', description: 'Subjects, units, subtopic completion, and spaced revisions', icon: GraduationCap },

  // Calendar
  { id: 'calendar', label: 'Unified Calendar Schedule', category: 'Calendar', description: 'Chronological timeline of tasks, bills, time blocks, and cashflows', icon: Calendar },

  // Complete Backup
  { id: 'account_backup', label: 'Complete Account Archive', category: 'System', description: 'Full lossless verified snapshot of all user collections', icon: FolderArchive },
];

export const ExportCenterView: React.FC = () => {
  const { user, currency, settings, showToast, refreshKey } = useApp();
  const { isDisabled } = useMotionPreferences();
  const tz = settings?.timezone || DEFAULT_TIMEZONE;
  const todayStr = useMemo(() => getTodayDateString(tz), [tz]);

  // Filters & Selection State
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplateId>('executive_master');
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [datePreset, setDatePreset] = useState<DateFilterPreset>('this_month');
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [customEnd, setCustomEnd] = useState<string>(todayStr);

  const [selectedModules, setSelectedModules] = useState<Set<ExportModuleId>>(
    new Set(['finance_overview', 'tasks', 'focus_sessions', 'habits'])
  );

  const handleSelectTemplate = (templateId: ReportTemplateId) => {
    setSelectedTemplate(templateId);
    const cfg = REPORT_TEMPLATES[templateId];
    if (cfg) {
      setSelectedModules(new Set(cfg.defaultModules));
      setDatePreset(cfg.defaultPreset);
      if (templateId === 'account_backup') {
        setFormat('json');
      } else if (format === 'json') {
        setFormat('pdf');
      }
    }
  };

  const cachedTasks = clientDataCache.getTasks();
  const cachedIncomes = clientDataCache.getIncomes();
  const hasCachedData = Boolean(cachedTasks || cachedIncomes);

  const [loading, setLoading] = useState(!hasCachedData);
  const [exporting, setExporting] = useState(false);
  const [previewSearch, setPreviewSearch] = useState('');
  const [showAccuracyModal, setShowAccuracyModal] = useState(false);

  // Raw Database Data with fast initial cache hydration
  const [rawData, setRawData] = useState<UnifiedExportDataPayload>(() => ({
    userName: user?.name || 'Verified User',
    userSettings: settings,
    incomes: (clientDataCache.getIncomes() || []).filter((item: IncomeTransaction) => !item.deletedAt),
    expenses: (clientDataCache.getExpenses() || []).filter((item: ExpenseTransaction) => !item.deletedAt),
    bills: (clientDataCache.getBills() || []).filter((item: Bill) => !item.deletedAt),
    envelopes: (clientDataCache.getEnvelopes() || []).filter((item: BudgetEnvelope) => !item.deletedAt),
    savingsGoals: clientDataCache.getSavingsGoals() || [],
    subscriptions: (clientDataCache.getSubscriptions() || []).filter((item: SubscriptionPlan) => !item.deletedAt),
    categories: clientDataCache.getCategories() || [],
    tasks: (clientDataCache.getTasks() || []).filter((item: Task) => !item.deletedAt),
    sessions: clientDataCache.getFocusSessions() || [],
    habits: (clientDataCache.getHabits() || []).filter((item: Habit) => !item.deletedAt),
    timeBlocks: [],
    studySubjects: (clientDataCache.getStudySubjects() || []).filter((item: StudySubject) => !item.deletedAt),
    studyTopics: (clientDataCache.getStudyTopics() || []).filter((item: StudyTopic) => !item.deletedAt),
    studyRevisions: (clientDataCache.getStudyRevisions() || []).filter((item: StudyRevision) => !item.deletedAt),
  }));

  const loadAllData = () => {
    setLoading(true);
    Promise.all([
      api.getIncomes().catch(() => [] as IncomeTransaction[]),
      api.getExpenses().catch(() => [] as ExpenseTransaction[]),
      api.getBills().catch(() => [] as Bill[]),
      api.getEnvelopes().catch(() => [] as BudgetEnvelope[]),
      api.getSavingsGoals().catch(() => [] as SavingsGoal[]),
      api.getSubscriptions().catch(() => [] as SubscriptionPlan[]),
      api.getCategories().catch(() => [] as ExpenseCategory[]),
      api.getTasks().catch(() => [] as Task[]),
      api.getFocusSessions().catch(() => [] as FocusSession[]),
      api.getHabits().catch(() => [] as Habit[]),
      api.getTimeBlocks().catch(() => [] as TimeBlock[]),
      api.getStudySubjects().catch(() => [] as StudySubject[]),
      api.getStudyTopics().catch(() => [] as StudyTopic[]),
      api.getStudyRevisions().catch(() => [] as StudyRevision[]),
    ])
      .then(([inc, exp, b, env, sg, sub, cat, t, s, h, tb, sSub, sTop, sRev]) => {
        setRawData({
          userName: user?.name || 'Verified User',
          userSettings: settings,
          incomes: inc.filter((item: IncomeTransaction) => !item.deletedAt),
          expenses: exp.filter((item: ExpenseTransaction) => !item.deletedAt),
          bills: b.filter((item: Bill) => !item.deletedAt),
          envelopes: env.filter((item: BudgetEnvelope) => !item.deletedAt),
          savingsGoals: sg,
          subscriptions: sub.filter((item: SubscriptionPlan) => !item.deletedAt),
          categories: cat,
          tasks: t.filter((item: Task) => !item.deletedAt),
          sessions: s,
          habits: h.filter((item: Habit) => !item.deletedAt),
          timeBlocks: tb.filter((item: TimeBlock) => !item.deletedAt),
          studySubjects: sSub.filter((item: StudySubject) => !item.deletedAt),
          studyTopics: sTop.filter((item: StudyTopic) => !item.deletedAt),
          studyRevisions: sRev.filter((item: StudyRevision) => !item.deletedAt),
        });
      })
      .catch((err) => {
        showToast('Failed to load export collections', 'error');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAllData();
  }, [refreshKey]);

  // Date Range Calculation
  const activeDateRange = useMemo(() => {
    return resolveDateFilterRange(datePreset, tz, {
      startDate: customStart,
      endDate: customEnd,
    });
  }, [datePreset, tz, customStart, customEnd]);

  const rangeLabel = useMemo(() => {
    if (datePreset === 'custom') return `${activeDateRange.startDate} to ${activeDateRange.endDate}`;
    return datePreset.replace(/_/g, ' ').toUpperCase();
  }, [datePreset, activeDateRange]);

  // Filtered Data based on active date range
  const filteredData = useMemo(() => {
    return filterPayloadByDateRange(rawData, activeDateRange, tz);
  }, [rawData, activeDateRange, tz]);

  // Module Selection Helpers
  const toggleModule = (id: ExportModuleId) => {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllModules = () => {
    setSelectedModules(new Set(MODULE_OPTIONS.map((m) => m.id)));
  };

  const selectFinanceOnly = () => {
    setSelectedModules(new Set(['finance_overview', 'income', 'expenses', 'bills', 'envelopes', 'savings_goals']));
  };

  const selectProductivityOnly = () => {
    setSelectedModules(new Set(['productivity_overview', 'tasks', 'focus_sessions', 'habits', 'study_os']));
  };

  const clearModuleSelection = () => {
    setSelectedModules(new Set(['finance_overview']));
  };

  // Preview metrics
  const previewMetrics = useMemo(() => {
    const incCount = filteredData.incomes.length;
    const expCount = filteredData.expenses.length;
    const billCount = filteredData.bills.length;
    const envCount = filteredData.envelopes.length;
    const goalCount = filteredData.savingsGoals.length;
    const taskCount = filteredData.tasks.length;
    const sessionCount = filteredData.sessions.length;
    const habitCount = filteredData.habits.length;
    const studyCount = filteredData.studySubjects.length;
    const timeBlockCount = filteredData.timeBlocks.length;
    const calendarUniqueCount =
      timeBlockCount +
      (selectedModules.has('tasks') ? 0 : filteredData.tasks.filter((t) => t.dueDate).length) +
      (selectedModules.has('bills') ? 0 : billCount);

    let totalSelectedRecords = 0;

    if (selectedModules.has('account_backup')) {
      totalSelectedRecords =
        incCount +
        expCount +
        billCount +
        envCount +
        goalCount +
        taskCount +
        sessionCount +
        habitCount +
        studyCount +
        timeBlockCount;
    } else {
      // Finance group
      if (selectedModules.has('finance_overview') || selectedModules.has('transactions')) {
        totalSelectedRecords += incCount + expCount + billCount;
      } else {
        if (selectedModules.has('income')) totalSelectedRecords += incCount;
        if (selectedModules.has('expenses')) totalSelectedRecords += expCount;
        if (selectedModules.has('bills')) totalSelectedRecords += billCount;
      }
      if (selectedModules.has('envelopes')) totalSelectedRecords += envCount;
      if (selectedModules.has('savings_goals')) totalSelectedRecords += goalCount;

      // Productivity group
      if (selectedModules.has('productivity_overview')) {
        totalSelectedRecords += taskCount + sessionCount;
      } else {
        if (selectedModules.has('tasks')) totalSelectedRecords += taskCount;
        if (selectedModules.has('focus_sessions')) totalSelectedRecords += sessionCount;
      }

      // Habits
      if (selectedModules.has('habits')) totalSelectedRecords += habitCount;

      // Study OS
      if (selectedModules.has('study_os')) totalSelectedRecords += studyCount;

      // Calendar
      if (selectedModules.has('calendar')) {
        totalSelectedRecords += calendarUniqueCount;
      }
    }

    const estimatedBytes = Math.max(1024, totalSelectedRecords * 240);
    const estimatedKb = Math.round(estimatedBytes / 1024);

    return {
      incCount,
      expCount,
      billCount,
      envCount,
      goalCount,
      taskCount,
      sessionCount,
      habitCount,
      studyCount,
      timeBlockCount,
      totalSelectedRecords,
      estimatedKb,
    };
  }, [filteredData, selectedModules]);

  // Sample Rows for Preview Table
  const samplePreviewRows = useMemo(() => {
    const rows: Array<{
      id: string;
      module: string;
      date: string;
      title: string;
      category: string;
      value: string;
      isPositive?: boolean;
      isNegative?: boolean;
    }> = [];

    // Incomes
    if (
      selectedModules.has('income') ||
      selectedModules.has('finance_overview') ||
      selectedModules.has('transactions') ||
      selectedModules.has('account_backup')
    ) {
      for (const i of filteredData.incomes.slice(0, 15)) {
        rows.push({
          id: i.id,
          module: 'Income',
          date: i.date,
          title: i.source,
          category: i.category,
          value: `+${formatCurrency(i.amountPaise, currency)}`,
          isPositive: true,
        });
      }
    }

    // Expenses
    if (
      selectedModules.has('expenses') ||
      selectedModules.has('finance_overview') ||
      selectedModules.has('transactions') ||
      selectedModules.has('account_backup')
    ) {
      for (const e of filteredData.expenses.slice(0, 15)) {
        rows.push({
          id: e.id,
          module: 'Expense',
          date: e.date,
          title: e.description,
          category: e.categoryName || e.categoryId,
          value: `-${formatCurrency(e.amountPaise, currency)}`,
          isNegative: true,
        });
      }
    }

    // Bills
    if (
      selectedModules.has('bills') ||
      selectedModules.has('finance_overview') ||
      selectedModules.has('transactions') ||
      selectedModules.has('calendar') ||
      selectedModules.has('account_backup')
    ) {
      for (const b of filteredData.bills.slice(0, 10)) {
        rows.push({
          id: b.id,
          module: 'Bill',
          date: b.dueDate,
          title: b.name,
          category: b.categoryName || b.categoryId,
          value: `-${formatCurrency(b.amountPaise, currency)}`,
          isNegative: true,
        });
      }
    }

    // Budget Envelopes
    if (
      selectedModules.has('envelopes') ||
      selectedModules.has('finance_overview') ||
      selectedModules.has('account_backup')
    ) {
      for (const env of filteredData.envelopes.slice(0, 10)) {
        rows.push({
          id: env.id,
          module: 'Budget',
          date: '',
          title: env.name,
          category: env.categoryId || 'General',
          value: `${formatCurrency(env.allocatedPaise, currency)} cap`,
        });
      }
    }

    // Savings Goals
    if (
      selectedModules.has('savings_goals') ||
      selectedModules.has('finance_overview') ||
      selectedModules.has('account_backup')
    ) {
      for (const g of filteredData.savingsGoals.slice(0, 10)) {
        rows.push({
          id: g.id,
          module: 'Savings',
          date: g.targetDate || '',
          title: g.title,
          category: 'Savings Goal',
          value: `${formatCurrency(g.savedPaise, currency)} / ${formatCurrency(g.targetPaise, currency)}`,
        });
      }
    }

    // Tasks
    if (
      selectedModules.has('tasks') ||
      selectedModules.has('productivity_overview') ||
      selectedModules.has('calendar') ||
      selectedModules.has('account_backup')
    ) {
      for (const t of filteredData.tasks.slice(0, 15)) {
        rows.push({
          id: t.id,
          module: 'Task',
          date: t.dueDate || t.createdAt.slice(0, 10),
          title: t.title,
          category: t.category || 'General',
          value: t.status.toUpperCase(),
        });
      }
    }

    // Focus Sessions
    if (
      selectedModules.has('focus_sessions') ||
      selectedModules.has('productivity_overview') ||
      selectedModules.has('account_backup')
    ) {
      for (const s of filteredData.sessions.slice(0, 10)) {
        rows.push({
          id: s.id,
          module: 'Focus',
          date: s.startedAt.slice(0, 10),
          title: `${s.mode.toUpperCase()} Session`,
          category: s.completed ? 'Completed' : 'Partial',
          value: `${Math.round(s.durationSeconds / 60)} mins`,
        });
      }
    }

    // Habits
    if (selectedModules.has('habits') || selectedModules.has('account_backup')) {
      for (const h of filteredData.habits.slice(0, 10)) {
        rows.push({
          id: h.id,
          module: 'Habit',
          date: '',
          title: h.title,
          category: h.category,
          value: `${(h.completedDates || []).length} streak`,
        });
      }
    }

    // Study OS
    if (selectedModules.has('study_os') || selectedModules.has('account_backup')) {
      for (const sub of filteredData.studySubjects.slice(0, 10)) {
        rows.push({
          id: sub.id,
          module: 'Study',
          date: '',
          title: `${sub.code} - ${sub.name}`,
          category: sub.targetExam || 'Subject',
          value: `${sub.completedSubtopics}/${sub.totalSubtopics}`,
        });
      }
    }

    // Calendar TimeBlocks
    if (selectedModules.has('calendar') || selectedModules.has('account_backup')) {
      for (const tb of filteredData.timeBlocks.slice(0, 10)) {
        rows.push({
          id: tb.id,
          module: 'Calendar',
          date: tb.date,
          title: tb.title,
          category: tb.category,
          value: `${tb.startMinute}m-${tb.endMinute}m`,
        });
      }
    }

    // Sort descending by date
    const sorted = rows.sort((a, b) => b.date.localeCompare(a.date));

    if (!previewSearch.trim()) return sorted.slice(0, 10);
    const q = previewSearch.toLowerCase();
    return sorted
      .filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          r.module.toLowerCase().includes(q) ||
          r.date.includes(q)
      )
      .slice(0, 10);
  }, [filteredData, selectedModules, currency, previewSearch]);

  // Main Export Dispatcher
  const handleExecuteExport = async () => {
    if (selectedModules.size === 0) {
      showToast('Please select at least one module to export', 'error');
      return;
    }

    setExporting(true);
    const dateStamp = new Date().toISOString().slice(0, 10);

    try {
      // 1. PDF Export
      if (format === 'pdf') {
        const templateConfig = REPORT_TEMPLATES[selectedTemplate];
        const ok = printExecutivePdfReport(
          filteredData,
          rangeLabel,
          user?.name || 'Verified User',
          {
            templateId: selectedTemplate,
            customTitle: templateConfig?.title,
            selectedModules,
            currency,
          }
        );
        if (ok) {
          showToast(`Luxury PDF statement "${templateConfig?.title || 'Report'}" ready for print / save!`, 'success');
        } else {
          showToast('Pop-up was blocked. Downloaded HTML document as fallback.', 'info');
        }
      }

      // 2. XLSX Multi-Sheet Workbook Export
      else if (format === 'xlsx') {
        const sheets = generateMasterXlsxWorkbook(filteredData, rangeLabel, selectedModules, currency);
        downloadXlsxFile(`FocusFlow-${selectedTemplate.replace(/_/g, '-')}-${dateStamp}.xlsx`, sheets);
        showToast('Multi-sheet Excel workbook (.xlsx) downloaded successfully!', 'success');
      }

      // 3. CSV Tabular Export
      else if (format === 'csv') {
        const selectedList = Array.from(selectedModules);
        if (selectedList.length === 1 && !selectedModules.has('account_backup')) {
          const mod = selectedList[0];
          const { filename, content } = generateModuleCsv(mod, filteredData, currency);
          downloadCsvFile(filename, content);
          showToast(`CSV export "${filename}" downloaded successfully!`, 'success');
        } else {
          // Multi-module CSV export: bundle each module into a separate CSV file inside a ZIP archive
          const targetModules: ExportModuleId[] = selectedModules.has('account_backup')
            ? ['income', 'expenses', 'transactions', 'bills', 'envelopes', 'savings_goals', 'productivity_overview', 'habits', 'study_os', 'calendar']
            : selectedList;

          const files = targetModules.map((mod) => {
            const { filename, content } = generateModuleCsv(mod, filteredData, currency);
            return { name: filename, content };
          });

          downloadZipFile(`focusflow-export-csv-${dateStamp}.zip`, files);
          showToast(`Exported ${files.length} module CSV files in ZIP archive!`, 'success');
        }
      }

      // 4. JSON Versioned Backup Export
      else if (format === 'json') {
        const scope = selectedModules.has('account_backup') ? 'complete' : selectedTemplate;
        const { filename, jsonText } = generateVersionedJsonBackup(filteredData, scope, selectedModules);
        downloadJsonFile(filename, jsonText);
        showToast(`Lossless JSON backup "${filename}" downloaded successfully!`, 'success');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      showToast(msg, 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12">
      {/* Hero Header Banner */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8 border border-[var(--ff-border-color)] bg-[var(--ff-surface-card)] shadow-lg">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-72 h-72 rounded-full bg-gradient-to-br from-indigo-500/15 via-purple-500/10 to-transparent blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--ff-accent-soft)] text-[var(--ff-accent-text)] text-xs font-bold border border-[var(--ff-accent-border)]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Certified Audit &amp; Data Portability Center</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--ff-text-primary)]">
              Ultimate Premium Export &amp; Reporting Hub
            </h1>
            <p className="text-xs sm:text-sm text-[var(--ff-text-muted)] leading-relaxed">
              Export verified financial statements, multi-sheet Excel workbooks, clean CSV ledgers, and full restorable JSON archives. Zero fabricated data — 100% verified accounting records.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ThemeButton
              variant="secondary"
              size="sm"
              onClick={() => setShowAccuracyModal(true)}
              className="flex items-center gap-1.5"
            >
              <Info className="w-4 h-4 text-[var(--ff-accent-text)]" />
              <span>Category Integrity Audit</span>
            </ThemeButton>
            <ThemeButton
              variant="secondary"
              size="sm"
              onClick={loadAllData}
              disabled={loading}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Collections</span>
            </ThemeButton>
          </div>
        </div>
      </div>

      {/* Document Template Presets */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--ff-accent-text)]" />
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-[var(--ff-text-secondary)]">
              Curated Document Templates
            </h2>
          </div>
          <span className="text-[11px] text-[var(--ff-text-muted)]">
            Active: <strong className="text-[var(--ff-accent-text)]">{REPORT_TEMPLATES[selectedTemplate]?.title}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {Object.values(REPORT_TEMPLATES).map((tmpl) => {
            const isSelected = selectedTemplate === tmpl.id;
            return (
              <button
                key={tmpl.id}
                type="button"
                onClick={() => handleSelectTemplate(tmpl.id)}
                className={`flex flex-col text-left px-3.5 py-2.5 rounded-xl border shrink-0 transition-all ${
                  isSelected
                    ? 'border-[var(--ff-accent)] bg-[var(--ff-accent-soft)]/20 shadow-xs ring-1 ring-[var(--ff-accent)]'
                    : 'border-[var(--ff-border-color)] bg-[var(--ff-surface-card)] hover:border-[var(--ff-border-hover)]'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[9.5px] font-bold text-[var(--ff-text-muted)] uppercase tracking-wider">
                    {tmpl.category}
                  </span>
                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[var(--ff-accent)]"></span>}
                </div>
                <span className="text-xs font-bold text-[var(--ff-text-primary)] whitespace-nowrap">
                  {tmpl.title}
                </span>
                <span className="text-[10px] text-[var(--ff-text-muted)] max-w-[200px] truncate mt-0.5">
                  {tmpl.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Format & Date Controls (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* 1. Format Selection Card */}
          <ThemeCard className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[var(--ff-accent-soft)] flex items-center justify-center text-[var(--ff-accent-text)]">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">Export Format</h3>
                  <p className="text-[11px] text-[var(--ff-text-muted)]">Select target container format</p>
                </div>
              </div>
              <ThemeBadge tone="accent">
                {format.toUpperCase()}
              </ThemeBadge>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {[
                { id: 'pdf' as ExportFormat, label: 'Executive PDF', desc: 'Cover, KPIs, tables, print-ready', icon: FileText, color: 'text-rose-500' },
                { id: 'xlsx' as ExportFormat, label: 'Excel (.xlsx)', desc: 'Multi-sheet workbook with formulas', icon: Table, color: 'text-emerald-500' },
                { id: 'csv' as ExportFormat, label: 'RFC-4180 CSV', desc: 'Spreadsheet-friendly UTF-8 BOM', icon: Receipt, color: 'text-blue-500' },
                { id: 'json' as ExportFormat, label: 'Snapshot JSON', desc: 'Lossless restorable schema archive', icon: FileCode, color: 'text-amber-500' },
              ].map((item) => {
                const Icon = item.icon;
                const isSelected = format === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFormat(item.id)}
                    className={`flex flex-col text-left p-3 rounded-xl border transition-all relative ${
                      isSelected
                        ? 'border-[var(--ff-accent)] bg-[var(--ff-accent-soft)]/20 shadow-sm ring-1 ring-[var(--ff-accent)]'
                        : 'border-[var(--ff-border-color)] bg-[var(--ff-surface-card)] hover:border-[var(--ff-border-hover)]'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <Icon className={`w-4 h-4 ${item.color}`} />
                      {isSelected && <Check className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />}
                    </div>
                    <span className="text-xs font-bold text-[var(--ff-text-primary)]">{item.label}</span>
                    <span className="text-[10px] text-[var(--ff-text-muted)] line-clamp-1">{item.desc}</span>
                  </button>
                );
              })}
            </div>
          </ThemeCard>

          {/* 2. Date Range Filter Card */}
          <ThemeCard className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">Reporting Window</h3>
                  <p className="text-[11px] text-[var(--ff-text-muted)]">Timezone: {tz}</p>
                </div>
              </div>
              <span className="text-[11px] font-mono font-bold text-[var(--ff-accent-text)]">
                {rangeLabel}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { id: 'this_month' as DateFilterPreset, label: 'This Month' },
                { id: 'last_month' as DateFilterPreset, label: 'Last Month' },
                { id: 'this_week' as DateFilterPreset, label: 'This Week' },
                { id: 'today' as DateFilterPreset, label: 'Today' },
                { id: 'yesterday' as DateFilterPreset, label: 'Yesterday' },
                { id: 'this_year' as DateFilterPreset, label: 'This Year' },
                { id: 'all_time' as DateFilterPreset, label: 'All Time' },
                { id: 'custom' as DateFilterPreset, label: 'Custom' },
              ].map((p) => {
                const isSelected = datePreset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setDatePreset(p.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                      isSelected
                        ? 'bg-[var(--ff-accent)] text-white border-[var(--ff-accent)] shadow-xs'
                        : 'bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] border-transparent hover:text-[var(--ff-text-primary)]'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Custom Range Inputs */}
            {datePreset === 'custom' && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--ff-border-color)]">
                <div>
                  <label className="block text-[10px] font-bold text-[var(--ff-text-muted)] uppercase mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="ff-input w-full px-2.5 py-1 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[var(--ff-text-muted)] uppercase mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="ff-input w-full px-2.5 py-1 text-xs font-mono"
                  />
                </div>
              </div>
            )}
          </ThemeCard>

          {/* 3. Export Summary Stats Card */}
          <div className="p-4 rounded-2xl border border-[var(--ff-border-color)] bg-gradient-to-br from-[var(--ff-surface-card)] to-[var(--ff-surface-muted)] space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-[var(--ff-text-secondary)] uppercase tracking-wider">
              <span>Ready for Export</span>
              <span className="font-mono text-[var(--ff-accent-text)]">
                ~{previewMetrics.estimatedKb} KB
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
                <span className="text-[10px] text-[var(--ff-text-muted)] block">Records</span>
                <span className="text-base font-extrabold font-mono text-[var(--ff-text-primary)]">
                  {previewMetrics.totalSelectedRecords}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
                <span className="text-[10px] text-[var(--ff-text-muted)] block">Modules</span>
                <span className="text-base font-extrabold font-mono text-[var(--ff-accent-text)]">
                  {selectedModules.size}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)]">
                <span className="text-[10px] text-[var(--ff-text-muted)] block">Format</span>
                <span className="text-base font-extrabold font-mono text-[var(--ff-text-primary)] uppercase">
                  {format}
                </span>
              </div>
            </div>

            <ThemeButton
              variant="primary"
              size="lg"
              onClick={handleExecuteExport}
              disabled={exporting || loading || previewMetrics.totalSelectedRecords === 0}
              className="w-full mt-2 flex items-center justify-center gap-2 py-3 shadow-md"
            >
              <Download className={`w-4 h-4 ${exporting ? 'animate-bounce' : ''}`} />
              <span className="font-bold">
                {exporting ? 'Generating Document...' : `Download ${format.toUpperCase()} Export`}
              </span>
            </ThemeButton>
          </div>
        </div>

        {/* Right Column: Module Matrix & Live Inspection (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Module Selection Card */}
          <ThemeCard className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">Select Modules to Include</h3>
                <p className="text-[11px] text-[var(--ff-text-muted)]">Check modules to compile into export</p>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={selectAllModules}
                  className="px-2 py-1 text-[11px] font-semibold rounded-md bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)]"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={selectFinanceOnly}
                  className="px-2 py-1 text-[11px] font-semibold rounded-md bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)]"
                >
                  Finance
                </button>
                <button
                  type="button"
                  onClick={selectProductivityOnly}
                  className="px-2 py-1 text-[11px] font-semibold rounded-md bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)]"
                >
                  Productivity
                </button>
                <button
                  type="button"
                  onClick={clearModuleSelection}
                  className="px-2 py-1 text-[11px] font-semibold rounded-md bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)]"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {MODULE_OPTIONS.map((mod) => {
                const Icon = mod.icon;
                const isChecked = selectedModules.has(mod.id);

                let badgeCount = 0;
                if (mod.id === 'income') badgeCount = filteredData.incomes.length;
                else if (mod.id === 'expenses') badgeCount = filteredData.expenses.length;
                else if (mod.id === 'finance_overview' || mod.id === 'transactions') {
                  badgeCount = filteredData.incomes.length + filteredData.expenses.length;
                } else if (mod.id === 'bills') badgeCount = filteredData.bills.length;
                else if (mod.id === 'envelopes') badgeCount = filteredData.envelopes.length;
                else if (mod.id === 'savings_goals') badgeCount = filteredData.savingsGoals.length;
                else if (mod.id === 'tasks') badgeCount = filteredData.tasks.length;
                else if (mod.id === 'focus_sessions') badgeCount = filteredData.sessions.length;
                else if (mod.id === 'habits') badgeCount = filteredData.habits.length;
                else if (mod.id === 'study_os') badgeCount = filteredData.studySubjects.length;

                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => toggleModule(mod.id)}
                    className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                      isChecked
                        ? 'border-[var(--ff-accent)] bg-[var(--ff-accent-soft)]/15 shadow-xs'
                        : 'border-[var(--ff-border-color)] bg-[var(--ff-surface-card)] hover:border-[var(--ff-border-hover)] opacity-75'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 border ${
                        isChecked
                          ? 'bg-[var(--ff-accent)] border-[var(--ff-accent)] text-white'
                          : 'border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] text-transparent'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-[var(--ff-text-primary)] truncate">
                          {mod.label}
                        </span>
                        {badgeCount > 0 && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)]">
                            {badgeCount}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-[var(--ff-text-muted)] line-clamp-1 mt-0.5">
                        {mod.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </ThemeCard>

          {/* Live Data Inspection Preview Table */}
          <ThemeCard className="p-5 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
                  Live Data Preview (Top Matching Records)
                </h3>
                <p className="text-[11px] text-[var(--ff-text-muted)]">
                  Real records that will be compiled into your report
                </p>
              </div>

              <div className="relative w-full sm:w-48">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ff-text-muted)]" />
                <input
                  type="text"
                  placeholder="Filter preview..."
                  value={previewSearch}
                  onChange={(e) => setPreviewSearch(e.target.value)}
                  className="ff-input w-full pl-8 pr-2.5 py-1 text-xs"
                />
              </div>
            </div>

            {samplePreviewRows.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-[var(--ff-border-color)] rounded-xl">
                <p className="text-xs text-[var(--ff-text-muted)]">No records match the selected date window and module filters.</p>
                <p className="text-[10px] text-[var(--ff-text-muted)] mt-1">Try switching to &quot;This Year&quot; or &quot;All Time&quot;.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[var(--ff-border-color)]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[var(--ff-surface-muted)] border-b border-[var(--ff-border-color)] text-[10px] font-bold text-[var(--ff-text-muted)] uppercase tracking-wider">
                      <th className="py-2 px-3">Module</th>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Title / Description</th>
                      <th className="py-2 px-3">Category</th>
                      <th className="py-2 px-3 text-right">Value / Metric</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--ff-border-color)] bg-[var(--ff-surface-card)]">
                    {samplePreviewRows.map((row) => (
                      <tr key={row.id} className="hover:bg-[var(--ff-surface-hover)] transition-colors">
                        <td className="py-2 px-3">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)]">
                            {row.module}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-[var(--ff-text-muted)]">
                          {row.date}
                        </td>
                        <td className="py-2 px-3 font-medium text-[var(--ff-text-primary)] max-w-[160px] truncate">
                          {row.title}
                        </td>
                        <td className="py-2 px-3 text-[var(--ff-text-muted)] text-[11px] max-w-[120px] truncate">
                          {row.category}
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-mono font-bold text-xs ${
                            row.isPositive
                              ? 'text-[var(--ff-success)]'
                              : row.isNegative
                              ? 'text-[var(--ff-danger)]'
                              : 'text-[var(--ff-text-primary)]'
                          }`}
                        >
                          {row.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ThemeCard>
        </div>
      </div>

      {/* Category Accuracy Audit Modal */}
      <AnimatePresence>
        {showAccuracyModal && (
          <motion.div
            key="accuracy-modal"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowAccuracyModal(false);
            }}
          >
            <motion.div
              className="w-full max-w-lg bg-[var(--ff-card-bg)] border border-[var(--ff-border-color)] rounded-2xl shadow-2xl p-6 space-y-4"
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
            >
              <div className="flex items-center justify-between border-b border-[var(--ff-border-color)] pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[var(--ff-success)]" />
                  <h3 className="text-base font-bold text-[var(--ff-text-primary)]">
                    Financial Category Mapping Audit
                  </h3>
                </div>
                <button
                  onClick={() => setShowAccuracyModal(false)}
                  className="p-1 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs text-[var(--ff-text-secondary)] leading-relaxed">
                <p>
                  <strong>Root Cause of Historical Category Mappings:</strong> In earlier versions of the quick-add and variable expense forms, when a user typed descriptions like &ldquo;Groceries&rdquo;, &ldquo;food&rdquo;, &ldquo;recharge&rdquo;, or &ldquo;Breakfast&rdquo; without altering the category dropdown, the form defaulted to the very first category in the seeded database array (<code>Housing &amp; Rent</code>).
                </p>
                <p>
                  <strong>Non-Destructive Data Guarantee:</strong> To honor strict database safety rules, FocusFlow <strong>never silently mutates or rewrites historical user records</strong>. Historical entries retain their original verified record IDs and stored category IDs.
                </p>
                <p>
                  <strong>Smart Resolution in Unified Export:</strong> All new daily entries automatically infer categories (e.g. &ldquo;Breakfast&rdquo; &rarr; <code>Food &amp; Dining</code>; &ldquo;Recharge&rdquo; &rarr; <code>Bills &amp; Utilities</code>) through <code>resolveDefaultCategoryForReason</code>, guaranteeing clean future exports without risking database corruption.
                </p>
              </div>

              <div className="pt-2 flex justify-end">
                <ThemeButton variant="secondary" size="sm" onClick={() => setShowAccuracyModal(false)}>
                  Close
                </ThemeButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
