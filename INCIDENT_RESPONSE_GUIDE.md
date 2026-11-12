# Incident Response & Emergency Operations Guide

This guide establishes the severity definitions, operational runbooks, communication standards, and post-mortem templates for responding to production outages and technical emergencies in **FocusFlow & Finance**.

---

## 1. Incident Severity Classification

| Level | Severity | Definition & Impact | Target Response SLA | Target Resolution SLA |
| :---: | :--- | :--- | :---: | :---: |
| **P1** | **Critical** | Complete service outage, financial balance drift, security breach, or data loss. | $\le 15\text{ minutes}$ | $\le 2\text{ hours}$ |
| **P2** | **High** | Google Sheets sync completely blocked, bill payment transaction failures, auth rate limit loop. | $\le 30\text{ minutes}$ | $\le 6\text{ hours}$ |
| **P3** | **Medium** | Minor UI rendering issue, single-theme styling error, non-blocking reporting lag. | $\le 2\text{ hours}$ | $\le 24\text{ hours}$ |
| **P4** | **Low** | Cosmetic glitch, typo in documentation, non-functional enhancement request. | Next business day | Next sprint |

---

## 2. Emergency Operational Runbooks

### Runbook A: Google Sheets API Quota Exhaustion (HTTP 429)
**Symptom:** `Sync_Log` shows `RESOURCE_EXHAUSTED` or HTTP 429; sync queue length increases.
1. **Immediate Action:** The durable sync queue automatically shifts to exponential backoff with jitter ($base \times 2^{retry}$). Do not spam manual sync.
2. **Investigation:** Check GCP API Console $\rightarrow$ Google Sheets API $\rightarrow$ Metrics to identify request rate spikes.
3. **Mitigation:**
   - Temporarily increase flush interval in `src/lib/googleSheetsService.ts` from 30s to 120s.
   - If quota is permanently saturated, request quota increase in GCP Console or defer batch sync to off-peak hours.
   - Run dead-letter reconciliation:
     ```bash
     curl -X POST -H "Authorization: Bearer [ADMIN_TOKEN]" \
       https://your-domain.com/api/sync/reconcile
     ```

### Runbook B: Firestore Permission Denied (HTTP 403 / Rules Rejection)
**Symptom:** Client shows "Missing or insufficient permissions" when writing tasks or expenses.
1. **Immediate Action:** Check whether recent deployment modified `firestore.rules`.
2. **Investigation:** Open Firebase Console $\rightarrow$ Firestore $\rightarrow$ Rules Monitor to inspect rejected query paths and user tokens.
3. **Mitigation:**
   - Verify client auth token is valid and not expired.
   - Re-deploy known-good `firestore.rules`:
     ```bash
     firebase deploy --only firestore:rules
     ```

### Runbook C: Cloud Run 502/503 Service Unavailable
**Symptom:** Frontend health checks fail or `/api/*` endpoints return 502 Bad Gateway.
1. **Immediate Action:** Check Cloud Run service logs in GCP:
   ```bash
   gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit=20
   ```
2. **Investigation:** Check for container Out-Of-Memory (OOM) or unhandled exceptions during startup.
3. **Mitigation:**
   - Roll back to prior working revision:
     ```bash
     gcloud run services update-traffic focusflow-and-finance --to-revisions [PREVIOUS_REVISION]=100
     ```
   - If memory limit reached, increase Cloud Run container RAM to 1 GiB.

### Runbook D: Authentication Spike / Brute-Force Rate Limiting
**Symptom:** Rate limiter triggers high 429 counts on `/api/auth/*` or `/login`.
1. **Immediate Action:** In-memory sliding-window limiter throttles offending IPs (300 req/min limit).
2. **Investigation:** Inspect server log for repeated failed login attempts from specific CIDR blocks.
3. **Mitigation:**
   - Add offending IP blocks to Cloud Armor / NGINX drop rules.
   - Verify Firebase Authentication email enumeration protection is active in Firebase Console.

---

## 3. Communication Protocol

1. **Internal Notification:** Notify engineering team on designated communications channel within SLA window.
2. **Status Updates:** Update incident channel every 30 minutes for P1 incidents, including:
   - Current hypothesis and findings.
   - Mitigations attempted.
   - Estimated time to restore (ETR).
3. **Resolution Declaration:** Confirm resolution with automated smoke tests before closing the incident.

---

## 4. Post-Mortem & Root Cause Analysis (RCA) Template

All P1 and P2 incidents require an RCA document completed within 48 hours:

```markdown
# Incident Post-Mortem: [TITLE]
**Date:** YYYY-MM-DD  
**Severity:** P1 / P2  
**Incident Commander:** [Name]  
**Duration:** [Start Time] to [End Time] ([Duration])  

## 1. Executive Summary
Brief non-technical description of what occurred and user impact.

## 2. Timeline (UTC)
- HH:MM - Outage detected via alerting.
- HH:MM - Incident commander declared P1.
- HH:MM - Root cause identified.
- HH:MM - Mitigation applied.
- HH:MM - Systems verified recovered.

## 3. Root Cause Analysis (5 Whys)
1. Why did the failure occur?
2. Why was this not caught in staging?
3. Why did the monitoring not alert earlier?
4. Why did the safeguard fail?
5. Root systemic cause.

## 4. Corrective & Preventative Actions
- [ ] Action item 1 (Owner, Due Date)
- [ ] Action item 2 (Owner, Due Date)
```

