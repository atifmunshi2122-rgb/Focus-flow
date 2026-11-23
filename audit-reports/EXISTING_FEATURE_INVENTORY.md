# FocusFlow & Finance v1.7.0 — Existing Feature Inventory

**Audit Date:** November 2026  
**Audited Baseline:** v1.7.0 (Commit `cb3e4e1`)  
**Methodology:** Direct AST, Component, Route, and Firestore Schema Inspection  

---

## 1. Executive Dashboard & Telemetry
**Primary Component:** `src/components/dashboard/ExecutiveDashboardView.tsx`  
**Supporting Components:** `StatsOverview.tsx`, `RecentActivityList.tsx`, `QuickActions.tsx`, `ProductivityScoreCard.tsx`

* **Daily Productivity Score Engine**: Computes a deterministic score ($0 - 100$) based on completed tasks, pomodoro focus minutes, completed habits, and study review compliance.
* **Consolidated Metric Widgets**: Live indicators for Total Expenses vs Budget, Overdue Bills, Today's Focus Minutes, Pending Tasks, and Spaced Repetition Due Today.
* **Contextual Quick Actions**: Instant launch modals for quick-add task, record expense, log focus session, and create flashcard.
* **Activity Audit Feed**: Real-time unified chronological timeline aggregating financial transactions, study sessions, and completed tasks.
* **Mobile Viewport Optimization**: Stacked flex cards, touch-safe action pills ($>44\text{px}$ touch targets), and zero horizontal overflow.

---

## 2. Tasks & Time Blocking Planner
**Primary Components:** `src/components/tasks/TaskManager.tsx`, `DailyTimeBlockPlanner.tsx`, `TimeBlockModal.tsx`  
**Backend Routes:** `/api/tasks`, `/api/time-blocks` in `server/routes.ts`  
**Firestore Path:** `/users/{userId}/tasks`, `/users/{userId}/time_blocks`

* **Task Management**:
  * Full CRUD with title, description, priority (`low`, `medium`, `high`, `urgent`), category tag, and due date.
  * Hierarchical Subtasks: Checkable sub-items with auto-progress percentage calculation.
  * Soft-Deletion & Recovery: Tasks are soft-deleted (`deletedAt: timestamp`) with full restoration capabilities from Settings/Recovery Center.
  * Actual vs Estimated Duration: Tracks both estimated duration and logged focus seconds (`actualDurationSeconds`).
* **Daily Time Block Planner**:
  * 24-hour visual schedule grid with draggable/clickable time allocation blocks.
  * Direct linking between tasks and time blocks.
  * Conflict detection and overlap prevention.

---

## 3. Pomodoro Focus Engine & Distraction Tracker
**Primary Components:** `src/components/focus/PomodoroTimer.tsx`, `FocusAnalytics.tsx`, `InterruptionLoggerModal.tsx`, `RealClock.tsx`  
**Backend Routes:** `/api/focus/sessions`, `/api/focus/stats` in `server/routes.ts`  
**Firestore Path:** `/users/{userId}/focus_sessions`, `/users/{userId}/pomodoro_presets`

* **Drift-Free Precision Timer**: Web Worker-backed and timestamp-delta calculated countdown preventing background tab throttling and drift.
* **Cross-Tab Synchronization**: `BroadcastChannel` synchronization guaranteeing all open browser tabs reflect the exact same timer state and phase (`work`, `shortBreak`, `longBreak`).
* **Distraction & Interruption Logger**: Modal for logging internal and external interruptions mid-session with category tagging and distraction reason.
* **Preset Manager**: Custom Pomodoro profiles (e.g., Classical 25/5, Deep Work 50/10, Ultradian 90/20) persisted to Firestore.
* **Focus Analytics**: Visual daily/weekly focus charts, completion rates, category distribution, and streak counter.
* **Real Analog & Digital Clock**: High-contrast, theme-aware dial displaying local time with second-hand precision.

---

## 4. Habit Tracker & Heatmap
**Primary Components:** `src/components/habits/HabitTrackerView.tsx`, `HabitCard.tsx`, `HabitHeatmap.tsx`, `StreakCounter.tsx`  
**Backend Routes:** `/api/habits`, `/api/habits/:id/toggle` in `server/routes.ts`  
**Firestore Path:** `/users/{userId}/habits`

* **Daily Habit Tracking**: Toggle completion status for today with instant optimistic UI update and offline queue fallback.
* **Timezone-Aware Streak Engine**: Accurate streak calculation respecting the user's configured timezone (e.g., `Asia/Kolkata`, `UTC`, `America/New_York`) without midnight boundary drift.
* **GitHub-Style Activity Heatmap**: Visual yearly/monthly grid displaying frequency and intensity of habit completions.
* **Category & Cadence Options**: Supports daily, weekday, and custom target weekly frequencies.

---

## 5. Academic Study OS & Spaced Repetition System
**Primary Component:** `src/components/study/StudyView.tsx`  
**Supporting Components:** `TopicTracker.tsx`, `SpacedRepetitionLadder.tsx`, `FlashcardsDeck.tsx`, `QuizRunner.tsx`, `MistakeNotebook.tsx`, `ExamCountdown.tsx`  
**Backend Routes:** `/api/study/*` (18 distinct endpoints in `server/routes.ts`)  
**Firestore Paths:** `/users/{userId}/study_subjects`, `/study_topics`, `/study_revisions`, `/study_mistakes`, `/study_exams`, `/study_flashcards`, `/study_quizzes`

* **Subject & Topic Syllabus Tracker**: Multi-tier course subject management with chapter-by-chapter and topic-by-topic tracking.
* **Ebbinghaus Spaced Repetition (5-Stage Ladder)**:
  * Deterministic interval scheduling: Stage 1 (1 day), Stage 2 (3 days), Stage 3 (7 days), Stage 4 (14 days), Stage 5 (30 days / Mastered).
  * Automated categorization into: Overdue, Due Today, Upcoming, and Mastered.
  * Active Recall Quality Scoring: Rating recall (1–5) adjusts interval ladder position.
* **Flashcard Deck System**: Dual-sided flip flashcards with topic tagging and mastery progression.
* **Quiz & Assessment Runner**: Timed multiple-choice quizzes with automated scoring and mistake logging.
* **Mistake Notebook**: Dedicated repository for logging concepts, incorrect quiz answers, or problem-solving errors with corrective notes.
* **Exam Countdown & Readiness Calculator**: Visual countdown to exam date with readiness percentage calculated from topic completion and mastered revisions.

---

## 6. Personal Finance Engine
**Primary Components:** `src/components/finance/FinanceOverview.tsx`, `TransactionsLedger.tsx`, `EnvelopeBudgetManager.tsx`, `BillsTracker.tsx`, `SubscriptionManager.tsx`, `SavingsGoalsManager.tsx`, `RecurringTransactions.tsx`  
**Backend Routes:** `/api/finance/*`, `/api/envelopes/*`, `/api/subscriptions/*` in `server/routes.ts`  
**Firestore Paths:** `/users/{userId}/expenses`, `/income`, `/envelopes`, `/bills`, `/subscriptions`, `/savings_goals`

* **Transactions Ledger**: Comprehensive income and expense recording with category tagging, payment methods, date, and notes.
* **Zero-Based Envelope Budgeting**:
  * Allocation of monthly income into dedicated virtual envelopes.
  * Real-time spending progress bars with warning threshold alerts (50%–100%).
  * Inter-envelope fund transfers (`/api/envelopes/transfer`).
* **Bill & Due Date Reminder Tracker**: Tracks utility and credit card bills, due dates, paid status, and overdue flags.
* **Subscription Management**: Tracks SaaS and service subscriptions, billing frequencies (monthly/annual), renewal dates, and annual cost projections.
* **Savings Goals & Milestone Fund**: Target savings goals with progress tracking and direct contribution deposits.
* **Recurring Transactions Engine**: Scheduled recurring income/expenses with automated projection.

---

## 7. Couple / Partner Shared Savings (Joint Vaults)
**Primary Component:** `src/components/vaults/JointVaultsView.tsx`  
**Supporting Components:** `VaultSummaryCard.tsx`, `ContributeModal.tsx`, `RecordExpenseModal.tsx`, `SettleUpModal.tsx`, `InvitePartnerModal.tsx`  
**Backend Worker:** `server/vaultBackendService.ts`  
**Firestore Path:** `/joint_vaults/{vaultId}`, `/joint_vault_invitations/{inviteCode}`

* **Keyless Joint Vault Architecture**: Multi-member shared financial pools supporting up to 2 partners (e.g. couples/roommates).
* **Cryptographic Invite Codes**: CSPRNG-generated single-use invitation codes ($>80\text{ bits}$ entropy) with atomic acceptance and replay protection.
* **Dynamic Contribution Ratios**: Configurable split ratios (e.g., 50/50, 60/40, 70/30).
* **Shared Expense Ledger**: Shared expenses deducted directly from vault balance with participant contribution tracking.
* **Fair Settlement Calculator**: Automatically calculates net balance and who owes whom for zero-dispute settlements.
* **Firestore Security Invariant**: Hardened `getAfter()` rules preventing unauthorized vault withdrawal or balance tampering.

---

## 8. Universal Sheet Sync Hub
**Primary Component:** `src/components/sheets-hub/SheetHubView.tsx`  
**Supporting Components:** `ConnectSheetWizard.tsx`, `SheetConnectionCard.tsx`, `TabMappingModal.tsx`, `GoogleSheetPickerModal.tsx`  
**Backend Workers:** `server/universalSheetsWorker.ts`, `server/sheetsWorker.ts`, `server/driveWorker.ts`, `server/appsScriptBridgeWorker.ts`  
**Firestore Path:** `/users/{userId}/sheet_connections`, `/users/{userId}/sheet_tabs`

* **Connection Modes**:
  1. *Public Read-Only*: Inspects published spreadsheets without requiring Google OAuth via API Key.
  2. *Two-Way Checkbox Write-Back*: Authenticates via Google OAuth and performs granular cell updates (`spreadsheets.values.update`) directly into target spreadsheet cells.
  3. *Dual-Copy (Template Duplication)*: Automatically clones a master spreadsheet template in user's Google Drive via Drive API v3 and establishes sync.
  4. *Apps Script Webhook Bridge*: Alternative server-to-server writeback bridge using HMAC-SHA256 signature verification.
* **Interactive Google Picker Dialog**: In-browser Drive Sheet Picker powered by Google Identity Services and Picker API.
* **Multi-Tab Schema Mapping**: Automatically maps spreadsheet tabs to FocusFlow entities (Habits, Study Topics, Expenses).
* **Durable Idempotency Ledger**: Firestore-backed deduplication preventing duplicate row pushes during network retries.

---

## 9. Google Calendar Two-Way Synchronization
**Primary Backend Service:** `server/integrations/googleCalendarService.ts`  
**Frontend Service:** `src/lib/googleCalendarService.ts`  
**Backend Routes:** `/api/integrations/google-calendar/*`

* **OAuth 2.0 Web Flow**: Popup-based OAuth 2.0 flow with state verification, token exchange, and refresh token rotation.
* **At-Rest Token Encryption**: Refresh tokens and access credentials are encrypted at rest using AES-256-GCM (`server/crypto.ts`).
* **Task-to-Calendar Event Sync**: Automatically synchronizes FocusFlow task deadlines and time blocks into user's Google Calendar with configurable category color coding.
* **Least-Privilege Scoping**: Strictly requests `https://www.googleapis.com/auth/calendar.events` without demanding full calendar account administration.

---

## 10. Firebase Cloud Messaging (Web Push)
**Primary Backend Service:** `server/integrations/pushNotificationService.ts`  
**Frontend Client:** `src/lib/pushNotifications.ts`  
**Service Worker:** `public/sw.js` (Handles `push` and `notificationclick`)

* **HTTP v1 Multicast Push**: Modern Admin SDK messaging (`sendEachForMulticast()`) supporting multi-device delivery.
* **Device Installation Management**: Tracks active browser tokens per user under `/users/{userId}/fcm_installations`.
* **Stale Token Pruning**: Automatically detects `messaging/registration-token-not-registered` errors and deletes dead tokens from Firestore.
* **Daily Scheduled Notification Cron**: Vercel Cron (`0 8 * * *`) triggers `/api/cron/notifications` with `CRON_SECRET` bearer authentication, dispatching daily reminders for tasks, bills, and spaced repetition.

---

## 11. Unified Export Center
**Primary Component:** `src/components/export/ExportCenterView.tsx`  
**Export Engines:** `LuxuryPdfGenerator.ts`, `XlsxWorkbookGenerator.ts`, `CsvDataGenerator.ts`

* **Luxury PDF Reports**: Multi-page, formatted financial and productivity executive summaries with custom fonts, clean tables, and breakdown charts.
* **Native Excel (XLSX) Workbooks**: Structured multi-tab workbooks generated client-side using OpenXML standards.
* **Standard CSV / JSON Export**: Complete database backup export for local archiving and spreadsheet import.

---

## 12. Theme Studio 2.0 & Settings Ecosystem
**Primary Component:** `src/components/settings/SettingsView.tsx`  
**Theme Studio:** `src/components/settings/ThemeStudio.tsx`, `ThemeManagementLibrary.tsx`, `ColorEcosystem.tsx`

* **Theme Preservation**: Strictly verified inventory of 19 handcrafted visual design styles, 10 accents, 8 font pairings, 7 gradients, and 100 curated color palettes (`src/theme/palettes100.ts`).
* **Interactive Theme Studio**: Custom palette generator with real-time contrast checking, JSON export/import, and CSS variables injection.
* **Multi-Timezone Engine**: Native support for global timezones (`Asia/Kolkata`, `UTC`, `America/New_York`, etc.) with day boundary alignment.
* **Data Recovery & Resilience Center**: In-browser backup manager, local cache reset, Firestore cloud sync recovery, and orphan record repair.

---

## 13. Universal Search & Command Palette (Ctrl/Cmd+K)
**Component:** `src/components/common/UniversalCommandPalette.tsx`  
**Engine:** `src/lib/searchEngine.tsx`

* **Global Instant Search**: Searches across all entities simultaneously: Tasks, Habits, Study Topics, Expenses, Flashcards, Settings, and Navigation.
* **Keyboard Shortcut Registry**: Complete keyboard navigation (modal hotkeys, quick-add, tab switching).
* **Recent Searches & Actions**: Local storage backed recent history with deduplication.

---

## 14. Architecture, Offline & Security Foundations
* **Vercel Serverless Ready**: EROFS-safe filesystem fallback using `/tmp/focusflow-data` and memory mode.
* **Offline-First Outbox**: Actions queue in `sync_queue` during network loss and drain sequentially upon reconnection.
* **Firestore Security Rules**: Over 2,700 lines of declarative rules enforcing tenant isolation, type safety, and atomic transactions.
* **Staging Gate Isolation**: Prevents Vercel preview environments from writing to the production Firestore database.

