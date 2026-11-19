/**
 * Universal Sheet Sync Hub — Excel-Style Column Conversion Utilities
 * Handles arbitrary 0-based column indices (0 -> A, 25 -> Z, 26 -> AA, 27 -> AB, 701 -> ZZ, 702 -> AAA).
 */

/**
 * Converts a 0-based column index to an Excel column letter.
 * @example
 * columnIndexToLetter(0)   // 'A'
 * columnIndexToLetter(25)  // 'Z'
 * columnIndexToLetter(26)  // 'AA'
 * columnIndexToLetter(27)  // 'AB'
 * columnIndexToLetter(701) // 'ZZ'
 * columnIndexToLetter(702) // 'AAA'
 */
export function columnIndexToLetter(colIndex: number): string {
  if (colIndex < 0 || !Number.isInteger(colIndex)) {
    throw new Error(`Invalid column index: ${colIndex}. Must be a non-negative integer.`);
  }
  let letter = '';
  let temp = colIndex;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

/**
 * Converts an Excel column letter to a 0-based column index.
 * @example
 * columnLetterToIndex('A')   // 0
 * columnLetterToIndex('Z')   // 25
 * columnLetterToIndex('AA')  // 26
 * columnLetterToIndex('AB')  // 27
 * columnLetterToIndex('ZZ')  // 701
 * columnLetterToIndex('AAA') // 702
 */
export function columnLetterToIndex(colLetter: string): number {
  if (!colLetter || typeof colLetter !== 'string') {
    throw new Error('Column letter must be a non-empty string.');
  }
  const upper = colLetter.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(upper)) {
    throw new Error(`Invalid column letter: "${colLetter}". Must contain only alphabetic characters.`);
  }
  let index = 0;
  for (let i = 0; i < upper.length; i++) {
    index = index * 26 + (upper.charCodeAt(i) - 64);
  }
  return index - 1;
}

