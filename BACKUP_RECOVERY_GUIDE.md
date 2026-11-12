# Backup & Disaster Recovery Guide

This guide establishes the enterprise data protection, backup schedules, integrity checks, and disaster recovery procedures for **FocusFlow & Finance**.

---

## 1. Core Data Hierarchy & Source of Truth

> [!IMPORTANT]
> **Cloud Firestore is the primary database and sole authoritative source of truth.**  
> Google Sheets is a secondary reporting, presentation, and read-only analytics layer. Under no circumstances should Google Sheets be treated as an authoritative replacement for Firestore backups.

```
┌────────────────────────────────────────────────────────┐
│             CLOUD FIRESTORE (PRIMARY STORE)            │
│  - Full schema, subtask trees, soft-delete flags       │
│  - Integer paise precision, auth timestamps, audit log │
└──────────────────────────┬─────────────────────────────┘
                           │
             Automated Daily Snapshot
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│     CLOUD STORAGE (gs://focusflow-backups/prod/)       │
│  - Immutable daily Firestore exports                   │
│  - 30-day rolling retention + 7-day PITR               │
└────────────────────────────────────────────────────────┘

                           ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
     Secondary Read-Only   │   GOOGLE SHEETS WORKBOOK    │
     Export Sync Engine ──▶│ - 23 Worksheets & Charts    │
                           │ - Read-only analytical view │
                           └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘
```

---

## 2. Backup Schedules & Retention Policy

| Tier | Frequency | Storage Location | Retention Period | Target RPO |
| :--- | :--- | :--- | :--- | :--- |
| **Point-In-Time Recovery (PITR)** | Continuous (every minute) | Native Cloud Firestore | 7 rolling days | $\le 1\text{ minute}$ |
| **Automated Daily Export** | Every day at 02:00 UTC | `gs://focusflow-backups/daily/` | 30 days | $\le 24\text{ hours}$ |
| **Weekly Archive** | Every Sunday at 03:00 UTC | `gs://focusflow-backups/weekly/` | 12 weeks | $\le 7\text{ days}$ |
| **Monthly Archive** | 1st of each month | `gs://focusflow-backups/monthly/`| 12 months | $\le 30\text{ days}$ |
| **Local Offline JSON Dump** | On-demand before releases | Local encrypted storage | 90 days | Point of export |

---

## 3. Automated Cloud Firestore Export Setup

### Step 1: Create Dedicated Cloud Storage Bucket
```bash
gcloud storage buckets create gs://focusflow-backups \
  --project=[PROJECT_ID] \
  --location=us-central1 \
  --uniform-bucket-level-access
```

### Step 2: Grant Service Account Permissions
```bash
gcloud projects add-iam-policy-binding [PROJECT_ID] \
  --member="serviceAccount:[PROJECT_ID]@appspot.gserviceaccount.com" \
  --role="roles/datastore.importExportAdmin"

gcloud storage buckets add-iam-policy-binding gs://focusflow-backups \
  --member="serviceAccount:[PROJECT_ID]@appspot.gserviceaccount.com" \
  --role="roles/storage.admin"
```

### Step 3: Configure Cloud Scheduler Job
Create an automated daily Cloud Scheduler job that triggers the Cloud Firestore Export API via HTTP or Cloud Function:
```bash
gcloud scheduler jobs create http firestore-daily-backup \
  --location=us-central1 \
  --schedule="0 2 * * *" \
  --uri="https://firestore.googleapis.com/v1/projects/[PROJECT_ID]/databases/(default):exportDocuments" \
  --http-method=POST \
  --message-body='{"outputUriPrefix": "gs://focusflow-backups/daily"}' \
  --oauth-service-account-email="[PROJECT_ID]@appspot.gserviceaccount.com"
```

---

## 4. Manual On-Demand Backup Runbook

Before performing schema updates, migrations, or major version deployments:

```bash
# Export all Firestore collections to timestamped directory
EXPORT_DATE=$(date +%Y-%m-%d-%H%M)
gcloud firestore export gs://focusflow-backups/pre-release/${EXPORT_DATE} \
  --project=[PROJECT_ID]
```

To backup specific mission-critical collections only:
```bash
gcloud firestore export gs://focusflow-backups/pre-release/${EXPORT_DATE} \
  --collection-ids='users,tasks,bills,paymentHistory,incomeTransactions,expenseTransactions,envelopes' \
  --project=[PROJECT_ID]
```

---

## 5. Backup Integrity Verification Drill

Every 30 days, verify backup readability without touching production:

1. **Verify Cloud Storage File Existence & Checksums:**
   ```bash
   gcloud storage ls --long gs://focusflow-backups/daily/
   ```
2. **Perform Test Restore into Staging / Sandbox Project:**
   ```bash
   # Target isolated staging database ONLY
   gcloud firestore import gs://focusflow-backups/daily/[BACKUP_FOLDER] \
     --project=[STAGING_PROJECT_ID]
   ```
3. **Run Query Validation:**
   - Verify document counts across `users`, `tasks`, `bills`, and `envelopes`.
   - Confirm integer paise values match source ledgers.

---

## 6. Disaster Recovery & Restoration Procedure

> [!CAUTION]
> **A database restore is potentially destructive.**  
> Never perform a restore to production without explicit written management authorization and a pre-restore snapshot.

### Option A: Point-in-Time Recovery (PITR)
If accidental deletion or logic bug occurred within the last 7 days, recover to an exact minute:
```bash
gcloud firestore databases restore \
  --source-database='(default)' \
  --destination-database='recovered-db' \
  --recovery-time='2026-11-12T10:00:00Z' \
  --project=[PROJECT_ID]
```

### Option B: Cloud Storage Snapshot Restore
To restore an entire database from a Cloud Storage export:
```bash
# 1. Take safety snapshot of current corrupted state before touching anything
gcloud firestore export gs://focusflow-backups/corrupted-snapshot-$(date +%s) \
  --project=[PROJECT_ID]

# 2. Import verified snapshot
gcloud firestore import gs://focusflow-backups/daily/[VERIFIED_BACKUP_NAME] \
  --project=[PROJECT_ID]
```

---

## 7. Emergency Recovery from Google Sheets

If Firestore experiences a catastrophic total outage and no recent Cloud Storage snapshot exists, data can be reconstructed from the **23-Worksheet Google Sheets Workbook**:

1. **Export Workbook:** Download Google Sheets as `.xlsx` or individual `.csv` files.
2. **Target Sheets:**
   - `Income` (SheetId 112) $\rightarrow$ restore `incomeTransactions`
   - `Fixed_Expenses` (113) & `Variable_Expenses` (114) $\rightarrow$ restore `expenseTransactions`
   - `Bills_Payments` (115) $\rightarrow$ restore `bills` and `paymentHistory`
   - `Tasks` (109) $\rightarrow$ restore `tasks`
   - `Budgets` (116) $\rightarrow$ restore `envelopes`
3. **Data Ingestion Script:** Use the utility in `server/dataRecovery.ts` to map CSV rows back to Firestore document schemas, ensuring values are multiplied by 100 to convert decimal currency back to integer paise.
4. **Sheets Limitations Notice:**
   - Google Sheets exports do not retain subtask hierarchical arrays or deleted-at soft-delete histories.
   - Restored records will receive generated UUIDs if original document IDs were not recorded in Column A.

---

## 8. Recovery Objectives

- **RPO (Recovery Point Objective):** $\le 1\text{ hour}$ with continuous PITR; $\le 24\text{ hours}$ via daily snapshots.
- **RTO (Recovery Time Objective):** $\le 30\text{ minutes}$ to restore Cloud Run traffic to recovered database.
