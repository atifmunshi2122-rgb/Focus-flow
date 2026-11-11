import fs from 'fs';
import path from 'path';

// Store paths
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DATA_DIR, 'database.json');

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
  createdAt: string;
}

export interface UserSettings {
  userId: string;
  currency: 'INR' | 'USD' | 'EUR' | 'GBP';
  pomodoroWorkDuration: number; // in minutes
  shortBreakDuration: number;
  longBreakDuration: number;
  autoSwitchSessions: boolean;
  soundEnabled: boolean;
  theme: 'light' | 'dark' | 'system';
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress' | 'completed';
  estimatedPomodoros: number;
  completedPomodoros: number;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FocusSession {
  id: string;
  userId: string;
  taskId: string | null;
  taskTitle?: string;
  mode: 'work' | 'short_break' | 'long_break';
  durationMinutes: number;
  durationSeconds: number;
  completed: boolean;
  startedAt: string;
  endedAt: string;
}

export interface ExpenseCategory {
  id: string;
  userId: string;
  name: string;
  type: 'fixed' | 'variable' | 'both';
  icon: string;
  color: string;
}

export interface RecurringExpense {
  id: string;
  userId: string;
  name: string;
  amountPaise: number; // stored in minor units (paise/cents)
  categoryId: string;
  recurrence: 'monthly' | 'quarterly' | 'yearly';
  dueDay: number; // 1 - 31
  isActive: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Bill {
  id: string;
  userId: string;
  recurringExpenseId: string | null;
  name: string;
  amountPaise: number; // stored in minor units
  categoryId: string;
  dueDate: string; // YYYY-MM-DD
  status: 'PAID' | 'UNPAID' | 'OVERDUE';
  paymentDate: string | null; // YYYY-MM-DD
  notes: string;
  periodKey: string; // e.g. "2026-11" to prevent duplicate recurring bills
  createdAt: string;
  updatedAt: string;
}

export interface PaymentHistory {
  id: string;
  userId: string;
  billId: string;
  billName?: string;
  amountPaise: number;
  paidDate: string;
  paymentMethod: 'credit_card' | 'debit_card' | 'upi_bank' | 'cash' | 'other';
  transactionRef: string;
  notes: string;
  createdAt: string;
}

export interface IncomeTransaction {
  id: string;
  userId: string;
  source: string;
  amountPaise: number;
  date: string; // YYYY-MM-DD
  category: string;
  notes: string;
  createdAt: string;
}

export interface ExpenseTransaction {
  id: string;
  userId: string;
  billId: string | null;
  type: 'fixed' | 'variable';
  categoryId: string;
  categoryName?: string;
  amountPaise: number;
  date: string; // YYYY-MM-DD
  description: string;
  paymentMethod: 'credit_card' | 'debit_card' | 'upi_bank' | 'cash' | 'other';
  notes: string;
  createdAt: string;
}

export interface DatabaseSchema {
  users: User[];
  userSettings: UserSettings[];
  tasks: Task[];
  focusSessions: FocusSession[];
  categories: ExpenseCategory[];
  recurringExpenses: RecurringExpense[];
  bills: Bill[];
  paymentHistory: PaymentHistory[];
  incomeTransactions: IncomeTransaction[];
  expenseTransactions: ExpenseTransaction[];
}

const DEFAULT_CATEGORIES: Omit<ExpenseCategory, 'id' | 'userId'>[] = [
  { name: 'Housing & Rent', type: 'fixed', icon: 'Home', color: '#6366f1' },
  { name: 'Internet & Utilities', type: 'fixed', icon: 'Wifi', color: '#0ea5e9' },
  { name: 'Subscriptions', type: 'fixed', icon: 'Tv', color: '#8b5cf6' },
  { name: 'Insurance & Healthcare', type: 'fixed', icon: 'Shield', color: '#ec4899' },
  { name: 'Education & Fees', type: 'fixed', icon: 'GraduationCap', color: '#f59e0b' },
  { name: 'Food & Dining', type: 'variable', icon: 'Utensils', color: '#10b981' },
  { name: 'Groceries', type: 'variable', icon: 'ShoppingBag', color: '#14b8a6' },
  { name: 'Transportation & Fuel', type: 'variable', icon: 'Car', color: '#f97316' },
  { name: 'Shopping & Retail', type: 'variable', icon: 'ShoppingBag', color: '#a855f7' },
  { name: 'Entertainment & Leisure', type: 'variable', icon: 'Film', color: '#06b6d4' },
  { name: 'Personal & Wellness', type: 'variable', icon: 'Heart', color: '#e11d48' },
  { name: 'Emergency & Miscellaneous', type: 'variable', icon: 'AlertCircle', color: '#64748b' },
];

class DatabaseService {
  private db: DatabaseSchema = {
    users: [],
    userSettings: [],
    tasks: [],
    focusSessions: [],
    categories: [],
    recurringExpenses: [],
    bills: [],
    paymentHistory: [],
    incomeTransactions: [],
    expenseTransactions: [],
  };

  constructor() {
    this.ensureDataDir();
    this.load();
    this.ensureSeedData();
    this.checkRecurringBills();
  }

  private ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.db = JSON.parse(raw);
      }
    } catch (err) {
      console.error('Failed to load database file, initializing empty database:', err);
    }
  }

  public save() {
    try {
      this.ensureDataDir();
      const tempPath = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.db, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('Failed to save database file:', err);
    }
  }

  public getRaw(): DatabaseSchema {
    return this.db;
  }

  public reseed() {
    this.db = {
      users: [],
      userSettings: [],
      tasks: [],
      focusSessions: [],
      categories: [],
      recurringExpenses: [],
      bills: [],
      paymentHistory: [],
      incomeTransactions: [],
      expenseTransactions: [],
    };
    this.ensureSeedData(true);
    this.checkRecurringBills();
    this.save();
  }

  private ensureSeedData(force = false) {
    if (this.db.users.length > 0 && !force) {
      return;
    }

    const defaultUserId = 'usr_atif_default';
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const todayStr = `${currentYear}-${currentMonth}-${String(now.getDate()).padStart(2, '0')}`;

    // 1. User
    const user: User = {
      id: defaultUserId,
      email: 'atifmunshi2122@gmail.com',
      name: 'Atif Munshi',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      createdAt: new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString(),
    };
    this.db.users = [user];

    // 2. Settings
    this.db.userSettings = [
      {
        userId: defaultUserId,
        currency: 'INR',
        pomodoroWorkDuration: 25,
        shortBreakDuration: 5,
        longBreakDuration: 15,
        autoSwitchSessions: false,
        soundEnabled: true,
        theme: 'dark',
      },
    ];

    // 3. Categories
    this.db.categories = DEFAULT_CATEGORIES.map((cat, idx) => ({
      id: `cat_${idx + 1}`,
      userId: defaultUserId,
      ...cat,
    }));

    // Helper to find category id by name
    const getCatId = (name: string) => {
      const found = this.db.categories.find((c) => c.name.toLowerCase().includes(name.toLowerCase()));
      return found ? found.id : this.db.categories[0].id;
    };

    // 4. Tasks
    const sampleTasks: Task[] = [
      {
        id: 'tsk_1',
        userId: defaultUserId,
        title: 'Architect Personal Finance & Focus App',
        description: 'Implement full-stack relational persistence, unified dashboard, and dual-theme UI',
        priority: 'high',
        status: 'in_progress',
        estimatedPomodoros: 4,
        completedPomodoros: 3,
        dueDate: todayStr,
        createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'tsk_2',
        userId: defaultUserId,
        title: 'Review Monthly Budget & Recurring Bills',
        description: 'Verify quarterly subscriptions and update payment schedules',
        priority: 'medium',
        status: 'todo',
        estimatedPomodoros: 2,
        completedPomodoros: 0,
        dueDate: todayStr,
        createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'tsk_3',
        userId: defaultUserId,
        title: 'Refactor Core Database Transactions',
        description: 'Audit foreign key integrity and payment undo workflows',
        priority: 'high',
        status: 'completed',
        estimatedPomodoros: 3,
        completedPomodoros: 3,
        dueDate: todayStr,
        createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
      },
      {
        id: 'tsk_4',
        userId: defaultUserId,
        title: 'Deep Work: Read System Architecture Papers',
        description: 'Study state synchronization patterns and local-first offline databases',
        priority: 'low',
        status: 'todo',
        estimatedPomodoros: 2,
        completedPomodoros: 1,
        dueDate: null,
        createdAt: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    this.db.tasks = sampleTasks;

    // 5. Focus Sessions (Last 7 days to give great weekly charts & streak)
    const sessions: FocusSession[] = [];
    for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
      const sessionDate = new Date(Date.now() - dayOffset * 24 * 3600 * 1000);
      const count = dayOffset === 0 ? 4 : Math.floor(Math.random() * 3) + 3;
      for (let s = 0; s < count; s++) {
        const start = new Date(sessionDate.getTime() + s * 45 * 60 * 1000);
        const end = new Date(start.getTime() + 25 * 60 * 1000);
        sessions.push({
          id: `foc_${dayOffset}_${s}`,
          userId: defaultUserId,
          taskId: s % 2 === 0 ? 'tsk_1' : 'tsk_3',
          taskTitle: s % 2 === 0 ? 'Architect Personal Finance & Focus App' : 'Refactor Core Database Transactions',
          mode: 'work',
          durationMinutes: 25,
          durationSeconds: 1500,
          completed: true,
          startedAt: start.toISOString(),
          endedAt: end.toISOString(),
        });
      }
    }
    this.db.focusSessions = sessions;

    // 6. Recurring Expenses (Fixed)
    // All amounts in paise (100 paise = 1 INR)
    const recurring: RecurringExpense[] = [
      {
        id: 'rec_1',
        userId: defaultUserId,
        name: 'Apartment Rent',
        amountPaise: 2500000, // ₹25,000.00
        categoryId: getCatId('Housing'),
        recurrence: 'monthly',
        dueDay: 5,
        isActive: true,
        notes: 'Monthly apartment lease payment via net banking',
        createdAt: new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'rec_2',
        userId: defaultUserId,
        name: 'High-Speed Fiber Internet',
        amountPaise: 129900, // ₹1,299.00
        categoryId: getCatId('Internet'),
        recurrence: 'monthly',
        dueDay: 10,
        isActive: true,
        notes: '300 Mbps unlimited optical fiber connection',
        createdAt: new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'rec_3',
        userId: defaultUserId,
        name: 'Premium Cloud Hosting & VPS',
        amountPaise: 240000, // ₹2,400.00
        categoryId: getCatId('Subscriptions'),
        recurrence: 'monthly',
        dueDay: 15,
        isActive: true,
        notes: 'Dedicated dev environment and staging servers',
        createdAt: new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'rec_4',
        userId: defaultUserId,
        name: 'Gym & Fitness Membership',
        amountPaise: 350000, // ₹3,500.00
        categoryId: getCatId('Personal'),
        recurrence: 'monthly',
        dueDay: 20,
        isActive: true,
        notes: 'Monthly strength & wellness club pass',
        createdAt: new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'rec_5',
        userId: defaultUserId,
        name: 'Health Insurance Premium',
        amountPaise: 450000, // ₹4,500.00
        categoryId: getCatId('Insurance'),
        recurrence: 'monthly',
        dueDay: 28,
        isActive: true,
        notes: 'Comprehensive medical protection',
        createdAt: new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    this.db.recurringExpenses = recurring;

    // 7. Bills for the current month
    const periodKey = `${currentYear}-${currentMonth}`;
    const bills: Bill[] = [
      {
        id: 'bill_cur_1',
        userId: defaultUserId,
        recurringExpenseId: 'rec_1',
        name: 'Apartment Rent',
        amountPaise: 2500000,
        categoryId: getCatId('Housing'),
        dueDate: `${currentYear}-${currentMonth}-05`,
        status: 'PAID',
        paymentDate: `${currentYear}-${currentMonth}-04`,
        notes: 'Paid via direct bank transfer',
        periodKey,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'bill_cur_2',
        userId: defaultUserId,
        recurringExpenseId: 'rec_2',
        name: 'High-Speed Fiber Internet',
        amountPaise: 129900,
        categoryId: getCatId('Internet'),
        dueDate: `${currentYear}-${currentMonth}-10`,
        status: 'PAID',
        paymentDate: `${currentYear}-${currentMonth}-09`,
        notes: 'Auto-debit confirmed',
        periodKey,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'bill_cur_3',
        userId: defaultUserId,
        recurringExpenseId: 'rec_3',
        name: 'Premium Cloud Hosting & VPS',
        amountPaise: 240000,
        categoryId: getCatId('Subscriptions'),
        dueDate: `${currentYear}-${currentMonth}-15`,
        status: 'UNPAID',
        paymentDate: null,
        notes: 'Invoice received, due mid month',
        periodKey,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'bill_cur_4',
        userId: defaultUserId,
        recurringExpenseId: 'rec_4',
        name: 'Gym & Fitness Membership',
        amountPaise: 350000,
        categoryId: getCatId('Personal'),
        dueDate: `${currentYear}-${currentMonth}-20`,
        status: 'UNPAID',
        paymentDate: null,
        notes: 'Reminder set on calendar',
        periodKey,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'bill_cur_5',
        userId: defaultUserId,
        recurringExpenseId: 'rec_5',
        name: 'Health Insurance Premium',
        amountPaise: 450000,
        categoryId: getCatId('Insurance'),
        dueDate: `${currentYear}-${currentMonth}-28`,
        status: 'UNPAID',
        paymentDate: null,
        notes: 'Annual policy renewal installment',
        periodKey,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    this.db.bills = bills;

    // 8. Payment History for paid bills
    this.db.paymentHistory = [
      {
        id: 'pay_hist_1',
        userId: defaultUserId,
        billId: 'bill_cur_1',
        billName: 'Apartment Rent',
        amountPaise: 2500000,
        paidDate: `${currentYear}-${currentMonth}-04`,
        paymentMethod: 'upi_bank',
        transactionRef: 'UPI-RENT-849201',
        notes: 'Paid to landlord account',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'pay_hist_2',
        userId: defaultUserId,
        billId: 'bill_cur_2',
        billName: 'High-Speed Fiber Internet',
        amountPaise: 129900,
        paidDate: `${currentYear}-${currentMonth}-09`,
        paymentMethod: 'credit_card',
        transactionRef: 'CC-NET-29831',
        notes: 'Monthly auto-bill settled',
        createdAt: new Date().toISOString(),
      },
    ];

    // 9. Income Transactions
    this.db.incomeTransactions = [
      {
        id: 'inc_1',
        userId: defaultUserId,
        source: 'Engineering Salary',
        amountPaise: 14500000, // ₹145,000.00
        date: `${currentYear}-${currentMonth}-01`,
        category: 'Salary',
        notes: 'Direct salary deposit for current month',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'inc_2',
        userId: defaultUserId,
        source: 'Full-Stack Consulting Project',
        amountPaise: 4000000, // ₹40,000.00
        date: `${currentYear}-${currentMonth}-06`,
        category: 'Freelance',
        notes: 'Milestone 2 deliverable payment',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'inc_3',
        userId: defaultUserId,
        source: 'Mutual Fund Dividend',
        amountPaise: 450000, // ₹4,500.00
        date: `${currentYear}-${currentMonth}-08`,
        category: 'Investments',
        notes: 'Quarterly reinvested dividend',
        createdAt: new Date().toISOString(),
      },
    ];

    // 10. Expense Transactions (Fixed paid bills + Variable expenses)
    this.db.expenseTransactions = [
      // Paid fixed bills logged as expenses
      {
        id: 'exp_fix_1',
        userId: defaultUserId,
        billId: 'bill_cur_1',
        type: 'fixed',
        categoryId: getCatId('Housing'),
        amountPaise: 2500000,
        date: `${currentYear}-${currentMonth}-04`,
        description: 'Apartment Rent (Bill payment)',
        paymentMethod: 'upi_bank',
        notes: 'Auto-recorded upon bill clearance',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'exp_fix_2',
        userId: defaultUserId,
        billId: 'bill_cur_2',
        type: 'fixed',
        categoryId: getCatId('Internet'),
        amountPaise: 129900,
        date: `${currentYear}-${currentMonth}-09`,
        description: 'High-Speed Fiber Internet (Bill payment)',
        paymentMethod: 'credit_card',
        notes: 'Auto-recorded upon bill clearance',
        createdAt: new Date().toISOString(),
      },

      // Variable Expenses
      {
        id: 'exp_var_1',
        userId: defaultUserId,
        billId: null,
        type: 'variable',
        categoryId: getCatId('Groceries'),
        amountPaise: 425000, // ₹4,250.00
        date: `${currentYear}-${currentMonth}-03`,
        description: 'Organic Supermarket & Fresh Produce',
        paymentMethod: 'credit_card',
        notes: 'Weekly household restocking',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'exp_var_2',
        userId: defaultUserId,
        billId: null,
        type: 'variable',
        categoryId: getCatId('Food'),
        amountPaise: 185000, // ₹1,850.00
        date: `${currentYear}-${currentMonth}-05`,
        description: 'Artisan Bistro Dinner with Team',
        paymentMethod: 'upi_bank',
        notes: 'Project celebration dinner',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'exp_var_3',
        userId: defaultUserId,
        billId: null,
        type: 'variable',
        categoryId: getCatId('Transportation'),
        amountPaise: 140000, // ₹1,400.00
        date: `${currentYear}-${currentMonth}-07`,
        description: 'Fuel & Metro Travel Pass',
        paymentMethod: 'debit_card',
        notes: 'Commute expenses',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'exp_var_4',
        userId: defaultUserId,
        billId: null,
        type: 'variable',
        categoryId: getCatId('Shopping'),
        amountPaise: 380000, // ₹3,800.00
        date: `${currentYear}-${currentMonth}-08`,
        description: 'Mechanical Keyboard & Desk Ergonomics',
        paymentMethod: 'credit_card',
        notes: 'Home office workstation upgrade',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'exp_var_5',
        userId: defaultUserId,
        billId: null,
        type: 'variable',
        categoryId: getCatId('Food'),
        amountPaise: 65000, // ₹650.00
        date: `${currentYear}-${currentMonth}-10`,
        description: 'Specialty Coffee & Espresso Beans',
        paymentMethod: 'upi_bank',
        notes: 'Focus brew beans',
        createdAt: new Date().toISOString(),
      },
    ];

    this.save();
  }

  /**
   * Automatically generate recurring bills for the current period and mark overdue bills.
   */
  public checkRecurringBills(userId: string = 'usr_atif_default') {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const todayStr = `${currentYear}-${currentMonth}-${String(now.getDate()).padStart(2, '0')}`;
    const periodKey = `${currentYear}-${currentMonth}`;

    // 1. Generate bills for active recurring expenses
    const recurringList = this.db.recurringExpenses.filter((r) => r.userId === userId && r.isActive);

    for (const rec of recurringList) {
      // Check if bill already exists for this period
      const existing = this.db.bills.find(
        (b) => b.userId === userId && b.recurringExpenseId === rec.id && b.periodKey === periodKey
      );

      if (!existing) {
        const dueDayStr = String(Math.min(rec.dueDay, 28)).padStart(2, '0');
        const dueDate = `${currentYear}-${currentMonth}-${dueDayStr}`;
        const isPastDue = dueDate < todayStr;

        const newBill: Bill = {
          id: `bill_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          userId,
          recurringExpenseId: rec.id,
          name: rec.name,
          amountPaise: rec.amountPaise,
          categoryId: rec.categoryId,
          dueDate,
          status: isPastDue ? 'OVERDUE' : 'UNPAID',
          paymentDate: null,
          notes: rec.notes || `Recurring ${rec.recurrence} expense`,
          periodKey,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        this.db.bills.push(newBill);
      }
    }

    // 2. Mark unpaid bills past their due date as OVERDUE
    for (const bill of this.db.bills) {
      if (bill.userId === userId && bill.status === 'UNPAID' && bill.dueDate < todayStr) {
        bill.status = 'OVERDUE';
        bill.updatedAt = new Date().toISOString();
      }
    }

    this.save();
  }

  // Transaction support: Mark bill as paid
  public markBillAsPaid(
    userId: string,
    billId: string,
    paidDate?: string,
    paymentMethod: PaymentHistory['paymentMethod'] = 'upi_bank',
    notes?: string
  ): { success: boolean; bill?: Bill; error?: string } {
    const bill = this.db.bills.find((b) => b.id === billId && b.userId === userId);
    if (!bill) {
      return { success: false, error: 'Bill not found' };
    }
    if (bill.status === 'PAID') {
      return { success: false, error: 'Bill is already paid' };
    }

    const effectivePaidDate = paidDate || new Date().toISOString().split('T')[0];

    // Atomic update
    bill.status = 'PAID';
    bill.paymentDate = effectivePaidDate;
    bill.updatedAt = new Date().toISOString();

    // Add to PaymentHistory
    const paymentRecord: PaymentHistory = {
      id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId,
      billId: bill.id,
      billName: bill.name,
      amountPaise: bill.amountPaise,
      paidDate: effectivePaidDate,
      paymentMethod,
      transactionRef: `REF-${Date.now().toString(36).toUpperCase()}`,
      notes: notes || 'Bill payment recorded',
      createdAt: new Date().toISOString(),
    };
    this.db.paymentHistory.push(paymentRecord);

    // Create corresponding ExpenseTransaction so it reflects in expenses
    const expenseTx: ExpenseTransaction = {
      id: `exp_bill_${bill.id}`,
      userId,
      billId: bill.id,
      type: 'fixed',
      categoryId: bill.categoryId,
      amountPaise: bill.amountPaise,
      date: effectivePaidDate,
      description: `${bill.name} (Bill payment)`,
      paymentMethod,
      notes: notes || 'Paid bill expense',
      createdAt: new Date().toISOString(),
    };
    this.db.expenseTransactions.push(expenseTx);

    this.save();
    return { success: true, bill };
  }

  // Undo payment: revert bill back to unpaid
  public undoBillPayment(userId: string, billId: string): { success: boolean; bill?: Bill; error?: string } {
    const bill = this.db.bills.find((b) => b.id === billId && b.userId === userId);
    if (!bill) {
      return { success: false, error: 'Bill not found' };
    }
    if (bill.status !== 'PAID') {
      return { success: false, error: 'Bill is not marked as paid' };
    }

    const todayStr = new Date().toISOString().split('T')[0];
    bill.status = bill.dueDate < todayStr ? 'OVERDUE' : 'UNPAID';
    bill.paymentDate = null;
    bill.updatedAt = new Date().toISOString();

    // Remove linked payment record
    this.db.paymentHistory = this.db.paymentHistory.filter((p) => !(p.userId === userId && p.billId === billId));

    // Remove linked expense transaction
    this.db.expenseTransactions = this.db.expenseTransactions.filter(
      (e) => !(e.userId === userId && e.billId === billId)
    );

    this.save();
    return { success: true, bill };
  }
}

export const dbService = new DatabaseService();
