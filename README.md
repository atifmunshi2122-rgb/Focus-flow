# FocusFlow & Finance

> **Unified Executive Productivity & Financial Management Platform**  
> *Production Release v1.0.0 — Hardened, deterministic software with zero external AI dependencies.*

FocusFlow & Finance merges high-performance personal productivity management (Pomodoro timer, stopwatch, time-blocking, task trees, recurrence) with strict double-entry personal finance tracking (integer paise calculations, bills with atomic payment lifecycles, digital envelope budgeting, savings targets, and financial analytics).

Data is authoritatively persisted in **Cloud Firestore** and synchronized to a **23-Worksheet Executive Google Sheets Workbook** featuring native interactive charts, automated summary formulas, and custom conditional formatting.

---

## Key Capabilities

### ⚡ Productivity Management
- **Drift-Free Pomodoro & Stopwatch:** Millisecond-accurate monotonic countdown and stopwatch engines with customizable focus/break intervals and session tagging.
- **Hierarchical Tasks & Checklists:** Task organization with nested checklists, priority states, tags, and non-destructive 30-day soft-delete restoration.
- **Idempotent Recurring Workflows:** Period-keyed recurrence prevents duplicate tasks across days, weeks, and months.
- **Productivity Analytics & Streaks:** Daily, weekly, and monthly focus metrics with continuous streak calculations tied to the user's local timezone (`Asia/Kolkata` default).
- **Daily Time-Block Planner:** Visual hourly scheduling interface mapping tasks to energy levels throughout the day.

### 💰 Financial Management
- **Zero-Drift Integer Paise Arithmetic:** Eliminates IEEE 754 floating-point rounding errors by enforcing integer paise ($1.00 = 100\text{ paise}$) throughout all budgets and ledgers.
- **Fixed vs. Variable Expense Segregation:** Categorization separating recurring fixed commitments (rent, utilities) from discretionary variable spending.
- **Atomic Bill Payments & Audit Trail:** Single-transaction bill payments with non-destructive undo functionality and duplicate payment race-condition immunity.
- **Envelope Budgeting:** Category spending limits with 90% and 100% capacity alerts and rollover tracking.
- **Savings Goals:** Visual progress bars, milestone target tracking, and projected completion dates.

### 📊 Premium 23-Worksheet Google Sheets Integration
- **23 Specialized Worksheets:** Complete workbook schema with dedicated executive, financial, and productivity dashboards.
- **5 Native Interactive Charts:** Auto-generated Column, Line, Donut, and Area charts embedded directly into dashboards.
- **Decoupled Synchronization:** Raw values and dynamic formulas (`=SUM(C2:C)`) sync via `values:batchUpdate` without erasing borders, conditional formatting, dropdowns, or charts.
- **Durable Sync Queue:** Server-side queue with exponential backoff and jitter ($1\text{s}, 2\text{s}, 4\text{s}, \dots, 30\text{s}$) protecting against rate limits and transient network drops.

### 🎨 Theme Studio & Ergonomics
- **19 Handcrafted Design Presets:** Fully customizable themes (Minimalism, Neo-Brutalism, Cyberpunk, Forest, Glazed Clay, etc.) with verified WCAG 2.1 AA text contrast in both Light and Dark modes.
- **Fluid Responsive Layouts:** Optimized for screen sizes ranging from $360\text{px}$ mobile devices to $4\text{K}$ monitors with $\ge 44 \times 44\text{px}$ touch targets.
- **Accessible Motion System:** Spring-physics animations adhering strictly to `prefers-reduced-motion` settings.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend Framework** | React 19, TypeScript 5, Vite 8, Rolldown Runtime |
| **Styling & Icons** | Tailwind CSS v4, Lucide React Icons |
| **Motion & Animation** | Motion (Framer Motion v12) |
| **Database & Auth** | Google Cloud Firestore, Firebase Authentication |
| **Backend & Proxy** | Node.js, Express 4, TypeScript, Google APIs Client |
| **Spreadsheet Sync** | Google Sheets API v4 with Batch Value & Schema Updates |
| **Testing** | Node.js Test Runner with `tsx`, 39 Automated Test Suites |

---

## Quick Start

### Prerequisites
- **Node.js**: v20.x or higher
- **npm**: v10.x or higher
- **Firebase Project**: Firestore Database & Firebase Authentication enabled

### Installation

1. **Clone repository:**
   ```bash
   git clone https://github.com/your-username/focusflow-and-finance.git
   cd focusflow-and-finance
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env.local
   ```
   Populate `.env.local` with your Firebase web configuration and server port:
   ```env
   PORT=3000
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

---

## Available Scripts

| Script | Command | Purpose |
| :--- | :--- | :--- |
| `npm run dev` | `tsx server.ts` | Start local backend server and Vite development environment |
| `npm run test` | `node --import tsx --test test/**/*.test.ts` | Execute all 39 unit, financial, and integration tests |
| `npm run lint` | `tsc --noEmit` | Validate TypeScript types across client and server |
| `npm run validate` | `npm run lint && npm test` | Complete pre-commit lint and test pipeline |
| `npm run build:prod` | `npm run clean && npm run build` | Clean dist and compile optimized production bundle |
| `npm run preview` | `vite preview` | Locally preview the production build artifacts |

---

## Production Deployment

For full cloud deployment instructions (Google Cloud Run, Firebase Hosting, Docker, NGINX), refer to:
- [PRODUCTION_DEPLOYMENT_GUIDE.md](file:///Users/munshimdatif/Downloads/focusflow-&-finance/PRODUCTION_DEPLOYMENT_GUIDE.md)
- [FIREBASE_PRODUCTION_SETUP.md](file:///Users/munshimdatif/Downloads/focusflow-&-finance/FIREBASE_PRODUCTION_SETUP.md)
- [ENVIRONMENT_VARIABLES.md](file:///Users/munshimdatif/Downloads/focusflow-&-finance/ENVIRONMENT_VARIABLES.md)

---

## Documentation Directory

| Document | Purpose |
| :--- | :--- |
| [CHANGELOG.md](file:///Users/munshimdatif/Downloads/focusflow-&-finance/CHANGELOG.md) | Release history, bug fixes, and feature evolution |
| [RELEASE_PROCESS.md](file:///Users/munshimdatif/Downloads/focusflow-&-finance/RELEASE_PROCESS.md) | Release cadence, tagging protocol, and rollback runbooks |
| [BACKUP_RECOVERY_GUIDE.md](file:///Users/munshimdatif/Downloads/focusflow-&-finance/BACKUP_RECOVERY_GUIDE.md) | Firestore automated backups, recovery drills, and retention rules |
| [MAINTENANCE_GUIDE.md](file:///Users/munshimdatif/Downloads/focusflow-&-finance/MAINTENANCE_GUIDE.md) | Routine maintenance, dependency updates, and resource controls |
| [DATABASE_MIGRATION_GUIDE.md](file:///Users/munshimdatif/Downloads/focusflow-&-finance/DATABASE_MIGRATION_GUIDE.md) | Zero-downtime schema evolution and data backfill strategies |
| [INCIDENT_RESPONSE_GUIDE.md](file:///Users/munshimdatif/Downloads/focusflow-&-finance/INCIDENT_RESPONSE_GUIDE.md) | Triage protocols, failover actions, and post-mortem procedures |
| [SYSTEM_ARCHITECTURE.md](file:///Users/munshimdatif/Downloads/focusflow-&-finance/SYSTEM_ARCHITECTURE.md) | Complete architectural specifications and data flow diagrams |

---

## License & Support

FocusFlow & Finance is licensed under the MIT License. For inquiries, technical audits, or security reports, please consult the [SECURITY_CHECKLIST.md](file:///Users/munshimdatif/Downloads/focusflow-&-finance/SECURITY_CHECKLIST.md).
