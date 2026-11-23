import { TimeVsMoneyResult } from '../types/features15.ts';

/**
 * Converts an expense amount (in standard units or paise) into equivalent hours and days of work
 * based on the user's hourly earning rate.
 *
 * @param amountInCurrency - The monetary amount (in Rupees, Dollars, etc.)
 * @param hourlyRate - User configured hourly rate (in the same currency)
 */
export function calculateTimeVsMoney(
  amountInCurrency: number,
  hourlyRate?: number
): TimeVsMoneyResult | null {
  if (!hourlyRate || hourlyRate <= 0 || amountInCurrency <= 0) {
    return null;
  }

  const workHours = amountInCurrency / hourlyRate;
  const workDays = workHours / 8; // Standard 8-hour workday benchmark

  let humanizedString = '';
  if (workHours < 1) {
    const minutes = Math.round(workHours * 60);
    humanizedString = `${minutes} min${minutes === 1 ? '' : 's'} of work`;
  } else if (workHours < 8) {
    const h = Math.floor(workHours);
    const m = Math.round((workHours % 1) * 60);
    humanizedString = m > 0 ? `${h}h ${m}m of labor` : `${h} hour${h === 1 ? '' : 's'} of work`;
  } else {
    humanizedString = `${workDays.toFixed(1)} working days (${Math.round(workHours)} hrs)`;
  }

  return {
    amount: amountInCurrency,
    expenseAmount: amountInCurrency,
    hourlyRate,
    workHours: Math.round(workHours * 100) / 100,
    workDays: Math.round(workDays * 10) / 10,
    formattedTime: humanizedString,
    displayText: humanizedString,
    humanizedString,
    isConfigured: true,
  };
}
