import {
  JointVault,
  VaultMember,
  VaultContribution,
  VaultExpense,
  VaultSettlement,
  MemberContributionStats,
  VaultSettlementCalculation,
  VaultMilestone,
  VaultSummary,
  VaultActivity,
} from '../types/vault.ts';

/**
 * Validate that a target ratio map is mathematically sound:
 * - Supports 1-member solo vaults ({ [uid]: 100 }) or 2-member joint vaults
 * - Exact key match for active memberUids with non-negative integers 0..100
 * - Combined sum equals exactly 100
 */
export function isValidRatio(ratio: Record<string, number>, memberUids: string[]): boolean {
  if (!ratio || typeof ratio !== 'object' || Array.isArray(ratio)) return false;
  const uniqueMembers = Array.from(new Set((memberUids || []).filter(Boolean)));
  if (uniqueMembers.length !== 1 && uniqueMembers.length !== 2) return false;
  const keys = Object.keys(ratio);
  if (keys.length !== uniqueMembers.length) return false;
  for (const uid of uniqueMembers) {
    if (!Object.prototype.hasOwnProperty.call(ratio, uid)) return false;
    const val = ratio[uid];
    if (typeof val !== 'number' || !Number.isInteger(val) || val < 0 || val > 100) {
      return false;
    }
  }
  const sum = uniqueMembers.reduce((acc, uid) => acc + ratio[uid], 0);
  return sum === 100;
}

/**
 * Precision-safe allocation of target paise according to ratio percentage
 * Guarantees zero penny-rounding drift.
 */
export function allocateTargetPaise(
  totalTargetPaise: number,
  ratioA: number,
  uidA: string,
  uidB: string
): Record<string, number> {
  const shareA = Math.floor((totalTargetPaise * ratioA) / 100);
  const shareB = totalTargetPaise - shareA;
  return {
    [uidA]: shareA,
    [uidB]: shareB,
  };
}

/**
 * Calculate member contribution stats, target shares, and completion percentages.
 */
export function computeMemberContributionStats(
  vault: JointVault,
  members: VaultMember[],
  contributions: VaultContribution[]
): Record<string, MemberContributionStats> {
  const stats: Record<string, MemberContributionStats> = {};
  const activeContributions = contributions.filter((c) => c.status === 'active');

  const uidA = vault.memberUids[0] || '';
  const uidB = vault.memberUids[1] || '';
  const ratioA = vault.targetRatio[uidA] ?? 50;
  const targets = uidA && uidB ? allocateTargetPaise(vault.targetPaise, ratioA, uidA, uidB) : { [uidA]: vault.targetPaise };

  for (const member of members) {
    const memberContribs = activeContributions.filter((c) => c.contributedByUid === member.uid);
    const totalPaise = memberContribs.reduce((acc, c) => acc + c.amountPaise, 0);
    const targetSharePaise = targets[member.uid] || Math.floor(vault.targetPaise / Math.max(1, members.length));
    const targetRatioPercent = vault.targetRatio[member.uid] ?? 50;
    const progressPercent = targetSharePaise > 0 ? Math.min(100, Math.round((totalPaise / targetSharePaise) * 100)) : 100;

    stats[member.uid] = {
      uid: member.uid,
      name: member.name,
      totalPaise,
      count: memberContribs.length,
      targetSharePaise,
      targetRatioPercent,
      progressPercent,
    };
  }

  return stats;
}

/**
 * Calculate two-member shared expense settlement.
 *
 * Distinguishes:
 * 1. Joint expenses paid by each member
 * 2. Assigned shares of expenses for each member
 * 3. Reimbursements already settled between members
 * 4. Net outstanding settlement balance
 *
 * Formula:
 * netOwedByBtoA = (paidByA - shareOfA) - (settledByBtoA - settledByAtoB)
 * If > 0: Member B owes Member A
 * If < 0: Member A owes Member B
 * If == 0: Fully settled
 */
export function computeVaultSettlement(
  members: VaultMember[],
  expenses: VaultExpense[],
  settlements: VaultSettlement[]
): VaultSettlementCalculation | null {
  const activeMembers = (members || []).filter((m) => m.status === 'active');
  if (activeMembers.length < 2) return null;

  const memberA = activeMembers[0];
  const memberB = activeMembers[1];
  const activeExpenses = expenses.filter((e) => e.status === 'active');

  let paidByA = 0;
  let paidByB = 0;
  let shareOfA = 0;
  let shareOfB = 0;

  for (const exp of activeExpenses) {
    if (exp.paidByUid === memberA.uid) {
      paidByA += exp.amountPaise;
    } else if (exp.paidByUid === memberB.uid) {
      paidByB += exp.amountPaise;
    }

    shareOfA += exp.memberShares[memberA.uid] || 0;
    shareOfB += exp.memberShares[memberB.uid] || 0;
  }

  let settledByAtoB = 0;
  let settledByBtoA = 0;

  for (const s of settlements) {
    if (s.fromUid === memberA.uid && s.toUid === memberB.uid) {
      settledByAtoB += s.amountPaise;
    } else if (s.fromUid === memberB.uid && s.toUid === memberA.uid) {
      settledByBtoA += s.amountPaise;
    }
  }

  const netBalancePaise = (paidByA - shareOfA) - (settledByBtoA - settledByAtoB);

  let debtorUid: string | null = null;
  let debtorName: string | null = null;
  let creditorUid: string | null = null;
  let creditorName: string | null = null;

  if (netBalancePaise > 0) {
    debtorUid = memberB.uid;
    debtorName = memberB.name;
    creditorUid = memberA.uid;
    creditorName = memberA.name;
  } else if (netBalancePaise < 0) {
    debtorUid = memberA.uid;
    debtorName = memberA.name;
    creditorUid = memberB.uid;
    creditorName = memberB.name;
  }

  return {
    memberA: { uid: memberA.uid, name: memberA.name },
    memberB: { uid: memberB.uid, name: memberB.name },
    totalExpensesPaise: paidByA + paidByB,
    paidByA,
    paidByB,
    shareOfA,
    shareOfB,
    settledByAtoB,
    settledByBtoA,
    netBalancePaise,
    debtorUid,
    debtorName,
    creditorUid,
    creditorName,
    settled: netBalancePaise === 0,
  };
}

/**
 * Split expense amount into precision-safe integer member shares.
 */
export function splitExpense(
  amountPaise: number,
  splitMode: 'equal' | 'ratio' | 'custom',
  uidA: string,
  uidB: string,
  ratioA = 50,
  customShares?: { [uid: string]: number }
): Record<string, number> {
  if (splitMode === 'equal') {
    const shareA = Math.floor(amountPaise / 2);
    const shareB = amountPaise - shareA;
    return { [uidA]: shareA, [uidB]: shareB };
  }

  if (splitMode === 'ratio') {
    const shareA = Math.floor((amountPaise * ratioA) / 100);
    const shareB = amountPaise - shareA;
    return { [uidA]: shareA, [uidB]: shareB };
  }

  // Custom split
  if (customShares) {
    const shareA = customShares[uidA] || 0;
    const shareB = customShares[uidB] || 0;
    if (shareA + shareB === amountPaise && shareA >= 0 && shareB >= 0) {
      return { [uidA]: shareA, [uidB]: shareB };
    }
  }

  // Fallback to equal split if custom shares invalid
  const fallbackA = Math.floor(amountPaise / 2);
  return { [uidA]: fallbackA, [uidB]: amountPaise - fallbackA };
}

/**
 * Calculate milestones (25%, 50%, 75%, 100%) and their achievement status.
 */
export function computeMilestones(
  targetPaise: number,
  totalContributedPaise: number,
  activities: VaultActivity[] = []
): VaultMilestone[] {
  const percentages: (25 | 50 | 75 | 100)[] = [25, 50, 75, 100];
  return percentages.map((percent) => {
    const milestoneTarget = Math.floor((targetPaise * percent) / 100);
    const achieved = targetPaise > 0 && totalContributedPaise >= milestoneTarget;
    const activity = activities.find(
      (a) => a.type === 'milestone_achieved' && (a.metadata as { percent?: number } | undefined)?.percent === percent
    );

    return {
      percent,
      targetPaise: milestoneTarget,
      achieved,
      achievedAt: activity?.timestamp,
    };
  });
}

/**
 * Build a complete, unified summary for a vault.
 */
export function buildVaultSummary(
  vault: JointVault,
  members: VaultMember[],
  contributions: VaultContribution[],
  expenses: VaultExpense[] = [],
  settlements: VaultSettlement[] = [],
  activities: VaultActivity[] = []
): VaultSummary {
  const activeContributions = contributions.filter((c) => c.status === 'active');
  const totalContributedPaise = activeContributions.reduce((acc, c) => acc + c.amountPaise, 0);
  const remainingTargetPaise = Math.max(0, vault.targetPaise - totalContributedPaise);
  const progressPercentage =
    vault.targetPaise > 0 ? Math.min(100, Math.round((totalContributedPaise / vault.targetPaise) * 100)) : 100;

  const memberStats = computeMemberContributionStats(vault, members, contributions);
  const settlement = computeVaultSettlement(members, expenses, settlements);
  const milestones = computeMilestones(vault.targetPaise, totalContributedPaise, activities);
  const recentActivity = [...activities].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 20);

  return {
    vault,
    members,
    totalContributedPaise,
    remainingTargetPaise,
    progressPercentage,
    memberStats,
    settlement,
    milestones,
    recentActivity,
  };
}

