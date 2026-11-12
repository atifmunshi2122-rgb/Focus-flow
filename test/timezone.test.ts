import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TIMEZONE,
  getTodayDateString,
  formatDateInTimezone,
  getStartOfWeek,
  getEndOfWeek,
  getStartOfMonth,
  getEndOfMonth,
  calculateFocusStreakDays,
  parseDateString,
} from '../src/lib/dateTime.ts';

test('Timezone Engine — Asia/Kolkata Boundary and UTC Differences', () => {
  // Asia/Kolkata is UTC+05:30
  // When UTC is 2026-05-15 at 20:00:00 (8:00 PM UTC),
  // in India it is 2026-05-16 at 01:30:00 (1:30 AM next day).
  const utcDate = new Date('2026-05-15T20:00:00.000Z');

  // Naive toISOString().split('T')[0] gives the incorrect previous day (2026-05-15)
  assert.equal(utcDate.toISOString().split('T')[0], '2026-05-15');

  // Our timezone engine correctly returns 2026-05-16 for Asia/Kolkata
  const kolkataDate = formatDateInTimezone(utcDate, 'Asia/Kolkata');
  assert.equal(kolkataDate, '2026-05-16');

  // For New York (UTC-4 in daylight savings), 2026-05-15T20:00:00Z is 4:00 PM on 2026-05-15
  const nyDate = formatDateInTimezone(utcDate, 'America/New_York');
  assert.equal(nyDate, '2026-05-15');

  // When UTC is 2026-11-12 at 01:00:00Z, in Tokyo (UTC+9) it is 10:00 AM on 2026-11-12
  const tokyoDate = formatDateInTimezone('2026-11-12T01:00:00.000Z', 'Asia/Tokyo');
  assert.equal(tokyoDate, '2026-11-12');
});

test('Timezone Engine — Weekly and Monthly Boundary Calculations', () => {
  // 2026-05-13 is a Wednesday
  // Start of week (Monday) must be 2026-05-11
  assert.equal(getStartOfWeek('2026-05-13'), '2026-05-11');
  // End of week (Sunday) must be 2026-05-17
  assert.equal(getEndOfWeek('2026-05-13'), '2026-05-17');

  // 2026-05-10 is a Sunday
  // Monday of that week was 2026-05-04
  assert.equal(getStartOfWeek('2026-05-10'), '2026-05-04');
  assert.equal(getEndOfWeek('2026-05-10'), '2026-05-10');

  // Start & End of Month
  assert.equal(getStartOfMonth('2026-02-15'), '2026-02-01');
  assert.equal(getEndOfMonth('2026-02-15'), '2026-02-28');
  assert.equal(getEndOfMonth('2028-02-15'), '2028-02-29'); // Leap year
  assert.equal(getEndOfMonth('2026-04-10'), '2026-04-30');
  assert.equal(getEndOfMonth('2026-05-10'), '2026-05-31');
});

test('Timezone Engine — Focus Streak Calculation', () => {
  // Continuous streak test: sessions on 3 consecutive days
  const sessions = [
    { id: 's1', userId: 'u1', mode: 'work' as const, completed: true, durationSeconds: 1500, startedAt: '2026-05-10T10:00:00Z' },
    { id: 's2', userId: 'u1', mode: 'work' as const, completed: true, durationSeconds: 1500, startedAt: '2026-05-11T11:00:00Z' },
    { id: 's3', userId: 'u1', mode: 'work' as const, completed: true, durationSeconds: 1500, startedAt: '2026-05-12T09:00:00Z' },
  ];

  // If evaluated on 2026-05-12, streak should be 3
  const streakToday = calculateFocusStreakDays(sessions, 'Asia/Kolkata', new Date('2026-05-12T15:00:00Z'));
  assert.equal(streakToday, 3);

  // If evaluated on 2026-05-13 (today hasn't had a session yet, but yesterday 2026-05-12 had one), streak is preserved as 3
  const streakNextMorning = calculateFocusStreakDays(sessions, 'Asia/Kolkata', new Date('2026-05-13T06:00:00Z'));
  assert.equal(streakNextMorning, 3);

  // If evaluated on 2026-05-15 (more than 1 day skipped), streak resets to 0
  const streakBroken = calculateFocusStreakDays(sessions, 'Asia/Kolkata', new Date('2026-05-15T10:00:00Z'));
  assert.equal(streakBroken, 0);
});

