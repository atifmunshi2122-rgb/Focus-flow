/**
 * FocusFlow & Finance v1.8 — 15 Unique Zero-AI Features Type Definitions
 */

// ==========================================
// 1. Time-vs-Money True Cost Converter
// ==========================================
export interface TimeVsMoneyResult {
  amount: number;
  expenseAmount?: number;
  hourlyRate: number;
  workHours: number;
  workDays: number;
  formattedTime: string;
  isConfigured: boolean;
  displayText: string;
  humanizedString?: string;
}

// ==========================================
// 2. CS Student Built-in COA/Math Micro-Lab
// ==========================================
export type BaseType = 'bin' | 'dec' | 'hex';

export interface NumberConversionStep {
  step: number;
  operation: string;
  quotientOrProduct: string;
  remainderOrBit: string;
}

export interface NumberConversionResult {
  input: string;
  fromBase: BaseType;
  toBase: BaseType;
  output: string;
  steps: NumberConversionStep[];
  explanation: string;
}

export interface Ieee754Representation {
  value: number;
  is32Bit: boolean;
  signBit: string;
  exponentBits: string;
  mantissaBits: string;
  biasedExponent: number;
  actualExponent: number;
  bias: number;
  hexString: string;
  binaryString: string;
  specialCase?: 'zero' | 'infinity' | 'nan' | 'subnormal' | 'normal';
}

export interface ComplementsResult {
  originalDecimal: number;
  bits: 8 | 16 | 32;
  binaryRaw: string;
  onesComplement: string;
  twosComplement: string;
  isNegative: boolean;
  unsignedValue: number;
}

// ==========================================
// 3. RPG-Style Interactive Skill Tree
// ==========================================
export type SkillNodeStatus = 'locked' | 'available' | 'in_progress' | 'completed';

export interface SkillNode {
  id: string;
  userId?: string;
  trackId: string;
  title: string;
  description: string;
  tier: number; // 1, 2, 3, 4, 5
  prerequisites: string[]; // Node IDs required before unlocking
  status: SkillNodeStatus;
  category: string;
  xpPoints: number;
  completedAt?: string | null;
  notes?: string;
  icon?: string;
  position?: { x: number; y: number };
  estimatedHours?: number;
  tags?: string[];
}

export interface SkillTreePreset {
  id: string;
  name: string;
  category: string;
  description: string;
  nodes: SkillNode[];
}

export interface SkillTrack {
  id: string;
  title: string;
  description: string;
  category: string;
  nodes: SkillNode[];
}

// ==========================================
// 4. Built-in Rough-Work Whiteboard Canvas
// ==========================================
export interface WhiteboardDrawing {
  id: string;
  userId: string;
  title: string;
  topicId?: string;
  topicTitle?: string;
  dataUrl: string; // PNG base64
  sizeBytes: number;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 5. Web Audio API Binaural Beats
// ==========================================
export interface BinauralPreset {
  id: string;
  name: string;
  baseFreq: number; // Hz (Carrier frequency, e.g. 200 Hz)
  beatFreq: number; // Hz (Difference frequency, e.g. 10 Hz for Alpha, 40 Hz for Gamma)
  waveType: 'sine' | 'triangle';
  description: string;
  recommendedUse: string;
  brainwaveBand: 'Delta (0.5-4 Hz)' | 'Theta (4-8 Hz)' | 'Alpha (8-13 Hz)' | 'Beta (13-30 Hz)' | 'Gamma (30-50 Hz)';
}

// ==========================================
// 6. Today's Focus Receipt
// ==========================================
export interface FocusReceiptData {
  date: string;
  userName: string;
  totalStudyMinutes: number;
  completedTasksCount: number;
  completedTaskTitles: string[];
  pomodoroSessionsCount: number;
  totalPomodoroMinutes: number;
  completedHabitsCount: number;
  moneySavedPaise?: number;
  dailyExpensePaise?: number;
  currentStreak: number;
  productivityScore: number;
  currency: string;
  hideFinancials?: boolean;
}

// ==========================================
// 7. What-If Financial Sandbox
// ==========================================
export interface WhatIfScenario {
  id: string;
  name: string;
  monthlyIncomeDelta: number;
  categoryDeltas: Record<string, number>;
  projectedMonthlySavings: number;
  projectedAnnualSavings: number;
  savingsRateChange: number;
  notes?: string;
}

// ==========================================
// 8. Exam Hall Sectional Simulator
// ==========================================
export interface ExamSection {
  id: string;
  name: string;
  durationMinutes: number;
  totalQuestions?: number;
  questionsCount?: number;
  targetMarks?: number;
}

export interface ExamSimulationConfig {
  examName: string;
  totalMinutes: number;
  sections: ExamSection[];
}

export interface ExamSimulationState {
  id: string;
  title: string;
  totalDurationMinutes: number;
  sections: ExamSection[];
  currentSectionIndex: number;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'in_progress';
  sectionElapsedSeconds: Record<string, number>;
  totalElapsedSeconds: number;
  flaggedQuestions?: Record<string, number[]>; // sectionId -> question indices
  attemptedQuestions?: Record<string, number[]>;
  startedAt?: string;
  completedAt?: string;
}

// ==========================================
// 9. Decision Journal
// ==========================================
export interface DecisionEntry {
  id: string;
  userId: string;
  title: string;
  category: 'career' | 'academic' | 'financial' | 'personal' | 'health';
  rationale: string;
  expectedOutcome: string;
  confidenceScore: number; // 1-10
  expectedReviewDate: string; // YYYY-MM-DD
  reviewIntervalDays: 30 | 90 | number;
  status: 'pending_review' | 'reviewed';
  actualOutcome?: string;
  successRating?: number; // 1-5
  reflection?: string;
  lessonsLearned?: string;
  createdAt: string;
  reviewedAt?: string;
}

// ==========================================
// 10. Doomscroll Self-Tax Jar
// ==========================================
export interface DoomscrollTaxEntry {
  id: string;
  userId: string;
  minutes: number;
  durationMinutes?: number;
  distractionApp: string; // e.g. Instagram, YouTube, X, Reddit, Gaming
  platform?: string;
  ratePerHour: number;
  amountTaxed: number;
  taxAmountPaise?: number;
  currency: string;
  notes?: string;
  reason?: string;
  linkedSavingsGoalId?: string;
  createdAt: string;
}

// ==========================================
// 11. Life-in-Weeks Grid
// ==========================================
export interface LifeMilestone {
  id: string;
  weekIndex: number; // 0 to TotalWeeks
  age: number;
  label: string;
  title?: string;
  category: 'education' | 'career' | 'personal' | 'health' | 'target';
  date?: string;
  color?: string;
}

export interface LifeInWeeksConfig {
  birthDate: string; // YYYY-MM-DD
  horizonYears: number; // Default 90
  milestones: LifeMilestone[];
  enabled: boolean;
}

// ==========================================
// 12. 60-Second Code-Typing Warmup
// ==========================================
export interface TypingSnippet {
  id: string;
  language: 'cpp' | 'javascript' | 'python';
  title: string;
  code: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface TypingResult {
  wpm: number;
  accuracy: number;
  elapsedSeconds: number;
  totalCharsTyped: number;
  errorsCount: number;
  completed: boolean;
}

// ==========================================
// 13. Inflation-Adjusted Goal Calculator
// ==========================================
export interface InflationGoalCalculation {
  currentAmount: number;
  years: number;
  annualInflationRate: number; // % e.g. 6
  futureNominalTarget: number;
  purchasingPowerLossFactor: number;
  expectedReturnRate: number; // % e.g. 10
  requiredMonthlySavings: number;
  scenarios: Array<{
    inflationRate: number;
    futureCost: number;
    monthlySavingsRequired: number;
  }>;
}

// ==========================================
// 14. Time Capsule Letter to Future Self
// ==========================================
export interface TimeCapsuleLetter {
  id: string;
  userId: string;
  title: string;
  content: string;
  createdAt: string;
  unlockDate: string; // YYYY-MM-DD
  isUnlocked: boolean;
  isSealed?: boolean;
  sealedAt?: string;
  openedAt?: string;
  tags?: string[];
}

// ==========================================
// 15. Printable Emergency & Asset Summary Sheet
// ==========================================
export interface MaskedAccountRecord {
  id: string;
  institution: string;
  nickname: string;
  maskedNumber: string; // e.g. •••• 9214
  accountType: 'Savings' | 'Checking' | 'Fixed Deposit' | 'Demat/Brokerage' | 'Credit Card';
  nomineeName?: string;
  notes?: string;
}

export interface InsurancePolicyRecord {
  id: string;
  provider: string;
  policyRef?: string;
  policyNumber?: string;
  coverageType?: 'Health' | 'Life / Term' | 'Vehicle' | 'Property';
  policyType?: string;
  coverageAmountPaise?: number;
  emergencyHelpline: string;
  nomineeName: string;
}

export interface NomineeContactRecord {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  email?: string;
  priority?: number;
  isPrimary?: boolean;
}

export type EmergencyContact = NomineeContactRecord;

export interface EmergencyAssetProfile {
  id: string;
  userId: string;
  fullName?: string;
  bloodGroup?: string;
  primaryHospital?: string;
  accounts: MaskedAccountRecord[];
  policies: InsurancePolicyRecord[];
  emergencyContacts?: NomineeContactRecord[];
  contacts?: NomineeContactRecord[];
  importantDocumentLocations?: string;
  instructionsNote?: string;
  notes?: string;
  updatedAt: string;
}
