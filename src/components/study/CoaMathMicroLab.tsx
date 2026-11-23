import React, { useState, useMemo } from 'react';
import {
  Binary,
  Cpu,
  Calculator,
  TrendingUp,
  Copy,
  Check,
  ArrowRight,
  Info,
  RefreshCw,
} from 'lucide-react';
import {
  convertNumberBase,
  computeComplements,
  computeIeee754,
  computeComplexityPoints,
} from '../../lib/coaMathLab.ts';
import type { BaseType } from '../../types/features15.ts';

type LabSection = 'number_bases' | 'complements' | 'ieee754' | 'big_o';

export const CoaMathMicroLab: React.FC = () => {
  const [activeSection, setActiveSection] = useState<LabSection>('number_bases');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // 1. Number Bases State
  const [baseInput, setBaseInput] = useState<string>('42');
  const [fromBase, setFromBase] = useState<BaseType>('dec');
  const [toBase, setToBase] = useState<BaseType>('bin');

  const baseConversionResult = useMemo(() => {
    return convertNumberBase(baseInput, fromBase, toBase);
  }, [baseInput, fromBase, toBase]);

  // 2. Complements State
  const [complementsDecInput, setComplementsDecInput] = useState<number>(-42);
  const [bitWidth, setBitWidth] = useState<8 | 16 | 32>(8);

  const complementsResult = useMemo(() => {
    return computeComplements(complementsDecInput, bitWidth);
  }, [complementsDecInput, bitWidth]);

  // 3. IEEE-754 State
  const [floatInput, setFloatInput] = useState<number>(-13.625);
  const [is32Bit, setIs32Bit] = useState<boolean>(true);

  const ieeeResult = useMemo(() => {
    return computeIeee754(floatInput, is32Bit);
  }, [floatInput, is32Bit]);

  // 4. Big-O State
  const [logInput, setLogInput] = useState<number>(1024);
  const complexityData = useMemo(() => computeComplexityPoints(), []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border border-blue-500/20">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-6 h-6 text-blue-500 dark:text-blue-400" />
            <h2 className="text-xl font-bold text-foreground">COA & Computer Science Micro-Lab</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Deterministic step-by-step calculators for Computer Organization, Number Architecture, and Algorithm Complexity.
          </p>
        </div>

        {/* Section Navigation Pills */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-surface rounded-xl border border-border">
          <button
            type="button"
            onClick={() => setActiveSection('number_bases')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              activeSection === 'number_bases'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Binary className="w-3.5 h-3.5" />
            Number Bases
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('complements')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              activeSection === 'complements'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            1's & 2's Comp
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('ieee754')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              activeSection === 'ieee754'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            IEEE-754 Float
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('big_o')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              activeSection === 'big_o'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Big-O Complexity
          </button>
        </div>
      </div>

      {/* SECTION 1: Number Bases */}
      {activeSection === 'number_bases' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm space-y-4">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Binary className="w-5 h-5 text-blue-500" />
              Number System Conversion with Step-by-Step Expansion
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Input Value
                </label>
                <input
                  type="text"
                  value={baseInput}
                  onChange={(e) => setBaseInput(e.target.value)}
                  placeholder="e.g. 42 or 101010"
                  className="w-full px-3 py-2 text-sm rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  From Base
                </label>
                <select
                  value={fromBase}
                  onChange={(e) => setFromBase(e.target.value as BaseType)}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary focus:outline-none"
                >
                  <option value="dec">Decimal (Base 10)</option>
                  <option value="bin">Binary (Base 2)</option>
                  <option value="hex">Hexadecimal (Base 16)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  To Base
                </label>
                <select
                  value={toBase}
                  onChange={(e) => setToBase(e.target.value as BaseType)}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary focus:outline-none"
                >
                  <option value="bin">Binary (Base 2)</option>
                  <option value="dec">Decimal (Base 10)</option>
                  <option value="hex">Hexadecimal (Base 16)</option>
                </select>
              </div>
            </div>

            {/* Conversion Result Output */}
            <div className="p-4 rounded-xl bg-muted/40 border border-border flex items-center justify-between">
              <div>
                <span className="text-xs text-muted-foreground block font-medium">Result ({toBase.toUpperCase()}):</span>
                <span className="text-xl sm:text-2xl font-mono font-bold text-foreground tracking-wider">
                  {baseConversionResult.output}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(baseConversionResult.output, 'baseResult')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-surface hover:bg-muted border border-border transition-colors flex items-center gap-1.5"
              >
                {copiedKey === 'baseResult' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                    Copy
                  </>
                )}
              </button>
            </div>

            {/* Explanation & Steps */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                <Info className="w-4 h-4 text-blue-500" />
                {baseConversionResult.explanation}
              </div>

              {baseConversionResult.steps.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted text-muted-foreground font-semibold border-b border-border">
                      <tr>
                        <th className="px-3 py-2">Step</th>
                        <th className="px-3 py-2">Operation</th>
                        <th className="px-3 py-2">Quotient / Product</th>
                        <th className="px-3 py-2">Remainder / Bit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-mono">
                      {baseConversionResult.steps.map((st) => (
                        <tr key={st.step} className="hover:bg-muted/30">
                          <td className="px-3 py-2 text-muted-foreground">{st.step}</td>
                          <td className="px-3 py-2 font-medium">{st.operation}</td>
                          <td className="px-3 py-2 text-foreground">{st.quotientOrProduct}</td>
                          <td className="px-3 py-2 font-bold text-primary">{st.remainderOrBit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: 1's & 2's Complements */}
      {activeSection === 'complements' && (
        <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm space-y-5">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-indigo-500" />
            1's and 2's Complement Representation (Signed / Unsigned Range)
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Decimal Integer (Positive or Negative)
              </label>
              <input
                type="number"
                value={complementsDecInput}
                onChange={(e) => setComplementsDecInput(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Bit Architecture
              </label>
              <div className="flex gap-2">
                {[8, 16, 32].map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBitWidth(b as 8 | 16 | 32)}
                    className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all ${
                      bitWidth === b
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-background text-muted-foreground border-border hover:bg-muted'
                    }`}
                  >
                    {b}-bit
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-1">
              <span className="text-xs text-muted-foreground font-medium">Magnitude Binary:</span>
              <p className="text-lg font-mono font-bold text-foreground break-all">
                {complementsResult.binaryRaw}
              </p>
              <span className="text-[10px] text-muted-foreground">Unsigned magnitude ({bitWidth}-bit padded)</span>
            </div>

            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-1">
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">1's Complement (Bit Inversion):</span>
              <p className="text-lg font-mono font-bold text-blue-600 dark:text-blue-400 break-all">
                {complementsResult.onesComplement}
              </p>
              <span className="text-[10px] text-muted-foreground">Invert all 0s to 1s and 1s to 0s</span>
            </div>

            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                2's Complement (Hardware Representation):
              </span>
              <p className="text-lg font-mono font-bold text-emerald-600 dark:text-emerald-400 break-all">
                {complementsResult.twosComplement}
              </p>
              <span className="text-[10px] text-muted-foreground">1's Complement + 1 (used by CPUs for subtraction)</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-surface border border-border text-xs text-muted-foreground space-y-2">
            <div className="font-semibold text-foreground">Hardware Range Architecture ({bitWidth}-bit):</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                • <strong>Signed Range:</strong>{' '}
                <span className="font-mono text-foreground">
                  {-Math.pow(2, bitWidth - 1)} to {Math.pow(2, bitWidth - 1) - 1}
                </span>
              </div>
              <div>
                • <strong>Unsigned Range:</strong>{' '}
                <span className="font-mono text-foreground">0 to {Math.pow(2, bitWidth) - 1}</span>
              </div>
            </div>
            <div>
              • <strong>Interpretation:</strong>{' '}
              {complementsResult.isNegative ? (
                <span>
                  The MSB (Most Significant Bit) is <strong className="text-primary font-mono">1</strong>, indicating a negative signed integer.
                  Interpreted as unsigned binary, this bit pattern represents decimal <strong className="font-mono text-foreground">{complementsResult.unsignedValue}</strong>.
                </span>
              ) : (
                <span>
                  The MSB is <strong className="text-primary font-mono">0</strong>, indicating a positive signed integer. Signed and unsigned bit representations are identical.
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: IEEE-754 Floating-Point */}
      {activeSection === 'ieee754' && (
        <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm space-y-5">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Calculator className="w-5 h-5 text-purple-500" />
            IEEE-754 Floating-Point Visual Representation
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Floating-Point Real Number
              </label>
              <input
                type="number"
                step="any"
                value={floatInput}
                onChange={(e) => setFloatInput(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Precision Format
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIs32Bit(true)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all ${
                    is32Bit
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  32-bit Single Precision (float)
                </button>
                <button
                  type="button"
                  onClick={() => setIs32Bit(false)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all ${
                    !is32Bit
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  64-bit Double Precision (double)
                </button>
              </div>
            </div>
          </div>

          {/* Visual Bit Architecture Strip */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground block">
              Bit Strip Breakdown ({is32Bit ? '32' : '64'} bits):
            </span>
            <div className="flex flex-wrap gap-1 p-3 rounded-xl bg-background border border-border font-mono text-xs overflow-x-auto">
              {/* Sign Bit */}
              <div className="flex flex-col items-center">
                <span className="px-2 py-1 rounded bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold border border-rose-500/30">
                  {ieeeResult.signBit}
                </span>
                <span className="text-[9px] text-muted-foreground mt-1">Sign (1b)</span>
              </div>

              {/* Exponent */}
              <div className="flex flex-col items-center">
                <span className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/30 tracking-widest break-all">
                  {ieeeResult.exponentBits}
                </span>
                <span className="text-[9px] text-muted-foreground mt-1">
                  Biased Exponent ({is32Bit ? '8b' : '11b'})
                </span>
              </div>

              {/* Mantissa */}
              <div className="flex flex-col items-center flex-1">
                <span className="px-2.5 py-1 rounded bg-blue-500/20 text-blue-600 dark:text-blue-400 font-medium border border-blue-500/30 tracking-widest break-all w-full text-center">
                  {ieeeResult.mantissaBits}
                </span>
                <span className="text-[9px] text-muted-foreground mt-1">
                  Fraction / Mantissa ({is32Bit ? '23b' : '52b'})
                </span>
              </div>
            </div>
          </div>

          {/* Cards for Sign, Exponent, Bias */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-muted/40 border border-border">
              <span className="text-[11px] text-muted-foreground block font-medium">Sign Bit (S)</span>
              <p className="text-lg font-mono font-bold text-foreground">
                {ieeeResult.signBit} ({ieeeResult.signBit === '1' ? 'Negative (-)' : 'Positive (+)'})
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-muted/40 border border-border">
              <span className="text-[11px] text-muted-foreground block font-medium">Biased Exponent (E)</span>
              <p className="text-lg font-mono font-bold text-foreground">{ieeeResult.biasedExponent}</p>
              <span className="text-[10px] text-muted-foreground">Binary: {ieeeResult.exponentBits}</span>
            </div>

            <div className="p-3.5 rounded-xl bg-muted/40 border border-border">
              <span className="text-[11px] text-muted-foreground block font-medium">Actual Exponent (e)</span>
              <p className="text-lg font-mono font-bold text-foreground">
                {ieeeResult.actualExponent}
              </p>
              <span className="text-[10px] text-muted-foreground">
                E ({ieeeResult.biasedExponent}) - Bias ({ieeeResult.bias})
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-muted/40 border border-border">
              <span className="text-[11px] text-muted-foreground block font-medium">Hex Representation</span>
              <p className="text-lg font-mono font-bold text-primary">{ieeeResult.hexString}</p>
              <span className="text-[10px] text-muted-foreground">Stored memory bytes</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-surface border border-border text-xs text-muted-foreground space-y-1">
            <div className="font-semibold text-foreground">Mathematical Interpretation:</div>
            <p className="font-mono text-foreground text-xs">
              V = (-1)^S × (1 + Fraction) × 2^(E - Bias)
            </p>
            <p>
              Classification: <strong className="capitalize text-foreground">{ieeeResult.specialCase} value</strong>
            </p>
          </div>
        </div>
      )}

      {/* SECTION 4: Big-O Complexity */}
      {activeSection === 'big_o' && (
        <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm space-y-5">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
            Big-O Computational Complexity & Logarithmic Benchmark
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Logarithm Explorer (Value of N)
              </label>
              <input
                type="number"
                min="1"
                value={logInput}
                onChange={(e) => setLogInput(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 text-sm rounded-xl bg-background border border-border focus:ring-2 focus:ring-primary focus:outline-none font-mono"
              />
            </div>

            <div className="flex items-center gap-2 pt-5">
              <div className="p-3 rounded-xl bg-muted/30 border border-border flex-1">
                <span className="text-[11px] text-muted-foreground block">log₂(N)</span>
                <span className="text-base font-mono font-bold text-foreground">
                  {(Math.log2(logInput) || 0).toFixed(3)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-muted/30 border border-border flex-1">
                <span className="text-[11px] text-muted-foreground block">ln(N)</span>
                <span className="text-base font-mono font-bold text-foreground">
                  {(Math.log(logInput) || 0).toFixed(3)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-muted/30 border border-border flex-1">
                <span className="text-[11px] text-muted-foreground block">log₁₀(N)</span>
                <span className="text-base font-mono font-bold text-foreground">
                  {(Math.log10(logInput) || 0).toFixed(3)}
                </span>
              </div>
            </div>
          </div>

          {/* Big-O Growth Table */}
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted text-muted-foreground font-semibold border-b border-border">
                <tr>
                  <th className="px-3.5 py-2.5">Input (N)</th>
                  <th className="px-3.5 py-2.5 text-emerald-600 dark:text-emerald-400">O(1) Constant</th>
                  <th className="px-3.5 py-2.5 text-teal-600 dark:text-teal-400">O(log N) Log</th>
                  <th className="px-3.5 py-2.5 text-blue-600 dark:text-blue-400">O(N) Linear</th>
                  <th className="px-3.5 py-2.5 text-indigo-600 dark:text-indigo-400">O(N log N) Linearithmic</th>
                  <th className="px-3.5 py-2.5 text-amber-600 dark:text-amber-400">O(N²) Quadratic</th>
                  <th className="px-3.5 py-2.5 text-rose-600 dark:text-rose-400">O(2ᴺ) Exponential</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono">
                {complexityData.map((pt) => (
                  <tr key={pt.n} className="hover:bg-muted/30">
                    <td className="px-3.5 py-2 font-bold text-foreground">{pt.n}</td>
                    <td className="px-3.5 py-2 text-emerald-600 dark:text-emerald-400">{pt.o1}</td>
                    <td className="px-3.5 py-2 text-teal-600 dark:text-teal-400">{pt.oLogN}</td>
                    <td className="px-3.5 py-2 text-blue-600 dark:text-blue-400">{pt.oN}</td>
                    <td className="px-3.5 py-2 text-indigo-600 dark:text-indigo-400">{pt.oNLogN}</td>
                    <td className="px-3.5 py-2 text-amber-600 dark:text-amber-400">{pt.oN2}</td>
                    <td className="px-3.5 py-2 text-rose-600 dark:text-rose-400 font-bold">{pt.o2N}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

