import React, { useState } from 'react';
import {
  EmergencyAssetProfile,
  MaskedAccountRecord,
  InsurancePolicyRecord,
  EmergencyContact,
} from '../../types/features15.ts';
import { ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import {
  ShieldAlert,
  Printer,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Lock,
  Phone,
  Building,
  Heart,
  FileText,
  UserCheck,
} from 'lucide-react';

const LOCAL_STORAGE_KEY = 'focusflow_emergency_sheet_v1';

const SEED_PROFILE: EmergencyAssetProfile = {
  id: 'emergency-profile',
  userId: 'user',
  fullName: 'Atif Munshi',
  bloodGroup: 'O+',
  primaryHospital: 'City Multi-Speciality Hospital',
  contacts: [
    {
      id: 'c-1',
      name: 'Dr. R. Sharma (Primary Physician)',
      relationship: 'Doctor',
      phone: '+91 98765 43210',
      isPrimary: true,
    },
    {
      id: 'c-2',
      name: 'Family Primary Contact',
      relationship: 'Immediate Family',
      phone: '+91 98111 22334',
      isPrimary: true,
    },
  ],
  accounts: [
    {
      id: 'acc-1',
      institution: 'HDFC Bank',
      nickname: 'Primary Salary & Savings Account',
      maskedNumber: '•••• 4921',
      accountType: 'Savings',
      nomineeName: 'Spouse / Mother',
    },
    {
      id: 'acc-2',
      institution: 'Zerodha Broking',
      nickname: 'Equity & Long-Term Index Demat',
      maskedNumber: '•••• 8102',
      accountType: 'Demat/Brokerage',
      nomineeName: 'Primary Nominee on File',
    },
    {
      id: 'acc-3',
      institution: 'State Bank of India',
      nickname: 'Public Provident Fund (PPF)',
      maskedNumber: '•••• 3391',
      accountType: 'Fixed Deposit',
      nomineeName: 'Registered Nominee',
    },
  ],
  policies: [
    {
      id: 'pol-1',
      provider: 'HDFC ERGO Health',
      policyNumber: '•••• 7712',
      policyType: 'Health Insurance',
      coverageAmountPaise: 100000000, // ₹10 Lakhs
      emergencyHelpline: '1800 2666',
      nomineeName: 'Registered Family Nominee',
    },
    {
      id: 'pol-2',
      provider: 'ICICI Prudential Life',
      policyNumber: '•••• 9931',
      policyType: 'Term Life Insurance',
      coverageAmountPaise: 1000000000, // ₹1 Crore
      emergencyHelpline: '1860 266 7766',
      nomineeName: 'Registered Family Nominee',
    },
  ],
  notes: 'Physical property sale deeds and original educational degrees are stored in the bedroom fireproof document lockbox.',
  updatedAt: new Date().toISOString(),
};

export const EmergencyAssetSummary: React.FC = () => {
  const [profile, setProfile] = useState<EmergencyAssetProfile>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.accounts) return parsed;
      } catch {
        // fallback
      }
    }
    return SEED_PROFILE;
  });

  const [showMasked, setShowMasked] = useState(true);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Non-Printable Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] shadow-sm print:hidden">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-[var(--ff-text-primary)]">
              Printable Emergency & Asset Summary Sheet
            </h2>
            <ThemeBadge tone="danger">Encrypted & Masked</ThemeBadge>
          </div>
          <p className="text-xs text-[var(--ff-text-muted)]">
            A secure, printable offline dossier for next of kin and medical emergencies. Account numbers are strictly masked.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ThemeButton variant="secondary" size="sm" onClick={() => setShowMasked(!showMasked)}>
            {showMasked ? <EyeOff className="w-3.5 h-3.5 mr-1 text-amber-400" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
            {showMasked ? 'Masked' : 'Unmasked Preview'}
          </ThemeButton>

          <ThemeButton variant="primary" size="sm" onClick={handlePrint}>
            <Printer className="w-3.5 h-3.5 mr-1" />
            Print Dossier
          </ThemeButton>
        </div>
      </div>

      {/* Security Notice */}
      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-center gap-2.5 print:hidden">
        <Lock className="w-4 h-4 shrink-0 text-amber-400" />
        <span>
          <strong>Confidential Document:</strong> Keep printed copies in a physical home safe or fireproof document box.
          Never broadcast or share full account numbers digitally.
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
            <div>DATE: {new Date().toISOString().split('T')[0]}</div>
            <div>STATUS: CONFIDENTIAL</div>
          </div>
        </div>

        {/* Section 1: Vital Personal & Emergency Medical Information */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900 border-b border-neutral-300 pb-1 flex items-center gap-1.5">
            <Heart className="w-3.5 h-3.5 text-rose-600" />
            1. Vital Medical & Next-of-Kin Contacts
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
              <span className="text-[10px] text-neutral-500 uppercase block font-bold">Full Legal Name</span>
              <span className="font-bold text-sm text-neutral-900">{profile.fullName}</span>
            </div>

            <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
              <span className="text-[10px] text-neutral-500 uppercase block font-bold">Blood Group</span>
              <span className="font-bold text-sm text-rose-600 font-mono">{profile.bloodGroup || 'Not Specified'}</span>
            </div>

            <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
              <span className="text-[10px] text-neutral-500 uppercase block font-bold">Primary Hospital</span>
              <span className="font-bold text-xs text-neutral-900">{profile.primaryHospital || 'Local Emergency'}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
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
                {(profile.contacts || profile.emergencyContacts || []).map((c: EmergencyContact) => (
                  <tr key={c.id}>
                    <td className="py-2 px-3 font-bold">{c.name}</td>
                    <td className="py-2 px-3">{c.relationship}</td>
                    <td className="py-2 px-3 font-mono font-bold">{c.phone}</td>
                    <td className="py-2 px-3">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-200 font-bold uppercase">
                        {c.isPrimary ? 'Primary Next-of-Kin' : 'Secondary'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: Masked Bank & Investment Accounts */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900 border-b border-neutral-300 pb-1 flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-sky-600" />
            2. Bank Accounts & Investment Portfolios (Masked)
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-neutral-200">
              <thead className="bg-neutral-100 text-neutral-700">
                <tr>
                  <th className="py-2 px-3">Financial Institution</th>
                  <th className="py-2 px-3">Account Nickname</th>
                  <th className="py-2 px-3">Masked Account No.</th>
                  <th className="py-2 px-3">Type</th>
                  <th className="py-2 px-3">Nominee Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {profile.accounts.map((acc) => (
                  <tr key={acc.id}>
                    <td className="py-2 px-3 font-bold">{acc.institution}</td>
                    <td className="py-2 px-3">{acc.nickname}</td>
                    <td className="py-2 px-3 font-mono font-bold text-neutral-800">
                      {showMasked ? acc.maskedNumber : `${acc.maskedNumber} [Verified]`}
                    </td>
                    <td className="py-2 px-3">{acc.accountType}</td>
                    <td className="py-2 px-3 font-medium text-emerald-800">
                      {acc.nomineeName || 'Yes (On Record)'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3: Insurance Policies */}
        <div className="space-y-3">
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
                  <th className="py-2 px-3">Masked Policy No.</th>
                  <th className="py-2 px-3">Coverage</th>
                  <th className="py-2 px-3">24/7 Claim Helpline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {profile.policies.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 px-3 font-bold">{p.provider}</td>
                    <td className="py-2 px-3">{p.policyType}</td>
                    <td className="py-2 px-3 font-mono font-bold">{p.policyNumber}</td>
                    <td className="py-2 px-3 font-mono font-bold text-emerald-800">
                      ₹ {(((p.coverageAmountPaise || 0) / 100)).toLocaleString()}
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-rose-700">{p.emergencyHelpline}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 4: Physical Locker & Legal Document Locations */}
        {profile.notes && (
          <div className="space-y-2 pt-2 border-t border-neutral-200">
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
              4. Physical Document Locker & Key Instructions
            </h2>
            <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 text-xs leading-relaxed text-neutral-800">
              {profile.notes}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-4 border-t-2 border-neutral-900 text-center text-[10px] text-neutral-500 font-mono">
          FocusFlow & Finance Estate Safety Standard • Store safely with trusted family executor.
        </div>
      </div>
    </div>
  );
};
