/**
 * FocusFlow & Finance — Smart Syllabus Catalog Matcher & Suggestion Engine
 *
 * Connects the natural language command parser to the user's actual Study Catalog:
 * - Scores and ranks existing subjects with alias awareness (e.g. Math, DBMS, OS, DSA, TOC).
 * - Matches modules, chapters, topics, and subtopics strictly from existing database records.
 * - Never invents topics or chapters.
 * - Cross-references active Task list for duplicate detection.
 * - Generates real-time, real-data syllabus suggestions (e.g. "% complete", "pending subtopics").
 */

import { StudySubject, StudyTopic } from '../../types/study.ts';
import { Task } from '../../types/index.ts';
import { ParsedStudyCommand } from './studyCommandParser.ts';

export interface SubjectMatchResult {
  subject: StudySubject;
  score: number; // 0 - 100
  matchReason: string;
  isExact: boolean;
}

export interface MatchedTopicItem {
  topic: StudyTopic;
  selected: boolean;
  isDuplicateTask: boolean;
  existingTaskTitle?: string;
  isCompleted: boolean; // theory && practice
}

export interface MatchedSyllabusGroup {
  subject: StudySubject;
  unitName: string;
  unitNumber?: number;
  topics: MatchedTopicItem[];
  completionPercentage: number;
  totalSubtopics: number;
  pendingSubtopics: number;
}

export interface SyllabusSmartSuggestion {
  id: string;
  subjectCode: string;
  subjectName: string;
  unitName: string;
  message: string;
  commandPreset: string;
  pendingCount: number;
  completionPct: number;
}

// Built-in academic category definitions for intelligent subject matching
interface SubjectCategoryDef {
  queryAliases: string[];
  subjectCodes: string[];
  nameMatches: string[];
}

const SUBJECT_CATEGORIES: Record<string, SubjectCategoryDef> = {
  dbms: {
    queryAliases: ['database', 'dbms', 'sql', 'rdbms'],
    subjectCodes: ['sub_dbms', 'dbms'],
    nameMatches: ['database', 'dbms', 'sql'],
  },
  os: {
    queryAliases: ['operating system', 'operating systems', 'os'],
    subjectCodes: ['sub_os', 'os'],
    nameMatches: ['operating system', 'os'],
  },
  dsa: {
    queryAliases: [
      'data structures',
      'algorithms',
      'dsa',
      'data structures & algorithms',
      'data structure',
      'trees',
      'graphs',
      'sorting',
    ],
    subjectCodes: ['sub_dsa', 'dsa', 'sub_algorithms', 'algo'],
    nameMatches: ['data structures', 'algorithms', 'dsa'],
  },
  coa: {
    queryAliases: [
      'computer organization',
      'architecture',
      'coa',
      'computer architecture',
      'microprocessor',
    ],
    subjectCodes: ['sub_coa', 'coa'],
    nameMatches: ['computer organization', 'architecture', 'coa'],
  },
  toc: {
    queryAliases: ['automata', 'theory of computation', 'toc', 'formal languages', 'pumping lemma'],
    subjectCodes: ['sub_toc', 'toc'],
    nameMatches: ['theory of computation', 'automata', 'toc'],
  },
  cn: {
    queryAliases: ['computer networks', 'networking', 'networks', 'cn', 'tcp ip'],
    subjectCodes: ['sub_cn', 'cn'],
    nameMatches: ['computer networks', 'networking', 'cn'],
  },
  math: {
    queryAliases: [
      'mathematics',
      'math',
      'maths',
      'probability',
      'discrete math',
      'stats',
      'statistics',
      'algebra',
      'calculus',
    ],
    subjectCodes: ['sub_math', 'sub_probstats', 'sub_discretemath', 'math'],
    nameMatches: ['mathematics', 'math', 'probability', 'discrete math', 'stats'],
  },
  physics: {
    queryAliases: ['physics', 'engineering physics'],
    subjectCodes: ['sub_physics', 'physics'],
    nameMatches: ['physics'],
  },
  python: {
    queryAliases: ['python', 'python programming'],
    subjectCodes: ['sub_python', 'python'],
    nameMatches: ['python'],
  },
  cpp: {
    queryAliases: ['c++', 'cpp', 'c plus plus'],
    subjectCodes: ['sub_cpp', 'cpp'],
    nameMatches: ['c++', 'cpp'],
  },
  java: {
    queryAliases: ['java', 'core java'],
    subjectCodes: ['sub_java', 'java'],
    nameMatches: ['java'],
  },
  webdev: {
    queryAliases: ['web development', 'web dev', 'html', 'javascript', 'frontend'],
    subjectCodes: ['sub_webdev', 'webdev'],
    nameMatches: ['web development', 'web dev'],
  },
  systemdesign: {
    queryAliases: ['system design', 'distributed systems', 'scalability'],
    subjectCodes: ['sub_systemdesign', 'systemdesign'],
    nameMatches: ['system design'],
  },
};

/**
 * Normalizes text for robust matching (lowercase, stripped punctuation, single spaces).
 */
export function normalizeText(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?'"॥।]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Matches and ranks existing subjects against the parsed command.
 */
export function matchSubjects(
  command: ParsedStudyCommand,
  subjects: StudySubject[]
): SubjectMatchResult[] {
  const activeSubjects = subjects.filter((s) => !s.deletedAt);
  if (activeSubjects.length === 0) return [];

  const rawQuery = normalizeText(command.rawText);
  const subjectKeyword = command.subjectKeyword ? normalizeText(command.subjectKeyword) : '';

  const results: SubjectMatchResult[] = [];

  for (const subject of activeSubjects) {
    const codeNorm = normalizeText(subject.code).replace(/^sub_?/, '');
    const nameNorm = normalizeText(subject.name);
    let score = 0;
    let matchReason = '';
    let isExact = false;

    // 1. Direct code exact match (e.g. query "dbms" and code "Sub_DBMS")
    if (
      subjectKeyword &&
      (codeNorm === subjectKeyword || subject.code.toLowerCase() === subjectKeyword)
    ) {
      score = 100;
      matchReason = `Exact code match (${subject.code})`;
      isExact = true;
    }
    // 2. Direct name exact match
    else if (subjectKeyword && nameNorm === subjectKeyword) {
      score = 98;
      matchReason = `Exact name match (${subject.name})`;
      isExact = true;
    }
    // 3. Category alias match (checks both subjectKeyword and rawQuery against known academic domains)
    else {
      for (const [catKey, catDef] of Object.entries(SUBJECT_CATEGORIES)) {
        // Query must match one of the category query aliases
        const matchedAlias = catDef.queryAliases.find(
          (q) =>
            q === subjectKeyword ||
            (q.includes(' ') && rawQuery.includes(q)) ||
            rawQuery.split(/\s+/).includes(q)
        );

        if (matchedAlias) {
          // Subject must genuinely belong to this category
          const subjectBelongsToCat =
            catDef.subjectCodes.some(
              (sc) =>
                subject.code.toLowerCase().includes(sc) ||
                codeNorm === sc ||
                sc.includes(codeNorm)
            ) ||
            catDef.nameMatches.some((nm) => nameNorm.includes(nm));

          if (subjectBelongsToCat) {
            score = 92;
            matchReason = `Category match for ${catKey.toUpperCase()} ("${matchedAlias}")`;
            break;
          }
        }
      }
    }

    // 4. Fallback: Keyword match in code or name (minimum 3 characters, whole word check)
    if (score === 0 && subjectKeyword && subjectKeyword.length >= 3) {
      const nameTokens = nameNorm.split(/\s+/);
      if (codeNorm === subjectKeyword || nameTokens.includes(subjectKeyword)) {
        score = 85;
        matchReason = `Word match in ${subject.name}`;
      } else if (codeNorm.includes(subjectKeyword) || nameNorm.includes(subjectKeyword)) {
        score = 75;
        matchReason = `Substring match in ${subject.name}`;
      }
    }

    // 5. Mentioned in raw command
    if (score === 0) {
      if (rawQuery.includes(codeNorm) && codeNorm.length >= 2) {
        score = 70;
        matchReason = `Mentioned in command (${subject.code})`;
      } else if (rawQuery.includes(nameNorm)) {
        score = 65;
        matchReason = `Mentioned in command (${subject.name})`;
      }
    }

    if (score > 0) {
      results.push({
        subject,
        score,
        matchReason,
        isExact,
      });
    }
  }

  // Sort descending by score, tiebreak by total topics
  return results.sort(
    (a, b) => b.score - a.score || b.subject.totalSubtopics - a.subject.totalSubtopics
  );
}

/**
 * Matches existing units and topics for a chosen subject against the command.
 */
export function matchUnitsAndTopics(
  subject: StudySubject,
  command: ParsedStudyCommand,
  allTopics: StudyTopic[],
  existingTasks: Task[] = []
): MatchedSyllabusGroup[] {
  // Filter topics for this subject
  const subjectTopics = allTopics.filter(
    (t) => !t.deletedAt && t.subjectCode.toLowerCase() === subject.code.toLowerCase()
  );

  if (subjectTopics.length === 0) return [];

  // Group by unit name
  const unitMap = new Map<string, StudyTopic[]>();
  for (const t of subjectTopics) {
    const unit = t.unit.trim() || 'General';
    if (!unitMap.has(unit)) {
      unitMap.set(unit, []);
    }
    unitMap.get(unit)!.push(t);
  }

  const groups: MatchedSyllabusGroup[] = [];

  // Active tasks title set for duplicate detection
  const activeTaskTitles = new Set(
    existingTasks
      .filter((t) => !t.deletedAt && t.status !== 'completed')
      .map((t) => normalizeText(t.title))
  );

  const activeTopicIdsWithTasks = new Set(
    existingTasks
      .filter((t) => !t.deletedAt && (t as any).topicId)
      .map((t) => (t as any).topicId as string)
  );

  for (const [unitName, topics] of unitMap.entries()) {
    // Determine unit number if present in unitName (e.g. "Unit 2: OS Concepts" -> 2)
    const unitNumMatch = unitName.match(/\b(?:unit|module|chapter|mod|ch|part)\s*[-:]?\s*(\d+)\b/i) ||
      unitName.match(/(\d+)/);
    const unitNum = unitNumMatch ? parseInt(unitNumMatch[1], 10) : undefined;

    // Filter by unit if requested in command
    const isUnitTarget =
      command.unitNumber !== undefined
        ? unitNum === command.unitNumber
        : command.unitKeyword
        ? normalizeText(unitName).includes(normalizeText(command.unitKeyword))
        : true;

    // Process each topic item
    const topicItems: MatchedTopicItem[] = topics.map((t) => {
      const isCompleted = Boolean(t.theory && t.practice);
      const normalizedSubtopic = normalizeText(t.subtopic);
      const isDuplicate =
        activeTopicIdsWithTasks.has(t.id) ||
        activeTaskTitles.has(normalizedSubtopic) ||
        activeTaskTitles.has(`${normalizeText(subject.code)} ${normalizedSubtopic}`);

      // Selection logic:
      // If specific topicKeyword given (e.g. "Algebra"), select only matching topics
      // If targetScope is 'pending', select only incomplete topics
      // If unit target matches, select by default if not already completed/duplicated
      let shouldSelect = isUnitTarget;
      if (command.topicKeyword) {
        const topicKwNorm = normalizeText(command.topicKeyword);
        const matchesTopic =
          normalizeText(t.topic).includes(topicKwNorm) ||
          normalizeText(t.subtopic).includes(topicKwNorm);
        shouldSelect = matchesTopic;
      } else if (command.targetScope === 'pending') {
        shouldSelect = shouldSelect && !isCompleted;
      }

      return {
        topic: t,
        selected: shouldSelect && !isDuplicate,
        isDuplicateTask: isDuplicate,
        isCompleted,
      };
    });

    const totalSubtopics = topicItems.length;
    const completedSubtopics = topicItems.filter((i) => i.isCompleted).length;
    const pendingSubtopics = totalSubtopics - completedSubtopics;
    const completionPercentage =
      totalSubtopics > 0 ? Math.round((completedSubtopics / totalSubtopics) * 100) : 0;

    groups.push({
      subject,
      unitName,
      unitNumber: unitNum,
      topics: topicItems,
      completionPercentage,
      totalSubtopics,
      pendingSubtopics,
    });
  }

  // Sort groups: if command.unitNumber was specified, put that unit first
  if (command.unitNumber !== undefined) {
    groups.sort((a, b) => {
      if (a.unitNumber === command.unitNumber) return -1;
      if (b.unitNumber === command.unitNumber) return 1;
      return 0;
    });
  }

  return groups;
}

/**
 * Generates dynamic, real-data syllabus suggestions based on the user's actual database.
 */
export function generateSyllabusSuggestions(
  subjects: StudySubject[],
  topics: StudyTopic[],
  existingTasks: Task[] = []
): SyllabusSmartSuggestion[] {
  const activeSubjects = subjects.filter((s) => !s.deletedAt);
  const activeTopics = topics.filter((t) => !t.deletedAt);
  if (activeSubjects.length === 0 || activeTopics.length === 0) return [];

  const suggestions: SyllabusSmartSuggestion[] = [];

  for (const subject of activeSubjects) {
    const subTopics = activeTopics.filter(
      (t) => t.subjectCode.toLowerCase() === subject.code.toLowerCase()
    );
    if (subTopics.length === 0) continue;

    // Group by unit
    const unitMap = new Map<string, StudyTopic[]>();
    for (const t of subTopics) {
      const u = t.unit.trim() || 'Unit 1';
      if (!unitMap.has(u)) unitMap.set(u, []);
      unitMap.get(u)!.push(t);
    }

    for (const [unitName, unitTopics] of unitMap.entries()) {
      const total = unitTopics.length;
      const completed = unitTopics.filter((t) => t.theory && t.practice).length;
      const pending = total - completed;
      const pct = Math.round((completed / total) * 100);

      // Extract unit number for command preset
      const numMatch = unitName.match(/\d+/);
      const unitNum = numMatch ? numMatch[0] : '1';

      if (pending > 0) {
        suggestions.push({
          id: `sug_${subject.code}_${unitNum}`,
          subjectCode: subject.code,
          subjectName: subject.name,
          unitName,
          message: `You have ${pending} pending subtopics in ${unitName} (${pct}% complete).`,
          commandPreset: `Complete ${subject.name} Unit ${unitNum} this week`,
          pendingCount: pending,
          completionPct: pct,
        });
      }
    }
  }

  // Sort: highest pending count first, top 6 suggestions
  return suggestions.sort((a, b) => b.pendingCount - a.pendingCount).slice(0, 6);
}
