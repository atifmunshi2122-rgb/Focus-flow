import React, { useState, useEffect, useMemo } from 'react';
import {
  ThemeModal,
  ThemeButton,
  ThemeBadge,
  ThemeCard,
  ThemeInput,
  ThemeSelect,
} from '../ui/ThemePrimitives.tsx';
import { StudySubject, StudyTopic } from '../../types/study.ts';
import { Task } from '../../types/index.ts';
import { parseStudyCommand, ParsedStudyCommand, CommandLanguage } from '../../lib/study/studyCommandParser.ts';
import {
  matchSubjects,
  matchUnitsAndTopics,
  generateSyllabusSuggestions,
  MatchedSyllabusGroup,
  MatchedTopicItem,
  SyllabusSmartSuggestion,
} from '../../lib/study/studyCatalogMatcher.ts';
import {
  generateTaskBlueprints,
  TaskBreakdownMode,
  TaskBlueprint,
} from '../../lib/study/studyTaskBreakdown.ts';
import { createSyllabusTasks } from '../../lib/study/studyTaskIntegration.ts';
import { api } from '../../lib/api.ts';
import { useApp } from '../../context/AppContext.tsx';
import { playStudyMilestoneSound } from '../../lib/sound.ts';
import {
  Sparkles,
  BookOpen,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Layers,
  ListTodo,
  Check,
  X,
  Languages,
  ChevronRight,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface SmartSyllabusTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjects: StudySubject[];
  topics: StudyTopic[];
  tasks?: Task[];
  defaultSubjectCode?: string;
  onSuccess?: (createdTasks: Task[]) => void;
}

export const SmartSyllabusTaskModal: React.FC<SmartSyllabusTaskModalProps> = ({
  isOpen,
  onClose,
  subjects,
  topics,
  tasks = [],
  defaultSubjectCode,
  onSuccess,
}) => {
  const { settings, showToast } = useApp();

  // Natural language command input
  const [inputText, setInputText] = useState('');
  const [breakdownMode, setBreakdownMode] = useState<TaskBreakdownMode>('parent_with_subtasks');

  // Selected subject & unit
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedUnitName, setSelectedUnitName] = useState<string>('');

  // Selected subtopic IDs (for custom checklist)
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set());

  // Task creation overrides
  const [customDueDate, setCustomDueDate] = useState<string>('');
  const [customPriority, setCustomPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [customPomodoros, setCustomPomodoros] = useState<number>(1);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Timezone from settings
  const userTimezone = settings?.timezone || 'Asia/Kolkata';

  // 1. Dynamic Syllabus Suggestions from real study data
  const suggestions: SyllabusSmartSuggestion[] = useMemo(() => {
    return generateSyllabusSuggestions(subjects, topics, tasks);
  }, [subjects, topics, tasks]);

  // 2. Real-time command parsing
  const parsedCommand: ParsedStudyCommand = useMemo(() => {
    return parseStudyCommand(inputText, userTimezone);
  }, [inputText, userTimezone]);

  // 3. Matched subjects ranking
  const matchedSubjects = useMemo(() => {
    if (!inputText.trim()) {
      return subjects.filter((s) => !s.deletedAt).map((s) => ({
        subject: s,
        score: 0,
        matchReason: 'Catalog subject',
        isExact: false,
      }));
    }
    return matchSubjects(parsedCommand, subjects);
  }, [parsedCommand, subjects, inputText]);

  // Active chosen subject
  const currentSubject = useMemo(() => {
    if (selectedSubjectId) {
      return subjects.find((s) => s.id === selectedSubjectId) || null;
    }
    if (matchedSubjects.length > 0) {
      return matchedSubjects[0].subject;
    }
    return subjects[0] || null;
  }, [selectedSubjectId, matchedSubjects, subjects]);

  // 4. Units & Topics for chosen subject
  const matchedGroups: MatchedSyllabusGroup[] = useMemo(() => {
    if (!currentSubject) return [];
    return matchUnitsAndTopics(currentSubject, parsedCommand, topics, tasks);
  }, [currentSubject, parsedCommand, topics, tasks]);

  // Active chosen unit group
  const currentUnitGroup: MatchedSyllabusGroup | null = useMemo(() => {
    if (!matchedGroups || matchedGroups.length === 0) return null;
    if (selectedUnitName) {
      return matchedGroups.find((g) => g.unitName === selectedUnitName) || matchedGroups[0];
    }
    return matchedGroups[0];
  }, [matchedGroups, selectedUnitName]);

  // Synchronize defaults when modal opens or input changes
  useEffect(() => {
    if (isOpen) {
      if (!inputText && defaultSubjectCode) {
        const found = subjects.find((s) => s.code.toLowerCase() === defaultSubjectCode.toLowerCase());
        if (found) setSelectedSubjectId(found.id);
      }
      setErrorMessage(null);
    }
  }, [isOpen, defaultSubjectCode, subjects]);

  // Sync selected subtopics when unit group changes or input command re-parses
  useEffect(() => {
    if (currentUnitGroup) {
      const initialSelected = new Set<string>();
      for (const item of currentUnitGroup.topics) {
        if (item.selected) {
          initialSelected.add(item.topic.id);
        }
      }
      // If none was auto-selected by matcher, select all incomplete topics
      if (initialSelected.size === 0) {
        for (const item of currentUnitGroup.topics) {
          if (!item.isCompleted) {
            initialSelected.add(item.topic.id);
          }
        }
      }
      // Fallback: if all are completed, select all topics in unit
      if (initialSelected.size === 0 && currentUnitGroup.topics.length > 0) {
        currentUnitGroup.topics.forEach((t) => initialSelected.add(t.topic.id));
      }
      setSelectedTopicIds(initialSelected);
      setSelectedUnitName(currentUnitGroup.unitName);
    }
  }, [currentUnitGroup?.unitName, parsedCommand.normalizedText]);

  // Sync due date & priority from parsed command
  useEffect(() => {
    if (parsedCommand.dueDate) {
      setCustomDueDate(parsedCommand.dueDate);
    }
    if (parsedCommand.priority) {
      setCustomPriority(parsedCommand.priority);
    }
    if (parsedCommand.estimatedPomodoros) {
      setCustomPomodoros(parsedCommand.estimatedPomodoros);
    }
  }, [parsedCommand.dueDate, parsedCommand.priority, parsedCommand.estimatedPomodoros]);

  // Toggle single topic selection
  const toggleTopicSelection = (topicId: string) => {
    setSelectedTopicIds((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) {
        next.delete(topicId);
      } else {
        next.add(topicId);
      }
      return next;
    });
  };

  // Bulk selection helpers
  const handleSelectAll = () => {
    if (!currentUnitGroup) return;
    const all = new Set(currentUnitGroup.topics.map((t) => t.topic.id));
    setSelectedTopicIds(all);
  };

  const handleSelectPendingOnly = () => {
    if (!currentUnitGroup) return;
    const pending = new Set(
      currentUnitGroup.topics.filter((t) => !t.isCompleted).map((t) => t.topic.id)
    );
    setSelectedTopicIds(pending);
  };

  const handleDeselectAll = () => {
    setSelectedTopicIds(new Set());
  };

  // Active selected StudyTopic objects
  const activeSelectedTopics: StudyTopic[] = useMemo(() => {
    if (!currentUnitGroup) return [];
    return currentUnitGroup.topics
      .filter((t) => selectedTopicIds.has(t.topic.id))
      .map((t) => t.topic);
  }, [currentUnitGroup, selectedTopicIds]);

  // 5. Generate Task Blueprints
  const blueprints: TaskBlueprint[] = useMemo(() => {
    if (!currentSubject || !currentUnitGroup || activeSelectedTopics.length === 0) {
      return [];
    }

    return generateTaskBlueprints({
      mode: breakdownMode,
      subject: currentSubject,
      unitName: currentUnitGroup.unitName,
      selectedTopics: activeSelectedTopics,
      command: parsedCommand,
      existingTasks: tasks,
      customDueDate: customDueDate || null,
      customPriority,
      customPomodoros,
    });
  }, [
    breakdownMode,
    currentSubject,
    currentUnitGroup,
    activeSelectedTopics,
    parsedCommand,
    tasks,
    customDueDate,
    customPriority,
    customPomodoros,
  ]);

  const hasDuplicateWarnings = blueprints.some((b) => b.isDuplicate);

  // Submit and create tasks
  const handleCreateTasks = async () => {
    if (blueprints.length === 0) {
      setErrorMessage('Please select at least one subtopic to create tasks.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await createSyllabusTasks(blueprints, (t) => api.createTask(t));

      if (result.failedCount > 0 && result.createdTasks.length === 0) {
        throw new Error(result.errors.join('; '));
      }

      playStudyMilestoneSound(settings?.soundEnabled ?? true, settings?.soundVolume ?? 70);

      showToast(
        `Created ${result.createdTasks.length} task${result.createdTasks.length === 1 ? '' : 's'} from syllabus!`,
        'success'
      );

      if (onSuccess) {
        onSuccess(result.createdTasks);
      }

      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to create tasks. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Language pill style
  const getLanguageLabel = (lang: CommandLanguage) => {
    switch (lang) {
      case 'bn':
        return { label: 'বাংলা (Bengali)', tone: 'success' as const };
      case 'banglish':
        return { label: 'Banglish', tone: 'accent' as const };
      default:
        return { label: 'English', tone: 'info' as const };
    }
  };

  const langBadge = getLanguageLabel(parsedCommand.language);

  return (
    <ThemeModal
      isOpen={isOpen}
      onClose={onClose}
      title="Smart Syllabus-to-Task Engine"
      subtitle="Describe your study goal in natural language (English, বাংলা, or Banglish) or choose syllabus topics."
      maxWidthClass="max-w-3xl"
    >
      <div className="space-y-5 text-sm">
        {/* Natural Language Input Box */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-accent-indigo" />
              Natural Language Study Goal
            </label>
            <div className="flex items-center gap-2">
              <ThemeBadge tone={langBadge.tone} className="text-[11px] px-2 py-0.5">
                <Languages className="w-3 h-3 mr-1 inline" />
                {langBadge.label}
              </ThemeBadge>
              {inputText && (
                <button
                  type="button"
                  onClick={() => setInputText('')}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="relative">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="e.g. Complete Math Module 1 by Friday / আগামী সোমবারের মধ্যে Physics Chapter 3 শেষ করতে হবে / DBMS Unit 2 er sob topic porte hobe"
              rows={2}
              className="w-full rounded-xl border border-border bg-background/50 px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent-indigo/40 resize-none transition-all"
            />
          </div>

          {/* Dynamic Syllabus Suggestions Chips */}
          {suggestions.length > 0 && !inputText && (
            <div className="pt-1">
              <div className="text-[11px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                <span>Suggested Study Goals:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.slice(0, 4).map((sug) => (
                  <button
                    key={sug.id}
                    type="button"
                    onClick={() => setInputText(sug.commandPreset)}
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-border/80 bg-background/60 hover:bg-accent-indigo/10 hover:border-accent-indigo/50 text-foreground transition-colors group text-left"
                  >
                    <BookOpen className="w-3 h-3 text-accent-indigo shrink-0" />
                    <span className="font-medium">{sug.commandPreset}</span>
                    <span className="text-[10px] text-muted-foreground">({sug.pendingCount} left)</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Parsed Intent Summary */}
          {inputText.trim() && (
            <div className="p-2.5 rounded-xl bg-card border border-border/70 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-muted-foreground">Detected:</span>
              {currentSubject && (
                <ThemeBadge tone="accent">
                  Subject: {currentSubject.name} ({currentSubject.code.replace(/^Sub_/i, '')})
                </ThemeBadge>
              )}
              {parsedCommand.unitKeyword && (
                <ThemeBadge tone="info">
                  {parsedCommand.unitKeyword}
                </ThemeBadge>
              )}
              {parsedCommand.dueDate && (
                <ThemeBadge tone="success">
                  <Calendar className="w-3 h-3 mr-1 inline" />
                  Due: {parsedCommand.dueDate}
                </ThemeBadge>
              )}
              <ThemeBadge
                tone={
                  parsedCommand.priority === 'high'
                    ? 'danger'
                    : parsedCommand.priority === 'medium'
                    ? 'warning'
                    : 'neutral'
                }
              >
                Priority: {parsedCommand.priority.toUpperCase()}
              </ThemeBadge>
              <ThemeBadge tone="neutral">
                <Clock className="w-3 h-3 mr-1 inline" />
                {parsedCommand.estimatedPomodoros} Pomodoro{parsedCommand.estimatedPomodoros > 1 ? 's' : ''}
              </ThemeBadge>
            </div>
          )}
        </div>

        {/* Subject & Unit Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              Academic Subject
            </label>
            <select
              value={currentSubject?.id || ''}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent-indigo/40"
            >
              {matchedSubjects.map(({ subject, matchReason }) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name} ({subject.code.replace(/^Sub_/i, '')})
                  {matchReason && matchReason !== 'Catalog subject' ? ` — ${matchReason}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              Unit / Module / Chapter
            </label>
            <select
              value={currentUnitGroup?.unitName || ''}
              onChange={(e) => setSelectedUnitName(e.target.value)}
              disabled={!matchedGroups || matchedGroups.length === 0}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent-indigo/40 disabled:opacity-50"
            >
              {matchedGroups.map((g) => (
                <option key={g.unitName} value={g.unitName}>
                  {g.unitName} ({g.completionPercentage}% complete, {g.pendingSubtopics} pending)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Subtopics Checklist Container */}
        {currentUnitGroup && (
          <div className="space-y-2 border border-border/80 rounded-xl p-3 bg-background/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs">
                  Subtopics in {currentUnitGroup.unitName}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  ({activeSelectedTopics.length} of {currentUnitGroup.topics.length} selected)
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-accent-indigo hover:underline text-[11px] font-medium"
                >
                  All
                </button>
                <span className="text-muted-foreground">|</span>
                <button
                  type="button"
                  onClick={handleSelectPendingOnly}
                  className="text-accent-indigo hover:underline text-[11px] font-medium"
                >
                  Pending Only
                </button>
                <span className="text-muted-foreground">|</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-muted-foreground hover:text-foreground text-[11px]"
                >
                  None
                </button>
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {currentUnitGroup.topics.map((item) => {
                const isSelected = selectedTopicIds.has(item.topic.id);
                return (
                  <div
                    key={item.topic.id}
                    onClick={() => toggleTopicSelection(item.topic.id)}
                    className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-accent-indigo/60 bg-accent-indigo/5'
                        : 'border-border/60 hover:bg-muted/40'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                          isSelected
                            ? 'bg-accent-indigo border-accent-indigo text-white'
                            : 'border-muted-foreground/40'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">
                          {item.topic.subtopic}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          Topic: {item.topic.topic}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {item.isCompleted ? (
                        <ThemeBadge tone="success" className="text-[10px] px-1.5 py-0.5">
                          Done
                        </ThemeBadge>
                      ) : (
                        <ThemeBadge tone="neutral" className="text-[10px] px-1.5 py-0.5">
                          Pending
                        </ThemeBadge>
                      )}
                      {item.isDuplicateTask && (
                        <ThemeBadge tone="warning" className="text-[10px] px-1.5 py-0.5">
                          Active Task Exists
                        </ThemeBadge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Task Breakdown Mode & Configuration */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              Task Breakdown Structure
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBreakdownMode('parent_with_subtasks')}
                className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${
                  breakdownMode === 'parent_with_subtasks'
                    ? 'border-accent-indigo bg-accent-indigo/10 ring-1 ring-accent-indigo'
                    : 'border-border hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs mb-0.5">
                  <Layers className="w-3.5 h-3.5 text-accent-indigo" />
                  <span>Single Task</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  With {activeSelectedTopics.length} subtasks checklist
                </span>
              </button>

              <button
                type="button"
                onClick={() => setBreakdownMode('individual_tasks')}
                className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${
                  breakdownMode === 'individual_tasks'
                    ? 'border-accent-indigo bg-accent-indigo/10 ring-1 ring-accent-indigo'
                    : 'border-border hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs mb-0.5">
                  <ListTodo className="w-3.5 h-3.5 text-accent-indigo" />
                  <span>Separate Tasks</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {activeSelectedTopics.length} standalone tasks
                </span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={customDueDate}
                onChange={(e) => setCustomDueDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent-indigo/40"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Priority
              </label>
              <select
                value={customPriority}
                onChange={(e) => setCustomPriority(e.target.value as any)}
                className="w-full rounded-lg border border-border bg-background px-2 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent-indigo/40"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Pomodoros
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={customPomodoros}
                onChange={(e) => setCustomPomodoros(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent-indigo/40"
              />
            </div>
          </div>
        </div>

        {/* Live Blueprint Preview */}
        {blueprints.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-muted-foreground">
                Task Preview ({blueprints.length} {blueprints.length === 1 ? 'task' : 'tasks'}):
              </span>
              {hasDuplicateWarnings && (
                <span className="text-[11px] text-amber-500 flex items-center gap-1 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Potential duplicate detected
                </span>
              )}
            </div>

            <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
              {blueprints.map((bp, i) => (
                <div
                  key={i}
                  className={`p-2 rounded-lg border text-xs flex items-center justify-between ${
                    bp.isDuplicate
                      ? 'border-amber-500/50 bg-amber-500/5'
                      : 'border-border/70 bg-card'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <p className="font-medium truncate">{bp.title}</p>
                    {bp.subtasks && bp.subtasks.length > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        Includes {bp.subtasks.length} subtasks
                      </p>
                    )}
                    {bp.duplicateReason && (
                      <p className="text-[10px] text-amber-500 truncate">
                        {bp.duplicateReason}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <ThemeBadge tone="neutral" className="text-[10px]">
                      {bp.estimatedPomodoros} 🍅
                    </ThemeBadge>
                    {bp.dueDate && (
                      <ThemeBadge tone="neutral" className="text-[10px]">
                        {bp.dueDate}
                      </ThemeBadge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error message display */}
        {errorMessage && (
          <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Modal Action Footer */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <ThemeButton variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </ThemeButton>
          <ThemeButton
            variant="primary"
            onClick={handleCreateTasks}
            disabled={isSubmitting || blueprints.length === 0}
            className="flex items-center gap-1.5"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Creating Tasks...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>
                  Create {blueprints.length} {blueprints.length === 1 ? 'Task' : 'Tasks'}
                </span>
              </>
            )}
          </ThemeButton>
        </div>
      </div>
    </ThemeModal>
  );
};
