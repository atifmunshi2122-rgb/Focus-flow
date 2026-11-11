# Firebase & Google Sheets Synchronization System

Architectural blueprint and integration plan for implementing Cloud Firestore as the real-time primary database with Firebase Authentication (Google Sign-In), combined with automated, real-time Google Sheets record-keeping across 12 professionally styled financial and focus worksheets.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were confirmed during the Phase 1 interactive interview and will govern implementation:

- **Confirmed Decision 1 (Master Workbook Setup)**: The app will automatically initialize and style a dedicated master spreadsheet in the user's Google Drive titled `FocusFlow & Finance - Master Ledger` containing the 12 required worksheets with professional styling, freeze-panes, color-coded headers, and formulas.
- **Confirmed Decision 2 (Real-Time Sync Engine)**: Data mutations (Focus sessions, tasks, income, fixed expenses, variable expenses, bill status updates) will synchronize immediately to Google Sheets via an in-memory & persistent retry queue to prevent any data loss if Google APIs are temporarily unreachable.
- **Confirmed Decision 3 (Authentication Strategy)**: Google Sign-In with popup (`signInWithPopup`) via Firebase Authentication, providing a single seamless login for both personal Firestore data isolation and Google Drive/Sheets authorization.

---

## 1. Overview & Core Concept

### What It Delivers
- **Cloud Firestore Primary Database**: Real-time reactive data layer isolating every user's tasks, focus sessions, income streams, recurring expenses, and payment records with zero-trust Firestore security rules (`firestore.rules`).
- **Google Sheets Automated Synchronization**: Real-time bi-directional synchronization and formatted record-keeping in Google Sheets with 12 distinct worksheets:
  1. `Focus_Sessions`: Chronological log of every Pomodoro and break with start/end time and duration.
  2. `Focus_Daily`: Aggregated daily focus minutes, session counts, and streak tracking.
  3. `Focus_Weekly`: Weekly productive hours and daily averages.
  4. `Focus_Monthly`: Monthly productivity totals and completion ratios.
  5. `Income`: Revenue entries, payers, dates, and categorized income streams.
  6. `Fixed_Expenses`: Active recurring commitments (rent, internet, gym) with recurrence frequencies and due days.
  7. `Variable_Expenses`: Day-to-day purchases with categories and payment methods.
  8. `Bills_Payments`: Comprehensive bill ledger with status (PAID/UNPAID/OVERDUE), payment dates, and transaction references.
  9. `Finance_Daily`: Daily cash in, cash out, and net balance summaries.
  10. `Finance_Weekly`: Weekly financial aggregates with spending breakdowns.
  11. `Finance_Monthly`: Complete monthly income vs. expense reconciliation and savings rate.
  12. `Overall_Analytics`: Executive dashboard with totals, KPI summaries, and live spreadsheet formulas (`=SUM`, `=AVERAGE`).
- **Executive Sheets Styling**: Worksheets will feature deep navy `#0F172A` and slate header rows, frozen headers, currency formatting in INR (₹) or active user currency, conditional formatting (green for `PAID`, amber for `UNPAID`, crimson for `OVERDUE`), and proper number formats.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Sign-In Flow**:
   - The user clicks the Google Sign-In button (`Sign in with Google`).
   - Firebase Auth opens a Google popup requesting authentication and Google Workspace scopes (`spreadsheets` and `drive.file`).
   - Upon authentication, Firestore listeners hydrate the app instantly with the user's private data.
2. **Master Sheet Initialization**:
   - In Settings or the Sync Banner, the user sees "Connect Google Sheets".
   - The app checks for an existing `spreadsheetId` stored in the user's Firestore settings; if none exists, it invokes the Google Sheets API to create the 12 tabs with complete styling and headers, saving the ID to Firestore.
   - A direct link ("Open Google Sheets Workbook ↗") appears immediately.
3. **Real-Time Data Mutation & Sync Indicator**:
   - When a user finishes a Pomodoro, logs an expense, or marks a bill as paid, the change writes immediately to Firestore (local optimistic update + real-time listener).
   - The synchronization manager queues the row update for Google Sheets.
   - The Top Bar and Settings display a clean sync indicator with "Last synced just now" and a manual "Sync Now" trigger.
4. **Resilience & Offline Queue**:
   - If network connectivity drops or Google Sheets API returns a transient error, the sync queue persists pending mutations in Firestore/localStorage and retries with exponential backoff.

### Visual Styling & Indicators
- **Google Connection Badge**: Sleek status pill showing Google Account avatar, Connected Sheet title, and live sync pulse.
- **Top Bar Sync Widget**: Compact status displaying `Sync: Real-time active · 12 tabs synchronized`.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Client-Side OAuth Token Passing for Workspace APIs**
  - *Chosen Approach*: Retrieve the Google OAuth access token via Firebase Auth `signInWithPopup(auth, provider)` on the client, and use it to interact directly with the Google Sheets API v4 via proxy or client-side fetch.
  - *Why*: Eliminates server-side redirect URI mismatch errors inherent in preview environments while keeping token management in-memory per security guidelines.
- **Decision 2: Firestore as Primary Source of Truth with Sheets as Mirror**
  - *Chosen Approach*: All app queries read directly from Firestore real-time collections. Google Sheets acts as an export, reporting, and archival ledger.
  - *Why*: Guarantees instant sub-100ms response times for the Pomodoro timer and financial dashboard even when Google Sheets API experiences latency or rate limits.
- **Decision 3: Deduplication with Deterministic Record IDs**
  - *Chosen Approach*: Each row in Google Sheets is tagged with its unique Firestore Document ID in column A (hidden or formatted).
  - *Why*: Prevents duplicate rows during retries or historical re-syncs.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        User Interface (React)                          │
│  ┌──────────────────────┐  ┌─────────────────┐  ┌───────────────────┐  │
│  │ Unified Dashboard    │  │ Pomodoro Timer  │  │ Bills & Payments  │  │
│  └──────────┬───────────┘  └────────┬────────┘  └─────────┬─────────┘  │
└─────────────┼───────────────────────┼─────────────────────┼────────────┘
              │                       │                     │
              ▼                       ▼                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Sync Manager & Data Layer                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Firestore Real-Time Provider & Auth State                        │  │
│  │ (users, tasks, focusSessions, income, expenses, bills, settings) │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│                                     │                                  │
│                                     ▼                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Google Sheets Sync Queue (Deduplicated mutations & retry queue)   │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────────────┼──────────────────────────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
┌───────────────────────────┐                   ┌──────────────────────────┐
│   Google Cloud Firestore  │                   │     Google Sheets API    │
│   (Primary Database)      │                   │   (12 Master Worksheets) │
└───────────────────────────┘                   └──────────────────────────┘
```

### Firestore Schema & Collections
- `/users/{userId}`: Profile and preferences.
- `/users/{userId}/settings/{settingId}`: Active currency, timer durations, `spreadsheetId`, `lastSyncedAt`.
- `/users/{userId}/tasks/{taskId}`: Task records with Pomodoro metrics.
- `/users/{userId}/focus_sessions/{sessionId}`: Completed work and break intervals.
- `/users/{userId}/income/{incomeId}`: Income sources and amounts in minor units (paise).
- `/users/{userId}/recurring_expenses/{recId}`: Fixed recurring commitments.
- `/users/{userId}/expenses/{expenseId}`: Variable and fixed expense disbursements.
- `/users/{userId}/bills/{billId}`: Bills with status `PAID`, `UNPAID`, `OVERDUE` and payment dates.
- `/users/{userId}/payment_history/{payId}`: Audit trail of all completed payments.

### Implementation Phases Upon Approval
1. **Interactive Tools Phase**:
   - Call `show_aistudio_ui` with `ui_type: "firebase_setup"` and verify terms acceptance via `fax.GetFirebaseTos`.
   - Call `rpc_action` to invoke `ProvisionFirebase`.
   - Call `set_up_oauth` with Google Sheets and Google Drive scopes (`spreadsheets`, `drive.file`) and prompt user approval.
2. **Security Rules & Schema**:
   - Create `firebase-blueprint.json` and generate hardened `firestore.rules` validating user isolation (`request.auth.uid == resource.data.userId`).
   - Deploy rules via `DeployRules` RPC.
3. **Google Sheets Sync Engine**:
   - Implement `googleSheetsService.ts` containing the complete 12-worksheet generator with styling, cell formats, frozen rows, conditional formatting, and batch append/update functions.
   - Implement synchronization event listeners that queue changes and push updates to Google Sheets in real-time.
4. **UI Integration**:
   - Add Google Sign-In button and Google Sheets status card with "Open in Google Sheets" and "Sync Now" buttons.
   - Verify all test flows and verify zero build/lint errors.
