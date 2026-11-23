import { SkillNode, SkillTreePreset, SkillNodeStatus } from '../types/features15.ts';

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
 * Default Presets for CS, DSA, and Financial Mastery
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
        id: 'cs-dl',
        trackId: 'cs-foundations',
        title: 'Digital Logic & Gates',
        description: 'K-Maps, combinational logic, flip-flops, adders, and sequential circuits.',
        category: 'Hardware',
        tier: 1,
        xpPoints: 100,
        status: 'available',
        prerequisites: [],
        estimatedHours: 35,
        tags: ['Hardware', 'COA'],
        position: { x: 250, y: 50 },
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
        id: 'cs-coa',
        trackId: 'cs-foundations',
        title: 'Computer Organization & Architecture',
        description: 'CPU pipelining, cache memory, assembly language, memory hierarchies.',
        category: 'Systems',
        tier: 2,
        xpPoints: 150,
        status: 'locked',
        prerequisites: ['cs-dl'],
        estimatedHours: 45,
        tags: ['COA', 'Hardware'],
        position: { x: 250, y: 200 },
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
        prerequisites: ['cs-coa', 'cs-dsa'],
        estimatedHours: 50,
        tags: ['Systems', 'Kernel'],
        position: { x: 150, y: 350 },
      },
      {
        id: 'cs-db',
        trackId: 'cs-foundations',
        title: 'Database Management Systems',
        description: 'Relational algebra, SQL, indexing (B+ Trees), ACID, normalization, transactions.',
        category: 'Data',
        tier: 3,
        xpPoints: 200,
        status: 'locked',
        prerequisites: ['cs-dsa'],
        estimatedHours: 40,
        tags: ['Databases', 'SQL'],
        position: { x: 350, y: 350 },
      },
      {
        id: 'cs-cn',
        trackId: 'cs-foundations',
        title: 'Computer Networks',
        description: 'OSI 7-layer model, TCP/IP handshake, routing protocols, DNS, TLS/SSL, HTTP/3.',
        category: 'Networks',
        tier: 4,
        xpPoints: 250,
        status: 'locked',
        prerequisites: ['cs-os'],
        estimatedHours: 45,
        tags: ['Networking', 'Security'],
        position: { x: 250, y: 500 },
      },
    ],
  },
  {
    id: 'dsa-mastery',
    name: 'DSA Mastery Path',
    category: 'Algorithms',
    description: 'Competitive programming and technical interview roadmap from basics to dynamic programming.',
    nodes: [
      {
        id: 'dsa-1',
        trackId: 'dsa-mastery',
        title: 'Arrays & Two Pointers',
        description: 'Sliding window, prefix sums, binary search on sorted arrays.',
        category: 'Basics',
        tier: 1,
        xpPoints: 100,
        status: 'available',
        prerequisites: [],
        estimatedHours: 20,
        tags: ['Arrays', 'Pointers'],
        position: { x: 80, y: 50 },
      },
      {
        id: 'dsa-2',
        trackId: 'dsa-mastery',
        title: 'Linked Lists, Stacks & Queues',
        description: 'Reversing lists, fast & slow pointers, monotonic stack, circular queues.',
        category: 'Linear Data',
        tier: 1,
        xpPoints: 100,
        status: 'available',
        prerequisites: [],
        estimatedHours: 25,
        tags: ['Stack', 'Queue'],
        position: { x: 280, y: 50 },
      },
      {
        id: 'dsa-3',
        trackId: 'dsa-mastery',
        title: 'Recursion & Backtracking',
        description: 'Tree recursion, permutations, combinations, N-Queens, state rollback.',
        category: 'Recursion',
        tier: 2,
        xpPoints: 150,
        status: 'locked',
        prerequisites: ['dsa-1'],
        estimatedHours: 30,
        tags: ['Backtracking'],
        position: { x: 80, y: 200 },
      },
      {
        id: 'dsa-4',
        trackId: 'dsa-mastery',
        title: 'Trees & Binary Search Trees',
        description: 'DFS & BFS traversals, lowest common ancestor, diameter, AVL/Red-Black balance.',
        category: 'Trees',
        tier: 2,
        xpPoints: 150,
        status: 'locked',
        prerequisites: ['dsa-2'],
        estimatedHours: 35,
        tags: ['Trees', 'BST'],
        position: { x: 280, y: 200 },
      },
      {
        id: 'dsa-5',
        trackId: 'dsa-mastery',
        title: 'Graphs: BFS, DFS & Topo Sort',
        description: 'Adjacency list, cycle detection, Kahn algorithm, connected components, bipartite check.',
        category: 'Graphs',
        tier: 3,
        xpPoints: 200,
        status: 'locked',
        prerequisites: ['dsa-3', 'dsa-4'],
        estimatedHours: 40,
        tags: ['Graphs', 'Traversal'],
        position: { x: 180, y: 350 },
      },
      {
        id: 'dsa-6',
        trackId: 'dsa-mastery',
        title: 'Dynamic Programming (1D & 2D)',
        description: 'Memoization, tabulation, knapsack, LCS, LIS, matrix chain multiplication.',
        category: 'DP',
        tier: 4,
        xpPoints: 250,
        status: 'locked',
        prerequisites: ['dsa-5'],
        estimatedHours: 50,
        tags: ['DP', 'Optimization'],
        position: { x: 180, y: 500 },
      },
    ],
  },
  {
    id: 'finance-independence',
    name: 'Financial Independence Roadmap',
    category: 'Finance',
    description: 'Step-by-step wealth building, debt elimination, index investing, and asset protection.',
    nodes: [
      {
        id: 'fin-1',
        trackId: 'finance-independence',
        title: 'Zero-Based Budgeting (50/30/20)',
        description: 'Track net cashflow, identify unnecessary recurring leaks, set monthly limits.',
        category: 'Budgeting',
        tier: 1,
        xpPoints: 100,
        status: 'available',
        prerequisites: [],
        estimatedHours: 10,
        tags: ['Budgeting', 'Cashflow'],
        position: { x: 100, y: 50 },
      },
      {
        id: 'fin-2',
        trackId: 'finance-independence',
        title: 'Emergency Reserve (3-6 Months)',
        description: 'Liquid high-yield savings to absorb unforeseen health, job, or family shocks.',
        category: 'Safety',
        tier: 2,
        xpPoints: 150,
        status: 'locked',
        prerequisites: ['fin-1'],
        estimatedHours: 15,
        tags: ['Emergency', 'Liquidity'],
        position: { x: 100, y: 190 },
      },
      {
        id: 'fin-3',
        trackId: 'finance-independence',
        title: 'High-Interest Debt Annihilation',
        description: 'Avalanche vs Snowball method to eradicate credit card and unsecured loans.',
        category: 'Debt',
        tier: 2,
        xpPoints: 150,
        status: 'locked',
        prerequisites: ['fin-1'],
        estimatedHours: 20,
        tags: ['Debt', 'Avalanche'],
        position: { x: 300, y: 190 },
      },
      {
        id: 'fin-4',
        trackId: 'finance-independence',
        title: 'Broad Market Index Investing',
        description: 'Low-cost broad market index funds, SIP compounding, dollar-cost averaging.',
        category: 'Investing',
        tier: 3,
        xpPoints: 200,
        status: 'locked',
        prerequisites: ['fin-2', 'fin-3'],
        estimatedHours: 25,
        tags: ['Investing', 'Index Funds'],
        position: { x: 200, y: 340 },
      },
      {
        id: 'fin-5',
        trackId: 'finance-independence',
        title: 'Asset Protection & Estate Planning',
        description: 'Term life insurance, comprehensive health cover, nominee audits, emergency binders.',
        category: 'Protection',
        tier: 4,
        xpPoints: 250,
        status: 'locked',
        prerequisites: ['fin-4'],
        estimatedHours: 15,
        tags: ['Insurance', 'Estate'],
        position: { x: 200, y: 480 },
      },
    ],
  },
];
