# Long-Term Maintenance & Operations Guide

This guide establishes the routine operating procedures, performance tuning standards, cost control mechanisms, and health auditing rules for maintaining **FocusFlow & Finance** in production.

---

## 1. Routine Maintenance Schedule

```
┌────────────────────────────────────────────────────────┐
│                   MAINTENANCE CADENCE                  │
├─────────────┬──────────────────────────────────────────┤
│ Daily       │ Health check verification, Sync_Log audit│
│ Weekly      │ Sync queue review, Firestore error log   │
│ Monthly     │ Dependency vulnerability scan, DB backups│
│ Quarterly   │ Disaster recovery drill, index cleanup   │
└─────────────┴──────────────────────────────────────────┘
```

### 1.1 Daily Health Check
- Inspect server health endpoint:
  ```bash
  curl -s -f https://your-production-domain.com/api/health
  ```
- Inspect Google Sheets `Sync_Log` sheet to verify all batch updates succeeded with zero consecutive errors.

### 1.2 Weekly Maintenance
- Check Firestore read/write quota usage in Google Cloud Console.
- Audit rate-limiter trigger logs for suspected credential-stuffing or IP-based abuse.
- Review durable sync queue dead-letter records:
  ```bash
  curl -s -H "Authorization: Bearer [ADMIN_TOKEN]" \
    https://your-production-domain.com/api/sync/dead-letter
  ```

### 1.3 Monthly Maintenance
- **Dependency Audit:**
  ```bash
  npm audit --production
  ```
- Review and apply non-breaking patch updates:
  ```bash
  npm outdated
  npm update [package-name]
  npm run validate
  ```
- Verify automated Cloud Storage backup completion and storage bucket lifecycle policies.

### 1.4 Quarterly Review
- Perform test restore of Firestore snapshot into staging environment (see [BACKUP_RECOVERY_GUIDE.md](file:///Users/munshimdatif/Downloads/focusflow-&-finance/BACKUP_RECOVERY_GUIDE.md)).
- Review unused composite indexes in Firestore and delete unused definitions to optimize write costs.
- Audit Theme Studio contrast compliance for any newly added color presets.

---

## 2. Dependency Update Policy

1. **Lockfile Enforcement:** Always use `package-lock.json` and deploy using `npm ci` rather than `npm install` to prevent unexpected transitive dependency shifts.
2. **Security Vulnerability SLA:**
   - **Critical Vulnerabilities (CVSS $\ge 9.0$):** Mitigate or patch within 24 hours.
   - **High Vulnerabilities (CVSS $7.0 - 8.9$):** Mitigate or patch within 7 days.
   - **Moderate / Low Vulnerabilities:** Review and update during monthly maintenance.
3. **Major Framework Upgrades (React, Vite, Tailwind):**
   - Conducted in an isolated `upgrade/` branch.
   - Must achieve 100% pass rate on `npm run validate` and pass manual cross-device smoke testing before merging into `main`.

---

## 3. Cost & Resource Control Guidelines

### 3.1 Google Cloud Firestore
- **Query Bounding:** Never execute unbounded collection queries in the frontend. All lists (Transactions, Tasks, History) must include `.limit(50)` or `.limit(100)` with pagination cursors.
- **Listener Teardown:** Ensure all `onSnapshot` listeners are properly returned in React `useEffect` cleanups to prevent memory leaks and redundant read billing.
- **Batch Writes:** Consolidate atomic operations (e.g. paying a bill and creating an expense) into single `writeBatch` transactions rather than multiple standalone writes.

### 3.2 Google Sheets API
- **Quota Safeguard:** Google Cloud limits projects to **300 requests per minute per project** and **60 requests per minute per user**.
- **Batch Processing:** Never issue per-row API calls. Data synchronization is handled exclusively via `values:batchUpdate`, aggregating thousands of cells into single HTTP requests.
- **Durable Queue Retries:** When hitting an HTTP 429 quota exception, the durable queue uses exponential backoff with jitter ($1\text{s}, 2\text{s}, 4\text{s}, \dots, 30\text{s}$) rather than aggressive polling.

### 3.3 Google Cloud Run Container Sizing
- **CPU:** 1 vCPU (sufficient for Node.js event-loop throughput).
- **Memory:** 512 MiB (recommended production baseline; prevents OOM while keeping idle container costs minimal).
- **Concurrency:** 80 requests per instance.
- **Min Instances:** 0 (or 1 if cold-start latency must be under 300ms).
- **Max Instances:** 5 (prevents runaway billing under distributed denial-of-service).

---

## 4. Log Sanitation & Privacy Standards

All logging across Express and client modules passes through `server/logSanitizer.ts`:
- **Redacted Fields:** `password`, `token`, `secret`, `apiKey`, `cardNumber`, `cvv`, `pan`, `aadhaar`.
- **Masking Pattern:** Replaced with `***REDACTED***`.
- **Zero PII in Monitoring:** Personal user identifiers (emails, phone numbers) are masked in all standard operational logs.
