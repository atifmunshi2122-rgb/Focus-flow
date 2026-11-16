export interface PredefinedReason {
  id: string;
  label: string;
  icon: string;
  defaultCategory: string;
}

export const PREDEFINED_EXPENSE_REASONS: PredefinedReason[] = [
  { id: 'breakfast', label: 'Breakfast', icon: '🍳', defaultCategory: 'Food & Dining' },
  { id: 'lunch', label: 'Lunch', icon: '🍛', defaultCategory: 'Food & Dining' },
  { id: 'dinner', label: 'Dinner', icon: '🍽️', defaultCategory: 'Food & Dining' },
  { id: 'snacks', label: 'Snacks', icon: '🍿', defaultCategory: 'Food & Dining' },
  { id: 'tea_coffee', label: 'Tea/Coffee', icon: '☕', defaultCategory: 'Food & Dining' },
  { id: 'groceries', label: 'Groceries', icon: '🛒', defaultCategory: 'Groceries' },
  { id: 'transport', label: 'Transport', icon: '🚗', defaultCategory: 'Transportation' },
  { id: 'education', label: 'Education', icon: '📚', defaultCategory: 'Education' },
  { id: 'other', label: 'Other', icon: '✨', defaultCategory: 'General' },
];

export const CUSTOM_REASONS_STORAGE_KEY = 'focusflow_custom_expense_reasons';

export function getCustomExpenseReasons(): string[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_REASONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

export function saveCustomExpenseReason(reason: string): string[] {
  const trimmed = reason.trim();
  if (!trimmed) return getCustomExpenseReasons();
  const current = getCustomExpenseReasons();
  const alreadyPredefined = PREDEFINED_EXPENSE_REASONS.some(
    (p) => p.label.toLowerCase() === trimmed.toLowerCase()
  );
  const alreadyCustom = current.some((c) => c.toLowerCase() === trimmed.toLowerCase());
  if (alreadyPredefined || alreadyCustom) return current;

  const updated = [trimmed, ...current];
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(CUSTOM_REASONS_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save custom reason to localStorage', e);
    }
  }
  return updated;
}

export function removeCustomExpenseReason(reason: string): string[] {
  const trimmed = reason.trim();
  const current = getCustomExpenseReasons();
  const updated = current.filter((c) => c.toLowerCase() !== trimmed.toLowerCase());
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(CUSTOM_REASONS_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to remove custom reason from localStorage', e);
    }
  }
  return updated;
}

export function resolveDefaultCategoryForReason(reason: string): string {
  const normalized = reason.trim().toLowerCase();
  const match = PREDEFINED_EXPENSE_REASONS.find(
    (p) => p.label.toLowerCase() === normalized || p.id.toLowerCase() === normalized
  );
  if (match) return match.defaultCategory;
  if (
    normalized.includes('food') ||
    normalized.includes('meal') ||
    normalized.includes('tea') ||
    normalized.includes('coffee') ||
    normalized.includes('breakfast') ||
    normalized.includes('lunch') ||
    normalized.includes('dinner') ||
    normalized.includes('snack')
  ) {
    return 'Food & Dining';
  }
  if (
    normalized.includes('bus') ||
    normalized.includes('taxi') ||
    normalized.includes('uber') ||
    normalized.includes('metro') ||
    normalized.includes('fuel') ||
    normalized.includes('petrol')
  ) {
    return 'Transportation';
  }
  if (
    normalized.includes('book') ||
    normalized.includes('course') ||
    normalized.includes('tuition') ||
    normalized.includes('exam')
  ) {
    return 'Education';
  }
  if (
    normalized.includes('grocery') ||
    normalized.includes('vegetable') ||
    normalized.includes('fruit') ||
    normalized.includes('bazaar')
  ) {
    return 'Groceries';
  }
  return 'General';
}
