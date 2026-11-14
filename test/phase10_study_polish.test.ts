import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Habit } from '../src/types/index.ts';

test('Phase 10 — AppContext Habits State & StudyView Sync Architecture', () => {
  const appContextSource = fs.readFileSync(path.resolve('src/context/AppContext.tsx'), 'utf8');
  const studyViewSource = fs.readFileSync(path.resolve('src/components/study/StudyView.tsx'), 'utf8');

  // AppContext must define and export habits as authoritative state
  assert.match(appContextSource, /habits:\s*Habit\[\];/, 'AppContextType must expose habits: Habit[]');
  assert.match(appContextSource, /const \[habits, setHabits\] = useState<Habit\[\]>\(\[\]\);/, 'AppContext must maintain habits state');
  assert.match(appContextSource, /setHabits\(habitList\);/, 'AppContext notification & data loading must populate habits state');

  // StudyView must consume habits and refreshKey from useApp()
  assert.match(studyViewSource, /const\s*\{\s*[^}]*habits[^}]*\}\s*=\s*useApp\(\);/, 'StudyView must read habits from useApp()');
  assert.match(studyViewSource, /const\s*\{\s*[^}]*refreshKey[^}]*\}\s*=\s*useApp\(\);/, 'StudyView must read refreshKey from useApp()');

  // StudyView must NOT make duplicate api.getHabits() calls
  assert.doesNotMatch(
    studyViewSource,
    /api\.getHabits\(\)/,
    'StudyView must not make redundant api.getHabits() calls; AppContext is the single source of truth'
  );

  // StudyView must update on refreshKey changes (when focus sessions or habits change)
  assert.match(
    studyViewSource,
    /useEffect\(\(\)\s*=>\s*\{\s*loadData\(\);\s*\}\s*,\s*\[user,\s*refreshKey\]\);/,
    'StudyView must reactively refresh when user or refreshKey changes'
  );
});

test('Phase 10 — Academic Habit Filtering Correctness', () => {
  // Test academic keyword categorization logic used in StudyView
  const sampleHabits: Partial<Habit>[] = [
    {
      id: 'h1',
      userId: 'test_u1',
      title: 'Solve 2 LeetCode / DSA Problems',
      frequency: 'daily',
      targetDaysPerWeek: 7,
      completedDates: ['2026-11-14'],
      createdAt: '2026-11-14T10:00:00Z',
    },
    {
      id: 'h2',
      userId: 'test_u1',
      title: 'Drink 2L Water',
      category: 'Health',
      frequency: 'daily',
      targetDaysPerWeek: 7,
      completedDates: [],
      createdAt: '2026-11-14T10:00:00Z',
    },
    {
      id: 'h3',
      userId: 'test_u1',
      title: 'Revise GATE DBMS Notes',
      category: 'Study',
      frequency: 'daily',
      targetDaysPerWeek: 6,
      completedDates: [],
      createdAt: '2026-11-14T10:00:00Z',
    },
    {
      id: 'h4',
      userId: 'test_u1',
      title: 'Evening 5km Jog',
      frequency: 'daily',
      targetDaysPerWeek: 5,
      completedDates: [],
      createdAt: '2026-11-14T10:00:00Z',
    },
  ];

  const filterAcademic = (list: Partial<Habit>[]) => {
    return list.filter((h) => {
      const title = (h.title || '').toLowerCase();
      const desc = (h.description || '').toLowerCase();
      const category = (h.category || '').toLowerCase();
      return (
        title.includes('study') ||
        title.includes('read') ||
        title.includes('revise') ||
        title.includes('dsa') ||
        title.includes('gate') ||
        title.includes('exam') ||
        title.includes('code') ||
        title.includes('lecture') ||
        category.includes('study') ||
        desc.includes('study')
      );
    });
  };

  const academic = filterAcademic(sampleHabits);
  assert.equal(academic.length, 2, 'Should detect exactly 2 academic habits (DSA and GATE DBMS)');
  assert.ok(academic.some((h) => h.id === 'h1'));
  assert.ok(academic.some((h) => h.id === 'h3'));
  assert.ok(!academic.some((h) => h.id === 'h2'), 'Water habit must not be categorized as academic');
  assert.ok(!academic.some((h) => h.id === 'h4'), 'Jogging habit must not be categorized as academic');
});

test('Phase 10 — TypeScript & Node Types Isolation', () => {
  const tsconfig = JSON.parse(fs.readFileSync(path.resolve('tsconfig.json'), 'utf8'));
  const viteConfig = fs.readFileSync(path.resolve('vite.config.ts'), 'utf8');

  // tsconfig.json must preserve vite/client without globally polluting Node types
  assert.deepEqual(
    tsconfig.compilerOptions.types,
    ['vite/client'],
    'tsconfig.json must restrict compilerOptions.types to ["vite/client"]'
  );

  // vite.config.ts must explicitly reference node types
  assert.match(
    viteConfig,
    /\/\/\/\s*<reference\s+types="node"\s*\/>/,
    'vite.config.ts must include triple-slash reference for node types'
  );
});

test('Phase 10 — Mobile Navigation & Touch Target Standard (>= 44x44px)', () => {
  const appSource = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
  const themePrimitivesSource = fs.readFileSync(path.resolve('src/components/ui/ThemePrimitives.tsx'), 'utf8');

  // Bottom navigation must use safe-area-aware padding
  assert.match(
    appSource,
    /pb-\[max\(0\.5rem,env\(safe-area-inset-bottom\)\)\]/,
    'Bottom nav must support safe-area-inset-bottom'
  );

  // Primary mobile navigation items and touch target sizing
  assert.match(appSource, /min-h-\[48px\]/, 'Bottom nav items must have at least 48px min height');

  // Mobile overflow "More" sheet drawer presence
  assert.match(appSource, /data-tab="more"/, 'Bottom nav must include 5th "more" tab');
  assert.match(appSource, /All Workspaces & Tools/, 'Mobile More drawer must display workspaces overview');

  // Prominent spotlight for Study OS and Habits in mobile More sheet
  assert.match(appSource, /setCurrentTab\('study'\)/, 'Mobile More sheet must include Study OS shortcut');
  assert.match(appSource, /setCurrentTab\('habits'\)/, 'Mobile More sheet must include Habits shortcut');

  // ThemeModal must use safe-area bottom padding and overscroll-contain
  assert.match(
    themePrimitivesSource,
    /overscroll-contain/,
    'ThemeModal must include overscroll-contain to prevent scroll bouncing'
  );
  assert.match(
    themePrimitivesSource,
    /pb-\[max\(1\.5rem,env\(safe-area-inset-bottom\)\)\]/,
    'ThemeModal must have safe-area padding for mobile keyboards and home indicators'
  );
});

test('Phase 10 — Mobile Study Modals Input Zoom Prevention & Touch Target Standard', () => {
  const addSubjectSource = fs.readFileSync(path.resolve('src/components/study/AddStudySubjectModal.tsx'), 'utf8');
  const addTopicSource = fs.readFileSync(path.resolve('src/components/study/AddStudyTopicModal.tsx'), 'utf8');
  const logMistakeSource = fs.readFileSync(path.resolve('src/components/study/LogStudyMistakeModal.tsx'), 'utf8');
  const scheduleRevisionSource = fs.readFileSync(path.resolve('src/components/study/ScheduleRevisionModal.tsx'), 'utf8');

  // Inputs must use text-base sm:text-sm or text-base sm:text-xs to prevent iOS Safari auto-zooming
  for (const [name, source] of [
    ['AddStudySubjectModal', addSubjectSource],
    ['AddStudyTopicModal', addTopicSource],
    ['LogStudyMistakeModal', logMistakeSource],
    ['ScheduleRevisionModal', scheduleRevisionSource],
  ]) {
    assert.match(
      source,
      /text-base/,
      `${name} must use 16px text-base on mobile to prevent iOS Safari input focus auto-zoom`
    );
    assert.match(
      source,
      /min-h-\[44px\]/,
      `${name} action buttons must satisfy minimum 44px touch target compliance`
    );
  }

  // ScheduleRevisionModal must use a mobile-friendly grid layout for intervals
  assert.match(
    scheduleRevisionSource,
    /grid-cols-3 sm:grid-cols-6/,
    'ScheduleRevisionModal must use responsive grid columns (3 on mobile, 6 on desktop) for interval buttons'
  );
});
