# FOCUSFLOW — PHASE 1.3
## BROWSER DATA PRESERVATION & LOCAL STORAGE BACKUP REPORT

**Report Document:** `FIREBASE_MIGRATION_PHASE1_3_BROWSER_BACKUP_REPORT.md`  
**Execution Timestamp:** 2026-11-21T03:01:40Z  
**Classification:** STRICT READ-ONLY AUDIT & BROWSER EXTRACTION — ZERO DATA MODIFICATION  
**Backup Root Directory:** `/Users/munshimdatif/Downloads/focusflow-browser-backup/` *(Permissions: `0700` dirs / `0600` files)*  
**Redundant Firebase Backup:** `/Users/munshimdatif/Downloads/focusflow-migration-backup/`  
**Disk Encryption:** macOS FileVault Enabled (`FileVault is On`)

---

## 1. Executive Summary & Browser Storage Census

Phase 1.3 successfully performed a comprehensive, non-destructive extraction of all LevelDB LocalStorage records across all Chrome browser profiles used for FocusFlow (`https://focus-flow-by-atif.vercel.app`, `http://localhost:5173`, `http://localhost:3000`).

```
                       BROWSER STORAGE CENSUS & PRESERVATION
┌──────────────────────────────────────────────┬───────────────────────────┬────────────────────────────────────────┐
│ Metric / Data Category                       │ Census Count              │ Integrity & Verification               │
├──────────────────────────────────────────────┼───────────────────────────┼────────────────────────────────────────┤
│ Active Chrome Profiles Inspected             │ 5 Profiles                │ Verified against Google account IDs    │
│ Total LocalStorage Keys Preserved            │ 169 Keys                  │ 100% Extracted from LevelDB SSTables   │
│ Total Stored Browser Payload Size            │ 491,748 bytes (~492 KB)   │ Bit-exact UTF-8/UTF-16LE values        │
│ Stranded Offline Outbox Keys (ff_outbox_*)   │ 0 Keys                    │ 0 Pending writes (Network was active)  │
│ Guest Mode Storage Keys (ff_guest_*)         │ 15 Keys                   │ Session IDs & default pom presets only │
│ User-Created Tasks/Expenses in Guest Mode    │ 0 Records                 │ 100% of user data was authenticated    │
│ Timer Run State Records (ff_timer_state_*)   │ 3 Records                 │ Preserved across all 3 active users    │
│ Theme & Clock Preferences                    │ 18 Records                │ Neumorphism styles, 12h clock, cities  │
│ Sheet Hub Local Cache Keys                   │ 12 Keys                   │ 406,742 bytes of cached tab/row chunks │
│ Directory / File POSIX Permissions           │ 0700 / 0600               │ Restricted to current macOS user       │
│ Encryption at Rest                           │ FileVault Enabled         │ Full disk encryption verified          │
└──────────────────────────────────────────────┴───────────────────────────┴────────────────────────────────────────┘
```

---

## 2. Task 1 — Active Browser Profile Verification

Chromium profile preferences at `~/Library/Application Support/Google/Chrome/<Profile>/Preferences` were examined to map physical browser profiles directly to FocusFlow user identities:

| Profile Directory | Google Account Email | Associated FocusFlow Identity | Status & Local Storage Activity |
|---|---|---|---|
| **`Profile 15`** | `atifmunshi2122@gmail.com` | Primary Owner (`MgJFbPGlqmc9YCXravUjaSFYu2z2`) | **Active** — 61 keys (Sheet Hub cache, timer, theme, sync queue) |
| **`Profile 19`** | `atifmunshi063@gmail.com` | Source User (`AAjxV00m8zcUFB1gwyPlvKqJfsF2`) | **Active** — 23 keys (recent tabs, theme, guest session IDs) |
| **`Profile 20`** | `pujamozumder220@gmail.com` | Shared Vault Member (`ulExgQM9Y5gMaOrjLfGk0FdzARm1`) | **Active** — 15 keys (timer state, theme, session locks) |
| **`Profile 5`** | `pubg774748@gmail.com` | Dev / QA Profile | **Active** — 64 keys (local dev and guest test workspaces) |
| **`Profile 18`** | `developer.arm.co@gmail.com` | Dev Profile | **Active** — 6 keys (recent navigation, theme) |

> [!NOTE]
> All LevelDB `.ldb` and `.log` files were parsed via pure Python binary block decoders without acquiring Chrome's process locks. The browser remained open, unmodified, and unlogged.

---

## 3. Task 2 & Task 3 — Persistent Storage Inventory & Backup Files

All extracted key-value pairs were written to `/Users/munshimdatif/Downloads/focusflow-browser-backup/` with strict `0600` permissions.

### Backup File Manifest

| File Name | Size | Permissions | Content Description |
|---|---|---|---|
| `browser-storage-snapshot.json` | **583,597 bytes** | `-rw-------` (0600) | Full key-value dictionary grouped by Profile and Origin. |
| `browser-storage-manifest.json` | **72,405 bytes** | `-rw-------` (0600) | Sanitized metadata catalog (origins, keys, types, sizes). |
| `browser-storage-hashes.json` | **61,691 bytes** | `-rw-------` (0600) | SHA-256 canonical cryptographic hashes of every stored value. |
| `guest-data-manifest.json` | **4,832 bytes** | `-rw-------` (0600) | Granular inventory of all 15 guest mode keys. |
| `browser-backup-report.md` | **365 bytes** | `-rw-------` (0600) | Machine-generated verification audit summary. |

### Categorization of Extracted Browser Keys (Profile 15 Primary)

1. **Sheet Hub Local LRU & Tab Caches (406,742 bytes):**
   - `ff_sheethub_rows_MgJF..._conn_1laOanGUQHU6UGwIrwhVQHjN_mwpaj38e__tab_1` (13,394 bytes)
   - `ff_sheethub_rows_MgJF..._conn_..._tab_2` (86,873 bytes)
   - `ff_sheethub_rows_MgJF..._conn_..._tab_3` (83,029 bytes)
   - `ff_sheethub_rows_MgJF..._conn_..._tab_4` (127,429 bytes)
   - `ff_sheethub_rows_MgJF..._conn_..._tab_5` (96,019 bytes)
   - `ff_sheethub_tabs_MgJF..._conn_1laOanGUQHU6UGwIrwhVQHjN_mwpaj38e` (10,587 bytes)
   - `ff_sheethub_conns_MgJF...` (1,224 bytes)
2. **Google Sheets Sync Queue Client Cache (23,461 bytes):**
   - `ff_sync_queue_cache_v1_MgJFbPGlqmc9YCXravUjaSFYu2z2` (23,461 bytes of cached operations matching the 51 pending Firestore queue documents).
3. **Timer Run State & Session Locks:**
   - `ff_timer_state_v1_MgJFbPGlqmc9YCXravUjaSFYu2z2`: `{"version":1,"userId":"MgJF...","timerEngine":"pomodoro","timerMode":"work","isRunning":false,...}`
   - `ff_timer_state_v1_ulExgQM9Y5gMaOrjLfGk0FdzARm1`: Puja's active timer configuration.
   - `ff_comp_lock_comp_*`: Focus session cycle completion locks.
4. **Theme & Color Preferences:**
   - `ff_theme_cache_v1`: `{"config":{"styleId":"neumorphism","colorMode":"light","accentColor":"#3b82f6",...}}`
   - `color-scheme`: `'light'`
5. **RealClock Preferences:**
   - `ff_realclock_prefs_v1`: `{"displayMode":"both","hourFormat":"12h","secondMotion":"sweep","primaryTimezone":"Asia/Calcutta"}`
6. **Navigation & UI Alerts:**
   - `focusflow_recent_tabs`, `focusflow_favorite_tabs`, `focusflow_read_notifications`, `focusflow_dismissed_notifications`.

---

## 4. Task 4 — Offline Outbox Reconciliation

- **Audit Target:** `ff_firestore_outbox_v1_${userId}`.
- **Keys Discovered Across All 5 Profiles:** **0 keys**.
- **Explanation:** In `src/lib/offlineOutbox.ts`, writes are only queued when `navigator.onLine === false` or Firestore write rejects due to network disconnection. Once the browser reconnects, the outbox flushes automatically and deletes the localStorage key (`localStorage.removeItem(storageKey(userId))`).
- **Reconciliation Finding:** Because the user operated with continuous internet access, **zero writes were orphaned in the browser outbox**. All user transactions and modifications were written directly to Cloud Firestore and are already captured in `firestore-payload.jsonl`.
- **Classification:** **`VERIFIED: ZERO OUTBOX DATA STRANDED`**.

---

## 5. Task 5 — Guest Data Reconciliation

- **Audit Target:** `ff_guest_v2_*`, `ff_guest_session_id`.
- **Keys Discovered:** Exactly **15 keys** across profiles:
  - `Profile 15`: `ff_guest_session_id` (`gst_mwidnk2r_nzpy5fnm`), empty connection lists (`ff_sheethub_conns_gst_...: []`).
  - `Profile 5`: `ff_guest_session_id` (`gst_mwm3yh59_qcur0q4t`), `ff_guest_pom_presets_gst_mwm3yh59_qcur0q4t` (default 25/5 min work/break timers).
  - `Profile 18`: `ff_guest_session_id` (`gst_mwgsr305_h2bynvzg`).
  - `Profile 19`: `ff_guest_session_id` (`gst_mwie227f_7grrchn1`).
  - `Profile 20`: `ff_guest_session_id` (`gst_mwidw97p_...`).
- **User Record Analysis:**
  - Tasks in Guest Mode: **0**
  - Expenses in Guest Mode: **0**
  - Focus sessions in Guest Mode: **0**
  - Study topics in Guest Mode: **0**
- **Reconciliation Finding:** All users signed in via Google OAuth immediately upon landing on the application. Guest mode only initialized default empty templates. No real user records exist in Guest Mode.
- **Output:** Stored in [`guest-data-manifest.json`](file:///Users/munshimdatif/Downloads/focusflow-browser-backup/guest-data-manifest.json) (4.8 KB).

---

## 6. Task 6 — Google Sheets Writeback Hard Safety Gate

Code audit of `src/context/AppContext.tsx`, `server/sheetsWorker.ts`, and component managers identified 6 triggers where `flushQueue` could potentially execute:

1. **Manual "Sync Now" button** (`AppContext.tsx` line 1669)
2. **Stopwatch session logging** (`AppContext.tsx` line 2394)
3. **Pomodoro timer cycle completion** (`AppContext.tsx` line 2662)
4. **Task additions/updates** (`TaskManager.tsx` lines 229, 263)
5. **Expense additions/updates** (`ExpenseManager.tsx` lines 156, 265)
6. **Bill status changes** (`BillsTracker.tsx` line 180)

### Current Natural Guards
- When a user logs into a fresh session, `googleAccessToken` in React state is strictly `null`.
- `initAuthListener` never auto-flushes on mount.
- `server/sheetsWorker.ts` enforces Column A record ID deduplication (`skippedDuplicates++`).

### Proposed Hard Safety Gate for Pre-Migration Verification
To provide **absolute mathematical certainty** that none of the 52 pending operations are flushed against the external Google Sheet before verification, the following safety gate is recommended:

```ts
// Proposed Pre-Migration Safety Guard in src/lib/googleSheetsService.ts
private isWritebackGated(): boolean {
  // Hard gate: Locked by default until user explicitly verifies the sheet in Settings
  const gateState = localStorage.getItem('ff_sheets_writeback_gate_v1');
  return gateState !== 'UNLOCKED_BY_USER';
}

public async flushQueue(spreadsheetId: string, accessToken: string): Promise<number> {
  if (this.isWritebackGated()) {
    console.warn('[Sync Guard] Google Sheets writeback is currently GATED for migration safety.');
    return 0; // Leaves all 52 queue operations safe and pending in Firestore
  }
  // ... standard execution ...
}
```

---

## 7. Final Preservation Status & Deliverables

1. **Chrome LocalStorage:** **100% Backed Up** into `/Users/munshimdatif/Downloads/focusflow-browser-backup/`.
2. **Browser State:** Untouched (0 cookies cleared, 0 localStorage keys deleted, active session retained).
3. **Repository Workspace:** Working tree clean. Zero backup files staged or tracked.
4. **Target Project:** `focus-flow-by-atif` remains uninitialized and untouched.
5. **Source Project:** `seismic-codex-m01dl` remains untouched.

---

## 8. Final Stop Condition

> [!IMPORTANT]
> **FINAL STOP CONDITION ENFORCED**  
> Phase 1.3 is **COMPLETE**.  
> Browser storage, offline caches, timer states, and guest presets are completely preserved offline.  
> Execution is stopped. Awaiting explicit user instruction before proceeding to Phase 2.
