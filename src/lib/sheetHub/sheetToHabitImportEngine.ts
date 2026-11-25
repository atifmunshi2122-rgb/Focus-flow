/**
 * FocusFlow & Finance — Deterministic Sheet Hub → Habit Tracker Import Engine
 *
 * Executes deduplicated upserts of Habits parsed from Sheet Hub tabs into
 * FocusFlow's Habit Tracker (Firestore / local API), preserving existing habit
 * progress in Merge mode.
 */

import type { SheetConnection, SheetSyncedRow, SheetTabSchema } from '../../types/sheetHub.ts';
import type { Habit } from '../../types/index.ts';
import { api } from '../api.ts';
import { clientDataCache } from '../dataCache.ts';
import { sheetHubStore } from './sheetHubStore.ts';
import {
  generateHabitImportPreview,
  type HabitImportMergeMode,
  type HabitTabImportConfig,
} from './sheetToHabitTransformer.ts';

export interface SheetToHabitImportResult {
  success: boolean;
  createdHabitsCount: number;
  updatedHabitsCount: number;
  unchangedHabitsCount: number;
  totalCheckinsImported: number;
  newCheckinsAddedCount: number;
  skippedRowsCount: number;
  errors: string[];
}

export async function executeSheetToHabitImport(input: {
  userId: string;
  connection: SheetConnection;
  tabs: SheetTabSchema[];
  tabConfigs: Record<string, HabitTabImportConfig>;
  cachedRowsByTabId: Record<string, SheetSyncedRow[]>;
  mergeMode: HabitImportMergeMode;
  onProgress?: (p: { stage: string; percent: number }) => void;
}): Promise<SheetToHabitImportResult> {
  const { userId, connection, tabs, tabConfigs, cachedRowsByTabId, mergeMode, onProgress } = input;
  const spreadsheetId = connection.sourceSpreadsheetId || connection.spreadsheetId || connection.id;
  const errors: string[] = [];

  onProgress?.({ stage: 'Loading existing habits & sheet rows...', percent: 15 });

  const existingHabits = await api.getHabits().catch(() => [] as Habit[]);
  const selectedTabs = tabs.filter((t) => tabConfigs[t.id]?.isIncluded);

  const tabInputs: Array<{
    tab: SheetTabSchema;
    config: HabitTabImportConfig;
    rows: SheetSyncedRow[];
  }> = [];

  for (const tab of selectedTabs) {
    const config = tabConfigs[tab.id];
    let rows = cachedRowsByTabId[tab.id];
    if (!rows) {
      rows = await sheetHubStore.loadTabRows(userId, tab.id, connection.id).catch(() => []);
    }
    tabInputs.push({ tab, config, rows });
  }

  onProgress?.({ stage: 'Parsing habit dates & streaks...', percent: 35 });

  const preview = generateHabitImportPreview({
    tabs: tabInputs,
    existingHabits,
    spreadsheetId,
    mergeMode,
  });

  const existingById = new Map<string, Habit>(existingHabits.map((h) => [h.id, h]));

  let createdHabitsCount = 0;
  let updatedHabitsCount = 0;
  let unchangedHabitsCount = 0;

  const total = preview.habits.length;
  for (let i = 0; i < total; i++) {
    const item = preview.habits[i];
    const pct = 40 + Math.round(((i + 1) / Math.max(1, total)) * 55);
    onProgress?.({
      stage: `Saving habit ${i + 1} of ${total}: ${item.title}`,
      percent: pct,
    });

    try {
      if (item.isExistingMatch && item.existingHabitId) {
        const existing = existingById.get(item.existingHabitId);
        const prevSorted = [...(existing?.completedDates || [])].sort();
        const datesChanged =
          item.mergedDates.length !== prevSorted.length ||
          item.mergedDates.some((d, idx) => d !== prevSorted[idx]);

        if (!datesChanged && existing?.sourceMappingKey === item.sourceMappingKey) {
          unchangedHabitsCount++;
          continue;
        }

        await api.updateHabit(item.existingHabitId, {
          completedDates: item.mergedDates,
          bestStreakDays: item.bestStreakDays,
          description: item.description || existing?.description || '',
          sourceSpreadsheetId: spreadsheetId,
          sourceSheetId: item.sourceSheetId,
          sourceRowId: item.sourceRowId || existing?.sourceRowId || null,
          sourceMappingKey: item.sourceMappingKey,
          sourceLayout: item.sourceLayout,
        });
        updatedHabitsCount++;
      } else {
        await api.createHabit({
          title: item.title,
          description: item.description,
          category: item.category,
          color: item.color,
          frequency: item.frequency,
          targetDaysPerWeek: item.targetDaysPerWeek,
          customDays: [0, 1, 2, 3, 4, 5, 6],
          completedDates: item.mergedDates,
          bestStreakDays: item.bestStreakDays,
          sourceSpreadsheetId: spreadsheetId,
          sourceSheetId: item.sourceSheetId,
          sourceRowId: item.sourceRowId || null,
          sourceMappingKey: item.sourceMappingKey,
          sourceLayout: item.sourceLayout,
        });
        createdHabitsCount++;
      }
    } catch (err: unknown) {
      errors.push(
        `Failed to save "${item.title}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  clientDataCache.invalidate('habits');
  onProgress?.({ stage: 'Habit import complete!', percent: 100 });

  return {
    success: errors.length === 0,
    createdHabitsCount,
    updatedHabitsCount,
    unchangedHabitsCount,
    totalCheckinsImported: preview.summary.totalIncomingCheckins,
    newCheckinsAddedCount: preview.summary.newCheckinsAddedCount,
    skippedRowsCount: preview.summary.skippedRowsCount,
    errors,
  };
}
