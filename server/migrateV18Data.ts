import fs from 'fs';
import path from 'path';
import { getAdminFirestore, hasServiceAccountCredentials } from './firebaseAdmin.js';
import { resolveDefaultDataDir } from './db.js';

export interface MigrationSummary {
  inspectedFile: string;
  totalRecordsFound: number;
  migratedCount: number;
  skippedExistingCount: number;
  quarantinedCount: number;
  quarantineFilePath?: string;
  quarantinedRecords: Array<{
    collection: string;
    recordId?: string;
    reason: string;
    data: any;
  }>;
  errors: string[];
}

export interface MigrateOptions {
  sourceJsonPath?: string;
  quarantineOutputPath?: string;
  dryRun?: boolean;
  firestoreOverride?: any;
}

const COLLECTION_MAPPINGS: Record<string, string> = {
  skillNodes: 'skill_nodes',
  whiteboardDrawings: 'whiteboard_drawings',
  examSimulations: 'exam_simulations',
  decisionEntries: 'decision_entries',
  doomscrollLogs: 'doomscroll_logs',
  lifeMilestones: 'life_milestones',
  timeCapsules: 'time_capsules',
  emergencyAssetProfiles: 'emergency_profile',
};

/**
 * Safely and idempotently migrates v1.8 records from local JSON database
 * to Cloud Firestore under authenticated user-scoped paths (`users/{userId}/{subcollection}/{id}`).
 *
 * Invariants:
 * 1. Never overwrites existing Firestore records.
 * 2. Never guesses or reassigns unowned/ambiguous records to a user; quarantines them.
 * 3. Never deletes source JSON data.
 * 4. Safe to rerun at any time without side effects.
 */
export async function migrateV18JsonToFirestore(
  options: MigrateOptions = {}
): Promise<MigrationSummary> {
  const sourcePath =
    options.sourceJsonPath || path.resolve(resolveDefaultDataDir(), 'database.json');
  const quarantinePath =
    options.quarantineOutputPath ||
    path.resolve(process.cwd(), 'data', 'migration_v18_quarantine.json');

  const summary: MigrationSummary = {
    inspectedFile: sourcePath,
    totalRecordsFound: 0,
    migratedCount: 0,
    skippedExistingCount: 0,
    quarantinedCount: 0,
    quarantinedRecords: [],
    errors: [],
  };

  if (!fs.existsSync(sourcePath)) {
    return summary;
  }

  let parsed: any;
  try {
    const raw = fs.readFileSync(sourcePath, 'utf8');
    parsed = JSON.parse(raw);
  } catch (err) {
    summary.errors.push(`Failed to parse source JSON at ${sourcePath}: ${String(err)}`);
    return summary;
  }

  if (!parsed || typeof parsed !== 'object') {
    summary.errors.push(`Invalid JSON root at ${sourcePath}: expected object`);
    return summary;
  }

  const firestore = options.firestoreOverride || getAdminFirestore();

  for (const [jsonKey, firestoreSubcollection] of Object.entries(COLLECTION_MAPPINGS)) {
    const records = parsed[jsonKey];
    if (!Array.isArray(records) || records.length === 0) continue;

    summary.totalRecordsFound += records.length;

    for (const record of records) {
      if (!record || typeof record !== 'object') continue;

      const recordId = record.id ? String(record.id) : (firestoreSubcollection === 'emergency_profile' ? 'default' : undefined);
      const userId = record.userId ? String(record.userId).trim() : undefined;

      // 1. Ownership & Ambiguity Quarantine Guard
      if (!userId || userId === 'undefined' || userId === 'null') {
        summary.quarantinedCount++;
        summary.quarantinedRecords.push({
          collection: firestoreSubcollection,
          recordId,
          reason: 'MISSING_OR_AMBIGUOUS_USER_ID',
          data: record,
        });
        continue;
      }

      if (!recordId) {
        summary.quarantinedCount++;
        summary.quarantinedRecords.push({
          collection: firestoreSubcollection,
          recordId: undefined,
          reason: 'MISSING_RECORD_ID',
          data: record,
        });
        continue;
      }

      const docId = firestoreSubcollection === 'emergency_profile' ? 'default' : recordId;

      if (options.dryRun) {
        summary.migratedCount++;
        continue;
      }

      // 2. Idempotent Target Inspection (Do NOT overwrite existing)
      try {
        const docRef = firestore
          .collection('users')
          .doc(userId)
          .collection(firestoreSubcollection)
          .doc(docId);

        const existingSnap = await docRef.get();
        if (existingSnap.exists) {
          summary.skippedExistingCount++;
          continue;
        }

        // 3. Write non-existing record preserving exact timestamps and canonical identifiers
        const recordIdPayload =
          firestoreSubcollection === 'emergency_profile' ? `ep_${userId}` : docId;
        await docRef.set({
          ...record,
          id: recordIdPayload,
          userId,
        });
        summary.migratedCount++;
      } catch (err) {
        summary.errors.push(
          `Failed writing ${firestoreSubcollection}/${docId} for user ${userId}: ${String(err)}`
        );
      }
    }
  }

  // 4. Persist quarantine report if any ambiguous records were detected
  if (summary.quarantinedCount > 0) {
    try {
      const qDir = path.dirname(quarantinePath);
      if (!fs.existsSync(qDir)) {
        fs.mkdirSync(qDir, { recursive: true });
      }
      fs.writeFileSync(quarantinePath, JSON.stringify(summary.quarantinedRecords, null, 2), 'utf8');
      summary.quarantineFilePath = quarantinePath;
    } catch (err) {
      summary.errors.push(`Failed to write quarantine file at ${quarantinePath}: ${String(err)}`);
    }
  }

  return summary;
}

