import React, { useState, useMemo } from 'react';
import {
  SkillNode,
  SkillTreePreset,
  SkillNodeStatus,
} from '../../types/features15.ts';
import {
  SKILL_TREE_PRESETS,
  resolveNodeStatus,
  computeTreeStats,
  hasCycle,
} from '../../lib/skillTreeEngine.ts';
import { ThemeCard, ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import {
  Sparkles,
  Lock,
  Unlock,
  CheckCircle2,
  Clock,
  Play,
  RotateCcw,
  Plus,
  GitBranch,
  Layers,
  AlertCircle,
  Award,
  ChevronRight,
  HelpCircle,
} from 'lucide-react';
import { playStudyMilestoneSound } from '../../lib/sound.ts';

interface SkillTreeLabProps {
  onAttachToTopic?: (nodeTitle: string) => void;
}

export const SkillTreeLab: React.FC<SkillTreeLabProps> = ({ onAttachToTopic }) => {
  const [selectedPresetId, setSelectedPresetId] = useState<string>('cs-foundations');
  const [activePreset, setActivePreset] = useState<SkillTreePreset>(() => {
    const saved = localStorage.getItem('focusflow_skill_tree_state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.nodes) return parsed;
      } catch {
        // fallback
      }
    }
    return SKILL_TREE_PRESETS[0];
  });

  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newNodeTitle, setNewNodeTitle] = useState('');
  const [newNodeCategory, setNewNodeCategory] = useState('');
  const [newNodeHours, setNewNodeHours] = useState(10);
  const [newNodePrereqs, setNewNodePrereqs] = useState<string[]>([]);
  const [cycleError, setCycleError] = useState<string | null>(null);

  // Persist skill tree state locally
  const saveState = (updatedPreset: SkillTreePreset) => {
    setActivePreset(updatedPreset);
    try {
      localStorage.setItem('focusflow_skill_tree_state', JSON.stringify(updatedPreset));
    } catch {
      // ignore
    }
  };

  const handleSelectPreset = (presetId: string) => {
    const found = SKILL_TREE_PRESETS.find((p) => p.id === presetId);
    if (found) {
      setSelectedPresetId(presetId);
      saveState(JSON.parse(JSON.stringify(found)));
      setSelectedNodeId(null);
    }
  };

  const stats = useMemo(() => {
    return computeTreeStats(activePreset.nodes);
  }, [activePreset.nodes]);

  const selectedNode = useMemo(() => {
    return activePreset.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [activePreset.nodes, selectedNodeId]);

  const handleStatusChange = (nodeId: string, newStatus: SkillNodeStatus) => {
    const updatedNodes = activePreset.nodes.map((n) => {
      if (n.id === nodeId) {
        return {
          ...n,
          status: newStatus,
          completedAt: newStatus === 'completed' ? new Date().toISOString() : undefined,
        };
      }
      return n;
    });

    if (newStatus === 'completed') {
      try {
        playStudyMilestoneSound();
      } catch {
        // audio error fallback
      }
    }

    saveState({ ...activePreset, nodes: updatedNodes });
  };

  const handleResetProgress = () => {
    if (!window.confirm('Reset progress for this skill tree? All completed nodes will be locked/available.')) return;
    const original = SKILL_TREE_PRESETS.find((p) => p.id === activePreset.id) || SKILL_TREE_PRESETS[0];
    saveState(JSON.parse(JSON.stringify(original)));
    setSelectedNodeId(null);
  };

  const handleCreateNode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNodeTitle.trim()) return;

    const newId = `custom-${Date.now()}`;
    const candidateNode: SkillNode = {
      id: newId,
      trackId: activePreset.id,
      title: newNodeTitle.trim(),
      description: `Custom mastery unit for ${newNodeCategory || 'Independent Study'}`,
      category: newNodeCategory.trim() || 'Custom',
      tier: newNodePrereqs.length > 0 ? 2 : 1,
      xpPoints: 100,
      status: 'available',
      prerequisites: newNodePrereqs,
      estimatedHours: newNodeHours,
      tags: ['Custom'],
      position: { x: 200, y: (activePreset.nodes.length + 1) * 80 },
    };

    const nextNodes = [...activePreset.nodes, candidateNode];
    if (hasCycle(nextNodes)) {
      setCycleError('Cannot add node: This prerequisite configuration introduces a circular dependency loop!');
      return;
    }

    setCycleError(null);
    saveState({ ...activePreset, nodes: nextNodes });
    setIsAddModalOpen(false);
    setNewNodeTitle('');
    setNewNodeCategory('');
    setNewNodePrereqs([]);
  };

  // Node position coordinates for SVG graph
  const nodeMap = useMemo(() => new Map(activePreset.nodes.map((n) => [n.id, n])), [activePreset.nodes]);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-[var(--ff-accent)]/10 text-[var(--ff-accent-text)]">
              <GitBranch className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-[var(--ff-text-primary)]">RPG-Style Skill Tree</h2>
            <ThemeBadge tone="accent">v1.8 Mastery</ThemeBadge>
          </div>
          <p className="text-xs text-[var(--ff-text-muted)]">
            Explore interconnected technical skill branches. Nodes unlock automatically as prerequisites are mastered.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Preset Selector */}
          <select
            value={selectedPresetId}
            onChange={(e) => handleSelectPreset(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[var(--ff-text-primary)] font-medium focus:outline-none focus:ring-1 focus:ring-[var(--ff-accent)]"
          >
            {SKILL_TREE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.category})
              </option>
            ))}
          </select>

          {/* View Mode Toggle */}
          <div className="flex rounded-xl bg-[var(--ff-surface-muted)] p-0.5 border border-[var(--ff-border)]">
            <button
              onClick={() => setViewMode('graph')}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                viewMode === 'graph'
                  ? 'bg-[var(--ff-accent)] text-white shadow-sm'
                  : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
              }`}
            >
              Graph Map
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                viewMode === 'list'
                  ? 'bg-[var(--ff-accent)] text-white shadow-sm'
                  : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
              }`}
            >
              List Roadmap
            </button>
          </div>

          <ThemeButton variant="secondary" size="sm" onClick={() => setIsAddModalOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Node
          </ThemeButton>

          <ThemeButton variant="ghost" size="sm" onClick={handleResetProgress} title="Reset Progress">
            <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
          </ThemeButton>
        </div>
      </div>

      {/* Progress & Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border)]">
          <div className="text-[10px] text-[var(--ff-text-muted)] font-medium uppercase tracking-wider">Overall Progress</div>
          <div className="text-xl font-bold text-[var(--ff-text-primary)] mt-1 flex items-baseline gap-1">
            <span>{stats.percentage}%</span>
            <span className="text-xs text-[var(--ff-text-muted)] font-normal">mastered</span>
          </div>
          <div className="w-full bg-[var(--ff-surface-muted)] h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${stats.percentage}%` }}
            />
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border)]">
          <div className="text-[10px] text-[var(--ff-text-muted)] font-medium uppercase tracking-wider">Completed</div>
          <div className="text-xl font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span>{stats.completed}</span>
            <span className="text-xs text-[var(--ff-text-muted)] font-normal">/ {stats.total}</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border)]">
          <div className="text-[10px] text-[var(--ff-text-muted)] font-medium uppercase tracking-wider">In Progress</div>
          <div className="text-xl font-bold text-sky-400 mt-1 flex items-center gap-1.5">
            <Play className="w-4 h-4" />
            <span>{stats.inProgress}</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border)]">
          <div className="text-[10px] text-[var(--ff-text-muted)] font-medium uppercase tracking-wider">Available</div>
          <div className="text-xl font-bold text-amber-400 mt-1 flex items-center gap-1.5">
            <Unlock className="w-4 h-4" />
            <span>{stats.available}</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border)]">
          <div className="text-[10px] text-[var(--ff-text-muted)] font-medium uppercase tracking-wider">Locked</div>
          <div className="text-xl font-bold text-neutral-400 mt-1 flex items-center gap-1.5">
            <Lock className="w-4 h-4" />
            <span>{stats.locked}</span>
          </div>
        </div>
      </div>

      {/* Main View Area */}
      {viewMode === 'graph' ? (
        <div className="relative rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] p-4 overflow-x-auto min-h-[460px]">
          <div className="text-xs font-semibold text-[var(--ff-text-muted)] mb-3 flex items-center justify-between">
            <span>Interactive Skill Map — Click a node to view details & update progress</span>
            <span className="text-[11px] text-[var(--ff-text-muted)]">Arrows indicate prerequisites flow</span>
          </div>

          <div className="relative min-w-[700px] min-h-[400px]">
            {/* SVG Connecting Curves */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="8"
                  markerHeight="6"
                  refX="7"
                  refY="3"
                  orient="auto"
                >
                  <polygon points="0 0, 8 3, 0 6" fill="rgba(148, 163, 184, 0.5)" />
                </marker>
                <marker
                  id="arrowhead-active"
                  markerWidth="8"
                  markerHeight="6"
                  refX="7"
                  refY="3"
                  orient="auto"
                >
                  <polygon points="0 0, 8 3, 0 6" fill="#10b981" />
                </marker>
              </defs>

              {activePreset.nodes.map((node) => {
                if (!node.prerequisites) return null;
                return node.prerequisites.map((preId: string) => {
                  const preNode = nodeMap.get(preId);
                  if (!preNode) return null;

                  const startX = (preNode.position?.x || 100) + 100;
                  const startY = (preNode.position?.y || 100) + 40;
                  const endX = (node.position?.x || 100) + 100;
                  const endY = (node.position?.y || 100) + 10;

                  const isComplete = preNode.status === 'completed';
                  const strokeColor = isComplete ? '#10b981' : 'rgba(148, 163, 184, 0.35)';

                  return (
                    <path
                      key={`${preId}->${node.id}`}
                      d={`M ${startX} ${startY} C ${startX} ${(startY + endY) / 2}, ${endX} ${(startY + endY) / 2}, ${endX} ${endY}`}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={isComplete ? 2.5 : 1.5}
                      strokeDasharray={isComplete ? undefined : '4 4'}
                      markerEnd={isComplete ? 'url(#arrowhead-active)' : 'url(#arrowhead)'}
                    />
                  );
                });
              })}
            </svg>

            {/* Nodes */}
            <div className="relative z-10">
              {activePreset.nodes.map((node) => {
                const effectiveStatus = resolveNodeStatus(node, activePreset.nodes);
                const isSelected = selectedNodeId === node.id;

                let borderClass = 'border-[var(--ff-border)]';
                let bgBadge = 'bg-neutral-800 text-neutral-400';
                let Icon = Lock;

                if (effectiveStatus === 'completed') {
                  borderClass = 'border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.15)]';
                  bgBadge = 'bg-emerald-500/20 text-emerald-400';
                  Icon = CheckCircle2;
                } else if (effectiveStatus === 'in_progress') {
                  borderClass = 'border-sky-500/70 shadow-[0_0_15px_rgba(14,165,233,0.15)]';
                  bgBadge = 'bg-sky-500/20 text-sky-400';
                  Icon = Play;
                } else if (effectiveStatus === 'available') {
                  borderClass = 'border-amber-500/50 hover:border-amber-400';
                  bgBadge = 'bg-amber-500/20 text-amber-300';
                  Icon = Unlock;
                }

                return (
                  <button
                    key={node.id}
                    onClick={() => setSelectedNodeId(node.id)}
                    style={{
                      position: 'absolute',
                      left: `${node.position?.x || 50}px`,
                      top: `${node.position?.y || 50}px`,
                      width: '210px',
                    }}
                    className={`p-3 rounded-xl bg-[var(--ff-surface)] border text-left transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer ${borderClass} ${
                      isSelected ? 'ring-2 ring-[var(--ff-accent)] ring-offset-2 ring-offset-[var(--ff-surface)]' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase flex items-center gap-1 ${bgBadge}`}>
                        <Icon className="w-3 h-3" />
                        {effectiveStatus.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-[var(--ff-text-muted)] font-mono">{node.estimatedHours}h</span>
                    </div>

                    <div className="text-xs font-bold text-[var(--ff-text-primary)] line-clamp-1">{node.title}</div>
                    <div className="text-[11px] text-[var(--ff-text-muted)] line-clamp-1 mt-0.5">{node.category}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* List / Roadmap View */
        <div className="space-y-3">
          {activePreset.nodes.map((node) => {
            const effectiveStatus = resolveNodeStatus(node, activePreset.nodes);
            const isSelected = selectedNodeId === node.id;

            return (
              <div
                key={node.id}
                onClick={() => setSelectedNodeId(node.id)}
                className={`p-4 rounded-xl bg-[var(--ff-surface)] border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isSelected
                    ? 'border-[var(--ff-accent)] shadow-sm'
                    : 'border-[var(--ff-border)] hover:border-[var(--ff-accent)]/40'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--ff-text-primary)]">{node.title}</span>
                    <ThemeBadge
                      tone={
                        effectiveStatus === 'completed'
                          ? 'success'
                          : effectiveStatus === 'in_progress'
                          ? 'accent'
                          : effectiveStatus === 'available'
                          ? 'warning'
                          : 'neutral'
                      }
                    >
                      {effectiveStatus.replace('_', ' ')}
                    </ThemeBadge>
                    <span className="text-[10px] text-[var(--ff-text-muted)] font-mono">{node.estimatedHours}h</span>
                  </div>
                  <p className="text-xs text-[var(--ff-text-muted)]">{node.description}</p>
                  {node.prerequisites && node.prerequisites.length > 0 && (
                    <div className="flex items-center gap-1 text-[11px] text-[var(--ff-text-muted)] mt-1">
                      <span>Prerequisites:</span>
                      {node.prerequisites.map((preId: string) => {
                        const preNode = nodeMap.get(preId);
                        const isDone = preNode?.status === 'completed';
                        return (
                          <span
                            key={preId}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              isDone ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            {preNode?.title || preId}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  {effectiveStatus !== 'completed' && effectiveStatus !== 'locked' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStatusChange(node.id, 'completed');
                      }}
                      className="px-3 py-1 text-xs rounded-lg font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition-colors flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Mark Mastered
                    </button>
                  )}
                  {effectiveStatus === 'available' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStatusChange(node.id, 'in_progress');
                      }}
                      className="px-3 py-1 text-xs rounded-lg font-medium bg-sky-600 text-white hover:bg-sky-500 transition-colors flex items-center gap-1"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Start
                    </button>
                  )}
                  {effectiveStatus === 'completed' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStatusChange(node.id, 'available');
                      }}
                      className="px-2.5 py-1 text-xs rounded-lg font-medium text-neutral-400 hover:text-white transition-colors"
                    >
                      Undo
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selected Node Details Drawer */}
      {selectedNode && (
        <div className="p-5 rounded-2xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[var(--ff-text-primary)]">{selectedNode.title}</h3>
                <ThemeBadge
                  tone={
                    resolveNodeStatus(selectedNode, activePreset.nodes) === 'completed'
                      ? 'success'
                      : resolveNodeStatus(selectedNode, activePreset.nodes) === 'in_progress'
                      ? 'accent'
                      : 'warning'
                  }
                >
                  {resolveNodeStatus(selectedNode, activePreset.nodes).toUpperCase()}
                </ThemeBadge>
              </div>
              <p className="text-xs text-[var(--ff-text-muted)] mt-1">{selectedNode.description}</p>
            </div>

            <div className="flex items-center gap-2">
              {onAttachToTopic && (
                <ThemeButton
                  variant="secondary"
                  size="sm"
                  onClick={() => onAttachToTopic(selectedNode.title)}
                >
                  Attach to Study Topic
                </ThemeButton>
              )}
              <button
                onClick={() => setSelectedNodeId(null)}
                className="text-xs text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
              >
                Close
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border)]">
              <span className="text-[10px] text-[var(--ff-text-muted)] uppercase tracking-wider block">Estimated Effort</span>
              <span className="text-sm font-bold text-[var(--ff-text-primary)] mt-0.5 block">{selectedNode.estimatedHours} Hours</span>
            </div>

            <div className="p-3 rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border)]">
              <span className="text-[10px] text-[var(--ff-text-muted)] uppercase tracking-wider block">Discipline Category</span>
              <span className="text-sm font-bold text-[var(--ff-text-primary)] mt-0.5 block">{selectedNode.category}</span>
            </div>

            <div className="p-3 rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border)]">
              <span className="text-[10px] text-[var(--ff-text-muted)] uppercase tracking-wider block">Prerequisites Status</span>
              <span className="text-sm font-bold text-[var(--ff-text-primary)] mt-0.5 block">
                {selectedNode.prerequisites && selectedNode.prerequisites.length > 0
                  ? `${selectedNode.prerequisites.filter((p: string) => nodeMap.get(p)?.status === 'completed').length} / ${selectedNode.prerequisites.length} Met`
                  : 'None (Root Node)'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--ff-border)]">
            <span className="text-xs text-[var(--ff-text-muted)] mr-2 font-medium">Update Mastery State:</span>
            <ThemeButton
              variant={selectedNode.status === 'in_progress' ? 'primary' : 'secondary'}
              size="sm"
              disabled={resolveNodeStatus(selectedNode, activePreset.nodes) === 'locked'}
              onClick={() => handleStatusChange(selectedNode.id, 'in_progress')}
            >
              <Play className="w-3.5 h-3.5 mr-1" />
              In Progress
            </ThemeButton>

            <ThemeButton
              variant={selectedNode.status === 'completed' ? 'primary' : 'secondary'}
              size="sm"
              disabled={resolveNodeStatus(selectedNode, activePreset.nodes) === 'locked'}
              onClick={() => handleStatusChange(selectedNode.id, 'completed')}
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Mark Completed
            </ThemeButton>

            <ThemeButton
              variant="ghost"
              size="sm"
              onClick={() => handleStatusChange(selectedNode.id, 'available')}
            >
              Reset
            </ThemeButton>
          </div>
        </div>
      )}

      {/* Add Custom Node Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] p-5 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-[var(--ff-text-primary)]">Add Custom Skill Node</h3>

            {cycleError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{cycleError}</span>
              </div>
            )}

            <form onSubmit={handleCreateNode} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-[var(--ff-text-muted)] block mb-1">Node Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Asynchronous Microservices"
                  value={newNodeTitle}
                  onChange={(e) => setNewNodeTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[var(--ff-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--ff-accent)]"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--ff-text-muted)] block mb-1">Category</label>
                <input
                  type="text"
                  placeholder="e.g. Distributed Systems"
                  value={newNodeCategory}
                  onChange={(e) => setNewNodeCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[var(--ff-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--ff-accent)]"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--ff-text-muted)] block mb-1">Estimated Hours</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={newNodeHours}
                  onChange={(e) => setNewNodeHours(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[var(--ff-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--ff-accent)]"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--ff-text-muted)] block mb-1">Prerequisites (Optional)</label>
                <div className="max-h-32 overflow-y-auto space-y-1 p-2 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)]">
                  {activePreset.nodes.map((n: SkillNode) => (
                    <label key={n.id} className="flex items-center gap-2 text-xs text-[var(--ff-text-primary)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newNodePrereqs.includes(n.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewNodePrereqs([...newNodePrereqs, n.id]);
                          } else {
                            setNewNodePrereqs(newNodePrereqs.filter((id) => id !== n.id));
                          }
                        }}
                        className="rounded border-[var(--ff-border)] text-[var(--ff-accent)]"
                      />
                      <span>{n.title}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <ThemeButton type="button" variant="ghost" size="sm" onClick={() => setIsAddModalOpen(false)}>
                  Cancel
                </ThemeButton>
                <ThemeButton type="submit" variant="primary" size="sm">
                  Add Node
                </ThemeButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
