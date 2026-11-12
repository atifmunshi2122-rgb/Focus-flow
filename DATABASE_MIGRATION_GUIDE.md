# Cloud Firestore Database Migration Guide

This guide establishes the rules, design patterns, and execution runbooks for performing safe, zero-downtime schema evolution and data migrations in **FocusFlow & Finance**.

---

## 1. Zero-Downtime Migration Principles

Cloud Firestore is a flexible NoSQL document store, but schema consistency is vital for financial calculations and business workflows. To ensure zero-downtime updates:

1. **Additive Changes First:** Never delete or rename existing fields in production without a deprecation phase. New capabilities should introduce optional fields with fallback defaults in application code.
2. **Defensive Client Parsing:** Frontend and backend parsers must use nullish coalescing:
   ```typescript
   const spentPaise = doc.spentPaise ?? Math.round((doc.spent ?? 0) * 100);
   ```
3. **Dual-Writing during Transitions:** If an entity structure changes, the application writes both the legacy and the new field format during the transition window.
4. **Idempotent Backfills:** Migration scripts must be repeatable without corrupting already-migrated documents.

---

## 2. Three-Phase Migration Lifecycle

```
Phase 1: Code Deployment (Dual-Read / Dual-Write)
  │  - App code reads new field with fallback to legacy.
  │  - App code writes both new and legacy fields.
  ▼
Phase 2: Offline / Cloud Run Backfill Script
  │  - Script queries unmigrated documents in batches of 500.
  │  - Transforms data and writes new schema fields.
  ▼
Phase 3: Rules & Code Cleanup
     - Firestore rules updated to require the new field.
     - Legacy fallback code removed in subsequent major release.
```

---

## 3. Step-by-Step Backfill Script Pattern

Below is the verified pattern for writing Firestore migration scripts (see `scripts/migrateTemplate.ts`):

```typescript
import { getFirestore, writeBatch, collection, getDocs, query, limit } from 'firebase/firestore';

export async function runMigration(db: ReturnType<typeof getFirestore>) {
  console.log('[MIGRATION] Starting migration: Add integer paise to legacy expenses...');
  const BATCH_SIZE = 500;
  let totalMigrated = 0;

  while (true) {
    // 1. Query unmigrated records
    const q = query(collection(db, 'expenses'), limit(BATCH_SIZE));
    const snapshot = await getDocs(q);

    if (snapshot.empty) break;

    const batch = writeBatch(db);
    let countInBatch = 0;

    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();
      // Only process if new field is missing
      if (data.amountPaise === undefined && typeof data.amount === 'number') {
        const paise = Math.round(data.amount * 100);
        batch.update(docSnap.ref, {
          amountPaise: paise,
          schemaVersion: 2,
          migratedAt: new Date().toISOString()
        });
        countInBatch++;
      }
    });

    if (countInBatch === 0) break; // All queried records already migrated

    await batch.commit();
    totalMigrated += countInBatch;
    console.log(`[MIGRATION] Committed batch of ${countInBatch} documents. Total: ${totalMigrated}`);
  }

  console.log(`[MIGRATION] Migration complete. Total records updated: ${totalMigrated}`);
}
```

---

## 4. Pre-Migration Checklist

Before executing any database migration in production:

- [ ] Take a full on-demand Cloud Firestore export snapshot:
  ```bash
  gcloud firestore export gs://focusflow-backups/pre-migration-$(date +%s)
  ```
- [ ] Run migration script against the local Firebase Emulator or Staging project first.
- [ ] Verify that document counts, indexes, and calculated sums match expectations.
- [ ] Ensure `schemaVersion` tag is incremented on migrated documents.
- [ ] Verify frontend functionality continues to operate on both migrated and unmigrated documents simultaneously.

---

## 5. Rollback Runbook for Migrations

If a migration script causes unexpected corruption or invalid document updates:

1. **Halt Script Immediately:** Kill the running migration process.
2. **Execute Reversion Script (If Script was Additive):**
   - Run a targeted script to delete the newly introduced field:
     ```typescript
     batch.update(docSnap.ref, { newField: deleteField() });
     ```
3. **Full Snapshot Restore (If Destructive Corruption Occurred):**
   - Follow [BACKUP_RECOVERY_GUIDE.md](file:///Users/munshimdatif/Downloads/focusflow-&-finance/BACKUP_RECOVERY_GUIDE.md) to restore the pre-migration snapshot taken in step 4.
