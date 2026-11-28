import { SkillNode, SkillTreePreset, SkillNodeStatus } from '../types/features15.ts';
import type { StudySubject, StudyTopic } from '../types/study.ts';
import { deduplicateActiveStudyTopics } from './studyIntelligence.ts';

export interface StudySkillNode extends SkillNode {
  subjectCode: string;
  subjectName: string;
  subjectColor: string;
  unitName: string;
  totalTopics: number;
  masteredTopics: number;
  theoryTopics: number;
  practiceTopics: number;
  pyqTopics: number;
  progressPct: number;
  earnedXp: number;
  maxXp: number;
  topicIds: string[];
  sampleTopics: string[];
  isAutoSynced: boolean;
}

export interface StudySkillTree {
  id: string;
  name: string;
  category: string;
  description: string;
  subjectCode?: string;
  color?: string;
  nodes: StudySkillNode[];
  totalXp: number;
  earnedXp: number;
  level: number;
  rankTitle: string;
  nextLevelXp: number;
  levelProgressPct: number;
}

const XP_PER_THEORY = 15;
const XP_PER_PRACTICE = 20;
const XP_PER_PYQ = 15;
const MAX_XP_PER_TOPIC = XP_PER_THEORY + XP_PER_PRACTICE + XP_PER_PYQ; // 50 XP
const XP_PER_LEVEL = 250;

/**
 * Checks if adding or modifying dependencies creates a directed cycle.
 * Uses Tarjan's / standard DFS with 3-color graph traversal.
 */
export function hasCycle(nodes: SkillNode[]): boolean {
  const nodeMap = new Map<string, SkillNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  // 0: unvisited, 1: visiting (in recursion stack), 2: visited
  const visited = new Map<string, number>();

  function dfs(nodeId: string): boolean {
    const state = visited.get(nodeId) || 0;
    if (state === 1) return true; // Cycle detected
    if (state === 2) return false;

    visited.set(nodeId, 1);
    const node = nodeMap.get(nodeId);
    if (node && node.prerequisites) {
      for (const preId of node.prerequisites) {
        if (dfs(preId)) return true;
      }
    }
    visited.set(nodeId, 2);
    return false;
  }

  for (const n of nodes) {
    if (!visited.has(n.id)) {
      if (dfs(n.id)) return true;
    }
  }

  return false;
}

/**
 * Validates whether all prerequisites for a node are completed.
 */
export function arePrerequisitesMet(nodeId: string, nodes: SkillNode[]): boolean {
  const nodeMap = new Map<string, SkillNode>(nodes.map((n) => [n.id, n]));
  const target = nodeMap.get(nodeId);
  if (!target || !target.prerequisites || target.prerequisites.length === 0) {
    return true;
  }

  return target.prerequisites.every((preId: string) => {
    const pre = nodeMap.get(preId);
    return pre && pre.status === 'completed';
  });
}

/**
 * Computes the real-time status of a node based on its prerequisites and user progress.
 */
export function resolveNodeStatus(node: SkillNode, allNodes: SkillNode[]): SkillNodeStatus {
  if (node.status === 'completed') return 'completed';
  if (node.status === 'in_progress') return 'in_progress';
  return arePrerequisitesMet(node.id, allNodes) ? 'available' : 'locked';
}

/**
 * Calculates overall mastery and node breakdown for a skill tree.
 */
export function computeTreeStats(nodes: SkillNode[]) {
  const total = nodes.length;
  if (total === 0) {
    return { total: 0, completed: 0, inProgress: 0, available: 0, locked: 0, percentage: 0 };
  }

  let completed = 0;
  let inProgress = 0;
  let available = 0;
  let locked = 0;

  for (const n of nodes) {
    const status = resolveNodeStatus(n, nodes);
    if (status === 'completed') completed++;
    else if (status === 'in_progress') inProgress++;
    else if (status === 'available') available++;
    else locked++;
  }

  const percentage = Math.round((completed / total) * 100);
  return { total, completed, inProgress, available, locked, percentage };
}

/**
 * Deterministic RPG rank title from XP level.
 */
export function getRpgRankTitle(level: number): string {
  if (level >= 15) return 'Grandmaster Scholar';
  if (level >= 10) return 'Domain Tactician';
  if (level >= 6) return 'Concept Architect';
  if (level >= 3) return 'Syllabus Pathfinder';
  return 'Apprentice Scholar';
}

function computeLevelMetrics(earnedXp: number) {
  const safeXp = Math.max(0, Math.round(earnedXp));
  let level = 1;
  let remaining = safeXp;
  const gapFor = (lvl: number) => XP_PER_LEVEL + (lvl - 1) * 150;
  while (remaining >= gapFor(level)) {
    remaining -= gapFor(level);
    level += 1;
  }
  const currentGap = gapFor(level);
  const nextLevelXp = safeXp - remaining + currentGap;
  const levelProgressPct = Math.round((remaining / currentGap) * 100);
  return {
    level,
    rankTitle: getRpgRankTitle(level),
    nextLevelXp,
    levelProgressPct,
  };
}

function normalizeUnitLabel(unit: string | undefined): string {
  const cleaned = (unit || '').trim();
  return cleaned || 'Core Syllabus';
}

function slugifyId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unit';
}

/**
 * Builds live, deterministic RPG Skill Trees directly from the user's Study OS
 * subjects and topics (grouped by Subject -> Units with sequential prerequisites).
 */
export function buildStudySkillTreesFromSyllabus(
  subjects: StudySubject[],
  topics: StudyTopic[]
): {
  allSubjectsTree: StudySkillTree;
  subjectTrees: StudySkillTree[];
} {
  const activeSubjects = (subjects || []).filter((s) => !s.deletedAt);
  const activeTopics = deduplicateActiveStudyTopics(topics || [], activeSubjects);

  const subjectTrees: StudySkillTree[] = [];
  const allOverviewNodes: StudySkillNode[] = [];

  activeSubjects.forEach((sub, colIndex) => {
    const subTopics = activeTopics.filter((t) => t.subjectCode === sub.code);
    const trackId = `subject-${sub.code}`;
    const subColor = sub.color || '#6366f1';

    // Group topics by normalized unit label
    const unitMap = new Map<string, StudyTopic[]>();
    for (const topic of subTopics) {
      const unitLabel = normalizeUnitLabel(topic.unit);
      const bucket = unitMap.get(unitLabel) || [];
      bucket.push(topic);
      unitMap.set(unitLabel, bucket);
    }

    // Natural sort units (Unit 1, Unit 2, ..., Unit 10)
    const sortedUnits = Array.from(unitMap.entries()).sort(([unitA], [unitB]) =>
      unitA.localeCompare(unitB, undefined, { numeric: true, sensitivity: 'base' })
    );

    const subjectNodes: StudySkillNode[] = [];
    let prevNodeId: string | null = null;
    let prevNodeCompleted = true;

    if (sortedUnits.length === 0) {
      // Subject exists with no topics yet — render a root starter node
      const starterId = `study-${slugifyId(sub.code)}-starter`;
      const starterNode: StudySkillNode = {
        id: starterId,
        trackId,
        title: `${sub.name} — Starter`,
        description: 'Add syllabus topics to this subject to unlock live unit milestones and XP.',
        category: sub.name,
        tier: 1,
        xpPoints: 0,
        status: 'available',
        prerequisites: [],
        estimatedHours: 0,
        tags: [sub.code],
        position: { x: 40, y: 32 },
        subjectCode: sub.code,
        subjectName: sub.name,
        subjectColor: subColor,
        unitName: 'Core Syllabus',
        totalTopics: 0,
        masteredTopics: 0,
        theoryTopics: 0,
        practiceTopics: 0,
        pyqTopics: 0,
        progressPct: 0,
        earnedXp: 0,
        maxXp: 0,
        topicIds: [],
        sampleTopics: [],
        isAutoSynced: true,
      };
      subjectNodes.push(starterNode);
      allOverviewNodes.push({
        ...starterNode,
        trackId: 'all-subjects',
        position: { x: 28 + colIndex * 244, y: 28 },
      });
    } else {
      sortedUnits.forEach(([unitName, unitTopics], unitIdx) => {
        const nodeId = `study-${slugifyId(sub.code)}-${slugifyId(unitName)}-${unitIdx + 1}`;
        const totalTopics = unitTopics.length;
        const theoryTopics = unitTopics.filter((t) => t.theory).length;
        const practiceTopics = unitTopics.filter((t) => t.practice).length;
        const pyqTopics = unitTopics.filter((t) => t.pyq).length;
        const masteredTopics = unitTopics.filter((t) => t.theory && t.practice).length;

        const earnedXp =
          theoryTopics * XP_PER_THEORY +
          practiceTopics * XP_PER_PRACTICE +
          pyqTopics * XP_PER_PYQ;
        const maxXp = totalTopics * MAX_XP_PER_TOPIC;

        const progressPct =
          totalTopics > 0
            ? Math.round(((theoryTopics + practiceTopics) / (totalTopics * 2)) * 100)
            : 0;

        let status: SkillNodeStatus;
        if (totalTopics > 0 && masteredTopics === totalTopics) {
          status = 'completed';
        } else if (theoryTopics > 0 || practiceTopics > 0 || pyqTopics > 0) {
          status = 'in_progress';
        } else if (unitIdx === 0 || prevNodeCompleted) {
          status = 'available';
        } else {
          status = 'locked';
        }

        const sampleTopics = unitTopics
          .slice(0, 4)
          .map((t) => (t.subtopic || t.topic || '').trim())
          .filter(Boolean);

        // Zig-zag 2-column layout for individual subject tree view
        const colInSubTree = unitIdx % 2;
        const rowInSubTree = Math.floor(unitIdx / 2);

        const node: StudySkillNode = {
          id: nodeId,
          trackId,
          title: unitName,
          description:
            sampleTopics.length > 0
              ? `Covers ${sampleTopics.join(', ')}${totalTopics > sampleTopics.length ? ` +${totalTopics - sampleTopics.length} more` : ''}`
              : `${totalTopics} syllabus topic${totalTopics === 1 ? '' : 's'} in ${sub.name}`,
          category: sub.name,
          tier: unitIdx + 1,
          xpPoints: maxXp,
          status,
          prerequisites: prevNodeId ? [prevNodeId] : [],
          estimatedHours: Math.max(1, Math.round(totalTopics * 0.75)),
          tags: [sub.code, unitName],
          position: {
            x: 40 + colInSubTree * 290,
            y: 32 + rowInSubTree * 145,
          },
          subjectCode: sub.code,
          subjectName: sub.name,
          subjectColor: subColor,
          unitName,
          totalTopics,
          masteredTopics,
          theoryTopics,
          practiceTopics,
          pyqTopics,
          progressPct,
          earnedXp,
          maxXp,
          topicIds: unitTopics.map((t) => t.id),
          sampleTopics,
          isAutoSynced: true,
        };

        subjectNodes.push(node);
        allOverviewNodes.push({
          ...node,
          trackId: 'all-subjects',
          position: {
            x: 28 + colIndex * 244,
            y: 28 + unitIdx * 136,
          },
        });

        prevNodeId = nodeId;
        prevNodeCompleted = status === 'completed';
      });
    }

    const subEarnedXp = subjectNodes.reduce((sum, n) => sum + n.earnedXp, 0);
    const subTotalXp = subjectNodes.reduce((sum, n) => sum + n.maxXp, 0);
    const subLevelMetrics = computeLevelMetrics(subEarnedXp);

    subjectTrees.push({
      id: trackId,
      name: sub.name,
      category: sub.targetExam || sub.semesterOrDomain || 'Study Subject',
      description: `Live skill tree auto-generated from ${sub.name} (${subTopics.length} topics across ${sortedUnits.length || 1} unit${sortedUnits.length === 1 ? '' : 's'}).`,
      subjectCode: sub.code,
      color: subColor,
      nodes: subjectNodes,
      totalXp: subTotalXp,
      earnedXp: subEarnedXp,
      ...subLevelMetrics,
    });
  });

  const overallEarnedXp = allOverviewNodes.reduce((sum, n) => sum + n.earnedXp, 0);
  const overallTotalXp = allOverviewNodes.reduce((sum, n) => sum + n.maxXp, 0);
  const overallLevelMetrics = computeLevelMetrics(overallEarnedXp);

  const allSubjectsTree: StudySkillTree = {
    id: 'all-subjects',
    name: `All Subjects (${activeSubjects.length})`,
    category: 'Live Study OS',
    description: 'Every subject and unit from your Study OS syllabus, synced in real time with your T/P/Q & Google Sheets progress.',
    nodes: allOverviewNodes,
    totalXp: overallTotalXp,
    earnedXp: overallEarnedXp,
    ...overallLevelMetrics,
  };

  return { allSubjectsTree, subjectTrees };
}

/**
 * Legacy presets retained solely for backward-compatible test imports;
 * SkillTreeLab now runs exclusively on live Study OS syllabus data.
 */
export const SKILL_TREE_PRESETS: SkillTreePreset[] = [
  {
    id: 'cs-foundations',
    name: 'CS Foundations',
    category: 'Computer Science',
    description: 'Core curriculum path covering discrete math, digital logic, systems and architectures.',
    nodes: [
      {
        id: 'cs-dm',
        trackId: 'cs-foundations',
        title: 'Discrete Mathematics',
        description: 'Set theory, boolean algebra, logic, proofs, and combinatorics.',
        category: 'Foundations',
        tier: 1,
        xpPoints: 100,
        status: 'available',
        prerequisites: [],
        estimatedHours: 40,
        tags: ['Math', 'Logic'],
        position: { x: 50, y: 50 },
      },
      {
        id: 'cs-dsa',
        trackId: 'cs-foundations',
        title: 'Data Structures & Algorithms',
        description: 'Arrays, Trees, Graphs, Sorting, Dynamic Programming and Big-O notation.',
        category: 'Algorithms',
        tier: 2,
        xpPoints: 150,
        status: 'locked',
        prerequisites: ['cs-dm'],
        estimatedHours: 60,
        tags: ['Coding', 'Algorithms'],
        position: { x: 50, y: 200 },
      },
      {
        id: 'cs-os',
        trackId: 'cs-foundations',
        title: 'Operating Systems',
        description: 'Processes, threads, scheduling, concurrency, virtual memory, filesystems.',
        category: 'Systems',
        tier: 3,
        xpPoints: 200,
        status: 'locked',
        prerequisites: ['cs-dsa'],
        estimatedHours: 50,
        tags: ['Systems', 'Kernel'],
        position: { x: 150, y: 350 },
      },
    ],
  },
];
