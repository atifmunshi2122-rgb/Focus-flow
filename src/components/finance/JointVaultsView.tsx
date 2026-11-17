import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { formatCurrency, toPaise as parseCurrencyInput } from '../../lib/currency.ts';
import {
  JointVault,
  VaultMember,
  VaultInvitation,
  VaultContribution,
  VaultExpense,
  VaultSettlement,
  VaultSummary,
  ExpenseSplitMode,
} from '../../types/vault.ts';
import { ThemeCard, ThemeButton, ThemeBadge, ThemeInput, ThemeModal, ThemeSelect } from '../ui/ThemePrimitives.tsx';
import {
  AnimatedNumber,
  AnimatedProgressBar,
  MotionStaggerGrid,
  MotionStaggerItem,
  EmptyStateIllustration,
  SkeletonDashboard,
  useMotionPreferences,
} from '../ui/MotionPrimitives.tsx';
import {
  Heart,
  Users,
  Plus,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Wallet,
  Calendar,
  Share2,
  Copy,
  Check,
  Scale,
  Receipt,
  Sparkles,
  Clock,
  ArrowRight,
  Archive,
  LogOut,
  Info,
  DollarSign,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';

export const JointVaultsView: React.FC = () => {
  const { user, currency, showToast, refreshKey } = useApp();
  const { isDisabled } = useMotionPreferences();

  const [vaults, setVaults] = useState<VaultSummary[]>([]);
  const [selectedVaultId, setSelectedVaultId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'contributions' | 'expenses' | 'activity'>('overview');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isContributeModalOpen, setIsContributeModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [isRatioModalOpen, setIsRatioModalOpen] = useState(false);

  // Form states
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createTarget, setCreateTarget] = useState('');
  const [createMonthly, setCreateMonthly] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [activeInvite, setActiveInvite] = useState<VaultInvitation | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Contribution Form
  const [contribAmount, setContribAmount] = useState('');
  const [contribDate, setContribDate] = useState(new Date().toISOString().slice(0, 10));
  const [contribDesc, setContribDesc] = useState('');

  // Expense Form
  const [expAmount, setExpAmount] = useState('');
  const [expDesc, setExpDesc] = useState('');
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));
  const [expSplitMode, setExpSplitMode] = useState<ExpenseSplitMode>('equal');

  // Settlement Form
  const [settleAmount, setSettleAmount] = useState('');
  const [settleNotes, setSettleNotes] = useState('');

  // Ratio Form
  const [ratioPreset, setRatioPreset] = useState<'50/50' | '60/40' | '70/30' | 'custom'>('50/50');
  const [customRatioA, setCustomRatioA] = useState(50);
  const [customRatioB, setCustomRatioB] = useState(50);

  // Load vaults
  const loadVaults = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.getJointVaults();
      const safeData = Array.isArray(data) ? data : [];
      setVaults(safeData);
      if (safeData.length > 0 && !selectedVaultId) {
        setSelectedVaultId(safeData[0].vault.id);
      }
    } catch (err: any) {
      console.error('Failed to load joint vaults:', err);
      const code = err?.code || '';
      const msg = String(err?.message || '');
      if (code === 'permission-denied' || msg.includes('permission-denied') || msg.includes('Permission denied')) {
        setLoadError('Access to joint vaults was denied by security rules. Please verify your account permissions.');
      } else if (code === 'unauthenticated' || msg.includes('unauthenticated')) {
        setLoadError('Your session has expired. Please sign in again to access joint vaults.');
      } else if (code === 'unavailable' || msg.includes('unavailable') || msg.includes('Failed to fetch') || msg.includes('network')) {
        setLoadError('Network connection issue. Please check your internet connection and retry.');
      } else {
        setLoadError('Failed to load joint vaults. Please check connection and retry.');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedVaultId]);

  useEffect(() => {
    loadVaults();
  }, [loadVaults, refreshKey]);

  // Active vault summary
  const currentSummary = useMemo(() => {
    return vaults.find((v) => v.vault.id === selectedVaultId) || (vaults.length > 0 ? vaults[0] : null);
  }, [vaults, selectedVaultId]);

  // Real-time subscription to active vault
  useEffect(() => {
    if (!currentSummary) return;
    const unsub = api.subscribeToVault(currentSummary.vault.id, (updated) => {
      if (updated) {
        setVaults((prev) => prev.map((v) => (v.vault.id === updated.vault.id ? updated : v)));
      }
    });
    return () => unsub();
  }, [currentSummary?.vault.id]);

  // Handlers
  const handleCreateVault = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetPaise = parseCurrencyInput(createTarget);
    if (targetPaise <= 0) {
      showToast('Please enter a valid savings target amount', 'error');
      return;
    }
    const monthlyPaise = createMonthly ? parseCurrencyInput(createMonthly) : Math.round(targetPaise / 10);

    try {
      const created = await api.createJointVault({
        name: createName.trim(),
        description: createDesc.trim(),
        targetPaise,
        monthlyTargetPaise: monthlyPaise,
        currency,
      });
      showToast(`Created vault "${created.name}"`, 'success');
      setIsCreateModalOpen(false);
      setCreateName('');
      setCreateDesc('');
      setCreateTarget('');
      setCreateMonthly('');
      setSelectedVaultId(created.id);
      loadVaults();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create vault', 'error');
    }
  };

  const handleJoinVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim() || isJoining) return;

    setIsJoining(true);
    setJoinError(null);

    try {
      const result = await api.acceptVaultInvitation(joinCode.trim());
      showToast(`Joined vault "${result.vault.name}"!`, 'success');
      setIsJoinModalOpen(false);
      setJoinCode('');
      setJoinError(null);
      setSelectedVaultId(result.vault.id);
      await loadVaults();
    } catch (err: any) {
      const msg = String(err?.message || '');
      const status = err?.status;
      const code = String(err?.code || '');

      let friendlyMsg = 'Failed to join vault. Please verify the code and retry.';
      if (status === 503 || code === 'FIREBASE_ADMIN_NOT_CONFIGURED') {
        friendlyMsg = 'Joint Vault server is not configured with Firebase Admin credentials (FIREBASE_SERVICE_ACCOUNT). Please configure FIREBASE_SERVICE_ACCOUNT in your server environment.';
      } else if (status === 404 || code === 'NOT_FOUND' || msg.includes('404')) {
        friendlyMsg = 'Joint Vault invitation API is temporarily unreachable (404). Please ensure the backend is deployed and retry.';
      } else if (status === 401 || code === 'UNAUTHORIZED' || msg.includes('Unauthorized') || msg.includes('Authentication failed')) {
        friendlyMsg = 'Your authentication session has expired. Please sign in again to join this vault.';
      } else if (msg.toLowerCase().includes('different email')) {
        friendlyMsg = 'This invitation was sent to a different email address than your current signed-in account.';
      } else if (msg.toLowerCase().includes('already processed') || msg.toLowerCase().includes('already accepted') || msg.toLowerCase().includes('already used')) {
        friendlyMsg = 'This invitation code has already been used and is no longer valid.';
      } else if (msg.toLowerCase().includes('expired')) {
        friendlyMsg = 'This invitation code has expired. Please ask your partner to generate a new one.';
      } else if (msg.toLowerCase().includes('maximum') || msg.toLowerCase().includes('full') || msg.toLowerCase().includes('2 active members')) {
        friendlyMsg = 'This vault already has the maximum of 2 active partners.';
      } else if (msg.toLowerCase().includes('already a member')) {
        friendlyMsg = 'You are already an active member of this vault.';
      } else if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('offline') || msg.toLowerCase().includes('failed to fetch')) {
        friendlyMsg = 'Network connection interrupted. Please check your internet connection and retry.';
      } else if (msg) {
        friendlyMsg = msg;
      }

      setJoinError(friendlyMsg);
      showToast(friendlyMsg, 'error');
    } finally {
      setIsJoining(false);
    }
  };

  const handleGenerateInvite = async () => {
    if (!currentSummary) return;
    try {
      const invite = await api.createVaultInvitation(currentSummary.vault.id);
      setActiveInvite(invite);
      setIsInviteModalOpen(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to generate invitation', 'error');
    }
  };

  const handleCopyCode = () => {
    if (!activeInvite) return;
    navigator.clipboard.writeText(activeInvite.inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    showToast('Single-use invite code copied to clipboard!', 'success');
  };

  const handleAddContribution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSummary) return;
    const amountPaise = parseCurrencyInput(contribAmount);
    if (amountPaise <= 0) {
      showToast('Please enter a valid contribution amount', 'error');
      return;
    }

    try {
      await api.addVaultContribution(currentSummary.vault.id, {
        amountPaise,
        date: contribDate,
        description: contribDesc || 'Shared savings contribution',
      });
      showToast('Contribution recorded successfully!', 'success');
      setIsContributeModalOpen(false);
      setContribAmount('');
      setContribDesc('');
      loadVaults();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to record contribution', 'error');
    }
  };

  const handleReverseContribution = async (contribId: string) => {
    if (!currentSummary) return;
    const reason = window.prompt('Reason for reversing this contribution:');
    if (!reason) return;

    try {
      await api.reverseVaultContribution(currentSummary.vault.id, contribId, reason);
      showToast('Contribution reversed successfully', 'success');
      loadVaults();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to reverse contribution', 'error');
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSummary) return;
    const amountPaise = parseCurrencyInput(expAmount);
    if (amountPaise <= 0) {
      showToast('Please enter a valid expense amount', 'error');
      return;
    }

    try {
      await api.addVaultExpense(currentSummary.vault.id, {
        amountPaise,
        description: expDesc.trim(),
        date: expDate,
        splitMode: expSplitMode,
      });
      showToast('Shared expense recorded!', 'success');
      setIsExpenseModalOpen(false);
      setExpAmount('');
      setExpDesc('');
      loadVaults();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to record shared expense', 'error');
    }
  };

  const handleRecordSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSummary || !currentSummary.settlement) return;
    const amountPaise = parseCurrencyInput(settleAmount);
    if (amountPaise <= 0) {
      showToast('Please enter a valid settlement payment amount', 'error');
      return;
    }

    const { debtorUid, creditorUid, creditorName } = currentSummary.settlement;
    if (!debtorUid || !creditorUid) return;

    try {
      await api.recordVaultSettlement(currentSummary.vault.id, {
        toUid: creditorUid,
        toName: creditorName || 'Partner',
        amountPaise,
        notes: settleNotes || 'Reimbursement settlement',
      });
      showToast('Settlement payment recorded!', 'success');
      setIsSettleModalOpen(false);
      setSettleAmount('');
      setSettleNotes('');
      loadVaults();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to record settlement', 'error');
    }
  };

  const handleUpdateRatio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSummary) return;
    const memberUids = currentSummary.vault.memberUids;
    if (memberUids.length < 2) return;

    let ratioA = 50;
    let ratioB = 50;
    if (ratioPreset === '60/40') {
      ratioA = 60;
      ratioB = 40;
    } else if (ratioPreset === '70/30') {
      ratioA = 70;
      ratioB = 30;
    } else if (ratioPreset === 'custom') {
      ratioA = customRatioA;
      ratioB = customRatioB;
    }

    if (ratioA + ratioB !== 100) {
      showToast('Ratios must sum to exactly 100%', 'error');
      return;
    }

    try {
      await api.updateVaultRatio(currentSummary.vault.id, {
        [memberUids[0]]: ratioA,
        [memberUids[1]]: ratioB,
      });
      showToast('Target contribution ratio updated!', 'success');
      setIsRatioModalOpen(false);
      loadVaults();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update ratio', 'error');
    }
  };

  const handleLeaveVault = async () => {
    if (!currentSummary) return;
    if (currentSummary.vault.memberUids.length <= 1) {
      showToast('As the only remaining member, you cannot leave the vault. Please archive the vault instead.', 'info');
      return;
    }
    if (!window.confirm('Are you sure you want to leave this vault? Your historical contributions will remain recorded in the vault ledger.')) {
      return;
    }
    try {
      const res = await api.leaveVault(currentSummary.vault.id);
      if (res) {
        showToast('You have left the vault', 'info');
        setSelectedVaultId(null);
        loadVaults();
      } else {
        showToast('Failed to leave vault: server rejected the request', 'error');
      }
    } catch (err: any) {
      if (err?.code === 'LAST_MEMBER_MUST_ARCHIVE' || String(err?.message || '').includes('archive')) {
        showToast('As the only remaining member, you must archive the vault instead of leaving.', 'info');
      } else {
        showToast(err instanceof Error ? err.message : 'Failed to leave vault', 'error');
      }
    }
  };

  const handleArchiveVault = async () => {
    if (!currentSummary) return;
    if (!window.confirm('Are you sure you want to archive this vault? It will become read-only.')) {
      return;
    }
    try {
      await api.archiveVault(currentSummary.vault.id);
      showToast('Vault archived', 'info');
      loadVaults();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to archive vault', 'error');
    }
  };

  if (loading && vaults.length === 0) {
    return <SkeletonDashboard />;
  }

  if (loadError && vaults.length === 0) {
    return (
      <ThemeCard className="p-8 text-center my-6">
        <div className="max-w-md mx-auto flex flex-col items-center">
          <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-[var(--ff-text-primary)] mb-1">
            Unable to Load Joint Vaults
          </h3>
          <p className="text-sm text-[var(--ff-text-muted)] mb-5">{loadError}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <ThemeButton variant="primary" size="sm" onClick={loadVaults}>
              <RotateCcw className="w-4 h-4 mr-2" />
              <span>Retry Connection</span>
            </ThemeButton>
            <ThemeButton
              variant="secondary"
              size="sm"
              onClick={() => {
                setLoadError(null);
                setIsCreateModalOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              <span>Create Joint Vault</span>
            </ThemeButton>
            <ThemeButton
              variant="secondary"
              size="sm"
              onClick={() => {
                setLoadError(null);
                setIsJoinModalOpen(true);
              }}
            >
              <Users className="w-4 h-4 mr-1.5" />
              <span>Join with Code</span>
            </ThemeButton>
          </div>
        </div>
      </ThemeCard>
    );
  }

  if (vaults.length === 0) {
    return (
      <div className="space-y-6">
        <ThemeCard className="p-10 text-center">
          <EmptyStateIllustration
            icon={<Heart className="w-10 h-10 text-rose-500" />}
            title="Couple Shared Savings (Joint Vaults)"
            description="Create a shared savings vault with your partner, contribute towards mutual goals, record joint expenses, and calculate automatic settlements while keeping your personal finance completely private."
            action={
              <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
                <ThemeButton variant="primary" size="sm" onClick={() => setIsCreateModalOpen(true)}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  <span>Create Joint Vault</span>
                </ThemeButton>
                <ThemeButton variant="secondary" size="sm" onClick={() => setIsJoinModalOpen(true)}>
                  <Users className="w-4 h-4 mr-1.5" />
                  <span>Join with Invite Code</span>
                </ThemeButton>
              </div>
            }
          />
        </ThemeCard>

        {/* Create Modal */}
        <ThemeModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title="Create Couple Joint Vault">
          <form onSubmit={handleCreateVault} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-[var(--ff-text-secondary)] block mb-1">Vault Name *</label>
              <ThemeInput
                required
                placeholder="e.g. Dream House Downpayment, Euro Trip"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--ff-text-secondary)] block mb-1">Savings Goal ({currency}) *</label>
              <ThemeInput
                required
                type="number"
                min="1"
                step="any"
                placeholder="e.g. 50000"
                value={createTarget}
                onChange={(e) => setCreateTarget(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--ff-text-secondary)] block mb-1">Monthly Target ({currency}) (Optional)</label>
              <ThemeInput
                type="number"
                min="0"
                step="any"
                placeholder="e.g. 5000"
                value={createMonthly}
                onChange={(e) => setCreateMonthly(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--ff-text-secondary)] block mb-1">Description (Optional)</label>
              <ThemeInput
                placeholder="What are you both saving towards?"
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
              />
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <ThemeButton variant="secondary" size="sm" type="button" onClick={() => setIsCreateModalOpen(false)}>
                Cancel
              </ThemeButton>
              <ThemeButton variant="primary" size="sm" type="submit">
                Create Vault
              </ThemeButton>
            </div>
          </form>
        </ThemeModal>

        {/* Join Modal */}
        <ThemeModal
          isOpen={isJoinModalOpen}
          onClose={() => {
            if (!isJoining) {
              setIsJoinModalOpen(false);
              setJoinError(null);
            }
          }}
          title="Join Partner's Vault"
        >
          <form onSubmit={handleJoinVault} className="space-y-4">
            {joinError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">Unable to Join Vault</p>
                  <p className="mt-0.5">{joinError}</p>
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-[var(--ff-text-secondary)] block mb-1">
                Enter 10-12 Character Invite Code *
              </label>
              <ThemeInput
                required
                disabled={isJoining}
                placeholder="e.g. ABC123XYZ"
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(e.target.value.toUpperCase());
                  if (joinError) setJoinError(null);
                }}
              />
              <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
                Ask your partner to generate a single-use invite code from their vault.
              </span>
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <ThemeButton
                variant="secondary"
                size="sm"
                type="button"
                disabled={isJoining}
                onClick={() => {
                  setIsJoinModalOpen(false);
                  setJoinError(null);
                }}
              >
                Cancel
              </ThemeButton>
              <ThemeButton
                variant="primary"
                size="sm"
                type="submit"
                disabled={isJoining || !joinCode.trim()}
              >
                {isJoining ? 'Joining Vault...' : 'Join Vault'}
              </ThemeButton>
            </div>
          </form>
        </ThemeModal>
      </div>
    );
  }

  const { vault, members, totalContributedPaise, remainingTargetPaise, progressPercentage, memberStats, settlement, milestones, recentActivity } = currentSummary!;
  const isFull = vault.memberUids.length >= 2;
  const isCreator = vault.createdBy === user?.id;

  return (
    <div className="space-y-6">
      {/* Top Header & Vault Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--ff-border)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
            <Heart className="w-5 h-5 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[var(--ff-text-primary)]">{vault.name}</h2>
              <ThemeBadge tone={vault.status === 'active' ? 'accent' : 'neutral'}>
                {vault.status.toUpperCase()}
              </ThemeBadge>
            </div>
            <p className="text-xs text-[var(--ff-text-muted)]">
              {vault.description || 'Couple Shared Savings & Joint Expense Ledger'}
            </p>
          </div>
        </div>

        {/* Vault Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {vaults.length > 1 && (
            <ThemeSelect
              value={vault.id}
              onChange={(e) => setSelectedVaultId(e.target.value)}
              className="text-xs"
              aria-label="Select active vault"
            >
              {vaults.map((v) => (
                <option key={v.vault.id} value={v.vault.id}>
                  {v.vault.name}
                </option>
              ))}
            </ThemeSelect>
          )}

          {!isFull && vault.status === 'active' && (
            <ThemeButton variant="secondary" size="xs" onClick={handleGenerateInvite}>
              <Share2 className="w-3.5 h-3.5 mr-1 text-rose-500" />
              <span>Invite Partner</span>
            </ThemeButton>
          )}

          {isFull && vault.status === 'active' && (
            <ThemeButton variant="secondary" size="xs" onClick={() => setIsRatioModalOpen(true)}>
              <Scale className="w-3.5 h-3.5 mr-1" />
              <span>Target Ratio</span>
            </ThemeButton>
          )}

          <ThemeButton variant="primary" size="xs" onClick={() => setIsContributeModalOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            <span>Contribute</span>
          </ThemeButton>

          {isFull && (
            <ThemeButton variant="secondary" size="xs" onClick={() => setIsExpenseModalOpen(true)}>
              <Receipt className="w-3.5 h-3.5 mr-1" />
              <span>Joint Expense</span>
            </ThemeButton>
          )}

          <ThemeButton variant="ghost" size="xs" onClick={() => setIsCreateModalOpen(true)} title="Create another vault">
            <Plus className="w-3.5 h-3.5" />
          </ThemeButton>

          <ThemeButton
            variant="secondary"
            size="xs"
            onClick={() => {
              setJoinError(null);
              setIsJoinModalOpen(true);
            }}
            title="Join partner's vault with invite code"
          >
            <Users className="w-3.5 h-3.5 mr-1" />
            <span>Join with Code</span>
          </ThemeButton>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <MotionStaggerGrid className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" style={{ gap: 'var(--ff-grid-gap)' }}>
        {/* Total Contributed */}
        <MotionStaggerItem>
          <ThemeCard variant="3d" className="p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)]">
              <span className="font-semibold">Total Contributed</span>
              <Wallet className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-[var(--ff-text-primary)]">
              <AnimatedNumber value={totalContributedPaise} format={(p) => formatCurrency(p, vault.currency)} />
            </div>
            <div className="flex items-center justify-between text-[11px] text-[var(--ff-text-muted)]">
              <span>Goal: {formatCurrency(vault.targetPaise, vault.currency)}</span>
              <span className="font-semibold text-emerald-500">{progressPercentage}%</span>
            </div>
            <AnimatedProgressBar value={totalContributedPaise} max={vault.targetPaise} tone="success" heightClass="h-2" />
          </ThemeCard>
        </MotionStaggerItem>

        {/* Remaining to Target */}
        <MotionStaggerItem>
          <ThemeCard variant="3d" className="p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)]">
              <span className="font-semibold">Remaining Target</span>
              <TrendingUp className="w-4 h-4 text-[var(--ff-accent)]" />
            </div>
            <div className="text-2xl font-bold font-mono text-[var(--ff-text-primary)]">
              <AnimatedNumber value={remainingTargetPaise} format={(p) => formatCurrency(p, vault.currency)} />
            </div>
            <span className="text-[11px] text-[var(--ff-text-muted)] block">
              Monthly target: {formatCurrency(vault.monthlyTargetPaise, vault.currency)}
            </span>
          </ThemeCard>
        </MotionStaggerItem>

        {/* Member A Breakdown */}
        {members[0] && memberStats[members[0].uid] && (
          <MotionStaggerItem>
            <ThemeCard variant="3d" className="p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)]">
                <span className="font-semibold truncate">{members[0].name}</span>
                <ThemeBadge tone="accent">{memberStats[members[0].uid].targetRatioPercent}% Target</ThemeBadge>
              </div>
              <div className="text-xl font-bold font-mono text-[var(--ff-text-primary)]">
                {formatCurrency(memberStats[members[0].uid].totalPaise, vault.currency)}
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--ff-text-muted)]">
                <span>Target: {formatCurrency(memberStats[members[0].uid].targetSharePaise, vault.currency)}</span>
                <span className="font-semibold">{memberStats[members[0].uid].progressPercent}%</span>
              </div>
              <AnimatedProgressBar
                value={memberStats[members[0].uid].totalPaise}
                max={memberStats[members[0].uid].targetSharePaise}
                tone="accent"
                heightClass="h-1.5"
              />
            </ThemeCard>
          </MotionStaggerItem>
        )}

        {/* Member B Breakdown */}
        {members[1] && memberStats[members[1].uid] ? (
          <MotionStaggerItem>
            <ThemeCard variant="3d" className="p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)]">
                <span className="font-semibold truncate">{members[1].name}</span>
                <ThemeBadge tone="accent">{memberStats[members[1].uid].targetRatioPercent}% Target</ThemeBadge>
              </div>
              <div className="text-xl font-bold font-mono text-[var(--ff-text-primary)]">
                {formatCurrency(memberStats[members[1].uid].totalPaise, vault.currency)}
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--ff-text-muted)]">
                <span>Target: {formatCurrency(memberStats[members[1].uid].targetSharePaise, vault.currency)}</span>
                <span className="font-semibold">{memberStats[members[1].uid].progressPercent}%</span>
              </div>
              <AnimatedProgressBar
                value={memberStats[members[1].uid].totalPaise}
                max={memberStats[members[1].uid].targetSharePaise}
                tone="accent"
                heightClass="h-1.5"
              />
            </ThemeCard>
          </MotionStaggerItem>
        ) : (
          <MotionStaggerItem>
            <ThemeCard variant="3d" className="p-4 flex flex-col justify-center items-center text-center space-y-2">
              <Users className="w-6 h-6 text-[var(--ff-text-muted)]" />
              <span className="text-xs font-semibold text-[var(--ff-text-primary)]">Partner Not Joined</span>
              <ThemeButton variant="secondary" size="xs" onClick={handleGenerateInvite}>
                <Share2 className="w-3 h-3 mr-1" />
                <span>Invite Partner</span>
              </ThemeButton>
            </ThemeCard>
          </MotionStaggerItem>
        )}
      </MotionStaggerGrid>

      {/* Net Settlement Banner if shared expenses exist */}
      {settlement && settlement.totalExpensesPaise > 0 && (
        <div
          className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${settlement.settled
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}
        >
          <div className="flex items-center gap-3">
            <Scale className="w-5 h-5 shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-[var(--ff-text-primary)]">
                {settlement.settled ? 'Joint Expenses Fully Settled' : 'Outstanding Expense Settlement'}
              </h4>
              <p className="text-xs text-[var(--ff-text-muted)]">
                {settlement.settled
                  ? 'All shared expenses are completely balanced. Neither partner owes reimbursement.'
                  : `${settlement.debtorName} owes ${settlement.creditorName} ${formatCurrency(
                    Math.abs(settlement.netBalancePaise),
                    vault.currency
                  )} to balance shared expenses.`}
              </p>
            </div>
          </div>

          {!settlement.settled && (
            <ThemeButton variant="primary" size="xs" onClick={() => setIsSettleModalOpen(true)} className="shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              <span>Record Settlement</span>
            </ThemeButton>
          )}
        </div>
      )}

      {/* Milestones Progress Tracker */}
      <ThemeCard className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-bold text-[var(--ff-text-primary)]">Savings Milestones</span>
          </div>
          <span className="text-[11px] text-[var(--ff-text-muted)]">
            {milestones.filter((m) => m.achieved).length} of 4 Milestones Unlocked
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {milestones.map((m) => (
            <div
              key={m.percent}
              className={`p-2.5 rounded-lg border text-center transition-all ${m.achieved
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : 'border-[var(--ff-border)] bg-[var(--ff-card-bg)] text-[var(--ff-text-muted)] opacity-60'
                }`}
            >
              <div className="text-xs font-bold">{m.percent}% Target</div>
              <div className="text-[11px] font-mono mt-0.5">{formatCurrency(m.targetPaise, vault.currency, { compact: true })}</div>
              <span className="text-[10px] font-semibold mt-1 block">
                {m.achieved ? '✓ Achieved' : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      </ThemeCard>

      {/* Navigation Subtabs: Overview / Contributions / Expenses / Activity */}
      <div className="flex items-center gap-2 border-b border-[var(--ff-border)] pb-2 text-xs font-semibold">
        {(['overview', 'contributions', 'expenses', 'activity'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg capitalize transition-colors ${activeTab === tab
                ? 'bg-[var(--ff-accent-soft)] text-[var(--ff-accent-text)]'
                : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
              }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Subtab 1: Overview & Member Ledger */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ThemeCard className="p-4 space-y-3">
            <h4 className="text-xs font-bold text-[var(--ff-text-primary)] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[var(--ff-accent)]" />
              <span>Privacy &amp; Data Isolation Invariants</span>
            </h4>
            <ul className="text-xs text-[var(--ff-text-muted)] space-y-2 list-disc pl-4">
              <li>Each partner can only see records specifically belonging to this Joint Vault.</li>
              <li>Your personal Income, Expenses, Bills, Tasks, Habits and Study data remain strictly private.</li>
              <li>Vault currency is locked to <strong>{vault.currency}</strong> and cannot be altered.</li>
              <li>Contributions and reimbursements are stored with minor unit precision (zero penny-drift).</li>
            </ul>
          </ThemeCard>

          <ThemeCard className="p-4 space-y-3">
            <h4 className="text-xs font-bold text-[var(--ff-text-primary)] flex items-center gap-1.5">
              <Users className="w-4 h-4 text-rose-500" />
              <span>Vault Members ({members.length}/2)</span>
            </h4>
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.uid} className="flex items-center justify-between p-2 rounded-lg bg-[var(--ff-surface-subtle)] text-xs">
                  <div>
                    <span className="font-semibold text-[var(--ff-text-primary)]">{m.name}</span>
                    <span className="text-[11px] text-[var(--ff-text-muted)] ml-2">({m.role})</span>
                  </div>
                  <ThemeBadge tone={m.status === 'active' ? 'accent' : 'neutral'}>
                    {m.status}
                  </ThemeBadge>
                </div>
              ))}
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              {vault.memberUids.length > 1 ? (
                <ThemeButton variant="ghost" size="xs" onClick={handleLeaveVault} className="text-rose-400">
                  <LogOut className="w-3.5 h-3.5 mr-1" />
                  <span>Leave Vault</span>
                </ThemeButton>
              ) : (
                <span className="text-[11px] text-[var(--ff-text-muted)] italic">
                  Sole member: archive vault to close
                </span>
              )}
              {(isCreator || vault.memberUids.length <= 1) && (
                <ThemeButton variant="ghost" size="xs" onClick={handleArchiveVault}>
                  <Archive className="w-3.5 h-3.5 mr-1" />
                  <span>Archive Vault</span>
                </ThemeButton>
              )}
            </div>
          </ThemeCard>
        </div>
      )}

      {/* Subtab 2: Contributions Ledger */}
      {activeTab === 'contributions' && (
        <ThemeCard className="p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--ff-border)]">
            <h4 className="text-xs font-bold text-[var(--ff-text-primary)]">Contribution Ledger</h4>
            <ThemeButton variant="primary" size="xs" onClick={() => setIsContributeModalOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              <span>Add Contribution</span>
            </ThemeButton>
          </div>

          {recentActivity.filter((a) => a.type === 'contribution_added').length === 0 ? (
            <p className="text-xs text-[var(--ff-text-muted)] text-center py-6">No contributions yet.</p>
          ) : (
            <div className="divide-y divide-[var(--ff-border)]">
              {recentActivity
                .filter((a) => a.type === 'contribution_added')
                .map((a) => (
                  <div key={a.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-[var(--ff-text-primary)]">{a.description}</div>
                      <div className="text-[11px] text-[var(--ff-text-muted)] flex items-center gap-1.5 mt-0.5">
                        <Calendar className="w-3 h-3" />
                        <span>{new Date(a.timestamp).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-emerald-400">
                        +{formatCurrency(a.amountPaise || 0, vault.currency)}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </ThemeCard>
      )}

      {/* Subtab 3: Shared Expenses Ledger */}
      {activeTab === 'expenses' && (
        <ThemeCard className="p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--ff-border)]">
            <h4 className="text-xs font-bold text-[var(--ff-text-primary)]">Shared Expenses Ledger</h4>
            <ThemeButton variant="primary" size="xs" onClick={() => setIsExpenseModalOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              <span>Record Expense</span>
            </ThemeButton>
          </div>

          {recentActivity.filter((a) => a.type === 'expense_added').length === 0 ? (
            <p className="text-xs text-[var(--ff-text-muted)] text-center py-6">No joint expenses recorded yet.</p>
          ) : (
            <div className="divide-y divide-[var(--ff-border)]">
              {recentActivity
                .filter((a) => a.type === 'expense_added')
                .map((a) => (
                  <div key={a.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-[var(--ff-text-primary)]">{a.description}</div>
                      <div className="text-[11px] text-[var(--ff-text-muted)] flex items-center gap-1.5 mt-0.5">
                        <Calendar className="w-3 h-3" />
                        <span>{new Date(a.timestamp).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-rose-400">
                        -{formatCurrency(a.amountPaise || 0, vault.currency)}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </ThemeCard>
      )}

      {/* Subtab 4: Real-Time Activity Feed */}
      {activeTab === 'activity' && (
        <ThemeCard className="p-4 space-y-3">
          <h4 className="text-xs font-bold text-[var(--ff-text-primary)]">Real-Time Vault Activity</h4>
          <div className="divide-y divide-[var(--ff-border)]">
            {recentActivity.map((act) => (
              <div key={act.id} className="py-2.5 flex items-start gap-3 text-xs">
                <div className="w-7 h-7 rounded-lg bg-[var(--ff-accent-soft)] text-[var(--ff-accent)] flex items-center justify-center shrink-0 mt-0.5">
                  <Clock className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[var(--ff-text-primary)]">{act.title}</div>
                  <p className="text-[11px] text-[var(--ff-text-muted)]">{act.description}</p>
                  <span className="text-[10px] text-[var(--ff-text-muted)] mt-1 block">
                    {new Date(act.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ThemeCard>
      )}

      {/* MODAL 1: Invite Partner */}
      <ThemeModal isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} title="Invite Partner to Vault">
        <div className="space-y-4">
          <p className="text-xs text-[var(--ff-text-muted)]">
            Share this single-use code with your partner. Once they accept, they will have equal access to contribute and record shared expenses in this vault.
          </p>

          <div className="p-3 rounded-xl border border-[var(--ff-border)] bg-[var(--ff-surface-subtle)] flex items-center justify-between">
            <span className="font-mono font-bold text-sm tracking-widest text-[var(--ff-accent)]">
              {activeInvite?.inviteCode}
            </span>
            <ThemeButton variant="secondary" size="xs" onClick={handleCopyCode}>
              {copiedCode ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
              <span>{copiedCode ? 'Copied' : 'Copy'}</span>
            </ThemeButton>
          </div>

          <div className="text-[11px] text-[var(--ff-text-muted)] flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>Expires in 7 days. Can only be accepted once.</span>
          </div>

          <div className="pt-2 flex justify-end">
            <ThemeButton variant="primary" size="sm" onClick={() => setIsInviteModalOpen(false)}>
              Done
            </ThemeButton>
          </div>
        </div>
      </ThemeModal>

      {/* MODAL 2: Add Contribution */}
      <ThemeModal isOpen={isContributeModalOpen} onClose={() => setIsContributeModalOpen(false)} title="Contribute to Vault">
        <form onSubmit={handleAddContribution} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-[var(--ff-text-secondary)] block mb-1">Contribution Amount ({vault.currency}) *</label>
            <ThemeInput
              required
              type="number"
              min="1"
              step="any"
              placeholder="e.g. 5000"
              value={contribAmount}
              onChange={(e) => setContribAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ff-text-secondary)] block mb-1">Date</label>
            <ThemeInput
              type="date"
              value={contribDate}
              onChange={(e) => setContribDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ff-text-secondary)] block mb-1">Description</label>
            <ThemeInput
              placeholder="e.g. November monthly savings"
              value={contribDesc}
              onChange={(e) => setContribDesc(e.target.value)}
            />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <ThemeButton variant="secondary" size="sm" type="button" onClick={() => setIsContributeModalOpen(false)}>
              Cancel
            </ThemeButton>
            <ThemeButton variant="primary" size="sm" type="submit">
              Save Contribution
            </ThemeButton>
          </div>
        </form>
      </ThemeModal>

      {/* MODAL 3: Record Shared Expense */}
      <ThemeModal isOpen={isExpenseModalOpen} onClose={() => setIsExpenseModalOpen(false)} title="Record Joint Expense">
        <form onSubmit={handleAddExpense} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-[var(--ff-text-secondary)] block mb-1">Expense Description *</label>
            <ThemeInput
              required
              placeholder="e.g. Flight tickets, Hotel booking, Dinner"
              value={expDesc}
              onChange={(e) => setExpDesc(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ff-text-secondary)] block mb-1">Amount Paid ({vault.currency}) *</label>
            <ThemeInput
              required
              type="number"
              min="1"
              step="any"
              placeholder="e.g. 2500"
              value={expAmount}
              onChange={(e) => setExpAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ff-text-secondary)] block mb-1">Split Mode</label>
            <ThemeSelect
              value={expSplitMode}
              onChange={(e) => setExpSplitMode(e.target.value as ExpenseSplitMode)}
              className="text-xs"
            >
              <option value="equal">Equal Split (50/50)</option>
              <option value="ratio">According to Vault Target Ratio</option>
            </ThemeSelect>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ff-text-secondary)] block mb-1">Date</label>
            <ThemeInput
              type="date"
              value={expDate}
              onChange={(e) => setExpDate(e.target.value)}
            />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <ThemeButton variant="secondary" size="sm" type="button" onClick={() => setIsExpenseModalOpen(false)}>
              Cancel
            </ThemeButton>
            <ThemeButton variant="primary" size="sm" type="submit">
              Save Joint Expense
            </ThemeButton>
          </div>
        </form>
      </ThemeModal>

      {/* MODAL 4: Record Settlement */}
      <ThemeModal isOpen={isSettleModalOpen} onClose={() => setIsSettleModalOpen(false)} title="Record Expense Reimbursement">
        <form onSubmit={handleRecordSettlement} className="space-y-4">
          <p className="text-xs text-[var(--ff-text-muted)]">
            Record a reimbursement payment to balance the shared expense ledger.
          </p>
          <div>
            <label className="text-xs font-semibold text-[var(--ff-text-secondary)] block mb-1">Reimbursement Amount ({vault.currency}) *</label>
            <ThemeInput
              required
              type="number"
              min="1"
              step="any"
              placeholder={settlement?.netBalancePaise ? String(Math.abs(settlement.netBalancePaise) / 100) : '0'}
              value={settleAmount}
              onChange={(e) => setSettleAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ff-text-secondary)] block mb-1">Notes (Optional)</label>
            <ThemeInput
              placeholder="e.g. Paid via UPI / Bank transfer"
              value={settleNotes}
              onChange={(e) => setSettleNotes(e.target.value)}
            />
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <ThemeButton variant="secondary" size="sm" type="button" onClick={() => setIsSettleModalOpen(false)}>
              Cancel
            </ThemeButton>
            <ThemeButton variant="primary" size="sm" type="submit">
              Confirm Settlement
            </ThemeButton>
          </div>
        </form>
      </ThemeModal>

      {/* MODAL 5: Target Ratio Configuration */}
      <ThemeModal isOpen={isRatioModalOpen} onClose={() => setIsRatioModalOpen(false)} title="Configure Target Contribution Ratio">
        <form onSubmit={handleUpdateRatio} className="space-y-4">
          <p className="text-xs text-[var(--ff-text-muted)]">
            Set expected savings contribution allocations between you and your partner. This updates visual targets without modifying historical contributions.
          </p>

          <div className="grid grid-cols-3 gap-2">
            {(['50/50', '60/40', '70/30'] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setRatioPreset(preset)}
                className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-all ${ratioPreset === preset
                    ? 'border-[var(--ff-accent)] bg-[var(--ff-accent-soft)] text-[var(--ff-accent-text)]'
                    : 'border-[var(--ff-border)] text-[var(--ff-text-secondary)]'
                  }`}
              >
                {preset}
              </button>
            ))}
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <ThemeButton variant="secondary" size="sm" type="button" onClick={() => setIsRatioModalOpen(false)}>
              Cancel
            </ThemeButton>
            <ThemeButton variant="primary" size="sm" type="submit">
              Apply Target Ratio
            </ThemeButton>
          </div>
        </form>
      </ThemeModal>

      {/* MODAL 6: Join Partner's Vault (Accessible from Active View) */}
      <ThemeModal
        isOpen={isJoinModalOpen}
        onClose={() => {
          if (!isJoining) {
            setIsJoinModalOpen(false);
            setJoinError(null);
          }
        }}
        title="Join Partner's Vault"
      >
        <form onSubmit={handleJoinVault} className="space-y-4">
          {joinError && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Unable to Join Vault</p>
                <p className="mt-0.5">{joinError}</p>
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-[var(--ff-text-secondary)] block mb-1">
              Enter 10-12 Character Invite Code *
            </label>
            <ThemeInput
              required
              disabled={isJoining}
              placeholder="e.g. ABC123XYZ"
              value={joinCode}
              onChange={(e) => {
                setJoinCode(e.target.value.toUpperCase());
                if (joinError) setJoinError(null);
              }}
            />
            <span className="text-[11px] text-[var(--ff-text-muted)] mt-1 block">
              Ask your partner to generate a single-use invite code from their vault.
            </span>
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <ThemeButton
              variant="secondary"
              size="sm"
              type="button"
              disabled={isJoining}
              onClick={() => {
                setIsJoinModalOpen(false);
                setJoinError(null);
              }}
            >
              Cancel
            </ThemeButton>
            <ThemeButton
              variant="primary"
              size="sm"
              type="submit"
              disabled={isJoining || !joinCode.trim()}
            >
              {isJoining ? 'Joining Vault...' : 'Join Vault'}
            </ThemeButton>
          </div>
        </form>
      </ThemeModal>
    </div>
  );
};
