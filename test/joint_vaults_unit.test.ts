import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidRatio,
  allocateTargetPaise,
  computeMemberContributionStats,
  computeVaultSettlement,
  splitExpense,
  computeMilestones,
  buildVaultSummary,
} from '../src/lib/vaultIntelligence.ts';
import {
  JointVault,
  VaultMember,
  VaultContribution,
  VaultExpense,
  VaultSettlement,
} from '../src/types/vault.ts';

const mockVault: JointVault = {
  id: 'vlt_test_01',
  name: 'Our Dream Trip',
  description: 'Saving for Euro trip',
  currency: 'INR',
  targetPaise: 20000000, // ₹200,000.00
  monthlyTargetPaise: 2000000, // ₹20,000.00
  createdBy: 'uid_alice',
  memberUids: ['uid_alice', 'uid_bob'],
  targetRatio: { uid_alice: 60, uid_bob: 40 },
  status: 'active',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const mockMembers: VaultMember[] = [
  {
    uid: 'uid_alice',
    email: 'alice@example.com',
    name: 'Alice',
    role: 'creator',
    status: 'active',
    joinedAt: '2026-11-01T00:00:00.000Z',
  },
  {
    uid: 'uid_bob',
    email: 'bob@example.com',
    name: 'Bob',
    role: 'partner',
    status: 'active',
    joinedAt: '2026-11-02T00:00:00.000Z',
  },
];

test('Joint Vaults Unit — Ratio Validation and Penny-Rounding Allocation', () => {
  assert.equal(isValidRatio({ uid_alice: 50, uid_bob: 50 }, ['uid_alice', 'uid_bob']), true);
  assert.equal(isValidRatio({ uid_alice: 60, uid_bob: 40 }, ['uid_alice', 'uid_bob']), true);
  assert.equal(isValidRatio({ uid_alice: 70, uid_bob: 30 }, ['uid_alice', 'uid_bob']), true);
  assert.equal(isValidRatio({ uid_alice: 100, uid_bob: 0 }, ['uid_alice', 'uid_bob']), true);

  // Invalid sums
  assert.equal(isValidRatio({ uid_alice: 60, uid_bob: 50 }, ['uid_alice', 'uid_bob']), false);
  assert.equal(isValidRatio({ uid_alice: -10, uid_bob: 110 }, ['uid_alice', 'uid_bob']), false);
  assert.equal(isValidRatio({ uid_alice: 50 }, ['uid_alice', 'uid_bob']), false);

  // Allocation with odd paise (e.g. 100001 paise split 60/40)
  const allocOdd = allocateTargetPaise(100001, 60, 'uid_alice', 'uid_bob');
  assert.equal(allocOdd.uid_alice, 60000);
  assert.equal(allocOdd.uid_bob, 40001);
  assert.equal(allocOdd.uid_alice + allocOdd.uid_bob, 100001, 'Zero penny-drift: sum must equal exact total');
});

test('Joint Vaults Unit — Contribution Stats & Reversal Filtering', () => {
  const contributions: VaultContribution[] = [
    {
      id: 'c1',
      vaultId: 'vlt_test_01',
      contributedByUid: 'uid_alice',
      contributorName: 'Alice',
      amountPaise: 6000000, // ₹60,000
      date: '2026-11-05',
      description: 'November savings',
      createdAt: '2026-11-05T10:00:00.000Z',
      status: 'active',
    },
    {
      id: 'c2',
      vaultId: 'vlt_test_01',
      contributedByUid: 'uid_bob',
      contributorName: 'Bob',
      amountPaise: 4000000, // ₹40,000
      date: '2026-11-06',
      description: 'November savings',
      createdAt: '2026-11-06T10:00:00.000Z',
      status: 'active',
    },
    {
      id: 'c3_reversed',
      vaultId: 'vlt_test_01',
      contributedByUid: 'uid_bob',
      contributorName: 'Bob',
      amountPaise: 1000000, // ₹10,000 - reversed!
      date: '2026-11-07',
      description: 'Accidental duplicate',
      createdAt: '2026-11-07T10:00:00.000Z',
      status: 'reversed',
      reversedAt: '2026-11-07T11:00:00.000Z',
      reversedByUid: 'uid_bob',
    },
  ];

  const stats = computeMemberContributionStats(mockVault, mockMembers, contributions);

  // Alice: target 60% of 200,000 = 120,000. Contributed = 60,000. Progress = 50%
  assert.equal(stats.uid_alice.totalPaise, 6000000);
  assert.equal(stats.uid_alice.targetSharePaise, 12000000);
  assert.equal(stats.uid_alice.progressPercent, 50);

  // Bob: target 40% of 200,000 = 80,000. Contributed = 40,000 (ignoring reversed c3). Progress = 50%
  assert.equal(stats.uid_bob.totalPaise, 4000000);
  assert.equal(stats.uid_bob.targetSharePaise, 8000000);
  assert.equal(stats.uid_bob.progressPercent, 50);
});

test('Joint Vaults Unit — Shared Expense Splitting Modes', () => {
  // Equal split of odd amount (1001 paise)
  const equalSplit = splitExpense(1001, 'equal', 'uid_alice', 'uid_bob');
  assert.equal(equalSplit.uid_alice, 500);
  assert.equal(equalSplit.uid_bob, 501);
  assert.equal(equalSplit.uid_alice + equalSplit.uid_bob, 1001);

  // Ratio split (60/40 of 10000 paise)
  const ratioSplit = splitExpense(10000, 'ratio', 'uid_alice', 'uid_bob', 60);
  assert.equal(ratioSplit.uid_alice, 6000);
  assert.equal(ratioSplit.uid_bob, 4000);

  // Custom split
  const customSplit = splitExpense(10000, 'custom', 'uid_alice', 'uid_bob', 50, {
    uid_alice: 7500,
    uid_bob: 2500,
  });
  assert.equal(customSplit.uid_alice, 7500);
  assert.equal(customSplit.uid_bob, 2500);
});

test('Joint Vaults Unit — Settlement Engine: Equal Split & Full Settlement', () => {
  // Scenario 1: Alice pays for a ₹1,000 dinner split equally (₹500 each)
  const expenses: VaultExpense[] = [
    {
      id: 'e1',
      vaultId: 'vlt_test_01',
      paidByUid: 'uid_alice',
      payerName: 'Alice',
      amountPaise: 100000,
      description: 'Dinner',
      date: '2026-11-10',
      splitMode: 'equal',
      memberShares: { uid_alice: 50000, uid_bob: 50000 },
      createdAt: '2026-11-10T12:00:00.000Z',
      status: 'active',
    },
  ];

  const calc1 = computeVaultSettlement(mockMembers, expenses, []);
  assert.ok(calc1);
  assert.equal(calc1.totalExpensesPaise, 100000);
  assert.equal(calc1.paidByA, 100000);
  assert.equal(calc1.paidByB, 0);
  assert.equal(calc1.shareOfA, 50000);
  assert.equal(calc1.shareOfB, 50000);
  assert.equal(calc1.netBalancePaise, 50000);
  assert.equal(calc1.debtorUid, 'uid_bob');
  assert.equal(calc1.creditorUid, 'uid_alice');
  assert.equal(calc1.settled, false);

  // Bob pays Alice ₹500 via UPI settlement
  const settlements: VaultSettlement[] = [
    {
      id: 's1',
      vaultId: 'vlt_test_01',
      fromUid: 'uid_bob',
      fromName: 'Bob',
      toUid: 'uid_alice',
      toName: 'Alice',
      amountPaise: 50000,
      date: '2026-11-11',
      notes: 'Settled dinner via UPI',
      createdAt: '2026-11-11T12:00:00.000Z',
    },
  ];

  const calc2 = computeVaultSettlement(mockMembers, expenses, settlements);
  assert.ok(calc2);
  assert.equal(calc2.netBalancePaise, 0);
  assert.equal(calc2.debtorUid, null);
  assert.equal(calc2.creditorUid, null);
  assert.equal(calc2.settled, true, 'Expense must be marked fully settled');
});

test('Joint Vaults Unit — Settlement Engine: Symmetrical Mutual Expenses & Custom Split', () => {
  // Scenario 2:
  // Alice pays ₹1,000 for groceries (Bob share 600, Alice share 400)
  // Bob pays ₹800 for tickets (Alice share 400, Bob share 400)
  // Bob pays ₹200 partial reimbursement
  const expenses: VaultExpense[] = [
    {
      id: 'e1',
      vaultId: 'vlt_test_01',
      paidByUid: 'uid_alice',
      payerName: 'Alice',
      amountPaise: 100000,
      description: 'Groceries',
      date: '2026-11-10',
      splitMode: 'custom',
      memberShares: { uid_alice: 40000, uid_bob: 60000 },
      createdAt: '2026-11-10T12:00:00.000Z',
      status: 'active',
    },
    {
      id: 'e2',
      vaultId: 'vlt_test_01',
      paidByUid: 'uid_bob',
      payerName: 'Bob',
      amountPaise: 80000,
      description: 'Concert Tickets',
      date: '2026-11-11',
      splitMode: 'equal',
      memberShares: { uid_alice: 40000, uid_bob: 40000 },
      createdAt: '2026-11-11T12:00:00.000Z',
      status: 'active',
    },
  ];

  // Alice paid 1,000. Alice share = 400 + 400 = 800. Net excess paid by Alice = 200.
  // Bob paid 800. Bob share = 600 + 400 = 1000. Net deficit paid by Bob = -200.
  // Therefore Bob owes Alice 200.
  const calcBefore = computeVaultSettlement(mockMembers, expenses, []);
  assert.ok(calcBefore);
  assert.equal(calcBefore.paidByA, 100000);
  assert.equal(calcBefore.paidByB, 80000);
  assert.equal(calcBefore.shareOfA, 80000);
  assert.equal(calcBefore.shareOfB, 100000);
  assert.equal(calcBefore.netBalancePaise, 20000); // Bob owes Alice 200
  assert.equal(calcBefore.debtorUid, 'uid_bob');
  assert.equal(calcBefore.creditorUid, 'uid_alice');

  // Bob pays ₹150 partial reimbursement
  const settlements: VaultSettlement[] = [
    {
      id: 's_part',
      vaultId: 'vlt_test_01',
      fromUid: 'uid_bob',
      fromName: 'Bob',
      toUid: 'uid_alice',
      toName: 'Alice',
      amountPaise: 15000,
      date: '2026-11-12',
      notes: 'Partial settlement',
      createdAt: '2026-11-12T12:00:00.000Z',
    },
  ];

  const calcAfter = computeVaultSettlement(mockMembers, expenses, settlements);
  assert.ok(calcAfter);
  assert.equal(calcAfter.netBalancePaise, 5000, 'Remaining balance is exactly 5000 paise (₹50)');
  assert.equal(calcAfter.debtorUid, 'uid_bob');
  assert.equal(calcAfter.creditorUid, 'uid_alice');
  assert.equal(calcAfter.settled, false);
});

test('Joint Vaults Unit — Milestones Calculation', () => {
  const targetPaise = 10000000; // ₹100,000
  // At ₹55,000 contributed, 25% and 50% are achieved, 75% and 100% are not
  const milestones = computeMilestones(targetPaise, 5500000);
  assert.equal(milestones.find((m) => m.percent === 25)?.achieved, true);
  assert.equal(milestones.find((m) => m.percent === 50)?.achieved, true);
  assert.equal(milestones.find((m) => m.percent === 75)?.achieved, false);
  assert.equal(milestones.find((m) => m.percent === 100)?.achieved, false);
});

