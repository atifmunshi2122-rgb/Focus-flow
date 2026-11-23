# FocusFlow & Finance — Advanced Graph Studio Design & Architecture
**Project:** FocusFlow & Finance v1.8.0  
**Document:** `docs/GRAPH_STUDIO_DESIGN.md`  
**Role:** Senior Frontend Developer, Data Visualization Architect, and QA Engineer  
**Status:** Architecture & Component Design Specification (Zero External Libraries, Zero Fake Data)

---

## 1. System Overview & Architectural Invariants

The **Advanced Graph Studio** is a unified, high-performance visualization suite designed to aggregate, correlate, and render real deterministic data across all core operational domains of **FocusFlow & Finance**:
1. **Study OS Analytics** (Academic syllabus completion, spaced repetition recall, study hours, exam scores)
2. **Finance Analytics** (Cashflow trajectory, category spending, budget envelope burn, savings growth)
3. **Productivity Analytics** (Focus hours velocity, circadian 24h heatmap, task burndown, estimated vs actual effort)
4. **Habit Analytics** (Completion heatmaps, streak longevity, weekday consistency, adherence percentages)
5. **Custom Reports** (Cross-domain correlations, executive export center, printable statements)

```
+---------------------------------------------------------------------------------------------------------+
|                                    ADVANCED GRAPH STUDIO ARCHITECTURE                                    |
+---------------------------------------------------------------------------------------------------------+
|                                  [ GraphStudioToolbar ]                                                 |
|   Domain Filter: [ All | Study OS | Finance | Productivity | Habits | Custom Reports ]                  |
|   Time Range:    [ Today | 7D | 30D | 90D | 180D | 1Y | All | Custom Datepicker ]                       |
|   Actions:       [ Refresh | Toggle Compare Mode | Export Active View (PNG / CSV) ]                     |
+---------------------------------------------------------------------------------------------------------+
|                                      MAIN STUDIO VIEWPORT                                               |
|  +------------------------------------+  +------------------------------------+                         |
|  | [ Section 1: Study OS Analytics ]  |  | [ Section 2: Finance Analytics ]   |                         |
|  | - Study Activity Heatmap           |  | - Monthly Cashflow (In vs Out)     |                         |
|  | - Subject-Wise Focus Hours         |  | - Budget vs Actual Spending Burn   |                         |
|  | - Weekly/Monthly Study Velocity    |  | - Category Spending Trajectory     |                         |
|  | - Syllabus Completion Progress     |  | - Savings Growth & Target Velocity |                         |
|  | - Subject Performance Comparison   |  | - Liquid Net Cashflow Timeline     |                         |
|  +------------------------------------+  +------------------------------------+                         |
|  +------------------------------------+  +------------------------------------+                         |
|  | [ Section 3: Productivity Suite ]  |  | [ Section 4: Habit Consistency ]   |                         |
|  | - Focus Hours & Session Velocity   |  | - Habit Completion Matrix Heatmap  |                         |
|  | - Hour-of-Day Polar Heatmap (24h)  |  | - Historical Streak Longevity      |                         |
|  | - Task Completion & Velocity Trend |  | - Daily & Weekly Adherence Rate    |                         |
|  | - Task Burndown & Scope Curve      |  | - Habit Category Distribution      |                         |
|  | - Estimated vs Actual Pomodoros    |  +------------------------------------+                         |
|  +------------------------------------+                                                                 |
|  +----------------------------------------------------------------------------+                         |
|  | [ Section 5: Custom Reports & Cross-Domain Intelligence ]                  |                         |
|  | - Focus Hours vs Discretionary Expense Correlation (Dual-Axis)             |                         |
|  | - Interruption & Distraction Pareto Breakdown                              |                         |
|  | - Executive Unified Summary Cards & High-Resolution Vector Export          |                         |
|  +----------------------------------------------------------------------------+                         |
+---------------------------------------------------------------------------------------------------------+
```

### Architectural Invariants & Hard Rules
1. **Zero External Charting Libraries:** No `recharts`, `chart.js`, `d3`, `victory`, or `nivo`. All charts are authored natively using **React 19**, **pure SVG vector elements** (`<svg>`, `<path>`, `<rect>`, `<circle>`, `<g>`), **CSS Custom Properties** (`var(--ff-*)`), and **Motion Primitives** (`motion.div`, `AnimatedNumber`, `AnimatedProgressBar`).
2. **Zero Fake or Mocked Data:** Every chart maps directly to verified Firestore documents and local cache stores. Missing data displays a transparent, deterministic empty state ("No data recorded in selected date range") rather than fabricated curves.
3. **Projection Demarcation:** Actual historical records (solid lines, filled bars) are visually and semantically distinguished from prospective targets or forecast projections (dashed lines, shaded bands, distinct badges).
4. **No Redundant Firestore Reads:** The Studio leverages the established `clientDataCache` (`src/lib/dataCache.ts`) with SWR (stale-while-revalidate) semantics and in-flight request deduplication to prevent database read spikes.
5. **Universal Theme Integration:** SVG fills and strokes dynamically inherit FocusFlow's active CSS theme tokens (e.g., `--ff-accent`, `--ff-surface-card`, `--ff-border-color`, `--ff-success`, `--ff-danger`, `--ff-warning`). Theme switches occur without canvas re-rendering lag.
6. **Accessibility & Reduced Motion:** All charts provide `role="img"`, descriptive `aria-label` tags, and integrate with `useMotionPreferences()` to instantly collapse transitions to `0ms` when `prefers-reduced-motion` is active.

---

## 2. Main Studio Sections & Graph Specifications

---

### Section 1: Study Analytics

Designed for students and lifelong learners tracking curriculum mastery across academic tiers, subject codes, and Ebbinghaus revision cycles.

#### 1.1 Study Activity Heatmap
- **Objective:** Visualizes daily study consistency and session volume across the calendar year.
- **Chart Type:** Multi-week square cell matrix (similar to GitHub contribution graph, scaled for 84 to 365 days).
- **Data Source:** `StudyActivityLog[]` (`api.getStudyActivityLogs()`) combined with `FocusSession[]` where `activityType === 'study'` or `subjectCode != null`.
- **Anatomy:**
  - X-Axis: Weeks of the year (1–52).
  - Y-Axis: Days of the week (Mon–Sun).
  - Cell Fill: 5 discrete intensity tiers bound to `color-mix(in oklab, var(--ff-accent) [0%, 25%, 50%, 75%, 100%], transparent)`.
- **Interaction:** Hovering any cell reveals date, exact study minutes, sessions count, and logged subject codes. Clicking a cell filters the studio to that single day.

#### 1.2 Subject-Wise Study Hours
- **Objective:** Shows the distribution of deep work across different enrolled subjects.
- **Chart Type:** Horizontal ranked bar chart with percentage share and subject color swatches.
- **Data Source:** `FocusSession[]` grouped by `subjectCode` / `subjectId` and matched against `StudySubject[]`.
- **Anatomy:**
  - Bar Track: `AnimatedProgressBar` using `StudySubject.color` or fallback palette.
  - Metrics: Total study hours, session count, and percentage of overall study time.
- **Interaction:** Clicking a subject bar filters all other study graphs to isolate that single subject.

#### 1.3 Weekly and Monthly Study Trends
- **Objective:** Tracks whether study pacing is accelerating, plateauing, or slowing down over consecutive weeks and months.
- **Chart Type:** Continuous SVG spline line/area chart with smooth cubic Bezier curves and dual-period comparison (Current Period vs Prior Period dashed line).
- **Data Source:** `FocusSession[]` bucketed into calendar weeks (ISO week numbers) or months (`YYYY-MM`).
- **Anatomy:**
  - Gradient Area Fill: `url(#studyTrendGradient)` fading to transparent at the baseline.
  - Markers: Hover points with magnetic snapping.

#### 1.4 Syllabus Completion Progress
- **Objective:** Granular curriculum progress tracking per subject, breaking topics down into the syllabus triad: Theory, Practice, and Previous Year Questions (PYQ).
- **Chart Type:** Multi-segmented clustered progress stack (Theory % vs Practice % vs PYQ %).
- **Data Source:** `StudyTopic[]` (`api.getStudyTopics()`) grouped by `subjectCode`.
- **Anatomy:**
  - 3 distinct segment tracks:
    - Blue (`var(--ff-accent)`): Theory Complete (`theory === true`)
    - Emerald (`var(--ff-success)`): Practice Complete (`practice === true`)
    - Amber (`var(--ff-warning)`): PYQ Complete (`pyq === true`)
  - Overall Syllabus Readiness Index: $\frac{\text{Theory} + \text{Practice} + \text{PYQ}}{3 \times \text{Total Topics}} \times 100\%$.

#### 1.5 Subject Performance Comparison (Actual Scores Only)
- **Objective:** Compares empirical academic performance across subjects.
- **Condition:** **Rendered only if actual recorded scores exist.**
- **Data Source:** 
  - `StudyExam[]`: Verified published exam scores where `obtainedMarks !== null` ($\frac{\text{obtainedMarks}}{\text{totalMarks}} \times 100$).
  - `StudyQuizAttempt[]`: Recorded quiz test runs (`percentage`).
  - `StudyRevision[]`: Documented spaced repetition recall scores (`recallScore`).
- **Empty State Behavior:** If no exams, quizzes, or recall scores have been logged for a subject, the component renders a clean informational card: *"No test or recall scores recorded yet. Complete quizzes or log exam marks to unlock academic performance benchmarks."*
- **Chart Type:** Clustered horizontal comparison bars or polar polygon radar comparing subjects across Average Exam %, Average Quiz %, and Revision Recall %.

---

### Section 2: Finance Analytics

Designed for personal wealth management, strict envelope budgeting, and liquid cashflow control.

#### 2.1 Savings Growth Trend
- **Objective:** Visualizes accumulated savings over time toward target financial independence milestones.
- **Chart Type:** Step-line area chart with horizontal milestone threshold lines.
- **Data Source:** `SavingsGoal[]` (`api.getSavingsGoals()`) tracking `savedPaise` vs `targetPaise`, combined with net monthly retained cashflow (`totalIncomePaise - totalExpensePaise`).
- **Anatomy:**
  - Solid Emerald Curve: Actual cumulative savings deposited in vaults and goals.
  - Dashed Reference Line: Required linear savings velocity to hit target by `targetDate`.
  - Format: Currency formatted via `formatCurrency(paise, currency)`.

#### 2.2 Budget vs Actual Spending (Envelope Burn)
- **Objective:** Real-time visibility into whether spending is on pace or burning through monthly budget allocations prematurely.
- **Chart Type:** Comparative dual-bar chart (Allocated Envelope vs Actual Expense Incurred) with visual overflow markers.
- **Data Source:** `BudgetEnvelope[]` (`allocatedPaise`) vs sum of `ExpenseTransaction[]` (`amountPaise`) matching envelope `categoryId` for the active month.
- **Anatomy:**
  - Background Bar: Total allocated budget envelope limit.
  - Foreground Bar: Actual expenses incurred to date.
  - Color Shift: Shifts from Emerald ($<80\%$) to Amber ($80\text{--}99\%$) to Crimson ($\ge 100\%$ with over-budget warning badge).

#### 2.3 Monthly Cashflow (Inflow vs Outflow)
- **Objective:** High-level macro view of financial stability, savings rate, and operating margins across the past 6 to 12 months.
- **Chart Type:** Dual vertical column chart with floating Net Surplus/Deficit badge above each monthly pair.
- **Data Source:** `FinanceSummaryData.monthlyTrend` and raw `IncomeTransaction[]` & `ExpenseTransaction[]`.
- **Anatomy:**
  - Column 1: Gross Income (`var(--ff-success)`).
  - Column 2: Total Expenses (`var(--ff-danger)`).
  - Hover Popover: Monthly Savings Rate percentage: $\frac{\text{Income} - \text{Expenses}}{\text{Income}} \times 100\%$.

#### 2.4 Category-Wise Spending Trends
- **Objective:** Identifies seasonal spending spikes (e.g. Dining out vs Subscriptions vs Tech hardware) over time.
- **Chart Type:** Multi-line trend graph or 100% stacked area stream chart.
- **Data Source:** `ExpenseTransaction[]` aggregated by `categoryId` and grouped by calendar month.
- **Anatomy:** Up to 6 top categories plotted with distinct color tokens, plus a grouped "Other" series. Hovering highlights the active category spline while de-emphasizing others.

#### 2.5 Liquid Net Cashflow Timeline (Data Bounds Specification)
- **Objective:** Tracks the user's cumulative liquid financial balance over time.
- **Strict Data Bounds & Demarcation:**
  - FocusFlow stores complete historical transaction inflows (`IncomeTransaction`) and outflows (`ExpenseTransaction`) plus accumulated savings (`SavingsGoal.savedPaise`).
  - FocusFlow **does not** currently maintain an institutional balance-sheet ledger for illiquid real estate, debt amortization schedules, or live brokerage stock portfolios.
  - Therefore, this chart is explicitly titled **"Cumulative Liquid Cashflow Timeline"** (representing actual cash balance trajectory), strictly avoiding misleading institutional "Net Worth" projections.
- **Chart Type:** Cumulative balance spline with shaded surplus area above zero and deficit area below zero.

---

### Section 3: Productivity Analytics

Designed for knowledge workers and students seeking to optimize deep work stamina and eliminate schedule bottlenecks.

#### 3.1 Focus Hours Trend
- **Objective:** Monitors deep work momentum across daily, weekly, and rolling 30-day windows.
- **Chart Type:** Column histogram with an overlaid 7-day rolling moving average spline.
- **Data Source:** `FocusSession[]` (`completed === true`, `mode === 'work'`).
- **Anatomy:**
  - Columns: Daily focus hours.
  - Smooth Amber Line: 7-day moving average smoothing out weekend variances.
  - Target Reference Line: Horizontal dashed indicator at user's `dailyFocusGoalMinutes`.

#### 3.2 Hour-of-Day Productivity Heatmap (Circadian 24h Profile)
- **Objective:** Uncovers the user's biological peak focus hours (e.g., Early Morning 7–10 AM vs Late Night 9–11 PM).
- **Chart Type:** Radial 24-hour polar clock chart or a $7 \times 24$ weekday-by-hour matrix.
- **Data Source:** `FocusSession.startedAt` parsed into local timezone hour (0–23) and weekday (0–6).
- **Anatomy:**
  - 24 radial wedges representing each hour of the day.
  - Wedge radius and saturation correspond to the aggregate focus minutes logged during that hour.

#### 3.3 Task Completion Trend & Velocity
- **Objective:** Measures operational throughput and task finishing speed.
- **Chart Type:** Cumulative task burn-up curve alongside daily completed task bars.
- **Data Source:** `Task[]` (`api.getTasks()`) filtered by `completedAt` timestamp and priority (`high`, `medium`, `low`).
- **Anatomy:**
  - Bars: Number of tasks finished each day, color-coded by priority.
  - Stepped Line: Cumulative tasks finished during the selected timeframe.

#### 3.4 Task Burndown Chart
- **Objective:** Sprint-style burndown tracking remaining backlog tasks against deadline expectations.
- **Data Source:** `Task.createdAt`, `Task.dueDate`, and `Task.completedAt`.
- **Anatomy:**
  - Ideal Burndown Line: Straight dashed guide line connecting initial open tasks count to zero at the target completion date.
  - Actual Burndown Line: Solid stepped curve reflecting real task status transitions.

#### 3.5 Estimated vs Actual Focus Time
- **Objective:** Calibrates planning accuracy by comparing anticipated Pomodoro estimates against actual logged duration.
- **Chart Type:** 45-degree parity scatter plot or paired bar chart.
- **Data Source:** `Task.estimatedPomodoros * 25` vs `Task.completedPomodoros * 25` (or linked `FocusSession.actualDurationSeconds`).
- **Insights Derived:** Highlights systematic underestimation (optimism bias) or overestimation across task categories.

---

### Section 4: Habit Analytics

Designed for long-term behavioral consistency and streak retention.

#### 4.1 Habit Completion Heatmap
- **Objective:** Multi-habit visual matrix showing daily execution across all active routines.
- **Chart Type:** Grid where each row is an active `Habit` and each column is a day in the selected range.
- **Data Source:** `Habit.completedDates` (`YYYY-MM-DD`).
- **Anatomy:** Completed days render as solid accent badges; scheduled but uncompleted days render as subtle outlines; non-scheduled days are muted.

#### 4.2 Streak History & Longevity
- **Objective:** Celebrates active streaks and tracks historical resilience across habits.
- **Chart Type:** Horizontal range bar chart comparing `currentStreak` vs `bestStreakDays`.
- **Data Source:** `computeHabitStreak(habit)` in `src/lib/productivityIntelligence.ts`.

#### 4.3 Daily and Weekly Consistency Ratios
- **Objective:** Measures whether habits are sustained evenly throughout the week or dropped on weekends.
- **Chart Type:** Radar polygon or 7-column weekday bar chart (Monday through Sunday) showing completion rates by day of the week.

#### 4.4 Habit Completion Percentage by Category
- **Objective:** Analyzes which areas of personal growth (Health, Study, Fitness, Mindfulness) maintain highest adherence.
- **Chart Type:** Segmented ring or horizontal percentage bar stack grouped by `Habit.category`.

---

### Section 5: Custom Reports & Cross-Domain Intelligence

The crowning capability of the Advanced Graph Studio: correlating datasets that are normally trapped in disparate tabs.

#### 5.1 Focus Hours vs Discretionary Expense Correlation
- **The Hypothesis:** Does mental exhaustion or low focus trigger compensatory impulse spending?
- **Chart Type:** Synchronized dual-axis time-series:
  - Left Y-Axis: Daily Focus Minutes (`var(--ff-accent)`).
  - Right Y-Axis: Daily Discretionary Spending Paise (`var(--ff-warning)`).
- **Derived Metric:** Pearson correlation indicator (e.g. $r = -0.42$: "Moderate inverse correlation — lower focus days show higher discretionary expenditure").

#### 5.2 Interruption & Distraction Pareto Breakdown
- **Objective:** Identifies the top 20% of distractions causing 80% of lost focus time.
- **Chart Type:** Pareto Chart (Ranked frequency bars + cumulative percentage spline).
- **Data Source:** `FocusSession.interruptionReason`, `FocusSession.pauseCount`, and `DoomscrollTaxEntry[]`.

#### 5.3 Executive Export Center
- **Capabilities:**
  - One-click **High-Resolution PNG Vector Rasterization** via clean SVG canvas serialization.
  - One-click **Raw Data CSV Export** of the exact aggregated table powering the active chart view.
  - Printable PDF Report generation reusing `openPrintableReport()`.

---

## 3. Graph Studio Capabilities & Component Wireframes

### 3.1 Global Studio Toolbar (`GraphStudioToolbar.tsx`)

The toolbar anchors the top of the Studio and maintains active query filters:

```
[ Domain: Study OS v ]  [ Timeframe: Last 30 Days v ]  [ Date: 2026-10-24 - 2026-11-23 ]  [ Export v ]
```

- **Domain Filters:** `all` | `study` | `finance` | `productivity` | `habits` | `custom_reports`
- **Time Horizons:** 
  - `today`: 24-hour hour-by-hour view.
  - `this_week` / `last_7_days`: 7-day granular daily view.
  - `this_month` / `last_30_days`: 30-day daily bucket view.
  - `last_90_days`: 90-day weekly rollup.
  - `last_180_days`: 6-month bi-weekly rollup.
  - `this_year`: 12-month calendar rollup.
  - `custom`: Dual-input date picker (`startDate` $\to$ `endDate`).

### 3.2 Standardized Graph Container Contract (`GraphCard.tsx`)

Every visualization in the Studio adheres to an identical, accessible container structure:

```tsx
interface GraphCardProps {
  id: string;
  title: string;
  subtitle?: string;
  domain: 'study' | 'finance' | 'productivity' | 'habits' | 'custom';
  badge?: React.ReactNode;
  legend?: Array<{ label: string; color: string; isDashed?: boolean }>;
  loading?: boolean;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onExportCsv?: () => void;
  onExportPng?: () => void;
  children: React.ReactNode;
}
```

#### Anatomical Structure:
1. **Header:** Title, icon, domain badge, and legend.
2. **Action Corner:** Refresh button, CSV download, PNG export, and fullscreen expand toggle.
3. **Viewport Area:** Responsive SVG container with `viewBox="0 0 W H"` and `preserveAspectRatio="xMidYMid meet"`.
4. **Interactive Overlay:** Mouse-tracking invisible rect delivering magnetic hover crosshairs and tooltips.
5. **Footer / Insight Strip:** Single-sentence deterministic data takeaway (e.g., *"Focus hours increased by 18% compared to the previous 30-day period"*).

### 3.3 Interactive Tooltips (`GraphTooltip.tsx`)
- Floating popover positioned dynamically to avoid viewport clipping.
- Displays:
  - Formatted Date / Period Label
  - Series Name & Color Swatch
  - Exact Metric Value (Currency formatted or Hours/Minutes)
  - Period-over-period delta ($\Delta +12\%$ vs prior period)
- Closes cleanly on mouse leave or touch release.

### 3.4 Click-Through Detailed Data Navigation
Users can click on chart elements to inspect the underlying source records:
- Clicking a **Category Spending Bar** $\to$ Navigates to **Transactions Ledger** filtered by that specific category.
- Clicking a **Subject Focus Bar** $\to$ Navigates to **Study OS** with that subject active.
- Clicking a **Daily Heatmap Cell** $\to$ Navigates to **Daily Timeline** for that specific date.
- Clicking an **Unsettled Bill Column** $\to$ Navigates to **Bills Tracker**.

---

## 4. Chart Engine Implementation Strategy

### Why Pure React 19 + Custom SVG Scales?

| Requirement | External Charting Libs | FocusFlow Custom SVG Engine |
|---|---|---|
| **Bundle Size Overhead** | $+350\text{--}600$ KB | **$0$ KB** |
| **React 19 Compatibility** | Peer dependency warnings | **100% Native React 19** |
| **Dynamic CSS Theme Tokens** | Hard to bind with `var(--ff-*)` | **Direct CSS custom property binding** |
| **PWA & Offline Performance** | High memory overhead | **Zero-overhead lightweight vector DOM** |
| **Responsive Scalability** | Requires resize JS loops | **Declarative SVG `viewBox` scaling** |

### Mathematical Primitives (`GraphScales.ts`)

The Studio implements pure math scaling functions without D3:

1. **`scaleLinear`**:
   $$\text{scaleLinear}(x) = \text{rangeMin} + \frac{x - \text{domainMin}}{\text{domainMax} - \text{domainMin}} \times (\text{rangeMax} - \text{rangeMin})$$
2. **`scaleTime`**:
   Maps UTC epoch timestamps linearly across horizontal pixel coordinates.
3. **`scaleBand`**:
   Distributes discrete bars across an axis with configurable padding ratios.
4. **`generateSmoothSplinePath`**:
   Computes Catmull-Rom or cubic Bezier control points $(C_1, C_2)$ to render aesthetic smooth curves through discrete points without sharp angular corners.

---

## 5. Responsive Design & Theme Integration

### Breakpoints & Adaptive Layouts
- **Mobile ($< 640\text{ px}$):**
  - Single-column stacked cards (`grid-cols-1`).
  - Axis labels automatically downsample (e.g. showing every 4th day instead of all 30 days).
  - Touch-based scrub tooltips.
- **Tablet ($640\text{--}1024\text{ px}$):**
  - Two-column responsive grid (`grid-cols-1 md:grid-cols-2`).
- **Desktop ($> 1024\text{ px}$):**
  - Two-column and three-column balanced dashboard grids (`lg:grid-cols-2 xl:grid-cols-3`), with flagship correlation charts spanning full width (`col-span-full`).

### Universal Theme Tokens
All chart elements strictly reference FocusFlow's dynamic theme variables:
- Backgrounds: `var(--ff-surface-card)`, `var(--ff-surface-subtle)`
- Borders: `var(--ff-border-color)`
- Primary Accent: `var(--ff-accent)`, `var(--ff-accent-text)`
- Success / Inflow: `var(--ff-success)`
- Danger / Outflow: `var(--ff-danger)`
- Warning / Attention: `var(--ff-warning)`
- Typography: `var(--ff-text-primary)`, `var(--ff-text-muted)`

---

## 6. Performance, Caching & Firestore Efficiency

1. **In-Flight Deduplication & Memoization:**
   All queries route through `clientDataCache`. Multiple charts requesting `FocusSession[]` or `ExpenseTransaction[]` share a single cached promise and in-memory array.
2. **Date-Indexed Lookup Hashmaps:**
   Raw transaction arrays are transformed into `Map<string, DailyBucket>` in $O(N)$ time on first load, enabling $O(1)$ chart lookups across all 30 days.
3. **Selective Re-rendering:**
   Chart SVG bodies are wrapped in `React.memo` with custom shallow-comparison checks on data arrays, ensuring that tooltip pointer movement does not trigger re-computation of heavy SVG paths.

---

## 7. Next Documentation Steps

1. **`docs/GRAPH_DATA_MAPPING.md`**: Complete field-level data dictionary, queries, mathematical aggregation formulas, and projection vs actual demarcation.
2. **`docs/GRAPH_STUDIO_IMPLEMENTATION_PLAN.md`**: Modular phased roadmap for code implementation, testing, and release verification.
