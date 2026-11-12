import { CurrencyCode } from '../types/index.ts';

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

export const MAX_SAFE_PAISE = 1_000_000_000_000; // ₹10,000,000,000.00 (100 Crore / 10 Billion)
export const MIN_TRANSACTION_PAISE = 1; // ₹0.01

/**
 * Validate that an amount is a valid positive integer paise value within system boundaries.
 */
export function isValidPaise(amountPaise: unknown): amountPaise is number {
  if (typeof amountPaise !== 'number') return false;
  if (!Number.isFinite(amountPaise) || !Number.isInteger(amountPaise)) return false;
  return amountPaise >= 0 && amountPaise <= MAX_SAFE_PAISE;
}

/**
 * Formats minor units (paise/cents) into localized currency string.
 * e.g., 2500000 paise in INR -> "₹25,000.00"
 */
export function formatCurrency(
  amountPaise: number,
  currency: CurrencyCode = 'INR',
  options?: { hideDecimals?: boolean; compact?: boolean }
): string {
  const symbol = CURRENCY_SYMBOLS[currency] || '₹';
  const safePaise = typeof amountPaise === 'number' && Number.isFinite(amountPaise) ? amountPaise : 0;
  const isNegative = safePaise < 0;
  const absPaise = Math.abs(safePaise);
  const units = absPaise / 100;

  if (options?.compact && units >= 1000) {
    let compactFormatted: string;
    if (units >= 10000000) {
      // 1 Crore = 10,000,000
      compactFormatted = `${(units / 10000000).toFixed(2)}Cr`;
    } else if (units >= 100000) {
      // 1 Lakh = 100,000
      compactFormatted = `${(units / 100000).toFixed(1)}L`;
    } else {
      compactFormatted = `${(units / 1000).toFixed(1)}K`;
    }
    return `${isNegative ? '-' : ''}${symbol}${compactFormatted}`;
  }

  const formatted = new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    minimumFractionDigits: options?.hideDecimals ? 0 : 2,
    maximumFractionDigits: options?.hideDecimals ? 0 : 2,
  }).format(units);

  return `${isNegative ? '-' : ''}${symbol}${formatted}`;
}

/**
 * Converts user input (e.g. "1250.50" or 1250.5) to integer minor units (125050 paise)
 * using exact string parsing to eliminate IEEE-754 floating-point inaccuracies.
 */
export function toPaise(amount: number | string): number {
  if (amount === null || amount === undefined) return 0;

  if (typeof amount === 'number') {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    // Format to 2 decimal places as string first to prevent float multiplication errors (e.g. 19.99 * 100)
    const fixedStr = amount.toFixed(2);
    return parseStringToPaise(fixedStr);
  }

  return parseStringToPaise(String(amount));
}

function parseStringToPaise(str: string): number {
  const trimmed = str.trim();
  if (trimmed.startsWith('-')) return 0;
  const cleaned = trimmed.replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;

  const parts = cleaned.split('.');
  const wholePart = parts[0] ? parseInt(parts[0], 10) : 0;
  if (!Number.isFinite(wholePart) || wholePart < 0) return 0;

  const decimalPart = (parts[1] || '').slice(0, 2).padEnd(2, '0');
  const fraction = parseInt(decimalPart, 10);

  const totalPaise = wholePart * 100 + fraction;
  if (!Number.isFinite(totalPaise) || totalPaise < 0) return 0;

  return Math.min(totalPaise, MAX_SAFE_PAISE);
}

/**
 * Converts integer paise to standard decimal units for input form binding (e.g., 125000 -> 1250).
 */
export function fromPaise(paise: number): number {
  if (typeof paise !== 'number' || !Number.isFinite(paise)) return 0;
  return paise / 100;
}

export const toMajorCurrency = fromPaise;
