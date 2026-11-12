# Release Process & Release Management Guide

**FocusFlow & Finance** adheres to a disciplined, predictable, and fully audited release lifecycle. This document outlines the protocols, branching model, validation gates, and rollback procedures required for releasing software updates.

---

## 1. Semantic Versioning Protocol

We follow [Semantic Versioning 2.0.0](https://semver.org/):

```
vMAJOR.MINOR.PATCH
  │     │     └─ Bug fixes, security patches, minor optimizations (Backwards-compatible)
  │     └─────── New features, non-breaking schema additions (Backwards-compatible)
  └───────────── Breaking architectural or data schema shifts requiring explicit migration
```

### Examples:
- `v1.0.0`: Initial production baseline.
- `v1.0.1`: Hotfix for a time-calculation edge case on leap years.
- `v1.1.0`: Introduction of a new custom theme preset or export format.
- `v2.0.0`: Complete overhaul of ledger schema requiring an automated migration script.

---

## 2. Git Branching & Tagging Model

```
       [feature/xyz] ──┐
                       ▼
main (production) ──────────────●──────────────●───────▶ [v1.0.0 tag]
                       ▲        │              │
                       │        ▼              ▼
       [hotfix/abc]  ──┘   Staging Deploy   Production Deploy
```

1. **`main` Branch:** Represents production-ready code. Direct pushes are prohibited; all changes merge via pull requests.
2. **Release Tags:** Every release deployed to production **must** be tagged using an annotated Git tag:
   ```bash
   git tag -a v1.0.0 -m "Release v1.0.0: Production Baseline with 23-Worksheet Sheets Sync"
   git push origin v1.0.0
   ```
3. **Hotfix Branches:** Created directly from the tagged commit (`git checkout -b hotfix/issue-description v1.0.0`), patched, tested, and fast-forward merged back to `main` with a bumped `PATCH` tag.

---

## 3. Pre-Release Validation Checklist

Before any commit is tagged or promoted to staging/production, the release manager must run and pass the following gate pipeline:

```bash
# 1. Clean workspace and install exact dependencies
npm ci

# 2. Complete type checking across frontend and backend
npm run lint

# 3. Complete automated regression test execution
npm test

# 4. End-to-end composite validation script
npm run validate

# 5. Production bundle compilation and asset check
npm run build:prod
```

### Verification Criteria:
- [ ] `tsc --noEmit` exits with status `0` (zero type errors).
- [ ] All 39 test suites pass with zero failures or skipped assertions.
- [ ] `npm run build:prod` executes under 1,000ms and generates chunks within budget:
  - Total core bundle $\le 1\text{ MB}$.
  - CSS bundle $\le 100\text{ kB}$ (gzipped $\le 20\text{ kB}$).
- [ ] Dependency vulnerabilities checked:
  ```bash
  npm audit --production
  ```
  *(Zero critical or high vulnerabilities allowed).*

---

## 4. Multi-Environment Promotion Pipeline

### 4.1 Development Environment (`dev`)
- **Host:** Local machine or continuous preview branch.
- **Database:** Local Firebase Emulator Suite or sandbox Firestore instance.
- **Sheets Sync:** Test Google Drive spreadsheet.

### 4.2 Staging Environment (`staging`)
- **Host:** Cloud Run Staging service or staging hosting channel.
- **Database:** Dedicated staging Firestore project (`focusflow-staging`).
- **Validation Goal:** Execute smoke tests, Google Sheets batch generation, and responsive testing on physical mobile devices.

### 4.3 Production Environment (`prod`)
- **Host:** Google Cloud Run Production container (`focusflow-prod`).
- **Database:** Authoritative production Firestore (`focusflow-prod`).
- **Deployment Command (Google Cloud Run):**
  ```bash
  gcloud run deploy focusflow-and-finance \
    --image gcr.io/[PROJECT_ID]/focusflow-and-finance:v1.0.0 \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated \
    --set-env-vars NODE_ENV=production
  ```

---

## 5. Post-Deployment Smoke Verification

Immediately following a production deployment:

1. **Health Check Endpoint:**
   ```bash
   curl -s -f https://your-production-domain.com/health | jq .
   # Expected response: {"status": "ok", "uptime": <seconds>, "timestamp": "..."}
   ```
2. **Authentication Flow:**
   - Sign in as test user.
   - Confirm session token received and cookie/header dispatched.
3. **Financial Ledger Math:**
   - Record ₹100.00 expense; confirm balance decreases by exactly ₹100.00 with zero fraction drift.
4. **Google Sheets Sync:**
   - Trigger manual sync via Command Center (`Cmd+K` $\rightarrow$ "Sync to Google Sheets").
   - Confirm `Sync_Log` sheet displays `SUCCESS` status with correct row counts.

---

## 6. Emergency Rollback Runbook

If a critical flaw, data corruption, or severe regression is detected in production:

### Step 1: Revert Traffic to Previous Container Revision
If running on Google Cloud Run, instantly roll back traffic to the previous known-good revision:
```bash
# List previous revisions
gcloud run revisions list --service focusflow-and-finance --region us-central1

# Direct 100% of incoming traffic back to previous stable revision
gcloud run services update-traffic focusflow-and-finance \
  --to-revisions [PREVIOUS_REVISION_NAME]=100 \
  --region us-central1
```
*Latency: < 5 seconds with zero container rebuild downtime.*

### Step 2: Roll Back Static Hosting (If using Firebase Hosting)
```bash
firebase hosting:rollback
```

### Step 3: Git Hotfix or Revert
If a code rollback is required on the repository:
```bash
# Revert the faulty commit on main
git revert [FAULTY_COMMIT_HASH] -m 1

# Or checkout the previous stable tag and deploy hotfix
git checkout -b hotfix/emergency-rollback v1.0.0
npm run validate
git push origin hotfix/emergency-rollback
```

### Step 4: Validate Data Integrity
- Check `Sync_Log` in Google Sheets to identify any records transmitted during the faulty window.
- If data corruption occurred in Firestore, follow the [BACKUP_RECOVERY_GUIDE.md](file:///Users/munshimdatif/Downloads/focusflow-&-finance/BACKUP_RECOVERY_GUIDE.md) to restore from the latest automated snapshot.

