/**
 * Study & Academic Intelligence Types
 * Selectively integrated from NextStudy OS into FocusFlow & Finance.
 */

export type AcademicTierId = 'tier1_sem3' | 'tier2_placements' | 'tier3_gate' | 'custom' | string;

export interface AcademicTier {
  id: string;
  name: string;
  shortTitle: string;
  description: string;
  subjectCodes?: string[];
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface StudySubject {
  id: string;
  userId: string;
  code: string; // e.g. Sub_DBMS, Sub_OS, Sub_DSA
  name: string;
  tierId: string;
  semesterOrDomain?: string;
  targetExam?: string;
  totalSubtopics: number;
  completedSubtopics: number;
  color?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface StudyTopic {
  id: string;
  userId: string;
  subjectCode: string; // Matches StudySubject.code
  unit: string;
  topic: string;
  subtopic: string;
  priority: 'High' | 'Medium' | 'Low';
  theory: boolean;
  practice: boolean;
  pyq: boolean;
  revisionCount: number; // Ebbinghaus spaced interval count
  notes?: string;
  rowIndex?: number;
  isBookmarked?: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  // Source mapping & tracking metadata (v1.8 Step 4)
  sourceOrigin?: 'google_sheet' | 'manual' | 'csv';
  sourceSpreadsheetId?: string;
  sourceSheetId?: number | string;
  sourceRowId?: string;
  sourceRowKey?: string;
  sourceMappingKey?: string;
  sourceContentHash?: string;
  importedAt?: string;
  lastImportedAt?: string;
}

export interface StudyTopicSourceMapping {
  mappingKey: string; // `${spreadsheetId}|${sheetId}|${sourceRowId}`
  spreadsheetId: string;
  sheetId: number | string;
  sourceRowId: string;
  studyTopicId: string;
  subjectCode: string;
  unit: string;
  topic: string;
  subtopic?: string;
  lastImportedAt: string;
}

export interface StudyImportSession {
  sessionId: string;
  userId: string;
  sourceSpreadsheetId: string;
  sourceSpreadsheetTitle: string;
  targetTierId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'partial' | 'failed';
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  plannedSubjectsCount: number;
  plannedTopicsCount: number;
  committedSubjectIds: string[];
  committedTopicIds: string[];
  failedOperations: Array<{
    type: 'subject' | 'topic';
    id: string;
    codeOrTitle: string;
    error: string;
  }>;
  errorMessage?: string;
}

export type RevisionDifficulty = 'easy' | 'medium' | 'hard';
export type RevisionStatus = 'scheduled' | 'due' | 'overdue' | 'mastered';

export interface StudyRevision {
  id: string;
  userId: string;
  topicId: string;
  subjectCode: string;
  topicTitle: string;
  lastStudiedAt: string; // YYYY-MM-DD
  nextRevisionAt: string; // YYYY-MM-DD
  intervalDays: number; // 1, 3, 7, 14, 30, 60
  repetition: number;
  difficulty: RevisionDifficulty;
  recallScore?: number;
  status: RevisionStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface StudyMistake {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  subjectCode: string;
  subjectName?: string;
  topic: string;
  source: string;
  severity: 'High' | 'Medium' | 'Low';
  trap: string; // ❌ What went wrong
  rootCause: string; // 🔍 Why logic failed
  goldenRule: string; // 💡 Permanent corrective takeaway
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface StudyProgressSummary {
  overallCompletionPct: number;
  totalTopics: number;
  completedTopics: number;
  theoryCompleted: number;
  practiceCompleted: number;
  pyqCompleted: number;
  dueRevisionsCount: number;
  overdueRevisionsCount: number;
  masteredRevisionsCount: number;
  totalMistakesCount: number;
  unresolvedMistakesCount: number;
  highSeverityMistakesCount: number;
  totalStudyMinutes: number;
  subjectBreakdown: Array<{
    code: string;
    name: string;
    tierId: string;
    total: number;
    completed: number;
    completionPct: number;
    color?: string;
    studyMinutes?: number;
  }>;
}

// ==========================================
// PHASE 16 STUDY MANAGEMENT EXTENSIONS
// ==========================================

export interface StudyGoalMilestone {
  id: string;
  title: string;
  targetValue: number;
  completed: boolean;
  completedAt?: string | null;
}

export type StudyGoalStatus = 'active' | 'completed' | 'paused' | 'cancelled';
export type StudyGoalPriority = 'low' | 'medium' | 'high';
export type StudyGoalType = 'long_term' | 'semester' | 'monthly' | 'weekly' | 'daily';

export interface StudyGoal {
  id: string;
  userId: string;
  title: string;
  description: string;
  goalType: string;
  subjectId: string | null;
  subjectCode: string | null;
  targetValue: number;
  currentValue: number;
  unit: string;
  startDate: string;
  endDate: string;
  status: StudyGoalStatus;
  priority: StudyGoalPriority;
  milestones?: StudyGoalMilestone[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type StudyPlanType = 'daily' | 'weekly' | 'monthly' | 'semester' | 'exam';
export type StudyPlanStatus = 'active' | 'completed' | 'paused' | 'archived';

export interface StudyPlan {
  id: string;
  userId: string;
  title: string;
  description: string;
  planType: StudyPlanType;
  subjectIds: string[];
  startDate: string;
  endDate: string;
  dailyTargetMinutes: number;
  weeklyTargetMinutes: number;
  recurringPattern?: 'none' | 'daily' | 'weekdays' | 'weekends' | 'weekly';
  status: StudyPlanStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type StudyPlanTaskPriority = 'low' | 'medium' | 'high';
export type StudyPlanTaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface StudyPlanTask {
  id: string;
  userId: string;
  planId: string;
  subjectId: string | null;
  topicId: string | null;
  title: string;
  description: string;
  scheduledDate: string; // YYYY-MM-DD
  startTime: string | null; // HH:mm
  endTime: string | null; // HH:mm
  estimatedMinutes: number;
  actualMinutes: number;
  priority: StudyPlanTaskPriority;
  status: StudyPlanTaskStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type StudyResourceType = 'pdf' | 'video' | 'link' | 'document' | 'image' | 'other';

export interface StudyResource {
  id: string;
  userId: string;
  title: string;
  description: string;
  resourceType: StudyResourceType;
  subjectId: string | null;
  topicId: string | null;
  url: string | null;
  storagePath: string | null;
  tags: string[];
  isBookmarked?: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type StudyExamPrepStatus = 'not_started' | 'preparing' | 'ready' | 'completed';
export type StudyExamResultStatus = 'pending' | 'published';

export interface StudyExam {
  id: string;
  userId: string;
  title: string;
  examType: string;
  subjectIds: string[];
  examDate: string; // YYYY-MM-DD
  startTime: string | null;
  durationMinutes: number;
  totalMarks: number;
  obtainedMarks: number | null;
  syllabusTopicIds: string[];
  preparationStatus: StudyExamPrepStatus;
  resultStatus: StudyExamResultStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface StudyNote {
  id: string;
  userId: string;
  title: string;
  content: string;
  subjectId: string | null;
  topicId: string | null;
  tags: string[];
  isPinned: boolean;
  isBookmarked?: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface StudyActivityLog {
  id: string;
  userId: string;
  activityType: string;
  subjectId: string | null;
  topicId: string | null;
  planId: string | null;
  taskId: string | null;
  description: string;
  metadata: Record<string, unknown>;
  activityDate: string; // YYYY-MM-DD
  createdAt: string;
}

export interface StudyFlashcard {
  id: string;
  userId: string;
  subjectId: string | null;
  topicId: string | null;
  question: string;
  answer: string;
  difficulty: 'easy' | 'medium' | 'hard';
  reviewCount: number;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  isBookmarked?: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface StudyQuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctOptionIndex: number;
  explanation?: string;
}

export interface StudyQuizAttempt {
  id: string;
  attemptedAt: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  timeTakenSeconds: number;
}

export interface StudyQuiz {
  id: string;
  userId: string;
  title: string;
  subjectId: string | null;
  topicId: string | null;
  questions: StudyQuizQuestion[];
  attempts: StudyQuizAttempt[];
  highestScore: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface StudyExportPayload {
  version: number;
  exportedAt: string;
  userId: string;
  subjects: StudySubject[];
  topics: StudyTopic[];
  revisions: StudyRevision[];
  mistakes: StudyMistake[];
  goals: StudyGoal[];
  plans: StudyPlan[];
  planTasks: StudyPlanTask[];
  resources: StudyResource[];
  exams: StudyExam[];
  notes: StudyNote[];
  flashcards: StudyFlashcard[];
  quizzes: StudyQuiz[];
}

// ==========================================
// SHEET HUB → STUDY OS IMPORT & RE-IMPORT TYPES (STEP 5)
// ==========================================

export interface StudyImportDetailItem {
  subjectCode: string;
  subjectName: string;
  createdTopics: number;
  updatedTopics: number;
  skippedTopics: number;
  invalidRows: number;
  duplicateRows: number;
  theoryCompleted: number;
}

export interface StudyImportSource {
  id: string; // e.g. src_sheetId or spreadsheetId
  userId: string;
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl?: string | null;
  targetTierId: string;
  targetTierName?: string;
  importedSubjectCodes: string[];
  lastImportedAt: string;
  firstImportedAt: string;
  status: 'active' | 'untracked';
  totalImportsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StudyImportFailedRecord {
  subjectCode: string;
  topic: string;
  subtopic?: string;
  reason: string;
}

export interface StudyImportHistoryRecord {
  id: string;
  userId: string;
  sourceSpreadsheetId: string;
  sourceSpreadsheetTitle: string;
  targetTierId: string;
  targetTierName?: string;
  selectedTabs: string[];
  createdSubjectsCount: number;
  updatedSubjectsCount: number;
  createdTopicsCount: number;
  updatedTopicsCount: number;
  skippedTopicsCount: number;
  duplicateRowsCount: number;
  invalidRowsCount: number;
  theoryCompletedCount: number;
  status: 'success' | 'partial' | 'failed';
  importedAt: string;
  errorMessage?: string | null;
  details?: StudyImportDetailItem[];
  failedRecords?: StudyImportFailedRecord[];
}

export interface TopicConflictAnalysis {
  newTopics: Array<{
    subjectCode: string;
    unit: string;
    topic: string;
    subtopic: string;
    theory: boolean;
  }>;
  unchangedTopics: Array<{
    id: string;
    subjectCode: string;
    unit: string;
    topic: string;
    subtopic: string;
  }>;
  changedTopics: Array<{
    id: string;
    subjectCode: string;
    existing: {
      unit: string;
      topic: string;
      subtopic: string;
      priority: string;
      notes?: string;
    };
    incoming: {
      unit: string;
      topic: string;
      subtopic: string;
      priority: string;
      notes?: string;
    };
    diffFields: string[];
  }>;
  duplicateSourceRows: Array<{
    subjectCode: string;
    unit: string;
    topic: string;
    subtopic: string;
    count: number;
  }>;
  missingSourceTopics: Array<{
    id: string;
    subjectCode: string;
    unit: string;
    topic: string;
    subtopic: string;
    practice: boolean;
    revisionCount: number;
  }>;
}

