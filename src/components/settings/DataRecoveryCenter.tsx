import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { AuditLogEntry } from '../../types/index.ts';
import { ThemeCard, ThemeButton, ThemeBadge, ThemeInput } from '../ui/ThemePrimitives.tsx';
import {
  ShieldAlert,
  Download,
  Upload,
  History,
  AlertTriangle,
  RefreshCw,
  Search,
  CheckCircle2,
  Database,
} from 'lucide-react';

export const DataRecoveryCenter: React.FC = () => {
  const { showToast, refreshKey, triggerRefresh, offlineOutboxCount, reconcileOutboxNow, isOnline } = useApp();
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [loadingMoreLogs, setLoadingMoreLogs] = useState(false);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [hasMoreLogs, setHasMoreLogs] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [searchLog, setSearchLog] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  // Integrity scanner state
  const [scanning, setScanning] = useState(false);
  const [integrityIssues, setIntegrityIssues] = useState<Array<{ id: string; description: string; type: string }>>([]);
  const [scanCompleted, setScanCompleted] = useState(false);

  // Restore file input
  const [restoring, setRestoring] = useState(false);
  const [restoreStats, setRestoreStats] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoadingLogs(true);
    api.getAuditLogsPage(25, null)
      .then((page) => {
        if (!isMounted) return;
        setAuditLogs(page.items);
        setAuditCursor(page.nextCursor);
        setHasMoreLogs(page.hasMore);
      })
      .catch(() => {
        if (isMounted) showToast('Failed to load audit logs', 'error');
      })
      .finally(() => {
        if (isMounted) setLoadingLogs(false);
      });

    return () => {
      isMounted = false;
    };
  }, [refreshKey, showToast]);

  const handleLoadMoreLogs = async () => {
    if (!hasMoreLogs || !auditCursor) return;
    setLoadingMoreLogs(true);
    try {
      const page = await api.getAuditLogsPage(25, auditCursor);
      setAuditCursor(page.nextCursor);
      setHasMoreLogs(page.hasMore);
      setAuditLogs((prev) => {
        const seen = new Set(prev.map((l) => l.id));
        const next = page.items.filter((l) => !seen.has(l.id));
        return [...prev, ...next];
      });
    } catch {
      showToast('Failed to load older audit logs', 'error');
    } finally {
      setLoadingMoreLogs(false);
    }
  };

  const handleReconcileOutbox = async () => {
    setReconciling(true);
    try {
      await reconcileOutboxNow();
    } finally {
      setReconciling(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      showToast('Generating snapshot backup...', 'info');
      const backupData = await api.exportBackup();
      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `focusflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Full workspace backup downloaded successfully!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Backup export failed';
      showToast(msg, 'error');
    }
  };

  const handleFileRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoring(true);
    setRestoreStats(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid JSON format');
      }

      const res = await api.restoreBackup(parsed);
      setRestoreStats(res.counts);
      showToast('Workspace data restored successfully!', 'success');
      triggerRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid backup JSON file';
      showToast(`Restore failed: ${msg}`, 'error');
    } finally {
      setRestoring(false);
      e.target.value = '';
    }
  };

  const runIntegrityScanner = async () => {
    setScanning(true);
    setIntegrityIssues([]);
    try {
      const [expenses, bills, categories] = await Promise.all([
        api.getExpenses(),
        api.getBills(),
        api.getCategories(),
      ]);

      const catIds = new Set(categories.map((c) => c.id));
      const billIds = new Set(bills.map((b) => b.id));
      const issues: Array<{ id: string; description: string; type: string }> = [];

      for (const exp of expenses) {
        if (exp.categoryId && !catIds.has(exp.categoryId)) {
          issues.push({
            id: exp.id,
            type: 'Orphan Expense Category',
            description: `Expense "${exp.description}" points to missing category ID ${exp.categoryId}`,
          });
        }
        if (exp.billId && !billIds.has(exp.billId)) {
          issues.push({
            id: exp.id,
            type: 'Unlinked Bill Expense',
            description: `Expense "${exp.description}" references deleted/missing bill ID ${exp.billId}`,
          });
        }
      }

      setIntegrityIssues(issues);
      setScanCompleted(true);
      if (issues.length === 0) {
        showToast('All database relationships are consistent and healthy!', 'success');
      } else {
        showToast(`Discovered ${issues.length} record integrity discrepancies`, 'info');
      }
    } catch {
      showToast('Integrity scan encountered an error', 'error');
    } finally {
      setScanning(false);
    }
  };

  const filteredLogs = auditLogs.filter((log) => {
    const matchesSearch =
      (log.entityTitle && log.entityTitle.toLowerCase().includes(searchLog.toLowerCase())) ||
      (log.details && log.details.toLowerCase().includes(searchLog.toLowerCase())) ||
      log.action.toLowerCase().includes(searchLog.toLowerCase()) ||
      log.entityType.toLowerCase().includes(searchLog.toLowerCase());

    if (!matchesSearch) return false;
    if (actionFilter !== 'all' && log.action !== actionFilter) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 flex items-center justify-center rounded-xl"
            style={{ backgroundColor: 'var(--ff-accent-soft)', color: 'var(--ff-accent-text)' }}
          >
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--ff-text-primary)]">
              Advanced Data Recovery Center
            </h1>
            <p className="text-xs text-[var(--ff-text-muted)]">
              Point-in-time full JSON snapshots, verified ledger restores, audit logs and orphan record repairs
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeButton variant="secondary" size="sm" onClick={handleExportBackup}>
            <Download className="w-4 h-4 mr-1.5" />
            Export Snapshot
          </ThemeButton>

          <label className="cursor-pointer">
            <span className="inline-flex items-center justify-center font-medium rounded-lg px-3 py-1.5 text-xs bg-[var(--ff-accent)] text-white hover:opacity-90 transition-opacity">
              <Upload className="w-4 h-4 mr-1.5" />
              {restoring ? 'Restoring...' : 'Restore JSON'}
            </span>
            <input
              type="file"
              accept=".json"
              onChange={handleFileRestore}
              className="hidden"
              disabled={restoring}
            />
          </label>
        </div>
      </div>

      {/* Restore Statistics Banner */}
      {restoreStats && (
        <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <div className="text-xs">
            <h4 className="font-bold text-emerald-600 dark:text-emerald-400">Restore Completed Successfully</h4>
            <p className="text-[var(--ff-text-secondary)] mt-1">
              {Object.entries(restoreStats)
                .map(([k, v]) => `${k}: ${v} records`)
                .join(' • ')}
            </p>
          </div>
        </div>
      )}

      {/* Firestore Offline Outbox Recovery Card */}
      <ThemeCard>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-[var(--ff-text-primary)] flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-[var(--ff-accent)]" />
              Firestore Offline Outbox &amp; Reconciliation
              <ThemeBadge tone={offlineOutboxCount > 0 ? 'warning' : 'success'}>
                {offlineOutboxCount > 0 ? `${offlineOutboxCount} Pending` : 'In Sync'}
              </ThemeBadge>
            </h3>
            <p className="text-xs text-[var(--ff-text-muted)] mt-0.5">
              {offlineOutboxCount > 0
                ? 'Signed-in writes captured offline are queued securely in your per-user outbox awaiting Firestore replay (never diverted to local JSON fallback).'
                : `Primary Firestore source of truth is up to date (${isOnline ? 'Online' : 'Offline'}).`}
            </p>
          </div>

          <ThemeButton
            type="button"
            variant={offlineOutboxCount > 0 ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => void handleReconcileOutbox()}
            disabled={reconciling || !isOnline}
            loading={reconciling}
            loadingText="Reconciling..."
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${reconciling ? 'animate-spin' : ''}`} />
            Reconcile Now
          </ThemeButton>
        </div>
      </ThemeCard>

      {/* Database Integrity Scanner Card */}
      <ThemeCard>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-sm font-bold text-[var(--ff-text-primary)] flex items-center gap-2">
              <Database className="w-4 h-4 text-[var(--ff-accent)]" />
              Database Integrity Scanner
            </h3>
            <p className="text-xs text-[var(--ff-text-muted)] mt-0.5">
              Inspects your primary dataset for orphan foreign keys, dangling expenses, and broken pointers.
            </p>
          </div>

          <ThemeButton
            variant="secondary"
            size="sm"
            onClick={runIntegrityScanner}
            disabled={scanning}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning...' : 'Run Integrity Scan'}
          </ThemeButton>
        </div>

        {scanCompleted && (
          <div className="mt-3 pt-3 border-t ff-divider text-xs">
            {integrityIssues.length === 0 ? (
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Zero integrity discrepancies found. All relational keys are sound!</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-amber-500 font-bold">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Found {integrityIssues.length} integrity warnings:</span>
                </div>
                {integrityIssues.map((iss) => (
                  <div
                    key={iss.id}
                    className="p-2.5 rounded-lg border ff-divider bg-[var(--ff-muted)]/20 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-[var(--ff-text-primary)]">{iss.type}:</span>{' '}
                      <span className="text-[var(--ff-text-secondary)]">{iss.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </ThemeCard>

      {/* Historical Audit Trail */}
      <ThemeCard noPadding>
        <div className="p-4 border-b ff-divider flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[var(--ff-accent)]" />
            <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
              Verified Audit Log ({filteredLogs.length})
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-48 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ff-text-muted)]" />
              <ThemeInput
                type="search"
                value={searchLog}
                onChange={(e) => setSearchLog(e.target.value)}
                placeholder="Filter audit trail..."
                className="pl-8 text-xs py-1.5"
              />
            </div>

            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="ff-input text-xs py-1.5 px-2 rounded-lg"
              style={{
                backgroundColor: 'var(--ff-card-bg)',
                borderColor: 'var(--ff-border)',
                color: 'var(--ff-text-primary)',
              }}
            >
              <option value="all">All Actions</option>
              <option value="pay">Bill Payments</option>
              <option value="undo_payment">Undone Payments</option>
              <option value="create">Creations</option>
              <option value="update">Updates</option>
              <option value="delete">Deletions</option>
              <option value="restore">Restores</option>
              <option value="envelope_transfer">Envelope Transfers</option>
            </select>
          </div>
        </div>

        {loadingLogs ? (
          <div className="p-8 text-center text-xs text-[var(--ff-text-muted)]">Loading verified audit log...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--ff-text-muted)]">No audit entries matching filters.</div>
        ) : (
          <div className="divide-y ff-divider max-h-[500px] overflow-y-auto">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="p-3.5 hover:bg-[var(--ff-muted)]/10 flex items-center justify-between gap-4 transition-colors text-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ThemeBadge
                    tone={
                      log.action === 'undo_payment'
                        ? 'danger'
                        : log.action === 'pay'
                        ? 'success'
                        : log.action === 'delete'
                        ? 'danger'
                        : 'neutral'
                    }
                    className="uppercase shrink-0 font-mono text-[10px]"
                  >
                    {log.action.replace('_', ' ')}
                  </ThemeBadge>

                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--ff-text-primary)] truncate">
                      {log.entityTitle || log.entityId}
                    </p>
                    {log.details && (
                      <p className="text-[11px] text-[var(--ff-text-muted)] truncate">{log.details}</p>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0 text-[11px] font-mono text-[var(--ff-text-muted)]">
                  <span>{new Date(log.timestamp).toLocaleString()}</span>
                  <span className="block uppercase text-[9px] text-[var(--ff-text-muted)]">
                    {log.entityType}
                  </span>
                </div>
              </div>
            ))}
            {hasMoreLogs && (
              <div className="p-3 text-center border-t ff-divider">
                <ThemeButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleLoadMoreLogs()}
                  loading={loadingMoreLogs}
                  loadingText="Loading older entries..."
                >
                  Load Older Audit Logs
                </ThemeButton>
              </div>
            )}
          </div>
        )}
      </ThemeCard>
    </div>
  );
};
