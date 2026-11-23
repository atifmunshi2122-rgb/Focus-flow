import { TypingSnippet } from '../types/features15.ts';

export const STATIC_TYPING_SNIPPETS: TypingSnippet[] = [
  {
    id: 'cpp-binary-search',
    language: 'cpp',
    title: 'C++ Binary Search',
    code: `int binarySearch(const vector<int>& arr, int target) {
    int low = 0, high = arr.size() - 1;
    while (low <= high) {
        int mid = low + (high - low) / 2;
        if (arr[mid] == target) return mid;
        if (arr[mid] < target) low = mid + 1;
        else high = mid - 1;
    }
    return -1;
}`,
    difficulty: 'easy',
  },
  {
    id: 'cpp-dfs-graph',
    language: 'cpp',
    title: 'C++ Graph DFS Traversal',
    code: `void dfs(int u, const vector<vector<int>>& adj, vector<bool>& visited) {
    visited[u] = true;
    for (int v : adj[u]) {
        if (!visited[v]) {
            dfs(v, adj, visited);
        }
    }
}`,
    difficulty: 'medium',
  },
  {
    id: 'js-debounce',
    language: 'javascript',
    title: 'JavaScript Debounce Function',
    code: `function debounce(fn, delayMs) {
  let timeoutId = null;
  return function (...args) {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      fn.apply(this, args);
    }, delayMs);
  };
}`,
    difficulty: 'easy',
  },
  {
    id: 'js-memoize',
    language: 'javascript',
    title: 'JavaScript LRU Memoization Cache',
    code: `function memoize(fn) {
  const cache = new Map();
  return function (arg) {
    if (cache.has(arg)) return cache.get(arg);
    const result = fn(arg);
    cache.set(arg, result);
    return result;
  };
}`,
    difficulty: 'medium',
  },
  {
    id: 'py-quicksort',
    language: 'python',
    title: 'Python Quicksort Partition',
    code: `def quicksort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)`,
    difficulty: 'easy',
  },
  {
    id: 'py-topological-sort',
    language: 'python',
    title: 'Python Kahn Algorithm (Topo Sort)',
    code: `from collections import deque

def topological_sort(num_nodes, edges):
    in_degree = [0] * num_nodes
    adj = [[] for _ in range(num_nodes)]
    for u, v in edges:
        adj[u].append(v)
        in_degree[v] += 1
    queue = deque([i for i in range(num_nodes) if in_degree[i] == 0])
    order = []
    while queue:
        u = queue.popleft()
        order.append(u)
        for v in adj[u]:
            in_degree[v] -= 1
            if in_degree[v] == 0:
                queue.append(v)
    return order`,
    difficulty: 'hard',
  },
];

