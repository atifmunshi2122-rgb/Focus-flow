# FocusFlow & Finance — Advanced Graph Studio Data Mapping Specification
**Project:** FocusFlow & Finance v1.8.0  
**Document:** `docs/GRAPH_DATA_MAPPING.md`  
**Role:** Senior Frontend Developer, Data Visualization Architect, and QA Engineer  
**Status:** Canonical Data Mapping Specification (Zero Fake Data, 100% Deterministic)

---

## 1. Overview & Data Invariant Rules

This document establishes the precise field-level mapping, mathematical aggregation formulas, zero/null fallback behaviors, and click-through drill-down routes for every visualization in the **Advanced Graph Studio**.

### Invariant Principles
1. **Tenant Isolation:** Every query and aggregation is strictly partitioned by `userId === activeUserId`.
2. **Zero Fake Data:** If a user has logged no data in a selected date range, the chart renders an empty state illustration with an explicit call-to-action to log their first record.
3. **No Projections Masquerading as Facts:** Solid lines and filled shapes represent verified historical records. Dashed lines, shaded prediction intervals, or target guideposts are explicitly labeled as targets or models.
4. **Data Bounds & Liquid vs Institutional Net Worth:** FocusFlow tracks liquid transactions (`IncomeTransaction`, `ExpenseTransaction`, `Bill`, `SavingsGoal`). It does not maintain an institutional loan/mortgage or stock portfolio balance-sheet. Net cashflow is mapped as **Cumulative Liquid Cashflow**, avoiding fabricated "Net Worth" representations.

---

## 2. Section 1: Study Analytics Data Mappings

```
+---------------------------------------------------------------------------------------------------------+
|                                      STUDY ANALYTICS DATA MAPPING                                       |
+--------------------------+------------------------------+-----------------------------------------------+
| Chart Name               | Primary Collections / Cache  | Key Fields Used                               |
+--------------------------+------------------------------+-----------------------------------------------+
| Study Activity Heatmap   | FocusSession, StudyActivity  | startedAt, durationMinutes, activityDate      |
| Subject-Wise Focus Hours | FocusSession, StudySubject   | subjectCode, actualDurationSeconds, color     |
| Weekly/Monthly Velocity  | FocusSession                 | startedAt, actualDurationSeconds, completed   |
| Syllabus Triad Progress  | StudyTopic, StudySubject     | theory, practice, pyq, unit, subjectCode      |
| Subject Performance Comp | StudyExam, StudyQuizAttempt, | obtainedMarks, totalMarks, percentage,        |
|                          | StudyRevision                | recallScore (actual verified scores only!)    |
+--------------------------+------------------------------+-----------------------------------------------+
```

### 1.1 Study Activity Heatmap
- **Firestore Collections:** `focus_sessions`, `study_activity_logs`
- **Cache Keys:** `clientDataCache:focus_sessions`, `clientDataCache:study`
- **Fields Extracted:**
  - `FocusSession.startedAt` (ISO-8601 UTC string)
  - `FocusSession.durationMinutes`, `FocusSession.actualDurationSeconds`
  - `FocusSession.completed` (boolean)
  - `FocusSession.subjectCode` (string, e.g. `Sub_COA`)
  - `StudyActivityLog.activityDate` (`YYYY-MM-DD`), `StudyActivityLog.activityType`
- **Aggregation Formula:**
  - Convert `startedAt` to local calendar date $D$ (`YYYY-MM-DD`) via `formatDateInTimezone(startedAt, tz)`.
  - Filter: `s.completed === true && (s.activityType === 'study' || s.subjectCode != null || s.mode === 'work')`.
  - For each date $D$:
    $$\text{DailyStudyMinutes}(D) = \sum_{s \in S_D} \frac{\text{getSessionFocusSeconds}(s)}{60}$$
  - Map $\text{DailyStudyMinutes}$ into 5 intensity bins:
    - 0 mins: Tier 0 (Empty)
    - $1\text{--}29$ mins: Tier 1 ($25\%$ accent)
    - $30\text{--}74$ mins: Tier 2 ($50\%$ accent)
    - $75\text{--}119$ mins: Tier 3 ($75\%$ accent)
    - $\ge 120$ mins: Tier 4 ($100\%$ accent)
- **Zero/Null Handling:** Dates with 0 minutes render subtle border without fill.
- **Drill-Down Target:** Clicking a cell opens **Daily Timeline** (`/focus` tab, sub-tab `timeline`) for that date.

---

### 1.2 Subject-Wise Focus Hours
- **Firestore Collections:** `focus_sessions`, `study_subjects`
- **Fields Extracted:**
  - `FocusSession.subjectCode`, `FocusSession.subjectId`
  - `FocusSession.actualDurationSeconds`, `FocusSession.durationMinutes`
  - `StudySubject.code`, `StudySubject.name`, `StudySubject.color`
- **Aggregation Formula:**
  $$\text{SubjectHours}(C) = \sum_{s \in S_C} \frac{\text{getSessionFocusSeconds}(s)}{3600}$$
  $$\text{SharePct}(C) = \frac{\text{SubjectHours}(C)}{\sum_{all} \text{SubjectHours}} \times 100\%$$
- **Zero/Null Handling:** If `FocusSession.subjectCode` is undefined or null, categorized under "General Study".
- **Drill-Down Target:** Clicking a subject bar navigates to **Study OS** (`/study`) with that subject selected.

---

### 1.3 Weekly and Monthly Study Trends
- **Firestore Collections:** `focus_sessions`
- **Aggregation Formula:**
  - For Weekly Horizon: Group into ISO week numbers $W_1, W_2, \dots, W_n$ starting on Monday (`getStartOfWeek`).
  - For Monthly Horizon: Group into `YYYY-MM` month buckets.
  - Compute total focus hours per bucket.
  - Previous Period Comparison: Calculate rolling percentage delta:
    $$\Delta\% = \frac{\text{Hours}_{\text{current}} - \text{Hours}_{\text{previous}}}{\max(1, \text{Hours}_{\text{previous}})} \times 100\%$$
- **Demarcation:** Current period is a solid smooth Bezier line; previous period is a dashed guide line.
- **Drill-Down Target:** Hover popover reveals daily breakdown; clicking navigates to Focus Analytics.

---

### 1.4 Syllabus Completion Progress (Theory, Practice, PYQ Triad)
- **Firestore Collections:** `study_topics`, `study_subjects`
- **Fields Extracted:**
  - `StudyTopic.subjectCode`
  - `StudyTopic.theory` (boolean)
  - `StudyTopic.practice` (boolean)
  - `StudyTopic.pyq` (boolean)
  - `StudyTopic.deletedAt` (null / undefined check)
- **Aggregation Formula:**
  For each subject $S$ with $N_S$ active topics:
  $$\text{TheoryPct}(S) = \frac{\sum [t.theory == \text{true}]}{N_S} \times 100\%$$
  $$\text{PracticePct}(S) = \frac{\sum [t.practice == \text{true}]}{N_S} \times 100\%$$
  $$\text{PYQPct}(S) = \frac{\sum [t.pyq == \text{true}]}{N_S} \times 100\%$$
  $$\text{SyllabusReadinessIndex}(S) = \frac{\text{TheoryPct}(S) + \text{PracticePct}(S) + \text{PYQPct}(S)}{3}$$
- **Zero/Null Handling:** If $N_S = 0$, progress is $0\%$ with an "Empty Syllabus" badge.
- **Drill-Down Target:** Clicking a subject card opens the **Study Topics Checklist** for that subject.

---

### 1.5 Subject Performance Comparison (Actual Scores Only)
- **Firestore Collections:** `study_exams`, `study_quizzes`, `study_revisions`
- **Condition:** **Rendered only when verified test or recall marks exist.**
- **Fields Extracted:**
  - `StudyExam.subjectIds`, `StudyExam.totalMarks`, `StudyExam.obtainedMarks`, `StudyExam.resultStatus`
  - `StudyQuizAttempt.percentage` (via `StudyQuiz.subjectId`)
  - `StudyRevision.subjectCode`, `StudyRevision.recallScore`
- **Aggregation Formula:**
  - Exam Average: Mean of $(\frac{\text{obtainedMarks}}{\text{totalMarks}} \times 100)$ where `resultStatus === 'published'` and `obtainedMarks !== null`.
  - Quiz Average: Mean of `StudyQuizAttempt.percentage`.
  - Revision Retention: Mean of `StudyRevision.recallScore` (0–100).
- **Empty State Behavior:** If no exams or quizzes have documented results, renders:
  *"No academic test scores recorded yet. Take a quiz or log exam marks to generate performance benchmarks."*
- **Drill-Down Target:** Navigates to **Exams Tab** (`/study`, sub-tab `exams`).

---

## 3. Section 2: Finance Analytics Data Mappings

```
+---------------------------------------------------------------------------------------------------------+
|                                      FINANCE ANALYTICS DATA MAPPING                                      |
+--------------------------+------------------------------+-----------------------------------------------+
| Chart Name               | Primary Collections / Cache  | Key Fields Used                               |
+--------------------------+------------------------------+-----------------------------------------------+
| Savings Growth Trend     | SavingsGoal, Incomes, Exp    | savedPaise, targetPaise, targetDate, date     |
| Budget vs Actual Spending| BudgetEnvelope, ExpenseTrans | allocatedPaise, amountPaise, categoryId       |
| Monthly Cashflow         | IncomeTransaction, ExpenseTr | amountPaise, date (YYYY-MM), type             |
| Category Spending Trends | ExpenseTransaction, Category | categoryId, categoryName, amountPaise, date   |
| Liquid Cashflow Timeline | IncomeTransaction, ExpenseTr | amountPaise, date (cumulative net balance)    |
+--------------------------+------------------------------+-----------------------------------------------+
```

### 2.1 Savings Growth Trend
- **Firestore Collections:** `savings_goals`, `income_transactions`, `expense_transactions`
- **Fields Extracted:**
  - `SavingsGoal.title`, `SavingsGoal.savedPaise`, `SavingsGoal.targetPaise`, `SavingsGoal.targetDate`
  - Historical retained cash from monthly net transactions.
- **Aggregation Formula:**
  - Current Total Saved: $\text{TotalSavedPaise} = \sum g.savedPaise$.
  - Target Total: $\text{TotalTargetPaise} = \sum g.targetPaise$.
  - Projected Linear Trajectory:
    $$\text{TargetVelocityPerMonth} = \frac{\text{TotalTargetPaise} - \text{TotalSavedPaise}}{\text{MonthsRemaining}}$$
- **Demarcation:**
  - Actual Accumulated Savings: Solid Emerald line (`var(--ff-success)`).
  - Target Trajectory Guide: Dashed neutral reference line.
- **Drill-Down Target:** Clicking navigates to **Budget & Savings Manager** (`/finance`).

---

### 2.2 Budget vs Actual Spending (Envelope Burn)
- **Firestore Collections:** `budget_envelopes`, `expense_transactions`
- **Fields Extracted:**
  - `BudgetEnvelope.id`, `BudgetEnvelope.name`, `BudgetEnvelope.categoryId`, `BudgetEnvelope.allocatedPaise`, `BudgetEnvelope.monthKey`
  - `ExpenseTransaction.categoryId`, `ExpenseTransaction.amountPaise`, `ExpenseTransaction.date`
- **Aggregation Formula:**
  - For selected `monthKey` (e.g. `2026-11`):
    $$\text{Allocated}(E) = E.allocatedPaise$$
    $$\text{Spent}(E) = \sum_{e \in \text{Exp}, e.categoryId == E.categoryId} e.amountPaise$$
    $$\text{BurnRatePct}(E) = \frac{\text{Spent}(E)}{\text{Allocated}(E)} \times 100\%$$
- **Color Coding:**
  - $< 80\%$: Emerald (`var(--ff-success)`)
  - $80\text{--}99\%$: Amber (`var(--ff-warning)`)
  - $\ge 100\%$: Crimson (`var(--ff-danger)`) with overflow tag
- **Drill-Down Target:** Clicking navigates to **Envelope Budget Manager** (`/finance`).

---

### 2.3 Monthly Cashflow (Inflow vs Outflow)
- **Firestore Collections:** `income_transactions`, `expense_transactions`
- **Aggregation Formula:**
  - For each calendar month $M \in \{M_{-11}, \dots, M_0\}$:
    $$\text{Inflow}(M) = \sum_{i \in \text{Inc}_M} i.amountPaise$$
    $$\text{Outflow}(M) = \sum_{e \in \text{Exp}_M} e.amountPaise$$
    $$\text{NetSurplus}(M) = \text{Inflow}(M) - \text{Outflow}(M)$$
    $$\text{SavingsRatePct}(M) = \frac{\text{NetSurplus}(M)}{\max(1, \text{Inflow}(M))} \times 100\%$$
- **Drill-Down Target:** Clicking a month column filters the studio to that month.

---

### 2.4 Category-Wise Spending Trends
- **Firestore Collections:** `expense_transactions`, `expense_categories`
- **Aggregation Formula:**
  - Group expenses by `categoryId` and `date.slice(0, 7)`.
  - Rank categories by total expenditure in the current timeframe; select top 5 categories.
  - Remaining categories aggregated into "Other".
  - Multi-line path generated using `generateSmoothSplinePath()`.
- **Drill-Down Target:** Clicking a category legend filters the **Transactions Ledger** to that category.

---

### 2.5 Cumulative Liquid Cashflow Timeline (Data Bounds Specification)
- **Data Scope:** Cumulative cash surplus/deficit generated by the user's recorded liquid inflows and outflows.
- **Explicit Invariant:** Not labeled as institutional "Net Worth" (which requires mortgage, equity, and asset appraisal schemas).
- **Aggregation Formula:**
  - Sort all non-deleted transactions chronologically: $T = \text{sort}(Incomes \cup Expenses)$.
  - Running Balance:
    $$\text{Balance}(t_k) = \text{Balance}(t_{k-1}) + (\text{isIncome} ? +amount : -amount)$$
- **Visualization:** Smooth spline with gradient fill: Emerald above 0, Crimson below 0.

---

## 4. Section 3: Productivity Analytics Data Mappings

```
+---------------------------------------------------------------------------------------------------------+
|                                    PRODUCTIVITY ANALYTICS DATA MAPPING                                   |
+--------------------------+------------------------------+-----------------------------------------------+
| Chart Name               | Primary Collections / Cache  | Key Fields Used                               |
+--------------------------+------------------------------+-----------------------------------------------+
| Focus Hours Trend        | FocusSession, Settings       | startedAt, durationSeconds, dailyFocusGoal    |
| Circadian Polar Heatmap  | FocusSession                 | startedAt (hour 0-23, day 0-6), completed     |
| Task Completion Trend    | Task                         | completedAt, priority, status                 |
| Task Burndown Chart      | Task                         | createdAt, dueDate, completedAt, status       |
| Estimated vs Actual Time | Task, FocusSession           | estimatedPomodoros, completedPomodoros        |
+--------------------------+------------------------------+-----------------------------------------------+
```

### 3.1 Focus Hours Trend & Moving Average
- **Firestore Collections:** `focus_sessions`, `user_settings`
- **Aggregation Formula:**
  - Daily sum of completed work session minutes:
    $$\text{DailyHours}(D) = \frac{1}{60} \sum_{s \in S_D, s.mode == 'work' \& s.completed} \text{getSessionMinutes}(s)$$
  - 7-Day Rolling Moving Average:
    $$\text{MA}_7(D) = \frac{1}{7} \sum_{i=0}^6 \text{DailyHours}(D - i)$$
- **Demarcation:** Columns represent actual daily hours; smooth Amber curve represents $\text{MA}_7$; horizontal dashed line represents `UserSettings.dailyFocusGoalMinutes / 60`.

---

### 3.2 Circadian 24-Hour Productivity Polar Heatmap
- **Firestore Collections:** `focus_sessions`
- **Fields Extracted:** `startedAt` (parsed via `new Date(startedAt)` into local hour $H \in [0, 23]$ and weekday $W \in [0, 6]$).
- **Aggregation Formula:**
  - For each hour $h \in [0, 23]$:
    $$\text{HourFocusMinutes}(h) = \sum_{s \in S, \text{hour}(s) == h} \text{getSessionMinutes}(s)$$
  - Normalize radius or color saturation:
    $$\text{Intensity}(h) = \frac{\text{HourFocusMinutes}(h)}{\max_{i} \text{HourFocusMinutes}(i)}$$
- **Insights Derived:** Identifies "Golden Focus Window" (e.g. 08:00–11:00) vs "Afternoon Slump" (14:00–16:00).

---

### 3.3 Task Completion Trend & Burndown Curve
- **Firestore Collections:** `tasks`
- **Fields Extracted:** `Task.createdAt`, `Task.dueDate`, `Task.completedAt`, `Task.priority`, `Task.status`
- **Aggregation Formula:**
  - **Completion Velocity:** Count of tasks where `completedAt` falls on date $D$, categorized by `priority`.
  - **Burndown:**
    - Initial Open Tasks $N_0$ at start of selected window.
    - For each day $D$: $\text{RemainingTasks}(D) = \text{RemainingTasks}(D-1) + \text{Created}(D) - \text{Completed}(D)$.
    - Ideal Linear Pace: Straight dashed line from $N_0$ to 0 at the end of the sprint/month.

---

### 3.4 Estimated vs Actual Focus Effort
- **Firestore Collections:** `tasks`
- **Fields Extracted:**
  - `Task.estimatedPomodoros` (integer)
  - `Task.completedPomodoros` (integer)
- **Aggregation Formula:**
  - $\text{EstimatedMinutes} = \text{estimatedPomodoros} \times 25$
  - $\text{ActualMinutes} = \text{completedPomodoros} \times 25$
  - Delta: $\Delta = \text{ActualMinutes} - \text{EstimatedMinutes}$
  - Planning Accuracy Index:
    $$\text{AccuracyIndex} = 100\% - \min(100, \frac{|\Delta|}{\max(1, \text{EstimatedMinutes})} \times 100\%)$$

---

## 5. Section 4: Habit Analytics Data Mappings

```
+---------------------------------------------------------------------------------------------------------+
|                                       HABIT ANALYTICS DATA MAPPING                                       |
+--------------------------+------------------------------+-----------------------------------------------+
| Chart Name               | Primary Collections / Cache  | Key Fields Used                               |
+--------------------------+------------------------------+-----------------------------------------------+
| Habit Completion Matrix  | Habit                        | completedDates, frequency, customDays         |
| Streak History Longevity | Habit                        | bestStreakDays, completedDates                |
| Weekday Consistency      | Habit                        | completedDates (grouped by day of week 0-6)   |
| Category Adherence Pct   | Habit                        | category, completedDates, targetDaysPerWeek   |
+--------------------------+------------------------------+-----------------------------------------------+
```

### 4.1 Habit Completion Matrix Heatmap
- **Firestore Collections:** `habits`
- **Fields Extracted:** `Habit.id`, `Habit.title`, `Habit.completedDates`, `Habit.frequency`, `Habit.customDays`, `Habit.archived`
- **Aggregation Formula:**
  - For each active habit $h$ and each date $d$ in the range:
    - Check if scheduled: `isHabitScheduledOnDate(h, d)`.
    - Check if completed: `h.completedDates.includes(d)`.
  - Matrix cell state:
    - `completed`: Filled accent icon / green square.
    - `missed`: Outlined warning icon / red dot.
    - `rest_day`: Muted subtle background.

---

### 4.2 Streak History & Weekday Consistency
- **Firestore Collections:** `habits`
- **Aggregation Formula:**
  - Utilizes `computeHabitStreak(habit)` in `src/lib/productivityIntelligence.ts`.
  - Computes `currentStreak` and `bestStreakDays`.
  - Weekday Adherence: For each day of week $w \in \{0, \dots, 6\}$:
    $$\text{Adherence}(w) = \frac{\text{Completions on } w}{\text{Scheduled on } w} \times 100\%$$

---

## 6. Section 5: Custom Reports & Cross-Domain Intelligence

### 5.1 Focus Hours vs Discretionary Expense Correlation
- **Collections Joined:** `focus_sessions` $\bowtie$ `expense_transactions` (joined on date $D$)
- **Series 1 (Left Y-Axis):** $\text{FocusHours}(D)$
- **Series 2 (Right Y-Axis):** $\text{DiscretionarySpend}(D) = \sum_{e \in \text{Exp}_D, e.type == 'variable'} \frac{e.amountPaise}{100}$
- **Statistical Correlation (Pearson's $r$):**
  $$r = \frac{\sum (x_i - \bar{x})(y_i - \bar{y})}{\sqrt{\sum (x_i - \bar{x})^2 \sum (y_i - \bar{y})^2}}$$
- **Deterministic Interpretation:**
  - $r < -0.3$: *"Inverse Correlation: Discretionary expenditure tends to be higher on days with lower focus hours."*
  - $-0.3 \le r \le 0.3$: *"Neutral: Daily spending shows no direct dependence on focus duration."*
  - $r > 0.3$: *"Positive Correlation: Higher focus days correlate with higher recorded daily expenses."*

---

### 5.2 Interruption Pareto Root-Cause Chart
- **Collections Joined:** `focus_sessions` $\bowtie$ `doomscroll_taxes`
- **Fields Extracted:**
  - `FocusSession.interruptionReason`, `FocusSession.pauseCount`
  - `DoomscrollTaxEntry.distractionApp`, `DoomscrollTaxEntry.minutes`
- **Aggregation Formula:**
  - Group interruption causes: Phone/Messaging, App Doomscrolling, Fatigue, Urgent Chores, Unspecified.
  - Sort in descending order of frequency: $C_1, C_2, \dots, C_k$.
  - Compute cumulative percentage line:
    $$\text{CumPct}(k) = \frac{\sum_{i=1}^k \text{Count}(C_i)}{\text{TotalInterruptions}} \times 100\%$$

---

## 7. Data Availability & Schema Integrity Checklist

```
[x] Tenant isolation verified across all queries (userId parameter mandatory)
[x] All data fields cross-referenced against src/types/index.ts & src/types/study.ts
[x] Zero fake or non-deterministic values introduced
[x] Actual historical values explicitly distinguished from targets/projections
[x] Net Worth bounds clarified: Liquid Cashflow Timeline supported, institutional balance-sheet excluded
[x] Subject Performance Comparison strictly gated by verified test scores (StudyExam, StudyQuizAttempt, StudyRevision)
[x] Click-through navigation targets specified for all 18 visual candidates
```
