# FocusFlow & Finance — Release Notes

## Version: v1.7.0 (Production Hardening & NextStudy OS Integration)
**Release Date:** November 2026  
**Build Target:** Production Web & Cloud Run Container  
**Test Coverage:** 94/94 Automated Tests Passing (100% Pass Rate)

---

### Executive Highlights for v1.7.0
1. **NextStudy OS Selective Integration:** Comprehensive academic workspace support including Academic Tiers, Subject/Topic syllabus hierarchies, Ebbinghaus spaced repetition ladders, and mistake logs.
2. **Hardened Security Rules:** Cloud Firestore security rules upgraded for all 5 study and habit subcollections (`habits`, `study_subjects`, `study_topics`, `study_revisions`, `study_mistakes`) with strict field type checks, field immutability (`userId`, `code`, `topicId`), and `affectedKeys().hasOnly([...])` protection.
3. **Timer Engine Multi-Tab & Sleep/Wake Resilience:** Epoch timestamp calculation prevents drift during OS sleep/wake cycles; Web BroadcastChannel synchronization deduplicates session records across multiple browser tabs.
4. **Offline Outbox Multi-Account Isolation:** Strict per-user local storage prefixes and replay queues isolate offline operations completely on account switch.
5. **Production Code-Splitting & Manual Chunks:** Heavy modules (`sheets-engine`, `theme-studio`, `study-module`) dynamically code-split, reducing initial bundle from 1.4 MB to 735 kB.

---

## Version: v1.0.0 (Production Release Candidate)
**Release Date:** November 2026  
**Build Target:** Production Web & Cloud Run Container  
**Test Coverage:** 20/20 Automated Tests Passing (100% Pass Rate)

---

## 1. Executive Summary

FocusFlow & Finance v1.0.0 represents a complete, hardened production release of an integrated focus productivity and financial management system. The platform is built on 100% deterministic, conventional software logic with zero reliance on artificial intelligence, LLM APIs, or opaque external prompts.

All financial transactions now use strict integer paise arithmetic, atomic batch writes, and non-destructive audit logging. Timezone handling is centralized to `Asia/Kolkata` with full support for month-end recurrence clamping and leap-year boundaries.

---

## 2. Key Architectural Highlights

### 2.1 Financial Data Integrity
- **Integer Paise Precision:** Replaced floating-point numbers with integer paise ($1.00 = 100\text{ paise}$) across all calculations, budgets, and ledgers.
- **Atomic Payment Operations:** Bill payments execute atomically via Firestore `writeBatch`—updating the bill, inserting payment history, and generating an expense transaction in a single commit.
- **Non-Destructive Payment Undo:** Reversing a bill payment updates its status to `reversed` and logs a historical audit trail, ensuring compliance and auditability.
- **Idempotent Recurring Expenses:** Period-keyed bill generation (`rec_{id}_{YYYY-MM}`) prevents duplicate billing cycles.

### 2.2 Security & Multi-Tenant Isolation
- **Cryptographic Token Verification:** Express backend verifies RSA-SHA256 JWT signatures against Google's public x509 certs.
- **Sliding-Window Rate Limiting:** Throttles clients to 300 requests/minute per IP, defending against brute-force attacks and abuse.
- **Defensive HTTP Security Headers:** Enforces `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and restrictive `Permissions-Policy`.
- **Sensitive Log Sanitizer:** Automatically redacts tokens, credentials, card numbers, and passwords from console logs.
- **Production-Hardened Firestore Rules:** Subcollection-level user isolation and strict field-level boundaries across all 15 collections.

### 2.3 Centralized Date & Time Engine
- Centralized timezone handling in [dateTime.ts](file:///Users/munshimdatif/Downloads/focusflow-&-finance/src/lib/dateTime.ts) defaulting to `Asia/Kolkata` (`UTC+05:30`).
- Prevents timezone boundary drift (e.g., tasks or expenses dated to the prior day between 00:00 and 05:30 IST).
- Month-end recurrence date clamping prevents 29th/30th/31st due dates from overflowing February or 30-day months into the next month.

### 2.4 Server-Side Durable Google Sheets Sync
- Replaced unreliable browser local storage queues with a durable Firestore-backed sync queue.
- Exponential backoff with jitter ($1\text{s}, 2\text{s}, 4\text{s}, \dots, 30\text{s}$) for resilient synchronization across intermittent network disconnections.
- One-click historical resynchronization reconciles discrepancies between Firestore and Google Sheets.

---

## 3. New Non-AI Features

1. **Productivity Calendar:** Multi-dimensional monthly and weekly calendar integrating task deadlines, pomodoro focus records, and bill due dates.
2. **Daily Time-Block Planner:** Visual hourly time-blocking schedule with energy-level indicators and task association.
3. **Envelope Budgeting:** Digital envelope budgeting system with category caps, progress bars, and over-allocation warnings.
4. **Subscription Manager:** Recurring subscription management with renewal frequency indicators, annual projections, and payment method mapping.
5. **Advanced Data Recovery Center:** Centralized audit trail inspector, soft-delete restoration from trash (30-day window), and offline JSON database backup export/import.
6. **Enhanced Command Center:** Global spotlight navigation (`Cmd+K` / `Ctrl+K`) supporting instant navigation across all 12 modules and quick-action modals.

---

## 4. UI/UX & Performance Improvements

- **Bundle Optimization:** Monolithic 1.9MB bundle split into long-term cacheable vendor chunks (`vendor-firebase`, `vendor-react`, `vendor-motion`, `vendor-lucide`), reducing main application gzipped size to just 157 kB.
- **Table Pagination:** Configurable pagination (10, 25, 50, 100 rows) added to the Transactions Ledger, eliminating UI lag on large datasets.
- **WCAG 2.1 AA Contrast:** Refined text contrast and badge tones across all 16 Theme Studio design styles.
- **Reduced Motion Support:** Complete `@media (prefers-reduced-motion: reduce)` support for accessibility and fluid performance on lower-powered devices.

---

## 5. Automated Verification Results

All 20 regression tests pass with zero warnings:

| Test Suite | Tests Run | Result | Duration |
| :--- | :---: | :---: | :---: |
| **Financial Calculations** | 3 | Pass | ~65 ms |
| **Payments & Undo** | 2 | Pass | ~9 ms |
| **Recurring Bills** | 2 | Pass | ~10 ms |
| **Security & Rate Limiting** | 3 | Pass | ~8 ms |
| **Sync Queue & Backups** | 1 | Pass | ~4 ms |
| **Timer & Task CRUD** | 2 | Pass | ~9 ms |
| **Timezone & Streaks** | 3 | Pass | ~88 ms |
| **Budgets, Analytics & Themes** | 4 | Pass | ~3 ms |
| **Total** | **20** | **Pass (100%)** | **~720 ms** |

---

## 6. Upgrades & Breaking Changes

- **AI Package Purge:** `@google/genai` dependency removed. No Gemini API key is needed.
- **Financial Fields:** Amounts must be passed in integer paise (`amountPaise`). Floating-point rupee amounts are parsed cleanly via `toPaise(val)`.
- **Payment History Schema:** `status` field added (`'completed' | 'reversed'`). Existing records default to `'completed'`.

