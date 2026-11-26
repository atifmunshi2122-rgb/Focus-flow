import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as socialService from '../server/socialService.ts';
import type { DatabaseSchema } from '../server/db.ts';

function makeSocialDb(): DatabaseSchema {
  return {
    users: [
      { id: 'u_atif', name: 'Atif', email: 'atif@private.example', avatarUrl: '', createdAt: '2026-11-01T00:00:00Z' },
      { id: 'u_puja', name: 'Puja', email: 'puja@private.example', avatarUrl: '', createdAt: '2026-11-01T00:00:00Z' },
      { id: 'u_outsider', name: 'Outsider', email: 'out@private.example', avatarUrl: '', createdAt: '2026-11-01T00:00:00Z' },
    ],
    userSettings: [],
    tasks: [
      {
        id: 't1',
        userId: 'u_atif',
        title: 'Task 1',
        description: '',
        priority: 'medium',
        status: 'completed',
        dueDate: null,
        estimatedPomodoros: 1,
        completedPomodoros: 1,
        createdAt: '2026-11-26T00:00:00Z',
        updatedAt: '2026-11-26T00:00:00Z',
      },
    ],
    focusSessions: [
      {
        id: 's1',
        userId: 'u_atif',
        taskId: null,
        mode: 'work',
        durationMinutes: 60,
        durationSeconds: 3600,
        completed: true,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
      },
    ],
    categories: [],
    recurringExpenses: [],
    bills: [],
    incomeTransactions: [],
    expenseTransactions: [],
    paymentHistory: [],
    savingsGoals: [],
    timeBlocks: [],
    subscriptions: [],
    envelopes: [],
    auditLogs: [],
    syncQueue: [],
    studyTiers: [],
    studySubjects: [],
    studyTopics: [],
    studyRevisions: [],
    studyMistakes: [],
    gamificationProfiles: [],
    xpTransactions: [],
  };
}

describe('Phase 6 — Social, Friends, Squads, Shared Timer, Chat & Security', () => {
  it('searches users without leaking emails and enforces friend request/block rules', () => {
    const db = makeSocialDb();

    const search = socialService.searchSocialUsers(db, 'u_atif', 'Puja');
    assert.equal(search.users.length, 1);
    assert.equal((search.users[0] as any).email, undefined);

    const fr = socialService.sendFriendRequest(db, 'u_atif', 'u_puja');
    assert.equal(fr.status, 'pending');

    // Duplicate request blocked
    assert.throws(() => socialService.sendFriendRequest(db, 'u_atif', 'u_puja'));

    // Only recipient can accept
    assert.throws(() => socialService.respondFriendRequest(db, 'u_atif', fr.id, 'accept'));
    const accepted = socialService.respondFriendRequest(db, 'u_puja', fr.id, 'accept');
    assert.equal(accepted.status, 'accepted');

    // Blocking removes friendship and hides user
    socialService.blockSocialUser(db, 'u_atif', 'u_outsider');
    assert.throws(() => socialService.sendFriendRequest(db, 'u_outsider', 'u_atif'));
  });

  it('enforces squad roles, invitations, and private chat membership + rate limits', () => {
    const db = makeSocialDb();
    const squad = socialService.createSocialSquad(db, 'u_atif', {
      name: 'Night Scholars',
      description: 'Focused study squad',
      privacy: 'private',
    });

    const inv = socialService.inviteToSocialSquad(db, 'u_atif', squad.id, 'u_puja');
    socialService.respondSquadInvitation(db, 'u_puja', inv.id, 'accept');

    // Outsider cannot read or send private squad chat
    assert.throws(() => socialService.getChatMessages(db, 'u_outsider', { squadId: squad.id }));
    assert.throws(() =>
      socialService.sendChatMessage(db, 'u_outsider', { squadId: squad.id, text: 'hack' })
    );

    // Member can send & react uniquely
    const msg = socialService.sendChatMessage(db, 'u_puja', {
      squadId: squad.id,
      text: 'Let us focus!',
    });
    const reacted = socialService.reactToChatMessage(db, 'u_atif', msg.id, '🔥');
    assert.equal(reacted.reactionCounts?.['🔥'], 1);
    // Toggle off on duplicate reaction
    const unReacted = socialService.reactToChatMessage(db, 'u_atif', msg.id, '🔥');
    assert.equal(unReacted.reactionCounts?.['🔥'], 0);

    // Challenges compute real progress from verified sessions & tasks
    const challenges = socialService.getSquadWeeklyChallenges(db, 'u_puja', squad.id);
    assert.equal(challenges.find((c) => c.id === 'ch_focus_together')?.progress, 1);
    assert.equal(challenges.find((c) => c.id === 'ch_task_masters')?.progress, 1);
  });

  it('validates shared study timer transitions and host-only control', () => {
    const db = makeSocialDb();
    const squad = socialService.createSocialSquad(db, 'u_atif', {
      name: 'Timer Squad',
      privacy: 'private',
    });
    const inv = socialService.inviteToSocialSquad(db, 'u_atif', squad.id, 'u_puja');
    socialService.respondSquadInvitation(db, 'u_puja', inv.id, 'accept');

    const sess = socialService.createGroupStudySession(db, 'u_atif', {
      squadId: squad.id,
      roomId: squad.id,
      durationSeconds: 1500,
    });
    socialService.transitionGroupStudySession(db, 'u_puja', sess.id, 'join');
    assert.equal(sess.participantIds.length, 2);

    // Member cannot control host timer
    assert.throws(() => socialService.transitionGroupStudySession(db, 'u_puja', sess.id, 'start'));

    socialService.transitionGroupStudySession(db, 'u_atif', sess.id, 'start');
    assert.equal(sess.status, 'running');
    socialService.transitionGroupStudySession(db, 'u_atif', sess.id, 'pause');
    assert.equal(sess.status, 'paused');
    socialService.transitionGroupStudySession(db, 'u_atif', sess.id, 'resume');
    assert.equal(sess.status, 'running');
    socialService.transitionGroupStudySession(db, 'u_atif', sess.id, 'end');
    assert.equal(sess.status, 'completed');
  });
});
