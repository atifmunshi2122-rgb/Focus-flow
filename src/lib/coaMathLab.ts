/**
 * FocusFlow & Finance — COA and Computer Science Math Micro-Lab Engine
 * Pure deterministic algorithms for number systems, 1's/2's complements,
 * IEEE-754 floating point representation, and Big-O computational complexity.
 * ZERO EVAL. ZERO EXTERNAL AI.
 */

import type {
  BaseType,
  NumberConversionResult,
  NumberConversionStep,
  ComplementsResult,
  Ieee754Representation,
} from '../types/features15.ts';

/**
 * Validates whether string is a valid representation in the given base.
 */
export function isValidBaseString(input: string, base: BaseType): boolean {
  const clean = input.trim().replace(/^[-+]/, '');
  if (!clean) return false;
  if (base === 'bin') return /^[01]+$/.test(clean);
  if (base === 'dec') return /^[0-9]+$/.test(clean);
  if (base === 'hex') return /^[0-9a-fA-F]+$/.test(clean);
  return false;
}

/**
 * Converts a number string from one base to another with step-by-step arithmetic.
 */
export function convertNumberBase(
  input: string,
  fromBase: BaseType,
  toBase: BaseType
): NumberConversionResult {
  const trimmed = input.trim();
  if (!isValidBaseString(trimmed, fromBase)) {
    return {
      input: trimmed,
      fromBase,
      toBase,
      output: 'Invalid Input',
      steps: [],
      explanation: `The input "${trimmed}" contains characters invalid for base ${fromBase.toUpperCase()}.`,
    };
  }

  const isNeg = trimmed.startsWith('-');
  const unsignedRaw = trimmed.replace(/^[-+]/, '');
  const fromRadix = fromBase === 'bin' ? 2 : fromBase === 'dec' ? 10 : 16;
  const toRadix = toBase === 'bin' ? 2 : toBase === 'dec' ? 10 : 16;

  // Convert to Decimal first
  let decimalValue = 0;
  try {
    decimalValue = parseInt(unsignedRaw, fromRadix);
    if (isNaN(decimalValue)) throw new Error('NaN');
  } catch {
    return {
      input: trimmed,
      fromBase,
      toBase,
      output: 'Error',
      steps: [],
      explanation: 'Failed to parse integer within safe numeric bounds.',
    };
  }

  // Generate steps
  const steps: NumberConversionStep[] = [];
  let explanation = '';

  if (fromBase === toBase) {
    return {
      input: trimmed,
      fromBase,
      toBase,
      output: trimmed,
      steps: [{ step: 1, operation: 'Identical Base', quotientOrProduct: trimmed, remainderOrBit: '-' }],
      explanation: 'Source and target base are identical. No conversion required.',
    };
  }

  if (fromBase !== 'dec' && toBase === 'dec') {
    // Positional expansion steps: sum of d_i * base^i
    const chars = unsignedRaw.split('').reverse();
    explanation = `Positional Expansion Method: Multiply each digit by ${fromRadix}^position and sum them.`;
    chars.forEach((c, idx) => {
      const val = parseInt(c, fromRadix);
      const powerVal = Math.pow(fromRadix, idx);
      const product = val * powerVal;
      steps.push({
        step: idx + 1,
        operation: `${val} × ${fromRadix}^${idx}`,
        quotientOrProduct: `${product}`,
        remainderOrBit: c,
      });
    });
  } else if (toBase !== 'dec') {
    // Successive division method by target radix
    explanation = `Successive Division Method: Divide by ${toRadix} continuously; the remainders read bottom-to-top give the result.`;
    let temp = decimalValue;
    let stepNum = 1;
    if (temp === 0) {
      steps.push({ step: 1, operation: `0 ÷ ${toRadix}`, quotientOrProduct: '0', remainderOrBit: '0' });
    } else {
      while (temp > 0) {
        const rem = temp % toRadix;
        const quot = Math.floor(temp / toRadix);
        const remChar = rem.toString(toRadix).toUpperCase();
        steps.push({
          step: stepNum++,
          operation: `${temp} ÷ ${toRadix}`,
          quotientOrProduct: `Quotient: ${quot}`,
          remainderOrBit: `Remainder: ${rem} (${remChar})`,
        });
        temp = quot;
      }
    }
  }

  const rawConverted = decimalValue.toString(toRadix).toUpperCase();
  const finalOutput = isNeg ? `-${rawConverted}` : rawConverted;

  return {
    input: trimmed,
    fromBase,
    toBase,
    output: finalOutput,
    steps,
    explanation,
  };
}

/**
 * Computes 1's and 2's complements for signed and unsigned integers.
 */
export function computeComplements(decimalValue: number, bits: 8 | 16 | 32 = 8): ComplementsResult {
  const isNegative = decimalValue < 0;
  const maxUnsigned = Math.pow(2, bits) - 1;
  const maxSigned = Math.pow(2, bits - 1) - 1;
  const minSigned = -Math.pow(2, bits - 1);

  // Clamp safely within bits range
  const safeDec = Math.max(minSigned, Math.min(maxSigned, decimalValue));
  const magnitude = Math.abs(safeDec);

  // Raw binary magnitude padded
  const rawBin = magnitude.toString(2).padStart(bits, '0');

  // 1's complement of magnitude
  const onesComp = rawBin
    .split('')
    .map((b) => (b === '0' ? '1' : '0'))
    .join('');

  let twosComp = '';
  let unsignedValue = 0;

  if (isNegative) {
    // 2's complement = 1's comp + 1
    const onesInt = parseInt(onesComp, 2);
    const twosInt = (onesInt + 1) & maxUnsigned;
    twosComp = twosInt.toString(2).padStart(bits, '0');
    unsignedValue = twosInt;
  } else {
    twosComp = rawBin;
    unsignedValue = safeDec;
  }

  return {
    originalDecimal: safeDec,
    bits,
    binaryRaw: rawBin,
    onesComplement: onesComp,
    twosComplement: twosComp,
    isNegative,
    unsignedValue,
  };
}

/**
 * Computes IEEE-754 Floating-Point 32-bit Single Precision & 64-bit Double Precision representation.
 */
export function computeIeee754(value: number, is32Bit: boolean = true): Ieee754Representation {
  const buffer = new ArrayBuffer(is32Bit ? 4 : 8);
  const view = new DataView(buffer);

  if (is32Bit) {
    view.setFloat32(0, value, false); // Big endian
  } else {
    view.setFloat64(0, value, false);
  }

  let binaryString = '';
  let hexString = '';
  const totalBytes = is32Bit ? 4 : 8;

  for (let i = 0; i < totalBytes; i++) {
    const byte = view.getUint8(i);
    binaryString += byte.toString(2).padStart(8, '0');
    hexString += byte.toString(16).padStart(2, '0').toUpperCase();
  }

  const signBit = binaryString[0];
  const exponentLen = is32Bit ? 8 : 11;
  const mantissaLen = is32Bit ? 23 : 52;
  const bias = is32Bit ? 127 : 1023;

  const exponentBits = binaryString.slice(1, 1 + exponentLen);
  const mantissaBits = binaryString.slice(1 + exponentLen);

  const biasedExponent = parseInt(exponentBits, 2);
  const actualExponent = biasedExponent - bias;

  let specialCase: Ieee754Representation['specialCase'] = 'normal';
  if (biasedExponent === 0) {
    specialCase = mantissaBits.includes('1') ? 'subnormal' : 'zero';
  } else if (biasedExponent === Math.pow(2, exponentLen) - 1) {
    specialCase = mantissaBits.includes('1') ? 'nan' : 'infinity';
  }

  return {
    value,
    is32Bit,
    signBit,
    exponentBits,
    mantissaBits,
    biasedExponent,
    actualExponent,
    bias,
    hexString: '0x' + hexString,
    binaryString,
    specialCase,
  };
}

/**
 * Big-O complexity points table comparison.
 */
export interface ComplexityPoint {
  n: number;
  o1: number;
  oLogN: number;
  oN: number;
  oNLogN: number;
  oN2: number;
  o2N: string;
}

export function computeComplexityPoints(): ComplexityPoint[] {
  const ns = [1, 5, 10, 20, 50, 100];
  return ns.map((n) => {
    const oLogN = Math.round(Math.log2(n) * 100) / 100;
    const oNLogN = Math.round(n * Math.log2(n) * 100) / 100;
    const oN2 = Math.pow(n, 2);
    const o2N = n <= 30 ? Math.pow(2, n).toLocaleString() : '> 10^15 (Overflow)';
    return {
      n,
      o1: 1,
      oLogN,
      oN: n,
      oNLogN,
      oN2,
      o2N,
    };
  });
}

