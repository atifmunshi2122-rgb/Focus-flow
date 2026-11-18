import {
  Task,
  Bill,
  IncomeTransaction,
  ExpenseTransaction,
  Habit,
  FocusSession,
  DashboardData,
  SavingsGoal,
  BudgetEnvelope,
  SubscriptionPlan,
  ExpenseCategory,
  StudySubject,
  StudyTopic,
  StudyRevision,
  StudyMistake,
  StudyPlanTask,
  StudyExam,
  AuditLogEntry,
  FocusStatsData,
  TimeBlock,
  PomodoroGoal,
} from '../types/index.ts';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  userId: string | null;
}

const DEFAULT_TTL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * High-performance, user-scoped in-memory cache with request deduplication.
 * Eliminates redundant Firestore reads and blank-screen flashes across tab navigation.
 */
class ClientDataCache {
  private activeUserId: string | null = null;
  private entries = new Map<string, CacheEntry<unknown>>();
  private inFlightPromises = new Map<string, Promise<unknown>>();

  /**
   * Set the active user ID. If the user changed, automatically flushes
   * previous user data to prevent cross-account cache contamination.
   */
  setActiveUser(userId: string | null): void {
    if (this.activeUserId !== null && this.activeUserId !== userId) {
      this.clear();
    }
    this.activeUserId = userId;
  }

  getActiveUser(): string | null {
    return this.activeUserId;
  }

  private getKey(domain: string, userKey?: string | null): string {
    const uid = userKey !== undefined ? userKey : this.activeUserId;
    return `${uid || 'anonymous'}:${domain}`;
  }

  set<T>(domain: string, data: T, userKey?: string | null): void {
    const key = this.getKey(domain, userKey);
    this.entries.set(key, {
      data,
      timestamp: Date.now(),
      userId: userKey !== undefined ? userKey : this.activeUserId,
    });
  }

  get<T>(domain: string, ttlMs: number = DEFAULT_TTL_MS, userKey?: string | null): T | null {
    const key = this.getKey(domain, userKey);
    const entry = this.entries.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;

    // Check cross-user safety
    const expectedUser = userKey !== undefined ? userKey : this.activeUserId;
    if (entry.userId !== expectedUser) {
      this.entries.delete(key);
      return null;
    }

    // TTL check
    if (Date.now() - entry.timestamp > ttlMs) {
      return null;
    }

    return entry.data;
  }

  /**
   * Retrieves data even if slightly expired (for SWR initial display),
   * returning whether background revalidation is recommended.
   */
  getWithStale<T>(
    domain: string,
    ttlMs: number = DEFAULT_TTL_MS,
    userKey?: string | null
  ): { data: T | null; isStale: boolean } {
    const key = this.getKey(domain, userKey);
    const entry = this.entries.get(key) as CacheEntry<T> | undefined;
    if (!entry) return { data: null, isStale: true };

    const expectedUser = userKey !== undefined ? userKey : this.activeUserId;
    if (entry.userId !== expectedUser) {
      return { data: null, isStale: true };
    }

    const age = Date.now() - entry.timestamp;
    return {
      data: entry.data,
      isStale: age > ttlMs,
    };
  }

  /**
   * Shares a single in-flight promise for concurrent identical requests.
   * If two components mount and request tasks at the same instant, only ONE network call executes.
   */
  async dedupe<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const scopedKey = `${this.activeUserId || 'anon'}:${key}`;
    const existing = this.inFlightPromises.get(scopedKey) as Promise<T> | undefined;
    if (existing) {
      return existing;
    }

    const promise = fetcher().finally(() => {
      this.inFlightPromises.delete(scopedKey);
    });

    this.inFlightPromises.set(scopedKey, promise);
    return promise;
  }

  // --- Domain Getters & Setters ---

  getTasks(): Task[] | null {
    return this.get<Task[]>('tasks');
  }
  setTasks(tasks: Task[]): void {
    this.set('tasks', tasks);
  }

  getBills(): Bill[] | null {
    return this.get<Bill[]>('bills');
  }
  setBills(bills: Bill[]): void {
    this.set('bills', bills);
  }

  getTransactions(): { incomes: IncomeTransaction[]; expenses: ExpenseTransaction[] } | null {
    const incomes = this.get<IncomeTransaction[]>('incomes');
    const expenses = this.get<ExpenseTransaction[]>('expenses');
    if (!incomes && !expenses) return null;
    return {
      incomes: incomes || [],
      expenses: expenses || [],
    };
  }
  setTransactions(incomes: IncomeTransaction[], expenses: ExpenseTransaction[]): void {
    this.set('incomes', incomes);
    this.set('expenses', expenses);
  }

  getIncomes(): IncomeTransaction[] | null {
    return this.get<IncomeTransaction[]>('incomes');
  }
  setIncomes(incomes: IncomeTransaction[]): void {
    this.set('incomes', incomes);
  }

  getExpenses(): ExpenseTransaction[] | null {
    return this.get<ExpenseTransaction[]>('expenses');
  }
  setExpenses(expenses: ExpenseTransaction[]): void {
    this.set('expenses', expenses);
  }

  getDashboardData(): DashboardData | null {
    return this.get<DashboardData>('dashboard', 90 * 1000); // 90s TTL for dashboard metrics
  }
  setDashboardData(data: DashboardData): void {
    this.set('dashboard', data);
  }

  getHabits(): Habit[] | null {
    return this.get<Habit[]>('habits');
  }
  setHabits(habits: Habit[]): void {
    this.set('habits', habits);
  }

  getFocusSessions(): FocusSession[] | null {
    return this.get<FocusSession[]>('focus_sessions');
  }
  setFocusSessions(sessions: FocusSession[]): void {
    this.set('focus_sessions', sessions);
  }

  getSavingsGoals(): SavingsGoal[] | null {
    return this.get<SavingsGoal[]>('savings_goals');
  }
  setSavingsGoals(goals: SavingsGoal[]): void {
    this.set('savings_goals', goals);
  }

  getEnvelopes(): BudgetEnvelope[] | null {
    return this.get<BudgetEnvelope[]>('envelopes');
  }
  setEnvelopes(envelopes: BudgetEnvelope[]): void {
    this.set('envelopes', envelopes);
  }

  getSubscriptions(): SubscriptionPlan[] | null {
    return this.get<SubscriptionPlan[]>('subscriptions');
  }
  setSubscriptions(subs: SubscriptionPlan[]): void {
    this.set('subscriptions', subs);
  }

  getCategories(): ExpenseCategory[] | null {
    return this.get<ExpenseCategory[]>('categories', 10 * 60 * 1000); // 10 min TTL for categories
  }
  setCategories(cats: ExpenseCategory[]): void {
    this.set('categories', cats);
  }

  // Study Domain
  getStudySubjects(): StudySubject[] | null {
    return this.get<StudySubject[]>('study_subjects');
  }
  setStudySubjects(subs: StudySubject[]): void {
    this.set('study_subjects', subs);
  }

  getStudyTopics(subjectCode?: string): StudyTopic[] | null {
    const domain = subjectCode ? `study_topics_${subjectCode}` : 'study_topics_all';
    return this.get<StudyTopic[]>(domain);
  }
  setStudyTopics(topics: StudyTopic[], subjectCode?: string): void {
    const domain = subjectCode ? `study_topics_${subjectCode}` : 'study_topics_all';
    this.set(domain, topics);
  }

  getStudyRevisions(): StudyRevision[] | null {
    return this.get<StudyRevision[]>('study_revisions');
  }
  setStudyRevisions(revs: StudyRevision[]): void {
    this.set('study_revisions', revs);
  }

  getStudyMistakes(): StudyMistake[] | null {
    return this.get<StudyMistake[]>('study_mistakes');
  }
  setStudyMistakes(mistakes: StudyMistake[]): void {
    this.set('study_mistakes', mistakes);
  }

  getStudyPlanTasks(): StudyPlanTask[] | null {
    return this.get<StudyPlanTask[]>('study_plan_tasks');
  }
  setStudyPlanTasks(tasks: StudyPlanTask[]): void {
    this.set('study_plan_tasks', tasks);
  }

  getStudyExams(): StudyExam[] | null {
    return this.get<StudyExam[]>('study_exams');
  }
  setStudyExams(exams: StudyExam[]): void {
    this.set('study_exams', exams);
  }

  getAuditLogs(): AuditLogEntry[] | null {
    return this.get<AuditLogEntry[]>('audit_logs', 60 * 1000);
  }
  setAuditLogs(logs: AuditLogEntry[]): void {
    this.set('audit_logs', logs);
  }

  getFocusStats(): FocusStatsData | null {
    return this.get<FocusStatsData>('focus_stats', 120 * 1000);
  }
  setFocusStats(stats: FocusStatsData): void {
    this.set('focus_stats', stats);
  }

  getPomodoroGoals(): PomodoroGoal[] | null {
    return this.get<PomodoroGoal[]>('pomodoro_goals', 180 * 1000);
  }
  setPomodoroGoals(goals: PomodoroGoal[]): void {
    this.set('pomodoro_goals', goals);
  }

  getTimeBlocks(date?: string): TimeBlock[] | null {
    const domain = date ? `time_blocks_${date}` : 'time_blocks_all';
    return this.get<TimeBlock[]>(domain, 120 * 1000);
  }
  setTimeBlocks(blocks: TimeBlock[], date?: string): void {
    const domain = date ? `time_blocks_${date}` : 'time_blocks_all';
    this.set(domain, blocks);
  }

  /**
   * Invalidates cached entries matching a specific domain pattern.
   * If no domain is provided, clears the entire cache.
   */
  invalidate(domainPrefix?: string): void {
    if (!domainPrefix) {
      this.clear();
      return;
    }
    for (const key of Array.from(this.entries.keys())) {
      if (key.includes(domainPrefix)) {
        this.entries.delete(key);
      }
    }
  }

  /**
   * Completely flushes all cached data and in-flight promises.
   */
  clear(): void {
    this.entries.clear();
    this.inFlightPromises.clear();
  }
}

export const clientDataCache = new ClientDataCache();
