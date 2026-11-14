import { AcademicTier, StudySubject, StudyTopic, StudyRevision, StudyMistake } from '../types/study.ts';

export const DEFAULT_ACADEMIC_TIERS: AcademicTier[] = [
  {
    id: 'tier1_sem3',
    name: 'College Semester Core',
    shortTitle: 'Semester Core',
    description: 'High GPA Core Engineering: DBMS, OS, COA, Python, Probability, Discrete Math',
    subjectCodes: ['Sub_DBMS', 'Sub_OS', 'Sub_COA', 'Sub_Python', 'Sub_ProbStats', 'Sub_DiscreteMath'],
  },
  {
    id: 'tier2_placements',
    name: 'Campus Placements & SDE Skills',
    shortTitle: 'Placements & SDE',
    description: 'Coding Speed, DSA, C++, Java, Web Dev, System Design & Aptitude',
    subjectCodes: ['Sub_DSA', 'Sub_SystemDesign', 'Sub_WebDev', 'Sub_Cpp', 'Sub_Java'],
  },
  {
    id: 'tier3_gate',
    name: 'GATE CSE Theory & Depth',
    shortTitle: 'GATE CSE',
    description: 'Deep Mathematical Theory: Automata (TOC), Algorithms & Computer Networks',
    subjectCodes: ['Sub_TOC', 'Sub_Algorithms', 'Sub_CN'],
  },
];

export interface DefaultSubjectDefinition {
  code: string;
  name: string;
  tierId: string;
  semesterOrDomain: string;
  color: string;
  topics: Array<{
    unit: string;
    topic: string;
    subtopic: string;
    priority: 'High' | 'Medium' | 'Low';
    theory: boolean;
    practice: boolean;
    pyq: boolean;
    revisionCount: number;
    notes?: string;
  }>;
}

export const DEFAULT_STUDY_SUBJECTS: DefaultSubjectDefinition[] = [
  {
    code: 'Sub_DBMS',
    name: 'Database Management Systems',
    tierId: 'tier1_sem3',
    semesterOrDomain: 'Semester 3 / Core CSE',
    color: '#3b82f6',
    topics: [
      { unit: 'Unit 1: Relational Model', topic: 'ER & Relational Algebra', subtopic: 'Entity Sets, Keys, Select, Project, Cartesian Product, Joins', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 3 },
      { unit: 'Unit 2: SQL', topic: 'Queries & Aggregations', subtopic: 'Complex Nested Subqueries, Correlated Queries, Group By, Having', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 2 },
      { unit: 'Unit 3: Normalization', topic: 'Functional Dependencies', subtopic: 'Attribute Closure, Minimal Cover, Canonical Cover algorithm', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 3 },
      { unit: 'Unit 3: Normalization', topic: 'Normal Forms', subtopic: '1NF, 2NF, 3NF and BCNF lossless join & dependency preservation', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 3 },
      { unit: 'Unit 4: Transactions', topic: 'ACID & Serializability', subtopic: 'Conflict Serializability, View Serializability & Precedence Graphs', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 2 },
      { unit: 'Unit 4: Transactions', topic: 'Concurrency Control', subtopic: 'Two-Phase Locking (2PL), Strict 2PL & Timestamp Ordering', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 2 },
      { unit: 'Unit 5: Storage', topic: 'Indexing & B+ Trees', subtopic: 'Primary, Clustered, Secondary Indexes & B+ Tree search/insert math', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 3 },
      { unit: 'Unit 5: Storage', topic: 'Hashing Techniques', subtopic: 'Static vs Dynamic Hashing (Extendible & Linear Hashing)', priority: 'Medium', theory: true, practice: false, pyq: false, revisionCount: 1 },
      { unit: 'Unit 6: Recovery', topic: 'Log-based Recovery', subtopic: 'Deferred vs Immediate Modification, Checkpoints, ARIES algorithm', priority: 'Medium', theory: true, practice: false, pyq: false, revisionCount: 1 },
      { unit: 'Unit 6: Advanced', topic: 'NoSQL & Distributed', subtopic: 'CAP Theorem, Document vs Key-Value, Master-Slave replication', priority: 'Low', theory: false, practice: false, pyq: false, revisionCount: 0 },
    ],
  },
  {
    code: 'Sub_OS',
    name: 'Operating Systems',
    tierId: 'tier1_sem3',
    semesterOrDomain: 'Semester 3 / Core CSE',
    color: '#8b5cf6',
    topics: [
      { unit: 'Unit 1: Process Management', topic: 'Process Life Cycle', subtopic: 'PCB, Process States, Context Switching, Fork() tree calculations', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 3 },
      { unit: 'Unit 1: Process Management', topic: 'CPU Scheduling', subtopic: 'FCFS, SJF, SRTF, Round Robin, Multi-level Queue & Convoy effect', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 3 },
      { unit: 'Unit 2: Synchronization', topic: 'Classical Synchronization', subtopic: 'Peterson’s Solution, Test-And-Set, Semaphores & Mutex Locks', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 2 },
      { unit: 'Unit 2: Synchronization', topic: 'Concurrency Problems', subtopic: 'Producer-Consumer, Readers-Writers, Dining Philosophers', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 3 },
      { unit: 'Unit 3: Deadlocks', topic: 'Deadlock Avoidance', subtopic: 'Banker’s Safety Algorithm, Resource Allocation Graph cycles', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 2 },
      { unit: 'Unit 4: Memory Management', topic: 'Paging Architecture', subtopic: 'Page Tables, Multilevel Paging, Inverted Tables & TLB hit ratio', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 3 },
      { unit: 'Unit 4: Memory Management', topic: 'Virtual Memory & Page Faults', subtopic: 'FIFO, LRU, Optimal Page Replacement & Belady’s Anomaly proof', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 2 },
      { unit: 'Unit 5: Storage', topic: 'Disk Scheduling', subtopic: 'FCFS, SSTF, SCAN, C-SCAN, LOOK, C-LOOK head movements', priority: 'Medium', theory: true, practice: true, pyq: false, revisionCount: 1 },
      { unit: 'Unit 5: Storage', topic: 'File System Allocation', subtopic: 'Contiguous, Linked, Indexed Allocation & UNIX inode structure', priority: 'Medium', theory: true, practice: false, pyq: false, revisionCount: 1 },
      { unit: 'Unit 6: Protection', topic: 'Security & Access', subtopic: 'Access Matrix, Capabilities vs ACLs, User vs Kernel mode', priority: 'Low', theory: false, practice: false, pyq: false, revisionCount: 0 },
    ],
  },
  {
    code: 'Sub_COA',
    name: 'Computer Organization & Architecture',
    tierId: 'tier1_sem3',
    semesterOrDomain: 'Semester 3 / Core CSE',
    color: '#06b6d4',
    topics: [
      { unit: 'Unit 1: Instructions', topic: 'Addressing Modes', subtopic: 'Immediate, Direct, Indirect, Register, Indexed, Relative modes', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 3 },
      { unit: 'Unit 2: Arithmetic', topic: 'IEEE 754 Floating Point', subtopic: 'Single & Double Precision format, Normalization, Bias, Overflow', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 2 },
      { unit: 'Unit 2: Arithmetic', topic: 'Multiplication Algorithms', subtopic: 'Booth’s Algorithm, Restoring vs Non-restoring division', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 2 },
      { unit: 'Unit 3: Memory Hierarchy', topic: 'Cache Mapping', subtopic: 'Direct, Associative, Set-Associative Mapping, Tag/Block/Word bits', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 3 },
      { unit: 'Unit 4: Pipelining', topic: 'Pipeline Performance', subtopic: 'Speedup ratio, Throughput, Efficiency, Structural & Data hazards', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 3 },
      { unit: 'Unit 5: I/O Organization', topic: 'Interrupts & DMA', subtopic: 'Programmed I/O, Interrupt-Driven I/O, DMA Controller Cycle Stealing', priority: 'Medium', theory: true, practice: false, pyq: false, revisionCount: 1 },
      { unit: 'Unit 5: I/O Organization', topic: 'Control Unit Design', subtopic: 'Hardwired vs Microprogrammed Control, Horizontal vs Vertical control', priority: 'Medium', theory: true, practice: false, pyq: false, revisionCount: 1 },
      { unit: 'Unit 6: Advanced', topic: 'Multiprocessors', subtopic: 'Flynn’s Taxonomy, Cache Coherence (MESI protocol), NUMA vs UMA', priority: 'Low', theory: false, practice: false, pyq: false, revisionCount: 0 },
    ],
  },
  {
    code: 'Sub_DSA',
    name: 'Data Structures & Algorithms',
    tierId: 'tier2_placements',
    semesterOrDomain: 'Placements & Competitive Coding',
    color: '#10b981',
    topics: [
      { unit: 'Unit 1: Arrays & Two Pointers', topic: 'Sliding Window', subtopic: 'Variable & Fixed size sliding window, Two-pointer prefix sum', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 3 },
      { unit: 'Unit 2: Linked Lists', topic: 'Fast & Slow Pointers', subtopic: 'Floyd Cycle Detection, Reverse in K-Groups, LRU Cache list', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 3 },
      { unit: 'Unit 3: Trees & Graphs', topic: 'Binary Search Trees & DFS', subtopic: 'LCA of BST, Tree Traversals, Inorder Successor, Diameter of Tree', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 3 },
      { unit: 'Unit 4: Graph Algorithms', topic: 'Shortest Path & MST', subtopic: 'Dijkstra with Priority Queue, Bellman-Ford, Kruskal & Prim MST', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 3 },
      { unit: 'Unit 5: Dynamic Programming', topic: 'Knapsack & LCS', subtopic: '0/1 Knapsack, Unbounded Knapsack, Longest Common Subsequence & Edit Distance', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 4 },
      { unit: 'Unit 6: Advanced Strings', topic: 'Trie & KMP', subtopic: 'Trie insert/search/prefix, KMP Pattern Matching & LPS array', priority: 'Medium', theory: true, practice: true, pyq: true, revisionCount: 2 },
    ],
  },
  {
    code: 'Sub_TOC',
    name: 'Theory of Computation',
    tierId: 'tier3_gate',
    semesterOrDomain: 'GATE CSE Depth',
    color: '#f59e0b',
    topics: [
      { unit: 'Unit 1: Automata', topic: 'DFA & NFA', subtopic: 'DFA minimization, NFA to DFA conversion, Myhill-Nerode Theorem', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 3 },
      { unit: 'Unit 2: Regular Languages', topic: 'Pumping Lemma', subtopic: 'Proving non-regularity, Closure properties of regular languages', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 3 },
      { unit: 'Unit 3: Context-Free Languages', topic: 'Pushdown Automata', subtopic: 'Deterministic vs Non-deterministic PDA, Ambiguity in CFG', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 2 },
      { unit: 'Unit 4: Turing Machines', topic: 'Decidability & Halting Problem', subtopic: 'Recursive vs Recursively Enumerable languages, Rice Theorem', priority: 'High', theory: true, practice: true, pyq: true, revisionCount: 3 },
    ],
  },
];

export function buildDefaultStudyWorkspace(userId: string): {
  subjects: StudySubject[];
  topics: StudyTopic[];
  revisions: StudyRevision[];
  mistakes: StudyMistake[];
} {
  const nowIso = new Date().toISOString();
  const todayStr = nowIso.slice(0, 10);
  const subjects: StudySubject[] = [];
  const topics: StudyTopic[] = [];

  for (const def of DEFAULT_STUDY_SUBJECTS) {
    const subjectId = `subj_${def.code.toLowerCase()}_${userId}`;
    const subjectTopics: StudyTopic[] = def.topics.map((t, idx) => ({
      id: `topic_${def.code.toLowerCase()}_${idx + 1}_${userId}`,
      userId,
      subjectCode: def.code,
      unit: t.unit,
      topic: t.topic,
      subtopic: t.subtopic,
      priority: t.priority,
      theory: t.theory,
      practice: t.practice,
      pyq: t.pyq,
      revisionCount: t.revisionCount,
      notes: t.notes || '',
      rowIndex: idx + 1,
      createdAt: nowIso,
      updatedAt: nowIso,
    }));

    const completedCount = subjectTopics.filter((t) => t.theory && t.practice).length;

    subjects.push({
      id: subjectId,
      userId,
      code: def.code,
      name: def.name,
      tierId: def.tierId,
      semesterOrDomain: def.semesterOrDomain,
      color: def.color,
      totalSubtopics: subjectTopics.length,
      completedSubtopics: completedCount,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    topics.push(...subjectTopics);
  }

  // Initial Spaced Repetition seeds
  const revisions: StudyRevision[] = [
    {
      id: `rev_1_${userId}`,
      userId,
      topicId: topics[0]?.id || 'topic_sample',
      subjectCode: 'Sub_DBMS',
      topicTitle: 'B+ Tree Indexing & Node Splitting Rules',
      lastStudiedAt: todayStr,
      nextRevisionAt: todayStr, // Due today for immediate testing
      intervalDays: 1,
      repetition: 1,
      difficulty: 'medium',
      status: 'due',
      notes: 'Quiz: Minimum & maximum keys in an internal node of order p',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: `rev_2_${userId}`,
      userId,
      topicId: topics[6]?.id || 'topic_sample_2',
      subjectCode: 'Sub_OS',
      topicTitle: 'Banker’s Algorithm for Deadlock Avoidance',
      lastStudiedAt: todayStr,
      nextRevisionAt: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
      intervalDays: 3,
      repetition: 2,
      difficulty: 'easy',
      status: 'scheduled',
      notes: 'Check: Safety state vs Deadlock state conditions',
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  // Initial Mistake Trap seeds
  const mistakes: StudyMistake[] = [
    {
      id: `mistake_1_${userId}`,
      userId,
      date: todayStr,
      subjectCode: 'Sub_DBMS',
      subjectName: 'Database Management Systems',
      topic: 'B+ Tree Node Capacity',
      source: 'GATE CSE Mock 2024',
      severity: 'High',
      trap: 'Assumed leaf nodes and internal nodes have identical pointer formats and capacity.',
      rootCause: 'Did not account for leaf nodes having record pointers while internal nodes only have block/child pointers.',
      goldenRule: 'Always construct the node layout equation separately: p*(child_ptr) + (p-1)*key <= BlockSize for internal nodes.',
      resolved: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: `mistake_2_${userId}`,
      userId,
      date: todayStr,
      subjectCode: 'Sub_OS',
      subjectName: 'Operating Systems',
      topic: 'Virtual Memory Multi-level Paging',
      source: 'Semester Exam 2023',
      severity: 'Medium',
      trap: 'Calculated page table size for entire 4GB virtual space instead of mapped entries.',
      rootCause: 'Overlooked that multi-level paging only allocates page table pages when mapped.',
      goldenRule: 'For outer page tables, size is based on total virtual space, but inner tables exist only for valid mapped regions.',
      resolved: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  return { subjects, topics, revisions, mistakes };
}
