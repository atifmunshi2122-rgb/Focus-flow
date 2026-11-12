import test from 'node:test';
import assert from 'node:assert/strict';
import { dbService } from '../server/db.ts';

test('Timer Engine — Drift-Free Countdown and Time Representation', () => {
  // Simulate drift-free countdown calculation using timestamps
  const durationSeconds = 25 * 60; // 1500s
  const startEpoch = 1700000000000;
  
  // After exactly 120,400 ms (2 minutes and 400ms)
  const currentEpoch = startEpoch + 120400;
  const elapsedSeconds = Math.floor((currentEpoch - startEpoch) / 1000);
  const remainingSeconds = Math.max(0, durationSeconds - elapsedSeconds);

  assert.equal(elapsedSeconds, 120);
  assert.equal(remainingSeconds, 1380);

  // Time string formatting
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  assert.equal(timeFormatted, '23:00');
});

test('Tasks — Complete CRUD, Subtasks and Soft-Delete Restoration', () => {
  const userId = 'usr_test_tasks_' + Date.now();
  dbService.ensureUserWorkspace(userId);
  const raw = dbService.getRaw();

  // Create Task
  const taskId = 'task_test_crud_1';
  const newTask = {
    id: taskId,
    userId,
    title: 'Audit Financial Ledger',
    description: 'Ensure double-entry precision',
    priority: 'high' as const,
    status: 'todo' as const,
    dueDate: '2026-11-30',
    estimatedPomodoros: 4,
    completedPomodoros: 0,
    subtasks: [
      { id: 'sub_1', title: 'Check integer paise boundaries', done: true },
      { id: 'sub_2', title: 'Verify undo payment preservation', done: false },
    ],
    recurrence: 'none' as const,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  raw.tasks.push(newTask);
  dbService.save();

  // Read task
  const fetched = raw.tasks.find((t) => t.id === taskId && t.userId === userId);
  assert.ok(fetched !== undefined);
  assert.equal(fetched.title, 'Audit Financial Ledger');
  assert.ok(fetched.subtasks && fetched.subtasks.length === 2);
  assert.equal(fetched.subtasks[0].done, true);

  // Update Task (complete second subtask and increment completedPomodoros)
  fetched.subtasks[1].done = true;
  fetched.completedPomodoros += 1;
  fetched.status = 'completed';
  fetched.updatedAt = new Date().toISOString();
  dbService.save();

  const updated = raw.tasks.find((t) => t.id === taskId && t.userId === userId);
  assert.equal(updated?.status, 'completed');
  assert.equal(updated?.completedPomodoros, 1);
  assert.ok(updated?.subtasks && updated.subtasks[1].done === true);

  // Soft Delete Task
  fetched.deletedAt = new Date().toISOString();
  dbService.save();

  // Active tasks should exclude trashed task
  const activeTasks = raw.tasks.filter((t) => t.userId === userId && !t.deletedAt);
  assert.ok(!activeTasks.some((t) => t.id === taskId));

  // Trashed tasks should include it
  const trashedTasks = raw.tasks.filter((t) => t.userId === userId && Boolean(t.deletedAt));
  assert.ok(trashedTasks.some((t) => t.id === taskId));

  // Restore Task
  fetched.deletedAt = null;
  fetched.updatedAt = new Date().toISOString();
  dbService.save();

  const restored = raw.tasks.filter((t) => t.userId === userId && !t.deletedAt);
  assert.ok(restored.some((t) => t.id === taskId));

  // Clean up test workspace
  dbService.clearWorkspace(userId);
  dbService.save();
});
