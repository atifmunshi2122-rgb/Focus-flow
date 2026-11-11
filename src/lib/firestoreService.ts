import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase.ts';
import {
  Task,
  FocusSession,
  IncomeTransaction,
  ExpenseTransaction,
  RecurringExpense,
  Bill,
  PaymentHistory,
  UserSettings,
} from '../types/index.ts';

export const firestoreService = {
  // Sync Settings
  async saveSettings(userId: string, settings: Partial<UserSettings>): Promise<void> {
    const path = `users/${userId}/settings/default`;
    try {
      await setDoc(doc(db, path), settings, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async getSettings(userId: string): Promise<Partial<UserSettings> | null> {
    const path = `users/${userId}/settings/default`;
    try {
      const defaultSnap = await getDoc(doc(db, path));
      if (defaultSnap.exists()) {
        return defaultSnap.data() as Partial<UserSettings>;
      }
      const snap = await getDocs(collection(db, `users/${userId}/settings`));
      if (!snap.empty) {
        return snap.docs[0].data() as Partial<UserSettings>;
      }
      return null;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }
  },

  // Focus Sessions
  async saveFocusSession(userId: string, session: FocusSession): Promise<void> {
    const path = `users/${userId}/focus_sessions/${session.id}`;
    try {
      await setDoc(doc(db, path), session, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  listenFocusSessions(userId: string, onUpdate: (sessions: FocusSession[]) => void): Unsubscribe {
    const path = `users/${userId}/focus_sessions`;
    return onSnapshot(
      collection(db, path),
      (snapshot) => {
        const list = snapshot.docs.map((d) => d.data() as FocusSession);
        onUpdate(list.sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );
  },

  // Tasks
  async saveTask(userId: string, task: Task): Promise<void> {
    const path = `users/${userId}/tasks/${task.id}`;
    try {
      await setDoc(doc(db, path), task, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async deleteTask(userId: string, taskId: string): Promise<void> {
    const path = `users/${userId}/tasks/${taskId}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  },

  listenTasks(userId: string, onUpdate: (tasks: Task[]) => void): Unsubscribe {
    const path = `users/${userId}/tasks`;
    return onSnapshot(
      collection(db, path),
      (snapshot) => {
        const list = snapshot.docs.map((d) => d.data() as Task);
        onUpdate(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );
  },

  // Income
  async saveIncome(userId: string, income: IncomeTransaction): Promise<void> {
    const path = `users/${userId}/income/${income.id}`;
    try {
      await setDoc(doc(db, path), income, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async deleteIncome(userId: string, id: string): Promise<void> {
    const path = `users/${userId}/income/${id}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  },

  // Recurring Expenses
  async saveRecurringExpense(userId: string, rec: RecurringExpense): Promise<void> {
    const path = `users/${userId}/recurring_expenses/${rec.id}`;
    try {
      await setDoc(doc(db, path), rec, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  // Variable Expenses
  async saveExpense(userId: string, exp: ExpenseTransaction): Promise<void> {
    const path = `users/${userId}/expenses/${exp.id}`;
    try {
      await setDoc(doc(db, path), exp, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  // Bills
  async saveBill(userId: string, bill: Bill): Promise<void> {
    const path = `users/${userId}/bills/${bill.id}`;
    try {
      await setDoc(doc(db, path), bill, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  // Payment History
  async savePaymentHistory(userId: string, pay: PaymentHistory): Promise<void> {
    const path = `users/${userId}/payment_history/${pay.id}`;
    try {
      await setDoc(doc(db, path), pay, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },
};
