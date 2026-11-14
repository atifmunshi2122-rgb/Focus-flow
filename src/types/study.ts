/**
 * Study & Academic Intelligence Types
 * Selectively integrated from NextStudy OS into FocusFlow & Finance.
 */

export type AcademicTierId = 'tier1_sem3' | 'tier2_placements' | 'tier3_gate' | 'custom';

export interface AcademicTier {
  id: string;
  name: string;
  shortTitle: string;
  description: string;
  subjectCodes: string[];
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
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
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
  }>;
}
