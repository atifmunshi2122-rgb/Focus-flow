import './test_bootstrap.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { columnIndexToLetter, columnLetterToIndex } from '../src/lib/sheetHub/columnUtils.ts';

test('Column Utils — columnIndexToLetter conversions', () => {
  const cases: Array<[number, string]> = [
    [0, 'A'],
    [1, 'B'],
    [24, 'Y'],
    [25, 'Z'],
    [26, 'AA'],
    [27, 'AB'],
    [51, 'AZ'],
    [52, 'BA'],
    [53, 'BB'],
    [701, 'ZZ'],
    [702, 'AAA'],
    [703, 'AAB'],
  ];

  for (const [index, expected] of cases) {
    const actual = columnIndexToLetter(index);
    assert.equal(actual, expected, `Expected index ${index} to convert to "${expected}", got "${actual}"`);
  }
});

test('Column Utils — columnLetterToIndex conversions', () => {
  const cases: Array<[string, number]> = [
    ['A', 0],
    ['B', 1],
    ['Y', 24],
    ['Z', 25],
    ['AA', 26],
    ['AB', 27],
    ['AZ', 51],
    ['BA', 52],
    ['BB', 53],
    ['ZZ', 701],
    ['AAA', 702],
    ['AAB', 703],
  ];

  for (const [letter, expected] of cases) {
    const actual = columnLetterToIndex(letter);
    assert.equal(actual, expected, `Expected letter "${letter}" to convert to index ${expected}, got ${actual}`);
  }
});

test('Column Utils — Round-trip conversion', () => {
  for (let i = 0; i < 1500; i++) {
    const letter = columnIndexToLetter(i);
    const roundTripped = columnLetterToIndex(letter);
    assert.equal(roundTripped, i, `Round-trip failed for index ${i} -> "${letter}" -> ${roundTripped}`);
  }
});

test('Column Utils — Invalid inputs throw errors', () => {
  assert.throws(() => columnIndexToLetter(-1));
  assert.throws(() => columnIndexToLetter(1.5));
  assert.throws(() => columnLetterToIndex(''));
  assert.throws(() => columnLetterToIndex('A1'));
  assert.throws(() => columnLetterToIndex('123'));
});

