import { CurrencyCode } from './index.ts';

export type VaultStatus = 'active' | 'archived';
export type MemberRole = 'creator' | 'partner';
export type MemberStatus = 'active' | 'left';
export type InvitationStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'revoked';
export type ContributionStatus = 'active' | 'reversed';
export type ExpenseSplitMode = 'equal' | 'custom' | 'ratio';
export type ExpenseStatus = 'active' | 'reversed';

export interface JointVault {
  id: string;
  name: string;
  description: string;
  currency: CurrencyCode; // Locked at creation
  targetPaise: number;    // Goal amount in minor units
  monthlyTargetPaise: number;
  createdBy: string;      // Firebase UID
  memberUids: string[];   // Maximum 2 members: [uid1, uid2]
  targetRatio: Record<string, number>; // e.g. { [uid1]: 50, [uid2]: 50 } summing to 100
  status: VaultStatus;
  createdAt: string;      // ISO string
  updatedAt: string;      // ISO string
}

export interface VaultMember {
  uid: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: MemberRole;
  status: MemberStatus;
  joinedAt: string;
}

export interface VaultInvitation {
  id: string;
  vaultId: string;
  vaultName: string;
  invitedByUid: string;
  invitedByName: string;
  inviteCode: string;     // Single-use unpredictable token
  invitedEmail?: string;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string;
  acceptedByUid?: string;
  acceptedAt?: string;
}

export interface VaultContribution {
  id: string;
  vaultId: string;
  contributedByUid: string;
  contributorName: string;
  amountPaise: number;
  date: string;           // YYYY-MM-DD
  description: string;
  createdAt: string;
  status: ContributionStatus;
  reversedAt?: string;
  reversedByUid?: string;
  reversalReason?: string;
}

export interface VaultExpense {
  id: string;
  vaultId: string;
  paidByUid: string;
  payerName: string;
  amountPaise: number;
  description: string;
  date: string;           // YYYY-MM-DD
  splitMode: ExpenseSplitMode;
  memberShares: Record<string, number>; // in paise, sum must equal amountPaise
  createdAt: string;
  status: ExpenseStatus;
  reversedAt?: string;
  reversedByUid?: string;
}

export interface VaultSettlement {
  id: string;
  vaultId: string;
  fromUid: string;
  fromName: string;
  toUid: string;
  toName: string;
  amountPaise: number;
  date: string;           // YYYY-MM-DD
  notes: string;
  createdAt: string;
}

export type VaultActivityType =
  | 'vault_created'
  | 'member_joined'
  | 'contribution_added'
  | 'contribution_reversed'
  | 'expense_added'
  | 'expense_reversed'
  | 'settlement_recorded'
  | 'ratio_updated'
  | 'milestone_achieved'
  | 'member_left'
  | 'vault_archived';

export interface VaultActivity {
  id: string;
  vaultId: string;
  actorUid: string;
  actorName: string;
  type: VaultActivityType;
  title: string;
  description: string;
  amountPaise?: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface MemberContributionStats {
  uid: string;
  name: string;
  totalPaise: number;
  count: number;
  targetSharePaise: number;
  targetRatioPercent: number;
  progressPercent: number; // actual vs their target share
}

export interface VaultSettlementCalculation {
  memberA: { uid: string; name: string };
  memberB: { uid: string; name: string };
  totalExpensesPaise: number;
  paidByA: number;
  paidByB: number;
  shareOfA: number;
  shareOfB: number;
  settledByAtoB: number;
  settledByBtoA: number;
  // Outstanding direction:
  // if netBalancePaise > 0: memberB owes memberA
  // if netBalancePaise < 0: memberA owes memberB
  // if netBalancePaise == 0: all clear
  netBalancePaise: number;
  debtorUid: string | null;
  debtorName: string | null;
  creditorUid: string | null;
  creditorName: string | null;
  settled: boolean;
}

export interface VaultMilestone {
  percent: 25 | 50 | 75 | 100;
  targetPaise: number;
  achieved: boolean;
  achievedAt?: string;
}

export interface VaultSummary {
  vault: JointVault;
  members: VaultMember[];
  totalContributedPaise: number;
  remainingTargetPaise: number;
  progressPercentage: number;
  memberStats: Record<string, MemberContributionStats>;
  settlement: VaultSettlementCalculation | null;
  milestones: VaultMilestone[];
  recentActivity: VaultActivity[];
}

