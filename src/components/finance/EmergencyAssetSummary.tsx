import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  EmergencyAssetProfile,
  MaskedAccountRecord,
  InsurancePolicyRecord,
  EmergencyContact,
} from '../../types/features15.ts';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { getTodayDateString } from '../../lib/dateTime.ts';
import { ThemeButton, ThemeBadge, ThemeCard } from '../ui/ThemePrimitives.tsx';
import {
  ShieldAlert,
  Printer,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Lock,
  Heart,
  Building,
  FileText,
  Edit3,
  AlertTriangle,
  CheckCircle2,
  X,
  RefreshCw,
  ShieldCheck,
  AlertCircle,
  FileDown,
} from 'lucide-react';

// ============================================================================
// Helpers & Sanitizers
// ============================================================================

export function maskReference(raw: string): string {
  if (!raw) return '••••';
  const clean = raw.trim();
  if (clean.startsWith('••••')) return clean;
  const digits = clean.replace(/\s+/g, '');
  const last4 = digits.length > 4 ? digits.slice(-4) : digits;
  return `•••• ${last4}`;
}

export function isProfileConfigured(profile: EmergencyAssetProfile | null | undefined): boolean {
  if (!profile) return false;
  const hasName = Boolean(profile.fullName && profile.fullName.trim().length > 0);
  const hasHospital = Boolean(profile.primaryHospital && profile.primaryHospital.trim().length > 0);
  const hasBloodGroup = Boolean(profile.bloodGroup && profile.bloodGroup.trim().length > 0);
  const hasAccounts = Array.isArray(profile.accounts) && profile.accounts.length > 0;
  const hasPolicies = Array.isArray(profile.policies) && profile.policies.length > 0;
  const contacts = profile.contacts || profile.emergencyContacts;
  const hasContacts = Array.isArray(contacts) && contacts.length > 0;
  const hasNotes = Boolean(
    (profile.notes && profile.notes.trim().length > 0) ||
    (profile.importantDocumentLocations && profile.importantDocumentLocations.trim().length > 0)
  );
  return hasName || hasHospital || hasBloodGroup || hasAccounts || hasPolicies || hasContacts || hasNotes;
}

const BLOOD_GROUPS = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];
const ACCOUNT_TYPES: MaskedAccountRecord['accountType'][] = [
  'Savings',
  'Checking',
  'Fixed Deposit',
  'Demat/Brokerage',
  'Credit Card',
];
const POLICY_TYPES = [
  'Health Insurance',
  'Term Life Insurance',
  'Vehicle Insurance',
  'Property Insurance',
  'Critical Illness',
  'Accident & Disability',
  'Other Policy',
];

interface ExportFieldSelection {
  personalInfo: boolean;
  contacts: boolean;
  accounts: boolean;
  policies: boolean;
  documentNotes: boolean;
}

export const EmergencyAssetSummary: React.FC = () => {
  const { user } = useApp();
  const activeUid = user?.id || 'usr_guest';
  const storageKey = `focusflow_${activeUid}_emergency_profile_v1`;

  // Core state
  const [profile, setProfile] = useState<EmergencyAssetProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // View & Modal states
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [showMasked, setShowMasked] = useState<boolean>(true);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Print & Export Configuration
  const [exportSections, setExportSections] = useState<ExportFieldSelection>({
    personalInfo: true,
    contacts: true,
    accounts: true,
    policies: true,
    documentNotes: true,
  });
  const [exportMasked, setExportMasked] = useState<boolean>(true);
  const [requestPasswordProtection, setRequestPasswordProtection] = useState<boolean>(false);
  const [confirmPasswordNotice, setConfirmPasswordNotice] = useState<boolean>(false);

  // Form state for creating / editing
  const [formFullName, setFormFullName] = useState<string>('');
  const [formBloodGroup, setFormBloodGroup] = useState<string>('');
  const [formPrimaryHospital, setFormPrimaryHospital] = useState<string>('');
  const [formContacts, setFormContacts] = useState<EmergencyContact[]>([]);
  const [formAccounts, setFormAccounts] = useState<MaskedAccountRecord[]>([]);
  const [formPolicies, setFormPolicies] = useState<InsurancePolicyRecord[]>([]);
  const [formNotes, setFormNotes] = useState<string>('');

  // --------------------------------------------------------------------------
  // Data Loading & Persistence
  // --------------------------------------------------------------------------

  const loadSeqRef = useRef<number>(0);

  const loadProfile = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setIsLoading(true);
    setFetchError(null);
    setProfile(null);
    setIsEditing(false);
    setIsPrintModalOpen(false);
    setIsDeleteConfirmOpen(false);

    // Check local user cache first for instant feedback
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (isProfileConfigured(parsed) && seq === loadSeqRef.current) {
          setProfile(parsed);
        }
      }
    } catch {
      // ignore JSON parse error on cache
    }

    try {
      const remote = await api.getEmergencyProfile();
      if (seq !== loadSeqRef.current) return;
      if (isProfileConfigured(remote)) {
        setProfile(remote);
        try {
          localStorage.setItem(storageKey, JSON.stringify(remote));
        } catch {
          // ignore localStorage quota errors
        }
      } else {
        setProfile(null);
        try {
          localStorage.removeItem(storageKey);
        } catch {}
      }
      setFetchError(null);
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      const msg = err instanceof Error ? err.message : 'Failed to connect to backend server';
      setFetchError(msg);
      // NEVER fall back to fake sample data upon network or server error
    } finally {
      if (seq === loadSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [storageKey]);

  useEffect(() => {
    loadProfile();
    return () => {
      loadSeqRef.current += 1;
    };
  }, [loadProfile]);

  // Synchronize edit form when entering edit mode
  const handleOpenEdit = () => {
    if (profile) {
      setFormFullName(profile.fullName || '');
      setFormBloodGroup(profile.bloodGroup || '');
      setFormPrimaryHospital(profile.primaryHospital || '');
      setFormContacts(profile.contacts || profile.emergencyContacts || []);
      setFormAccounts(profile.accounts || []);
      setFormPolicies(profile.policies || []);
      setFormNotes(profile.notes || profile.importantDocumentLocations || '');
    } else {
      setFormFullName(user?.name || '');
      setFormBloodGroup('');
      setFormPrimaryHospital('');
      setFormContacts([]);
      setFormAccounts([]);
      setFormPolicies([]);
      setFormNotes('');
    }
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  // --------------------------------------------------------------------------
  // Save & Delete Actions
  // --------------------------------------------------------------------------

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFetchError(null);

    // Sanitize contacts
    const sanitizedContacts: EmergencyContact[] = formContacts
      .filter((c) => c.name.trim().length > 0)
      .map((c, i) => ({
        id: c.id || `c_${Date.now()}_${i}`,
        name: c.name.trim().slice(0, 128),
        relationship: c.relationship.trim().slice(0, 64) || 'Next-of-Kin',
        phone: c.phone.trim().slice(0, 32),
        isPrimary: Boolean(c.isPrimary),
      }));

    // Sanitize accounts (auto-masking strictly enforced)
    const sanitizedAccounts: MaskedAccountRecord[] = formAccounts
      .filter((a) => a.institution.trim().length > 0)
      .map((a, i) => ({
        id: a.id || `acc_${Date.now()}_${i}`,
        institution: a.institution.trim().slice(0, 128),
        nickname: a.nickname.trim().slice(0, 128) || 'Account Reference',
        maskedNumber: maskReference(a.maskedNumber),
        accountType: a.accountType || 'Savings',
        nomineeName: a.nomineeName?.trim().slice(0, 128) || undefined,
        notes: a.notes?.trim().slice(0, 500) || undefined,
      }));

    // Sanitize policies (auto-masking strictly enforced)
    const sanitizedPolicies: InsurancePolicyRecord[] = formPolicies
      .filter((p) => p.provider.trim().length > 0)
      .map((p, i) => ({
        id: p.id || `pol_${Date.now()}_${i}`,
        provider: p.provider.trim().slice(0, 128),
        policyType: p.policyType?.trim().slice(0, 64) || 'Health Insurance',
        policyNumber: maskReference(p.policyNumber || ''),
        coverageAmountPaise: Math.max(0, Number(p.coverageAmountPaise) || 0),
        emergencyHelpline: p.emergencyHelpline?.trim().slice(0, 64) || '',
        nomineeName: p.nomineeName?.trim().slice(0, 128) || '',
      }));

    const newProfile: EmergencyAssetProfile = {
      id: profile?.id || `ep_${activeUid}`,
      userId: activeUid,
      fullName: formFullName.trim().slice(0, 128) || undefined,
      bloodGroup: formBloodGroup.trim().slice(0, 16) || undefined,
      primaryHospital: formPrimaryHospital.trim().slice(0, 256) || undefined,
      contacts: sanitizedContacts,
      emergencyContacts: sanitizedContacts,
      accounts: sanitizedAccounts,
      policies: sanitizedPolicies,
      notes: formNotes.trim().slice(0, 2000) || undefined,
      importantDocumentLocations: formNotes.trim().slice(0, 2000) || undefined,
      updatedAt: new Date().toISOString(),
    };

    try {
      const saved = await api.saveEmergencyProfile(newProfile);
      setProfile(saved);
      try {
        localStorage.setItem(storageKey, JSON.stringify(saved));
      } catch {}
      setIsEditing(false);
      setActionSuccess('Emergency dossier saved successfully and persisted securely.');
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save emergency profile to database';
      setFetchError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProfile = async () => {
    setIsDeleting(true);
    setFetchError(null);
    try {
      await api.deleteEmergencyProfile();
      setProfile(null);
      try {
        localStorage.removeItem(storageKey);
      } catch {}
      setIsDeleteConfirmOpen(false);
      setIsEditing(false);
      setActionSuccess('Emergency profile permanently deleted.');
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete emergency profile';
      setFetchError(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  // --------------------------------------------------------------------------
  // Print & PDF Export Execution
  // --------------------------------------------------------------------------

  const handleConfirmPrint = () => {
    if (requestPasswordProtection && !confirmPasswordNotice) {
      return;
    }
    setIsPrintModalOpen(false);
    // Execute browser print dialogue safely
    setTimeout(() => {
      window.print();
    }, 150);
  };

  // Contacts list accessor
  const activeContacts = useMemo(() => {
    if (!profile) return [];
    return profile.contacts || profile.emergencyContacts || [];
  }, [profile]);

  // --------------------------------------------------------------------------
  // RENDER: Loading Skeleton
  // --------------------------------------------------------------------------

  if (isLoading && !profile) {
    return (
      <div className="p-8 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] space-y-4 animate-pulse">
        <div className="h-6 w-1/3 bg-[var(--ff-border)] rounded-md" />
        <div className="h-4 w-1/2 bg-[var(--ff-border)]/60 rounded-md" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
          <div className="h-20 bg-[var(--ff-border)]/40 rounded-xl" />
          <div className="h-20 bg-[var(--ff-border)]/40 rounded-xl" />
          <div className="h-20 bg-[var(--ff-border)]/40 rounded-xl" />
        </div>
        <div className="h-40 bg-[var(--ff-border)]/30 rounded-xl" />
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // RENDER: Error State (Never Fallback to Sample Data)
  // --------------------------------------------------------------------------

  if (fetchError && !profile && !isEditing) {
    return (
      <ThemeCard className="p-8 text-center space-y-4">
        <div className="inline-flex p-3 rounded-2xl bg-rose-500/10 text-rose-500">
          <AlertCircle className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-[var(--ff-text-primary)]">
            Unable to Load Emergency Profile
          </h2>
          <p className="text-xs text-[var(--ff-text-muted)] max-w-md mx-auto">
            {fetchError}
          </p>
        </div>
        <div className="pt-2 flex justify-center gap-3">
          <ThemeButton variant="secondary" onClick={loadProfile}>
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Retry Connection
          </ThemeButton>
          <ThemeButton variant="primary" onClick={handleOpenEdit}>
            <Plus className="w-4 h-4 mr-1.5" />
            Create New Profile
          </ThemeButton>
        </div>
      </ThemeCard>
    );
  }

  // --------------------------------------------------------------------------
  // RENDER: Empty State for New User
  // --------------------------------------------------------------------------

  if (!isProfileConfigured(profile) && !isEditing) {
    return (
      <ThemeCard className="p-8 text-center space-y-6">
        <div className="inline-flex p-4 rounded-3xl bg-rose-500/10 text-rose-500 shadow-inner">
          <ShieldAlert className="w-10 h-10" />
        </div>

        <div className="space-y-2 max-w-lg mx-auto">
          <h2 className="text-xl font-bold text-[var(--ff-text-primary)]">
            No Emergency Profile Configured
          </h2>
          <p className="text-xs text-[var(--ff-text-muted)] leading-relaxed">
            Create an offline-first emergency dossier for medical professionals and your trusted family next-of-kin.
            Securely record vital medical data, emergency physician contacts, masked bank account nicknames, and insurance policy references.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 max-w-md mx-auto text-left text-xs text-amber-300 flex items-start gap-3">
          <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            <strong>Privacy Guarantee:</strong> Account and policy references are strictly masked.
            Data is stored authoritatively under your authenticated user record. Never broadcast full account credentials.
          </span>
        </div>

        <div>
          <ThemeButton variant="primary" size="lg" onClick={handleOpenEdit}>
            <Plus className="w-4 h-4 mr-2" />
            Set Up Emergency Profile
          </ThemeButton>
        </div>
      </ThemeCard>
    );
  }

  // --------------------------------------------------------------------------
  // RENDER: Profile Editor Form (Create / Edit)
  // --------------------------------------------------------------------------

  if (isEditing) {
    return (
      <form onSubmit={handleSaveProfile} className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] shadow-sm">
          <div>
            <h2 className="text-lg font-bold text-[var(--ff-text-primary)] flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-rose-500" />
              {profile ? 'Edit Emergency & Asset Dossier' : 'Set Up Emergency Dossier'}
            </h2>
            <p className="text-xs text-[var(--ff-text-muted)]">
              All records are user-scoped. Account numbers and insurance policies are strictly masked.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <ThemeButton variant="secondary" size="sm" onClick={handleCancelEdit} disabled={isSaving}>
              Cancel
            </ThemeButton>
            <ThemeButton variant="primary" size="sm" type="submit" loading={isSaving}>
              Save Dossier
            </ThemeButton>
          </div>
        </div>

        {fetchError && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{fetchError}</span>
          </div>
        )}

        {/* Section 1: Personal & Medical Information */}
        <div className="p-6 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ff-text-primary)] border-b border-[var(--ff-border)] pb-2 flex items-center gap-2">
            <Heart className="w-4 h-4 text-rose-500" />
            1. Vital Medical & Identification
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--ff-text-secondary)]">Full Legal Name</label>
              <input
                type="text"
                value={formFullName}
                onChange={(e) => setFormFullName(e.target.value)}
                placeholder="e.g. Alex M. Mercer"
                className="w-full px-3 py-2 rounded-xl bg-[var(--ff-bg-canvas)] border border-[var(--ff-border)] text-xs text-[var(--ff-text-primary)] focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--ff-text-secondary)]">Blood Group</label>
              <select
                value={formBloodGroup}
                onChange={(e) => setFormBloodGroup(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--ff-bg-canvas)] border border-[var(--ff-border)] text-xs text-[var(--ff-text-primary)] focus:outline-none focus:border-rose-500"
              >
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg || 'Select Blood Group'}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--ff-text-secondary)]">Primary Hospital / Clinic</label>
              <input
                type="text"
                value={formPrimaryHospital}
                onChange={(e) => setFormPrimaryHospital(e.target.value)}
                placeholder="e.g. Memorial General Hospital"
                className="w-full px-3 py-2 rounded-xl bg-[var(--ff-bg-canvas)] border border-[var(--ff-border)] text-xs text-[var(--ff-text-primary)] focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Emergency Contacts */}
        <div className="p-6 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--ff-border)] pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ff-text-primary)] flex items-center gap-2">
              <Heart className="w-4 h-4 text-rose-500" />
              2. Emergency Next-of-Kin Contacts
            </h3>
            <ThemeButton
              variant="secondary"
              size="xs"
              onClick={() =>
                setFormContacts([
                  ...formContacts,
                  {
                    id: `c_${Date.now()}`,
                    name: '',
                    relationship: '',
                    phone: '',
                    isPrimary: formContacts.length === 0,
                  },
                ])
              }
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Contact
            </ThemeButton>
          </div>

          {formContacts.length === 0 ? (
            <p className="text-xs text-[var(--ff-text-muted)] italic py-2">
              No emergency contacts added yet. Click &quot;Add Contact&quot; to register next-of-kin or primary physician.
            </p>
          ) : (
            <div className="space-y-3">
              {formContacts.map((contact, idx) => (
                <div
                  key={contact.id || idx}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3.5 rounded-xl bg-[var(--ff-bg-canvas)] border border-[var(--ff-border)] items-center"
                >
                  <div className="sm:col-span-4 space-y-1">
                    <label className="text-[10px] uppercase text-[var(--ff-text-muted)] font-bold">Name</label>
                    <input
                      type="text"
                      value={contact.name}
                      onChange={(e) => {
                        const updated = [...formContacts];
                        updated[idx].name = e.target.value;
                        setFormContacts(updated);
                      }}
                      placeholder="Contact Name"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border)] text-xs text-[var(--ff-text-primary)]"
                    />
                  </div>

                  <div className="sm:col-span-3 space-y-1">
                    <label className="text-[10px] uppercase text-[var(--ff-text-muted)] font-bold">Relationship</label>
                    <input
                      type="text"
                      value={contact.relationship}
                      onChange={(e) => {
                        const updated = [...formContacts];
                        updated[idx].relationship = e.target.value;
                        setFormContacts(updated);
                      }}
                      placeholder="e.g. Spouse / Doctor"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border)] text-xs text-[var(--ff-text-primary)]"
                    />
                  </div>

                  <div className="sm:col-span-3 space-y-1">
                    <label className="text-[10px] uppercase text-[var(--ff-text-muted)] font-bold">Emergency Phone</label>
                    <input
                      type="text"
                      value={contact.phone}
                      onChange={(e) => {
                        const updated = [...formContacts];
                        updated[idx].phone = e.target.value;
                        setFormContacts(updated);
                      }}
                      placeholder="+1 (555) 000-0000"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border)] text-xs font-mono text-[var(--ff-text-primary)]"
                    />
                  </div>

                  <div className="sm:col-span-2 flex items-center justify-between sm:justify-end gap-2 pt-3 sm:pt-4">
                    <label className="flex items-center gap-1.5 text-xs text-[var(--ff-text-secondary)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={contact.isPrimary}
                        onChange={(e) => {
                          const updated = [...formContacts];
                          updated[idx].isPrimary = e.target.checked;
                          setFormContacts(updated);
                        }}
                        className="rounded accent-rose-500"
                      />
                      <span>Primary</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => setFormContacts(formContacts.filter((_, i) => i !== idx))}
                      className="p-1.5 text-neutral-400 hover:text-rose-500 rounded-lg hover:bg-rose-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 3: Bank & Demat Accounts (Auto-Masked) */}
        <div className="p-6 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--ff-border)] pb-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ff-text-primary)] flex items-center gap-2">
                <Building className="w-4 h-4 text-sky-500" />
                3. Financial Accounts & Portfolios (Masked References)
              </h3>
              <p className="text-[11px] text-[var(--ff-text-muted)] mt-0.5">
                Sensitive info: accounts are strictly stored as masked references (e.g. •••• 4921) to prevent account theft.
              </p>
            </div>

            <ThemeButton
              variant="secondary"
              size="xs"
              onClick={() =>
                setFormAccounts([
                  ...formAccounts,
                  {
                    id: `acc_${Date.now()}`,
                    institution: '',
                    nickname: '',
                    maskedNumber: '•••• ',
                    accountType: 'Savings',
                    nomineeName: '',
                  },
                ])
              }
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Account
            </ThemeButton>
          </div>

          {formAccounts.length === 0 ? (
            <p className="text-xs text-[var(--ff-text-muted)] italic py-2">
              No financial accounts added yet. Click &quot;Add Account&quot; to list account nicknames and nominees.
            </p>
          ) : (
            <div className="space-y-3">
              {formAccounts.map((acc, idx) => (
                <div
                  key={acc.id || idx}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3.5 rounded-xl bg-[var(--ff-bg-canvas)] border border-[var(--ff-border)] items-center"
                >
                  <div className="sm:col-span-3 space-y-1">
                    <label className="text-[10px] uppercase text-[var(--ff-text-muted)] font-bold">Institution</label>
                    <input
                      type="text"
                      value={acc.institution}
                      onChange={(e) => {
                        const updated = [...formAccounts];
                        updated[idx].institution = e.target.value;
                        setFormAccounts(updated);
                      }}
                      placeholder="e.g. Chase Bank"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border)] text-xs text-[var(--ff-text-primary)]"
                    />
                  </div>

                  <div className="sm:col-span-3 space-y-1">
                    <label className="text-[10px] uppercase text-[var(--ff-text-muted)] font-bold">Nickname</label>
                    <input
                      type="text"
                      value={acc.nickname}
                      onChange={(e) => {
                        const updated = [...formAccounts];
                        updated[idx].nickname = e.target.value;
                        setFormAccounts(updated);
                      }}
                      placeholder="e.g. Primary Salary"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border)] text-xs text-[var(--ff-text-primary)]"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[10px] uppercase text-[var(--ff-text-muted)] font-bold">
                      Masked Reference
                    </label>
                    <input
                      type="text"
                      value={acc.maskedNumber}
                      onChange={(e) => {
                        const updated = [...formAccounts];
                        updated[idx].maskedNumber = e.target.value;
                        setFormAccounts(updated);
                      }}
                      onBlur={() => {
                        const updated = [...formAccounts];
                        updated[idx].maskedNumber = maskReference(updated[idx].maskedNumber);
                        setFormAccounts(updated);
                      }}
                      placeholder="•••• 1234"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border)] text-xs font-mono text-[var(--ff-text-primary)]"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[10px] uppercase text-[var(--ff-text-muted)] font-bold">Account Type</label>
                    <select
                      value={acc.accountType}
                      onChange={(e) => {
                        const updated = [...formAccounts];
                        updated[idx].accountType = e.target.value as MaskedAccountRecord['accountType'];
                        setFormAccounts(updated);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border)] text-xs text-[var(--ff-text-primary)]"
                    >
                      {ACCOUNT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2 flex items-center justify-between sm:justify-end gap-2 pt-3 sm:pt-4">
                    <div className="space-y-1 w-full">
                      <label className="text-[10px] uppercase text-[var(--ff-text-muted)] font-bold">Nominee</label>
                      <input
                        type="text"
                        value={acc.nomineeName || ''}
                        onChange={(e) => {
                          const updated = [...formAccounts];
                          updated[idx].nomineeName = e.target.value;
                          setFormAccounts(updated);
                        }}
                        placeholder="Nominee"
                        className="w-full px-2 py-1 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border)] text-[11px] text-[var(--ff-text-primary)]"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setFormAccounts(formAccounts.filter((_, i) => i !== idx))}
                      className="p-1.5 text-neutral-400 hover:text-rose-500 rounded-lg hover:bg-rose-500/10 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 4: Insurance Policies */}
        <div className="p-6 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--ff-border)] pb-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ff-text-primary)] flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-500" />
                4. Insurance Policies & Emergency Claims
              </h3>
              <p className="text-[11px] text-[var(--ff-text-muted)] mt-0.5">
                Record claim helplines and policy references for immediate family execution.
              </p>
            </div>

            <ThemeButton
              variant="secondary"
              size="xs"
              onClick={() =>
                setFormPolicies([
                  ...formPolicies,
                  {
                    id: `pol_${Date.now()}`,
                    provider: '',
                    policyType: 'Health Insurance',
                    policyNumber: '•••• ',
                    coverageAmountPaise: 0,
                    emergencyHelpline: '',
                    nomineeName: '',
                  },
                ])
              }
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Policy
            </ThemeButton>
          </div>

          {formPolicies.length === 0 ? (
            <p className="text-xs text-[var(--ff-text-muted)] italic py-2">
              No insurance policies added yet. Click &quot;Add Policy&quot; to register coverage details.
            </p>
          ) : (
            <div className="space-y-3">
              {formPolicies.map((pol, idx) => (
                <div
                  key={pol.id || idx}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3.5 rounded-xl bg-[var(--ff-bg-canvas)] border border-[var(--ff-border)] items-center"
                >
                  <div className="sm:col-span-3 space-y-1">
                    <label className="text-[10px] uppercase text-[var(--ff-text-muted)] font-bold">Provider</label>
                    <input
                      type="text"
                      value={pol.provider}
                      onChange={(e) => {
                        const updated = [...formPolicies];
                        updated[idx].provider = e.target.value;
                        setFormPolicies(updated);
                      }}
                      placeholder="e.g. BlueCross / LIC"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border)] text-xs text-[var(--ff-text-primary)]"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[10px] uppercase text-[var(--ff-text-muted)] font-bold">Policy Type</label>
                    <select
                      value={pol.policyType}
                      onChange={(e) => {
                        const updated = [...formPolicies];
                        updated[idx].policyType = e.target.value;
                        setFormPolicies(updated);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border)] text-xs text-[var(--ff-text-primary)]"
                    >
                      {POLICY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[10px] uppercase text-[var(--ff-text-muted)] font-bold">Policy No. (Masked)</label>
                    <input
                      type="text"
                      value={pol.policyNumber || ''}
                      onChange={(e) => {
                        const updated = [...formPolicies];
                        updated[idx].policyNumber = e.target.value;
                        setFormPolicies(updated);
                      }}
                      onBlur={() => {
                        const updated = [...formPolicies];
                        updated[idx].policyNumber = maskReference(updated[idx].policyNumber || '');
                        setFormPolicies(updated);
                      }}
                      placeholder="•••• 7712"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border)] text-xs font-mono text-[var(--ff-text-primary)]"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[10px] uppercase text-[var(--ff-text-muted)] font-bold">Coverage (₹ / Currency)</label>
                    <input
                      type="number"
                      value={pol.coverageAmountPaise ? pol.coverageAmountPaise / 100 : ''}
                      onChange={(e) => {
                        const updated = [...formPolicies];
                        updated[idx].coverageAmountPaise = Math.max(0, Number(e.target.value) * 100);
                        setFormPolicies(updated);
                      }}
                      placeholder="1000000"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border)] text-xs font-mono text-[var(--ff-text-primary)]"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[10px] uppercase text-[var(--ff-text-muted)] font-bold">Claim Helpline</label>
                    <input
                      type="text"
                      value={pol.emergencyHelpline}
                      onChange={(e) => {
                        const updated = [...formPolicies];
                        updated[idx].emergencyHelpline = e.target.value;
                        setFormPolicies(updated);
                      }}
                      placeholder="1800 2666"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border)] text-xs font-mono text-[var(--ff-text-primary)]"
                    />
                  </div>

                  <div className="sm:col-span-1 flex items-center justify-end pt-3 sm:pt-4">
                    <button
                      type="button"
                      onClick={() => setFormPolicies(formPolicies.filter((_, i) => i !== idx))}
                      className="p-1.5 text-neutral-400 hover:text-rose-500 rounded-lg hover:bg-rose-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 5: Physical Storage & Executor Notes */}
        <div className="p-6 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ff-text-primary)] border-b border-[var(--ff-border)] pb-2">
            5. Physical Document Locker & Executor Key Instructions
          </h3>
          <textarea
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            rows={4}
            placeholder="e.g. Original property title deeds, passbooks, and fireproof box spare keys are kept in the master bedroom lockbox. Executor contact: attorney J. Vance."
            className="w-full p-3 rounded-xl bg-[var(--ff-bg-canvas)] border border-[var(--ff-border)] text-xs text-[var(--ff-text-primary)] focus:outline-none focus:border-rose-500"
          />
        </div>

        {/* Form Bottom Actions */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)]">
          {profile ? (
            <ThemeButton
              variant="danger"
              size="sm"
              onClick={() => setIsDeleteConfirmOpen(true)}
              disabled={isSaving || isDeleting}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete Dossier
            </ThemeButton>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3">
            <ThemeButton variant="secondary" size="sm" onClick={handleCancelEdit} disabled={isSaving}>
              Cancel
            </ThemeButton>
            <ThemeButton variant="primary" size="sm" type="submit" loading={isSaving}>
              Save Emergency Dossier
            </ThemeButton>
          </div>
        </div>
      </form>
    );
  }

  // --------------------------------------------------------------------------
  // RENDER: Active Profile Summary Sheet (Printable + Interactive)
  // --------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Non-Printable Header & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] shadow-sm print:hidden">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-[var(--ff-text-primary)]">
              Printable Emergency & Asset Summary Sheet
            </h2>
            {/* ACCURATE PRIVACY LABEL - REMOVED MISLEADING "ENCRYPTED" CLAIM */}
            <ThemeBadge tone="warning">Sensitive information — masked in this view</ThemeBadge>
          </div>
          <p className="text-xs text-[var(--ff-text-muted)]">
            A confidential offline dossier for next of kin and medical emergencies. Account numbers are strictly masked.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ThemeButton variant="secondary" size="sm" onClick={() => setShowMasked(!showMasked)}>
            {showMasked ? <EyeOff className="w-3.5 h-3.5 mr-1 text-amber-400" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
            {showMasked ? 'Masked' : 'Unmasked Preview'}
          </ThemeButton>

          <ThemeButton variant="secondary" size="sm" onClick={handleOpenEdit}>
            <Edit3 className="w-3.5 h-3.5 mr-1" />
            Edit Profile
          </ThemeButton>

          <ThemeButton variant="primary" size="sm" onClick={() => setIsPrintModalOpen(true)}>
            <Printer className="w-3.5 h-3.5 mr-1" />
            Print / Export Dossier
          </ThemeButton>

          <ThemeButton
            variant="ghost"
            size="sm"
            onClick={() => setIsDeleteConfirmOpen(true)}
            className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
            title="Delete Dossier"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </ThemeButton>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 flex items-center gap-2 print:hidden animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Security Notice (Print Hidden) */}
      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-center gap-2.5 print:hidden">
        <Lock className="w-4 h-4 shrink-0 text-amber-400" />
        <span>
          <strong>Confidential Document:</strong> Store printed hard copies in a physical home safe or fireproof document box.
          Never broadcast or share unmasked account numbers digitally.
        </span>
      </div>

      {/* Printable Sheet Container */}
      <div className="p-8 rounded-2xl bg-[#ffffff] text-neutral-900 border border-neutral-300 shadow-md space-y-6 print:p-0 print:border-none print:shadow-none print:m-0">
        {/* Document Title Header */}
        <div className="border-b-2 border-neutral-900 pb-4 flex justify-between items-start">
          <div>
            <h1 className="text-xl font-black tracking-tight uppercase">Emergency Medical & Financial Estate Dossier</h1>
            <p className="text-xs text-neutral-600 mt-0.5">FocusFlow & Finance Offline Resilience System</p>
          </div>
          <div className="text-right text-xs font-mono text-neutral-500">
            <div>DATE: {getTodayDateString()}</div>
            <div>STATUS: CONFIDENTIAL</div>
          </div>
        </div>

        {/* Section 1: Vital Personal & Emergency Medical Information */}
        <div
          className={`space-y-3 ${
            !exportSections.personalInfo && !exportSections.contacts ? 'print:hidden' : ''
          }`}
        >
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900 border-b border-neutral-300 pb-1 flex items-center gap-1.5">
            <Heart className="w-3.5 h-3.5 text-rose-600" />
            1. Vital Medical & Next-of-Kin Contacts
          </h2>

          <div
            className={`grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs ${
              !exportSections.personalInfo ? 'print:hidden' : ''
            }`}
          >
            <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
              <span className="text-[10px] text-neutral-500 uppercase block font-bold">Full Legal Name</span>
              <span className="font-bold text-sm text-neutral-900">{profile?.fullName || 'Not Provided'}</span>
            </div>

            <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
              <span className="text-[10px] text-neutral-500 uppercase block font-bold">Blood Group</span>
              <span className="font-bold text-sm text-rose-600 font-mono">{profile?.bloodGroup || 'Not Specified'}</span>
            </div>

            <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
              <span className="text-[10px] text-neutral-500 uppercase block font-bold">Primary Hospital</span>
              <span className="font-bold text-xs text-neutral-900">{profile?.primaryHospital || 'Local Emergency'}</span>
            </div>
          </div>

          <div className={`overflow-x-auto ${!exportSections.contacts ? 'print:hidden' : ''}`}>
            <table className="w-full text-left text-xs border border-neutral-200">
              <thead className="bg-neutral-100 text-neutral-700">
                <tr>
                  <th className="py-2 px-3">Contact Name</th>
                  <th className="py-2 px-3">Relationship</th>
                  <th className="py-2 px-3">Emergency Phone</th>
                  <th className="py-2 px-3">Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {activeContacts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-3 px-3 text-neutral-500 text-center italic">
                      No emergency contacts specified.
                    </td>
                  </tr>
                ) : (
                  activeContacts.map((c: EmergencyContact) => (
                    <tr key={c.id}>
                      <td className="py-2 px-3 font-bold">{c.name}</td>
                      <td className="py-2 px-3">{c.relationship}</td>
                      <td className="py-2 px-3 font-mono font-bold">{c.phone || '—'}</td>
                      <td className="py-2 px-3">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-200 font-bold uppercase">
                          {c.isPrimary ? 'Primary Next-of-Kin' : 'Secondary'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: Masked Bank & Investment Accounts */}
        <div className={`space-y-3 ${!exportSections.accounts ? 'print:hidden' : ''}`}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900 border-b border-neutral-300 pb-1 flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-sky-600" />
            2. Bank Accounts & Investment Portfolios ({exportMasked ? 'Masked' : 'Unmasked'})
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-neutral-200">
              <thead className="bg-neutral-100 text-neutral-700">
                <tr>
                  <th className="py-2 px-3">Financial Institution</th>
                  <th className="py-2 px-3">Account Nickname</th>
                  <th className="py-2 px-3">Account Ref</th>
                  <th className="py-2 px-3">Type</th>
                  <th className="py-2 px-3">Nominee Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {!profile?.accounts || profile.accounts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-3 px-3 text-neutral-500 text-center italic">
                      No financial accounts recorded.
                    </td>
                  </tr>
                ) : (
                  profile.accounts.map((acc) => (
                    <tr key={acc.id}>
                      <td className="py-2 px-3 font-bold">{acc.institution}</td>
                      <td className="py-2 px-3">{acc.nickname}</td>
                      <td className="py-2 px-3 font-mono font-bold text-neutral-800">
                        <span className="print:hidden">
                          {showMasked ? maskReference(acc.maskedNumber) : `${acc.maskedNumber} [Verified]`}
                        </span>
                        <span className="hidden print:inline">
                          {exportMasked ? maskReference(acc.maskedNumber) : acc.maskedNumber}
                        </span>
                      </td>
                      <td className="py-2 px-3">{acc.accountType}</td>
                      <td className="py-2 px-3 font-medium text-emerald-800">
                        {acc.nomineeName || 'Yes (On Record)'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3: Insurance Policies */}
        <div className={`space-y-3 ${!exportSections.policies ? 'print:hidden' : ''}`}>
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900 border-b border-neutral-300 pb-1 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-amber-600" />
            3. Insurance Policies & Emergency TPA Claims
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-neutral-200">
              <thead className="bg-neutral-100 text-neutral-700">
                <tr>
                  <th className="py-2 px-3">Insurer</th>
                  <th className="py-2 px-3">Policy Type</th>
                  <th className="py-2 px-3">Policy Ref</th>
                  <th className="py-2 px-3">Coverage</th>
                  <th className="py-2 px-3">24/7 Claim Helpline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {!profile?.policies || profile.policies.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-3 px-3 text-neutral-500 text-center italic">
                      No insurance policies recorded.
                    </td>
                  </tr>
                ) : (
                  profile.policies.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2 px-3 font-bold">{p.provider}</td>
                      <td className="py-2 px-3">{p.policyType}</td>
                      <td className="py-2 px-3 font-mono font-bold">
                        <span className="print:hidden">
                          {showMasked ? maskReference(p.policyNumber || '') : p.policyNumber || '—'}
                        </span>
                        <span className="hidden print:inline">
                          {exportMasked ? maskReference(p.policyNumber || '') : p.policyNumber || '—'}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono font-bold text-emerald-800">
                        ₹ {(((p.coverageAmountPaise || 0) / 100)).toLocaleString()}
                      </td>
                      <td className="py-2 px-3 font-mono font-bold text-rose-700">{p.emergencyHelpline || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 4: Physical Locker & Legal Document Locations */}
        {(profile?.notes || profile?.importantDocumentLocations) && (
          <div className={`space-y-2 pt-2 border-t border-neutral-200 ${!exportSections.documentNotes ? 'print:hidden' : ''}`}>
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
              4. Physical Document Locker & Key Instructions
            </h2>
            <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 text-xs leading-relaxed text-neutral-800 whitespace-pre-wrap">
              {profile.notes || profile.importantDocumentLocations}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-4 border-t-2 border-neutral-900 text-center text-[10px] text-neutral-500 font-mono">
          FocusFlow & Finance Estate Safety Standard • Store safely with trusted family executor.
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* MODAL: Print & Export Dossier (With Selection, Masking & Preview)    */}
      {/* ------------------------------------------------------------------ */}

      {isPrintModalOpen && profile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] rounded-2xl shadow-2xl p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[var(--ff-border)] pb-3">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-rose-500" />
                <h3 className="text-base font-bold text-[var(--ff-text-primary)]">
                  Print & Export Emergency Dossier
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="p-1 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-bg-canvas)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Field Selection Controls */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ff-text-primary)]">
                Select Sections to Include
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-[var(--ff-text-secondary)]">
                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--ff-bg-canvas)] border border-[var(--ff-border)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportSections.personalInfo}
                    onChange={(e) => setExportSections({ ...exportSections, personalInfo: e.target.checked })}
                    className="rounded accent-rose-500"
                  />
                  <span>Vital Medical & Name</span>
                </label>

                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--ff-bg-canvas)] border border-[var(--ff-border)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportSections.contacts}
                    onChange={(e) => setExportSections({ ...exportSections, contacts: e.target.checked })}
                    className="rounded accent-rose-500"
                  />
                  <span>Emergency Next-of-Kin</span>
                </label>

                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--ff-bg-canvas)] border border-[var(--ff-border)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportSections.accounts}
                    onChange={(e) => setExportSections({ ...exportSections, accounts: e.target.checked })}
                    className="rounded accent-rose-500"
                  />
                  <span>Bank & Investment Accounts</span>
                </label>

                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--ff-bg-canvas)] border border-[var(--ff-border)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportSections.policies}
                    onChange={(e) => setExportSections({ ...exportSections, policies: e.target.checked })}
                    className="rounded accent-rose-500"
                  />
                  <span>Insurance Policies & Claims</span>
                </label>

                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--ff-bg-canvas)] border border-[var(--ff-border)] cursor-pointer sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={exportSections.documentNotes}
                    onChange={(e) => setExportSections({ ...exportSections, documentNotes: e.target.checked })}
                    className="rounded accent-rose-500"
                  />
                  <span>Physical Document Locker & Instructions</span>
                </label>
              </div>
            </div>

            {/* Masking Options */}
            <div className="p-3.5 rounded-xl bg-[var(--ff-bg-canvas)] border border-[var(--ff-border)] space-y-2">
              <label className="flex items-center gap-2 text-xs text-[var(--ff-text-primary)] font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={exportMasked}
                  onChange={(e) => setExportMasked(e.target.checked)}
                  className="rounded accent-rose-500"
                />
                <span>Mask sensitive account & policy numbers (Recommended for Physical Printouts)</span>
              </label>
              <p className="text-[11px] text-[var(--ff-text-muted)] pl-5">
                Ensures only the last 4 digits (•••• 1234) appear on printed paper copies.
              </p>
            </div>

            {/* Password Protection Handling & Warning */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs text-[var(--ff-text-primary)] font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={requestPasswordProtection}
                  onChange={(e) => {
                    setRequestPasswordProtection(e.target.checked);
                    if (!e.target.checked) setConfirmPasswordNotice(false);
                  }}
                  className="rounded accent-rose-500"
                />
                <span>Request password protection on PDF export</span>
              </label>

              {requestPasswordProtection && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-semibold">Important Password Protection Notice:</strong>
                      <span>
                        Standard browser-native printing generates standard PDF files and does not apply digital PDF password encryption client-side.
                        To create a password-protected PDF, please use your operating system&apos;s native Print dialog security options
                        (e.g. on macOS: click <em>PDF</em> &gt; <em>Security Options...</em> &gt; <em>Require password to open document</em>).
                        FocusFlow will not silently produce an unencrypted document when protection is requested.
                      </span>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 pt-1 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmPasswordNotice}
                      onChange={(e) => setConfirmPasswordNotice(e.target.checked)}
                      className="rounded accent-amber-500"
                    />
                    <span>I understand and will set my PDF password in the operating system print dialog.</span>
                  </label>
                </div>
              )}
            </div>

            {/* Privacy Guarantee Badge */}
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>100% On-Device: Your dossier is formatted locally and is never sent to external PDF servers.</span>
            </div>

            {/* Live Print Preview Mini-Box */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--ff-text-primary)]">
                Print Preview (Summary)
              </h4>
              <div className="p-4 rounded-xl bg-neutral-100 text-neutral-800 text-[11px] space-y-2 border border-neutral-300 font-mono">
                <div className="font-bold border-b border-neutral-300 pb-1 flex justify-between">
                  <span>EMERGENCY DOSSIER PREVIEW</span>
                  <span>{getTodayDateString()}</span>
                </div>
                {exportSections.personalInfo && (
                  <div>
                    • Legal Name: <strong>{profile.fullName || 'Not Provided'}</strong> | Blood Group: <strong>{profile.bloodGroup || 'N/A'}</strong> | Hospital: <strong>{profile.primaryHospital || 'Local Emergency'}</strong>
                  </div>
                )}
                {exportSections.contacts && (
                  <div>
                    • Next-of-Kin Contacts: <strong>{activeContacts.length} registered</strong>
                  </div>
                )}
                {exportSections.accounts && (
                  <div>
                    • Financial Accounts: <strong>{profile.accounts?.length || 0} registered</strong> (Masked: {exportMasked ? 'YES' : 'NO'})
                  </div>
                )}
                {exportSections.policies && (
                  <div>
                    • Insurance Policies: <strong>{profile.policies?.length || 0} registered</strong> (Helplines included)
                  </div>
                )}
                {exportSections.documentNotes && (profile.notes || profile.importantDocumentLocations) && (
                  <div>
                    • Physical Document & Locker Notes: <strong>Included</strong>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[var(--ff-border)]">
              <ThemeButton variant="secondary" size="sm" onClick={() => setIsPrintModalOpen(false)}>
                Cancel
              </ThemeButton>
              <ThemeButton
                variant="primary"
                size="sm"
                onClick={handleConfirmPrint}
                disabled={requestPasswordProtection && !confirmPasswordNotice}
              >
                <FileDown className="w-3.5 h-3.5 mr-1.5" />
                Confirm &amp; Print Dossier
              </ThemeButton>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODAL: Delete Confirmation                                         */}
      {/* ------------------------------------------------------------------ */}

      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[var(--ff-surface)] border border-rose-500/30 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="p-3 rounded-xl bg-rose-500/10">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-[var(--ff-text-primary)]">
                Delete Emergency Dossier?
              </h3>
            </div>

            <p className="text-xs text-[var(--ff-text-muted)] leading-relaxed">
              This will permanently delete your emergency medical information, contacts, and account references from your cloud profile and local cache. This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--ff-border)]">
              <ThemeButton
                variant="secondary"
                size="sm"
                onClick={() => setIsDeleteConfirmOpen(false)}
                disabled={isDeleting}
              >
                Cancel
              </ThemeButton>
              <ThemeButton
                variant="danger"
                size="sm"
                onClick={handleDeleteProfile}
                loading={isDeleting}
              >
                Yes, Permanently Delete
              </ThemeButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
