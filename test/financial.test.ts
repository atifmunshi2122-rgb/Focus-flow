import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toPaise,
  fromPaise,
  formatCurrency,
  isValidPaise,
  MAX_SAFE_PAISE,
  MIN_TRANSACTION_PAISE,
} from '../src/lib/currency.ts';

test('Financial Calculations — Exact Integer Paise Conversion', () => {
  // Test basic integer amounts
  assert.equal(toPaise(100), 10000);
  assert.equal(toPaise('100'), 10000);

  // Test floating point numbers that normally suffer from IEEE-754 precision issues
  assert.equal(toPaise(19.99), 1999);
  assert.equal(toPaise('19.99'), 1999);
  assert.equal(toPaise(1250.5), 125050);
  assert.equal(toPaise('1250.50'), 125050);
  assert.equal(toPaise('0.05'), 5);
  assert.equal(toPaise(0.01), 1);
  assert.equal(toPaise('0.01'), 1);

  // Test reverse conversion to major currency units
  assert.equal(fromPaise(10000), 100);
  assert.equal(fromPaise(1999), 19.99);
  assert.equal(fromPaise(125050), 1250.5);
  assert.equal(fromPaise(1), 0.01);
  assert.equal(fromPaise(0), 0);
});

test('Financial Calculations — Boundary and Invalid Input Handling', () => {
  assert.equal(toPaise(0), 0);
  assert.equal(toPaise(-50), 0);
  assert.equal(toPaise('-100.50'), 0);
  assert.equal(toPaise(''), 0);
  assert.equal(toPaise('invalid'), 0);
  assert.equal(toPaise(NaN), 0);
  assert.equal(toPaise(Infinity), 0);

  // Upper boundary clamping
  const hugeAmount = MAX_SAFE_PAISE * 2;
  assert.equal(toPaise(hugeAmount), MAX_SAFE_PAISE);

  // Validity checks
  assert.equal(isValidPaise(0), true);
  assert.equal(isValidPaise(1000), true);
  assert.equal(isValidPaise(MAX_SAFE_PAISE), true);
  assert.equal(isValidPaise(-1), false);
  assert.equal(isValidPaise(10.5), false);
  assert.equal(isValidPaise('1000'), false);
  assert.equal(isValidPaise(null), false);
  assert.equal(isValidPaise(undefined), false);
  assert.equal(isValidPaise(MAX_SAFE_PAISE + 1), false);
});

test('Financial Calculations — Localized Currency Formatting', () => {
  // INR formatting uses Indian numbering system (Lakhs & Crores: 12,50,000.00)
  const formattedINR = formatCurrency(125000000, 'INR');
  assert.ok(formattedINR.includes('12,50,000.00'));
  assert.ok(formattedINR.startsWith('₹'));

  // USD formatting uses standard Western thousands grouping (1,250,000.00)
  const formattedUSD = formatCurrency(125000000, 'USD');
  assert.ok(formattedUSD.includes('1,250,000.00'));
  assert.ok(formattedUSD.startsWith('$'));

  // EUR and GBP symbols
  assert.ok(formatCurrency(50000, 'EUR').startsWith('€'));
  assert.ok(formatCurrency(50000, 'GBP').startsWith('£'));

  // Compact notation formatting
  assert.equal(formatCurrency(1500000000, 'INR', { compact: true }), '₹1.50Cr');
  assert.equal(formatCurrency(50000000, 'INR', { compact: true }), '₹5.0L');
  assert.equal(formatCurrency(2500000, 'INR', { compact: true }), '₹25.0K');

  // Negative amounts
  const negativeINR = formatCurrency(-5000, 'INR');
  assert.ok(negativeINR.startsWith('-₹50.00') || negativeINR.startsWith('-'));
});

