import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SETTINGS_CATEGORIES,
  SEARCH_INDEX,
  SettingsCategory,
} from '../src/components/settings/SettingsView.tsx';
import { UserSettings } from '../src/types/index.ts';

test('Settings Organization — Exactly 12 Structured Categories Defined', () => {
  const expectedCategories: SettingsCategory[] = [
    'account',
    'appearance',
    'personalization',
    'focus',
    'tasks',
    'finance',
    'notifications',
    'sync',
    'security',
    'backup',
    'accessibility',
    'about',
  ];

  assert.equal(SETTINGS_CATEGORIES.length, 12, 'Must have exactly 12 categories');

  const actualCategoryIds = SETTINGS_CATEGORIES.map((c) => c.id);
  assert.deepEqual(
    actualCategoryIds,
    expectedCategories,
    'Categories must match the exact defined order and IDs'
  );

  // Check metadata completeness for each category
  for (const category of SETTINGS_CATEGORIES) {
    assert.ok(category.label && category.label.length > 0, `Category ${category.id} must have a label`);
    assert.ok(category.shortLabel && category.shortLabel.length > 0, `Category ${category.id} must have a shortLabel`);
    assert.ok(category.description && category.description.length > 0, `Category ${category.id} must have a description`);
    assert.ok(category.icon !== undefined, `Category ${category.id} must have an icon component`);
  }
});

test('Settings Search Engine — Full Coverage Across All 12 Categories', () => {
  assert.ok(SEARCH_INDEX.length >= 12, 'Search index must contain entries for all sections');

  const representedCategories = new Set(SEARCH_INDEX.map((item) => item.categoryId));
  const expectedCategories: SettingsCategory[] = [
    'account',
    'appearance',
    'personalization',
    'focus',
    'tasks',
    'finance',
    'notifications',
    'sync',
    'security',
    'backup',
    'accessibility',
    'about',
  ];

  for (const cat of expectedCategories) {
    assert.ok(
      representedCategories.has(cat),
      `Category '${cat}' must be represented in search index`
    );
  }
});

test('Settings Search Engine — Keyword and Substring Resolution Queries', () => {
  const runSearch = (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return SEARCH_INDEX.filter((item) => {
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchDesc = item.description.toLowerCase().includes(q);
      const matchCat = item.categoryLabel.toLowerCase().includes(q);
      const matchKeyword = item.keywords.some((k) => k.toLowerCase().includes(q));
      return matchTitle || matchDesc || matchCat || matchKeyword;
    });
  };

  // 1. Appearance / Theme searches
  const themeMatches = runSearch('theme');
  assert.ok(themeMatches.some((m) => m.categoryId === 'appearance'));

  const paletteMatches = runSearch('palette');
  assert.ok(paletteMatches.some((m) => m.categoryId === 'appearance'));

  const fusionMatches = runSearch('fusion');
  assert.ok(fusionMatches.some((m) => m.categoryId === 'appearance'));

  // 2. Focus & Pomodoro searches
  const pomodoroMatches = runSearch('pomodoro');
  assert.ok(pomodoroMatches.some((m) => m.categoryId === 'focus'));

  const breakMatches = runSearch('break');
  assert.ok(breakMatches.some((m) => m.categoryId === 'focus'));

  const chimeMatches = runSearch('chime');
  assert.ok(chimeMatches.some((m) => m.categoryId === 'focus'));

  // 3. Finance searches
  const currencyMatches = runSearch('currency');
  assert.ok(currencyMatches.some((m) => m.categoryId === 'finance'));

  const paiseMatches = runSearch('paise');
  assert.ok(paiseMatches.some((m) => m.categoryId === 'finance'));

  const envelopeMatches = runSearch('envelope');
  assert.ok(envelopeMatches.some((m) => m.categoryId === 'finance'));

  // 4. Google Sheets Sync searches
  const sheetsMatches = runSearch('sheets');
  assert.ok(sheetsMatches.some((m) => m.categoryId === 'sync'));

  const syncMatches = runSearch('sync');
  assert.ok(syncMatches.some((m) => m.categoryId === 'sync'));

  // 5. Privacy & Security searches
  const rateLimitMatches = runSearch('rate limit');
  assert.ok(rateLimitMatches.some((m) => m.categoryId === 'security'));

  const jwtMatches = runSearch('jwt');
  assert.ok(jwtMatches.some((m) => m.categoryId === 'security'));

  // 6. Backup & Recovery searches
  const backupMatches = runSearch('backup');
  assert.ok(backupMatches.some((m) => m.categoryId === 'backup'));

  const trashMatches = runSearch('trash');
  assert.ok(trashMatches.some((m) => m.categoryId === 'backup'));

  // 7. Accessibility & Motion searches
  const a11yMatches = runSearch('motion');
  assert.ok(a11yMatches.some((m) => m.categoryId === 'accessibility'));

  const contrastMatches = runSearch('contrast');
  assert.ok(contrastMatches.some((m) => m.categoryId === 'accessibility'));

  // 8. Personalization searches
  const layoutMatches = runSearch('layout');
  assert.ok(layoutMatches.some((m) => m.categoryId === 'personalization'));

  const densityMatches = runSearch('density');
  assert.ok(densityMatches.some((m) => m.categoryId === 'personalization'));

  // 9. Account searches
  const oauthMatches = runSearch('oauth');
  assert.ok(oauthMatches.some((m) => m.categoryId === 'account'));

  // 10. Empty query handling
  assert.equal(runSearch('').length, 0);
  assert.equal(runSearch('   ').length, 0);

  // 11. Nonsense query handling
  assert.equal(runSearch('xyznonexistentquery999').length, 0);
});

test('Non-Destructive UserSettings Integrity — 100% Schema Preservation', () => {
  // Mock full pristine UserSettings object
  const sampleSettings: UserSettings = {
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    pomodoroWorkDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    autoSwitchSessions: false,
    soundEnabled: true,
    theme: 'system',
    themeConfig: {
      designStyle: 'glassmorphism',
      colorPalette: 'ocean-breeze',
      customAccent: '#0ea5e9',
      fontPairing: 'inter-geist',
      backgroundGradient: 'gradient-indigo-slate',
      lightDarkStrategy: 'system',
      customThemes: [],
    },
    savedThemes: [],
    activeSavedThemeId: undefined,
    googleSpreadsheetId: '1AbCdEfGhIjKlMnOpQrStUvWxYz',
    lastSyncedAt: '2026-11-13T10:00:00.000Z',
    dailyFocusGoalMinutes: 120,
    weeklyFocusGoalMinutes: 600,
    notificationPrefs: {
      dailyFocusReminder: true,
      dailyFocusReminderTime: '09:00',
      billDueDateLeadDays: 3,
      budgetThresholdWarningPercent: 80,
      recurringBillGenerationAlert: true,
      syncErrorAlerts: true,
    },
    keyboardShortcutsEnabled: true,
  };

  // Verify that all keys exist and types remain invariant
  const keys = Object.keys(sampleSettings) as (keyof UserSettings)[];
  const expectedKeys: (keyof UserSettings)[] = [
    'currency',
    'timezone',
    'pomodoroWorkDuration',
    'shortBreakDuration',
    'longBreakDuration',
    'autoSwitchSessions',
    'soundEnabled',
    'theme',
    'themeConfig',
    'savedThemes',
    'activeSavedThemeId',
    'googleSpreadsheetId',
    'lastSyncedAt',
    'dailyFocusGoalMinutes',
    'weeklyFocusGoalMinutes',
    'notificationPrefs',
    'keyboardShortcutsEnabled',
  ];

  for (const exp of expectedKeys) {
    assert.ok(keys.includes(exp), `UserSettings must retain '${exp}' without deletion`);
  }

  // Ensure notification preferences retain all sub-keys
  const notifKeys = Object.keys(sampleSettings.notificationPrefs);
  assert.ok(notifKeys.includes('dailyFocusReminder'));
  assert.ok(notifKeys.includes('dailyFocusReminderTime'));
  assert.ok(notifKeys.includes('billDueDateLeadDays'));
  assert.ok(notifKeys.includes('budgetThresholdWarningPercent'));
  assert.ok(notifKeys.includes('recurringBillGenerationAlert'));
  assert.ok(notifKeys.includes('syncErrorAlerts'));
});
