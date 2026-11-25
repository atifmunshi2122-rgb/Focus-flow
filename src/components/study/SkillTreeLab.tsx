import React, { useState, useMemo, useEffect } from 'react';
import type { StudySubject, StudyTopic } from '../../types/study.ts';
import {
  buildStudySkillTreesFromSyllabus,
  computeTreeStats,
  resolveNodeStatus,
  type StudySkillNode,
  type StudySkillTree,
} from '../../lib/skillTreeEngine.ts';
import { ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import {
  Lock,
  Unlock,
  CheckCircle2,
  Play,
  Plus,
  GitBranch,
  Award,
  BookOpen,
  ExternalLink,
  CheckSquare,
  Circle,
  Sparkles,
} from 'lucide-react';

interface SkillTreeLabProps {
  subjects: StudySubject[];
  topics: StudyTopic[];
  onOpenInSyllabus?: (subjectCode: string, unitOrQuery?: string) => void;
  onToggleTopicFlag?: (topicId: string, flag: 'theory' | 'practice' | 'pyq') => void;
  onToggleTopicCompleted?: (topicId: string) => void;
  onAddSubject?: () => void;
  onAddTopic?: (subjectCode?: string) => void;
}

export const SkillTreeLab: React.FC<SkillTreeLabProps> = ({
  subjects,
  topics,
  onOpenInSyllabus,
  onToggleTopicFlag,
  onToggleTopicCompleted,
  onAddSubject,
  onAddTopic,
}) => {
  const { allSubjectsTree, subjectTrees } = useMemo(
    () => buildStudySkillTreesFromSyllabus(subjects, topics),
    [subjects, topics]
  );

  const availableTracks = useMemo<StudySkillTree[]>(
    () => [allSubjectsTree, ...subjectTrees],
    [allSubjectsTree, subjectTrees]
  );

  const [selectedTrackId, setSelectedTrackId] = useState<string>('all-subjects');
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Keep selected track valid if subjects change
  useEffect(() => {
    if (!availableTracks.some((t) => t.id === selectedTrackId)) {
      setSelectedTrackId('all-subjects');
      setSelectedNodeId(null);
    }
  }, [availableTracks, selectedTrackId]);

  const activeTree = useMemo<StudySkillTree>(() => {
    return availableTracks.find((t) => t.id === selectedTrackId) || allSubjectsTree;
  }, [availableTracks, selectedTrackId, allSubjectsTree]);

  const stats = useMemo(() => computeTreeStats(activeTree.nodes), [activeTree.nodes]);

  const nodeMap = useMemo(
    () => new Map<string, StudySkillNode>(activeTree.nodes.map((n) => [n.id, n])),
    [activeTree.nodes]
  );

  const selectedNode = useMemo(
    () => activeTree.nodes.find((n) => n.id === selectedNodeId) || null,
    [activeTree.nodes, selectedNodeId]
  );

  // Map topicId -> live StudyTopic for interactive checklist inside drawer
  const topicById = useMemo(
    () => new Map<string, StudyTopic>(topics.map((t) => [t.id, t])),
    [topics]
  );

  const selectedNodeTopics = useMemo(() => {
    if (!selectedNode) return [];
    return selectedNode.topicIds
      .map((id) => topicById.get(id))
      .filter((t): t is StudyTopic => Boolean(t));
  }, [selectedNode, topicById]);

  // Dynamic SVG canvas dimensions so nothing clips horizontally or vertically
  const canvasDimensions = useMemo(() => {
    if (activeTree.nodes.length === 0) {
      return { width: 700, height: 340 };
    }
    const maxX = Math.max(...activeTree.nodes.map((n) => (n.position?.x || 0) + 220));
    const maxY = Math.max(...activeTree.nodes.map((n) => (n.position?.y || 0) + 125));
    return {
      width: Math.max(700, maxX + 36),
      height: Math.max(360, maxY + 40),
    };
  }, [activeTree.nodes]);

  // Subject column headers when viewing All Subjects
  const subjectColumns = useMemo(() => {
    if (activeTree.id !== 'all-subjects') return [];
    const seen = new Map<string, { subjectCode: string; subjectName: string; subjectColor: string; x: number }>();
    for (const node of activeTree.nodes) {
      if (!seen.has(node.subjectCode)) {
        seen.set(node.subjectCode, {
          subjectCode: node.subjectCode,
          subjectName: node.subjectName,
          subjectColor: node.subjectColor,
          x: node.position?.x || 28,
        });
      }
    }
    return Array.from(seen.values());
  }, [activeTree]);

  const activeSubjectsCount = subjects.filter((s) => !s.deletedAt).length;

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 p-5 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="p-2 rounded-xl bg-[var(--ff-accent)]/10 text-[var(--ff-accent-text)]">
                <GitBranch className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-bold text-[var(--ff-text-primary)]">RPG-Style Skill Tree</h2>
              <ThemeBadge tone="accent">Live Study Sync</ThemeBadge>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25">
                <Award className="w-3.5 h-3.5" />
                Lv. {activeTree.level} • {activeTree.rankTitle}
              </span>
            </div>
            <p className="text-xs text-[var(--ff-text-muted)]">
              Auto-generated from your Study OS subjects &amp; units. Toggling Theory, Practice, or PYQ anywhere updates XP &amp; unlocks nodes live.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Real Subject Track Selector */}
            <select
              value={selectedTrackId}
              onChange={(e) => {
                setSelectedTrackId(e.target.value);
                setSelectedNodeId(null);
              }}
              className="px-3 py-1.5 text-xs rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[var(--ff-text-primary)] font-medium focus:outline-none focus:ring-1 focus:ring-[var(--ff-accent)]"
            >
              {availableTracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.id === 'all-subjects'
                    ? `All Subjects (${activeSubjectsCount})`
                    : `${track.name} (${track.nodes.length} unit${track.nodes.length === 1 ? '' : 's'})`}
                </option>
              ))}
            </select>

            {/* View Mode Toggle */}
            <div className="flex rounded-xl bg-[var(--ff-surface-muted)] p-0.5 border border-[var(--ff-border)]">
              <button
                type="button"
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
                type="button"
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

            {onAddTopic && (
              <ThemeButton
                variant="secondary"
                size="sm"
                onClick={() => onAddTopic(activeTree.subjectCode)}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add Topic
              </ThemeButton>
            )}
          </div>
        </div>

        {/* Live XP Bar */}
        <div className="pt-3 border-t border-[var(--ff-border)]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-[var(--ff-text-muted)]">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              <strong className="text-[var(--ff-text-primary)] font-mono">{activeTree.earnedXp} XP</strong>
              {' / '}
              <span className="font-mono">{activeTree.totalXp} XP</span> total syllabus XP
              {' • '}
              <span className="text-amber-400 font-mono">
                {activeTree.nextLevelXp - activeTree.earnedXp} XP to Lv. {activeTree.level + 1}
              </span>
            </span>
          </div>
          <div className="w-full sm:w-56 bg-[var(--ff-surface-muted)] h-2 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-amber-400 transition-all duration-500"
              style={{ width: `${activeTree.levelProgressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Empty State if no subjects exist */}
      {activeSubjectsCount === 0 ? (
        <div className="p-10 rounded-2xl bg-[var(--ff-surface)] border border-dashed border-[var(--ff-border)] text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[var(--ff-surface-muted)] mx-auto flex items-center justify-center text-[var(--ff-accent-text)]">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-[var(--ff-text-primary)]">
            No Study OS Subjects Found Yet
          </h3>
          <p className="text-xs text-[var(--ff-text-muted)] max-w-md mx-auto">
            Add your subjects and syllabus topics (or sync your Google Sheet from Sheet Hub) and your live RPG Skill Tree will generate automatically.
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            {onAddSubject && (
              <ThemeButton variant="primary" size="sm" onClick={onAddSubject}>
                <Plus className="w-4 h-4 mr-1" />
                Add First Subject
              </ThemeButton>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Progress & Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3.5 rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border)]">
              <div className="text-[10px] text-[var(--ff-text-muted)] font-medium uppercase tracking-wider">Units Mastered</div>
              <div className="text-xl font-bold text-[var(--ff-text-primary)] mt-1 flex items-baseline gap-1">
                <span>{stats.percentage}%</span>
                <span className="text-xs text-[var(--ff-text-muted)] font-normal">complete</span>
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
            <div className="relative rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] p-4 overflow-x-auto">
              <div className="text-xs font-semibold text-[var(--ff-text-muted)] mb-3 flex flex-wrap items-center justify-between gap-2">
                <span>Live Syllabus Skill Map — Click any Unit node to inspect &amp; check off its topics</span>
                <span className="text-[11px] text-[var(--ff-text-muted)]">
                  +15 XP Theory • +20 XP Practice • +15 XP PYQ
                </span>
              </div>

              <div
                className="relative"
                style={{
                  minWidth: `${canvasDimensions.width}px`,
                  height: `${canvasDimensions.height + (subjectColumns.length > 0 ? 34 : 0)}px`,
                }}
              >
                {/* Subject Column Labels in All Subjects Mode */}
                {subjectColumns.length > 0 && (
                  <div className="relative z-10 h-8">
                    {subjectColumns.map((col) => (
                      <button
                        key={col.subjectCode}
                        type="button"
                        onClick={() => {
                          setSelectedTrackId(`subject-${col.subjectCode}`);
                          setSelectedNodeId(null);
                        }}
                        style={{
                          position: 'absolute',
                          left: `${col.x}px`,
                          top: '0px',
                          width: '228px',
                        }}
                        className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] hover:border-[var(--ff-accent)] transition-colors text-left"
                        title={`Focus on ${col.subjectName} skill tree`}
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: col.subjectColor }}
                          />
                          <span className="text-xs font-bold text-[var(--ff-text-primary)] truncate">
                            {col.subjectName}
                          </span>
                        </span>
                        <span className="text-[10px] font-mono text-[var(--ff-text-muted)] shrink-0">
                          Focus →
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* SVG Connecting Curves */}
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none z-0"
                  style={{ top: subjectColumns.length > 0 ? '34px' : '0px' }}
                >
                  <defs>
                    <marker
                      id="arrowhead"
                      markerWidth="8"
                      markerHeight="6"
                      refX="7"
                      refY="3"
                      orient="auto"
                    >
                      <polygon points="0 0, 8 3, 0 6" fill="rgba(148, 163, 184, 0.55)" />
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

                  {activeTree.nodes.map((node) => {
                    if (!node.prerequisites || node.prerequisites.length === 0) return null;
                    return node.prerequisites.map((preId: string) => {
                      const preNode = nodeMap.get(preId);
                      if (!preNode) return null;

                      const preX = preNode.position?.x || 40;
                      const preY = preNode.position?.y || 32;
                      const curX = node.position?.x || 40;
                      const curY = node.position?.y || 32;
                      const isSameRow = Math.abs(preY - curY) < 12;

                      const startX = isSameRow ? preX + 228 : preX + 114;
                      const startY = isSameRow ? preY + 52 : preY + 96;
                      const endX = isSameRow ? curX - 2 : curX + 114;
                      const endY = isSameRow ? curY + 52 : curY + 2;

                      const isComplete = preNode.status === 'completed';
                      const strokeColor = isComplete ? '#10b981' : 'rgba(148, 163, 184, 0.35)';
                      const midX = (startX + endX) / 2;
                      const midY = (startY + endY) / 2;
                      const pathD = isSameRow
                        ? `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`
                        : `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;

                      return (
                        <path
                          key={`${preId}->${node.id}`}
                          d={pathD}
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

                {/* Skill Unit Nodes */}
                <div
                  className="relative z-10"
                  style={{ top: subjectColumns.length > 0 ? '4px' : '0px' }}
                >
                  {activeTree.nodes.map((node) => {
                    const effectiveStatus = resolveNodeStatus(node, activeTree.nodes);
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
                        type="button"
                        onClick={() => setSelectedNodeId(node.id)}
                        style={{
                          position: 'absolute',
                          left: `${node.position?.x || 40}px`,
                          top: `${node.position?.y || 32}px`,
                          width: '228px',
                        }}
                        className={`p-3 rounded-xl bg-[var(--ff-surface)] border text-left transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer ${borderClass} ${
                          isSelected ? 'ring-2 ring-[var(--ff-accent)] ring-offset-2 ring-offset-[var(--ff-surface)]' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5 mb-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase flex items-center gap-1 whitespace-nowrap ${bgBadge}`}>
                            <Icon className="w-3 h-3 shrink-0" />
                            {effectiveStatus === 'completed'
                              ? 'Done'
                              : effectiveStatus === 'in_progress'
                              ? 'Active'
                              : effectiveStatus === 'available'
                              ? 'Open'
                              : 'Locked'}
                          </span>
                          <span className="text-[10px] text-amber-400 font-mono shrink-0 whitespace-nowrap">
                            {node.earnedXp}/{node.maxXp} XP
                          </span>
                        </div>

                        <div className="text-xs font-bold text-[var(--ff-text-primary)] line-clamp-1" title={node.title}>
                          {node.title}
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-[var(--ff-text-muted)] mt-1">
                          <span className="truncate max-w-[120px]">{node.subjectName}</span>
                          <span className="font-mono text-[10px]">
                            {node.masteredTopics > 0
                              ? `${node.masteredTopics}/${node.totalTopics} mastered`
                              : `${node.theoryTopics}/${node.totalTopics} theory`}
                          </span>
                        </div>

                        <div className="w-full bg-[var(--ff-surface-muted)] h-1.5 rounded-full mt-2 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${node.progressPct}%`,
                              backgroundColor:
                                effectiveStatus === 'completed'
                                  ? '#10b981'
                                  : node.subjectColor || '#6366f1',
                            }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* List / Roadmap View */
            <div className="space-y-3">
              {activeTree.nodes.map((node) => {
                const effectiveStatus = resolveNodeStatus(node, activeTree.nodes);
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
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: node.subjectColor }}
                        />
                        <span className="text-xs font-bold text-[var(--ff-text-primary)]">
                          {node.subjectName} — {node.title}
                        </span>
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
                        <span className="text-[10px] text-amber-400 font-mono">
                          {node.earnedXp}/{node.maxXp} XP
                        </span>
                      </div>
                      <p className="text-xs text-[var(--ff-text-muted)] line-clamp-1">{node.description}</p>
                      <div className="flex items-center gap-3 text-[11px] text-[var(--ff-text-muted)] font-mono">
                        <span className="text-blue-400">T: {node.theoryTopics}/{node.totalTopics}</span>
                        <span className="text-emerald-400">P: {node.practiceTopics}/{node.totalTopics}</span>
                        <span className="text-purple-400">Q: {node.pyqTopics}/{node.totalTopics}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <span className="text-xs font-bold font-mono text-[var(--ff-text-primary)]">
                        {node.progressPct}%
                      </span>
                      {onOpenInSyllabus && (
                        <ThemeButton
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenInSyllabus(node.subjectCode, node.unitName);
                          }}
                        >
                          <ExternalLink className="w-3.5 h-3.5 mr-1" />
                          Syllabus
                        </ThemeButton>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Selected Node Details & Live Interactive Topic Checklist (Centered Modal) */}
          {selectedNode && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
              onClick={() => setSelectedNodeId(null)}
            >
              <div
                className="w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5 rounded-2xl bg-[var(--ff-surface-card)] border border-[var(--ff-border-color)] shadow-2xl space-y-4"
                onClick={(e) => e.stopPropagation()}
              >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: selectedNode.subjectColor }}
                    />
                    <h3 className="text-base font-bold text-[var(--ff-text-primary)]">
                      {selectedNode.subjectName} — {selectedNode.title}
                    </h3>
                    <ThemeBadge
                      tone={
                        resolveNodeStatus(selectedNode, activeTree.nodes) === 'completed'
                          ? 'success'
                          : resolveNodeStatus(selectedNode, activeTree.nodes) === 'in_progress'
                          ? 'accent'
                          : 'warning'
                      }
                    >
                      {resolveNodeStatus(selectedNode, activeTree.nodes).replace('_', ' ').toUpperCase()}
                    </ThemeBadge>
                  </div>
                  <p className="text-xs text-[var(--ff-text-muted)] mt-1">{selectedNode.description}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {onOpenInSyllabus && (
                    <ThemeButton
                      variant="primary"
                      size="sm"
                      onClick={() => onOpenInSyllabus(selectedNode.subjectCode, selectedNode.unitName)}
                    >
                      <ExternalLink className="w-3.5 h-3.5 mr-1" />
                      Open in Syllabus
                    </ThemeButton>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedNodeId(null)}
                    className="px-2.5 py-1.5 text-xs text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border)]">
                  <span className="text-[10px] text-[var(--ff-text-muted)] uppercase tracking-wider block">Unit XP</span>
                  <span className="text-sm font-bold font-mono text-amber-400 mt-0.5 block">
                    {selectedNode.earnedXp} / {selectedNode.maxXp} XP
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border)]">
                  <span className="text-[10px] text-[var(--ff-text-muted)] uppercase tracking-wider block">Theory / Practice / PYQ</span>
                  <span className="text-sm font-bold font-mono text-[var(--ff-text-primary)] mt-0.5 block">
                    {selectedNode.theoryTopics}T · {selectedNode.practiceTopics}P · {selectedNode.pyqTopics}Q
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border)]">
                  <span className="text-[10px] text-[var(--ff-text-muted)] uppercase tracking-wider block">Topics Mastered</span>
                  <span className="text-sm font-bold font-mono text-emerald-400 mt-0.5 block">
                    {selectedNode.masteredTopics} / {selectedNode.totalTopics} ({selectedNode.progressPct}%)
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border)]">
                  <span className="text-[10px] text-[var(--ff-text-muted)] uppercase tracking-wider block">Prerequisite Unit</span>
                  <span className="text-sm font-bold text-[var(--ff-text-primary)] mt-0.5 block truncate">
                    {selectedNode.prerequisites.length > 0
                      ? nodeMap.get(selectedNode.prerequisites[0])?.title || 'Previous Unit'
                      : 'Root Unit (Unlocked)'}
                  </span>
                </div>
              </div>

              {/* Live Unit Topics List with T / P / Q / Done Toggles */}
              <div className="space-y-2 pt-2 border-t border-[var(--ff-border)]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--ff-text-primary)]">
                    Unit Topics ({selectedNodeTopics.length}) — Check off to earn XP live
                  </span>
                  {onAddTopic && (
                    <button
                      type="button"
                      onClick={() => onAddTopic(selectedNode.subjectCode)}
                      className="text-xs text-[var(--ff-accent-text)] hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add Topic
                    </button>
                  )}
                </div>

                {selectedNodeTopics.length === 0 ? (
                  <p className="text-xs text-[var(--ff-text-muted)] py-2">
                    No topics in this unit yet. Add topics to start earning XP!
                  </p>
                ) : (
                  <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                    {selectedNodeTopics.map((topic) => {
                      const isDone = Boolean(topic.theory && topic.practice);
                      return (
                        <div
                          key={topic.id}
                          className="p-2.5 rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-[var(--ff-text-primary)] truncate">
                              {topic.subtopic || topic.topic}
                            </div>
                            {topic.topic && topic.subtopic && (
                              <div className="text-[10px] text-[var(--ff-text-muted)] truncate">
                                {topic.topic}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                            {onToggleTopicCompleted && (
                              <button
                                type="button"
                                onClick={() => onToggleTopicCompleted(topic.id)}
                                className={`text-[10px] px-2 py-1 rounded-lg flex items-center gap-1 font-medium border transition-colors ${
                                  isDone
                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                    : 'bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)] border-[var(--ff-border)] hover:text-[var(--ff-text-primary)]'
                                }`}
                              >
                                {isDone ? (
                                  <>
                                    <CheckSquare className="w-3 h-3" /> Done
                                  </>
                                ) : (
                                  <>
                                    <Circle className="w-3 h-3" /> Mark Done
                                  </>
                                )}
                              </button>
                            )}

                            {onToggleTopicFlag && (
                              <div className="flex items-center gap-1 bg-[var(--ff-surface-muted)] p-0.5 rounded-lg border border-[var(--ff-border)]">
                                <button
                                  type="button"
                                  onClick={() => onToggleTopicFlag(topic.id, 'theory')}
                                  title="Theory (+15 XP)"
                                  className={`w-6 h-6 rounded text-[11px] font-bold transition-colors ${
                                    topic.theory
                                      ? 'bg-blue-500 text-white'
                                      : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                                  }`}
                                >
                                  T
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onToggleTopicFlag(topic.id, 'practice')}
                                  title="Practice (+20 XP)"
                                  className={`w-6 h-6 rounded text-[11px] font-bold transition-colors ${
                                    topic.practice
                                      ? 'bg-emerald-500 text-white'
                                      : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                                  }`}
                                >
                                  P
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onToggleTopicFlag(topic.id, 'pyq')}
                                  title="PYQ (+15 XP)"
                                  className={`w-6 h-6 rounded text-[11px] font-bold transition-colors ${
                                    topic.pyq
                                      ? 'bg-purple-500 text-white'
                                      : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                                  }`}
                                >
                                  Q
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
