import './test_bootstrap.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  sanitizeExamSimulationState,
  restorePersistedExamSimulation,
  buildCompletedExamPayload,
} from '../src/components/study/ExamHallSimulator.tsx';
import type { ExamSimulationState } from '../src/types/features15.ts';

test('Bug 1 & 2 — ExamHallSimulator strips localStorage timer keys & restores selected preset config after refresh', () => {
  const persistedPayload = JSON.stringify({
    id: 'sim-12345',
    title: 'JEE Advanced Sectional Benchmark',
    totalDurationMinutes: 180,
    sections: [
      { id: 'sec-1', name: 'Physics Section', durationMinutes: 60, questionsCount: 18 },
      { id: 'sec-2', name: 'Chemistry Section', durationMinutes: 50, questionsCount: 18 },
      { id: 'sec-3', name: 'Mathematics Section', durationMinutes: 70, questionsCount: 18 },
    ],
    currentSectionIndex: 1,
    startedAt: '2026-11-26T10:00:00Z',
    status: 'in_progress',
    sectionElapsedSeconds: {},
    totalElapsedSeconds: 0,
    // Transient localStorage-only fields that caused Firestore permission-denied:
    sectionTimeRemaining: 2400,
    totalTimeRemaining: 6600,
    sectionSpentSeconds: { 'sec-1': 3600, 'sec-2': 600 },
  });

  const restored = restorePersistedExamSimulation(persistedPayload);
  assert.ok(restored);

  // Bug 1: sanitized examState must NOT contain transient timer keys
  const stateKeys = Object.keys(restored.examState);
  assert.equal(stateKeys.includes('sectionTimeRemaining'), false);
  assert.equal(stateKeys.includes('totalTimeRemaining'), false);
  assert.equal(stateKeys.includes('sectionSpentSeconds'), false);

  // Bug 2: config restores JEE Advanced sections rather than resetting to GATE
  assert.equal(restored.config.examName, 'JEE Advanced Sectional Benchmark');
  assert.equal(restored.config.sections[0].name, 'Physics Section');
  assert.equal(restored.sectionTimeRemaining, 2400);
  assert.equal(restored.totalTimeRemaining, 6600);
  assert.deepEqual(restored.sectionSpentSeconds, { 'sec-1': 3600, 'sec-2': 600 });
});

test('Bug 3 & 4 — ExamHallSimulator maps actual elapsed seconds, avoids updater side-effects, and uses onlyIfExists: true', () => {
  const stateWithExtras = {
    id: 'sim-999',
    title: 'GRE General Simulation',
    totalDurationMinutes: 115,
    sections: [
      { id: 'sec-1', name: 'Analytical Writing', durationMinutes: 30 },
      { id: 'sec-2', name: 'Quantitative Reasoning', durationMinutes: 45 },
    ],
    currentSectionIndex: 1,
    status: 'in_progress' as const,
    sectionElapsedSeconds: {},
    totalElapsedSeconds: 0,
    sectionTimeRemaining: 100,
    totalTimeRemaining: 200,
    sectionSpentSeconds: { 'sec-1': 1800 },
  } as ExamSimulationState & Record<string, unknown>;

  const sanitized = sanitizeExamSimulationState(stateWithExtras);
  assert.equal('sectionTimeRemaining' in sanitized, false);

  const completed = buildCompletedExamPayload(
    sanitized,
    { 'sec-1': 1800, 'sec-2': 2400 },
    '2026-11-26T12:00:00Z'
  );
  assert.equal(completed.status, 'completed');
  assert.equal(completed.completedAt, '2026-11-26T12:00:00Z');
  assert.deepEqual(completed.sectionElapsedSeconds, { 'sec-1': 1800, 'sec-2': 2400 });
  assert.equal(completed.totalElapsedSeconds, 4200);
  assert.equal('sectionTimeRemaining' in completed, false);

  const src = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/study/ExamHallSimulator.tsx'),
    'utf8'
  );
  assert.match(src, /onlyIfExists:\s*true/);
  assert.doesNotMatch(src, /setSectionTimeRemaining\(\(prev\)\s*=>\s*\{[\s\S]*?handleAdvanceSection\(\)/);
});

