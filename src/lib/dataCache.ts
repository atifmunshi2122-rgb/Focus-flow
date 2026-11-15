import { Task, Bill, IncomeTransaction, ExpenseTransaction, Habit, FocusSession, DashboardData } from '../types/index.ts';

/**
 * In-memory client-side cache for high-frequency views.
 * Prevents full-screen flashing skeleton loaders on tab navigation (SWR pattern).
 */
class ClientDataCache {
  private tasks: Task[] | null = null;
  private bills: Bill[] | null = null;
  private incomes: IncomeTransaction[] | null = null;
  private expenses: ExpenseTransaction[] | null = null;
  private dashboardData: DashboardData | null = null;
  private habits: Habit[] | null = null;
  private focusSessions: FocusSession[] | null = null;

  getTasks(): Task[] | null {
    return this.tasks;
  }
  setTasks(tasks: Task[]): void {
    this.tasks = tasks;
  }

  getBills(): Bill[] | null {
    return this.bills;
  }
  setBills(bills: Bill[]): void {
    this.bills = bills;
  }

  getTransactions(): { incomes: IncomeTransaction[]; expenses: ExpenseTransaction[] } | null {
    if (!this.incomes && !this.expenses) return null;
    return {
      incomes: this.incomes || [],
      expenses: this.expenses || [],
    };
  }
  setTransactions(incomes: IncomeTransaction[], expenses: ExpenseTransaction[]): void {
    this.incomes = incomes;
    this.expenses = expenses;
  }

  getDashboardData(): DashboardData | null {
    return this.dashboardData;
  }
  setDashboardData(data: DashboardData): void {
    this.dashboardData = data;
  }

  getHabits(): Habit[] | null {
    return this.habits;
  }
  setHabits(habits: Habit[]): void {
    this.habits = habits;
  }

  getFocusSessions(): FocusSession[] | null {
    return this.focusSessions;
  }
  setFocusSessions(sessions: FocusSession[]): void {
    this.focusSessions = sessions;
  }

  clear(): void {
    this.tasks = null;
    this.bills = null;
    this.incomes = null;
    this.expenses = null;
    this.dashboardData = null;
    this.habits = null;
    this.focusSessions = null;
  }
}

export const clientDataCache = new ClientDataCache();

