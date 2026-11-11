import { CurrencyCode } from '../types/index.ts';

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

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
  const units = (amountPaise || 0) / 100;

  if (options?.compact && Math.abs(units) >= 1000) {
    if (Math.abs(units) >= 10000000) {
      // 1 Crore = 10,000,000
      return `${symbol}${(units / 10000000).toFixed(2)}Cr`;
    }
    if (Math.abs(units) >= 100000) {
      // 1 Lakh = 100,000
      return `${symbol}${(units / 100000).toFixed(1)}L`;
    }
    if (Math.abs(units) >= 1000) {
      return `${symbol}${(units / 1000).toFixed(1)}K`;
    }
  }

  const formatted = new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    minimumFractionDigits: options?.hideDecimals ? 0 : 2,
    maximumFractionDigits: options?.hideDecimals ? 0 : 2,
  }).format(units);

  return `${symbol}${formatted}`;
}

/**
 * Converts user input (e.g. "1250.50" or 1250.5) to integer minor units (125050 paise).
 */
export function toPaise(amount: number | string): number {
  if (typeof amount === 'string') {
    const cleaned = amount.replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : Math.round(num * 100);
  }
  return isNaN(amount) ? 0 : Math.round(amount * 100);
}

/**
 * Converts integer paise to standard decimal units for input form binding (e.g., 125000 -> 1250).
 */
export function fromPaise(paise: number): number {
  return (paise || 0) / 100;
}
