import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStudyCommand,
  convertBengaliDigits,
  detectLanguage,
  parseAction,
  parsePriority,
  parseDuration,
  parseDateExpression,
  parseUnitOrModule,
} from '../src/lib/study/studyCommandParser.ts';
import {
  matchSubjects,
  matchUnitsAndTopics,
  generateSyllabusSuggestions,
  normalizeText,
} from '../src/lib/study/studyCatalogMatcher.ts';
import {
  generateTaskBlueprints,
  checkDuplicateTask,
} from '../src/lib/study/studyTaskBreakdown.ts';
import {
  createSyllabusTasks,
  syncStudyProgressFromTask,
} from '../src/lib/study/studyTaskIntegration.ts';
import { buildDefaultStudyWorkspace } from '../src/data/studySeedData.ts';
import { StudySubject, StudyTopic } from '../src/types/study.ts';
import { Task } from '../src/types/index.ts';
import { getTodayDateString, addDays } from '../src/lib/dateTime.ts';

describe('Smart Syllabus-to-Task Engine Test Suite', () => {
  const seed = buildDefaultStudyWorkspace('test_user_syllabus');
  const subjects = seed.subjects;
  const topics = seed.topics;

  describe('1. Natural Language Parser (English, বাংলা, Banglish)', () => {
    it('parses English command: "Complete Math Module 1 by Friday"', () => {
      const cmd = parseStudyCommand('Complete Math Module 1 by Friday', 'Asia/Kolkata');
      assert.equal(cmd.language, 'en');
      assert.equal(cmd.action, 'complete');
      assert.equal(cmd.unitNumber, 1);
      assert.equal(cmd.unitKeyword, 'Module 1');
      assert.ok(cmd.subjectKeyword?.toLowerCase().includes('math'));
      assert.ok(cmd.dueDate, 'Due date should be resolved');
      assert.equal(cmd.targetScope, 'specific');

      const allCmd = parseStudyCommand('Complete all Math Module 1 topics by Friday');
      assert.equal(allCmd.targetScope, 'all');
    });

    it('parses Bengali command with Bengali numerals: "আগামী সোমবারের মধ্যে Physics Chapter ৩ শেষ করতে হবে"', () => {
      const cmd = parseStudyCommand('আগামী সোমবারের মধ্যে Physics Chapter ৩ শেষ করতে হবে', 'Asia/Kolkata');
      assert.equal(cmd.language, 'bn');
      assert.equal(cmd.action, 'complete');
      assert.equal(cmd.unitNumber, 3);
      assert.ok(cmd.subjectKeyword?.toLowerCase().includes('physics'));
      assert.ok(cmd.dueDate, 'Due date should be resolved for next Monday');
    });

    it('parses Bengali command: "DBMS Unit 2-এর সব Topic পড়তে হবে"', () => {
      const cmd = parseStudyCommand('DBMS Unit 2-এর সব Topic পড়তে হবে', 'Asia/Kolkata');
      assert.equal(cmd.language, 'bn');
      assert.equal(cmd.action, 'study');
      assert.equal(cmd.unitNumber, 2);
      assert.equal(cmd.targetScope, 'all');
      assert.ok(cmd.subjectKeyword?.toLowerCase().includes('dbms'));
    });

    it('parses Bengali command with relative tomorrow: "আগামীকাল Mathematics-এর Algebra পড়ব"', () => {
      const cmd = parseStudyCommand('আগামীকাল Mathematics-এর Algebra পড়ব', 'Asia/Kolkata');
      assert.equal(cmd.language, 'bn');
      assert.equal(cmd.action, 'study');
      assert.ok(cmd.subjectKeyword?.toLowerCase().includes('mathematics'));
      const expectedTomorrow = addDays(getTodayDateString('Asia/Kolkata'), 1);
      assert.equal(cmd.dueDate, expectedTomorrow);
    });

    it('parses Banglish command: "DBMS Unit 2 er sob topic porte hobe"', () => {
      const cmd = parseStudyCommand('DBMS Unit 2 er sob topic porte hobe', 'Asia/Kolkata');
      assert.equal(cmd.language, 'banglish');
      assert.equal(cmd.action, 'study');
      assert.equal(cmd.unitNumber, 2);
      assert.equal(cmd.targetScope, 'all');
      assert.ok(cmd.subjectKeyword?.toLowerCase().includes('dbms'));
    });

    it('parses Banglish command with relative date: "kalke math module 1 complete korte hobe"', () => {
      const cmd = parseStudyCommand('kalke math module 1 complete korte hobe', 'Asia/Kolkata');
      assert.equal(cmd.language, 'banglish');
      assert.equal(cmd.action, 'complete');
      assert.equal(cmd.unitNumber, 1);
      const expectedTomorrow = addDays(getTodayDateString('Asia/Kolkata'), 1);
      assert.equal(cmd.dueDate, expectedTomorrow);
    });

    it('extracts priority: high, medium, low in English and Bengali', () => {
      const highCmd1 = parseStudyCommand('Urgent: study OS Chapter 2 today', 'Asia/Kolkata');
      assert.equal(highCmd1.priority, 'high');

      const highCmd2 = parseStudyCommand('জরুরি DBMS Unit 1 রিভিশন দিতে হবে', 'Asia/Kolkata');
      assert.equal(highCmd2.priority, 'high');

      const lowCmd = parseStudyCommand('low priority quick reading of DSA module 3', 'Asia/Kolkata');
      assert.equal(lowCmd.priority, 'low');
    });

    it('extracts duration and calculates pomodoros', () => {
      const durCmd1 = parseStudyCommand('Study DBMS Unit 2 for 45 minutes', 'Asia/Kolkata');
      assert.equal(durCmd1.estimatedMinutes, 45);
      assert.equal(durCmd1.estimatedPomodoros, 2);

      const durCmd2 = parseStudyCommand('Complete Math module 1 in 2 hours', 'Asia/Kolkata');
      assert.equal(durCmd2.estimatedMinutes, 120);
      assert.equal(durCmd2.estimatedPomodoros, 5);
    });

    it('converts Bengali digits to standard Arabic digits', () => {
      assert.equal(convertBengaliDigits('মডিউল ৩ অধ্যায় ৪ পৃষ্ঠা ১২০'), 'মডিউল 3 অধ্যায় 4 পৃষ্ঠা 120');
      assert.equal(convertBengaliDigits('০১২৩৪৫৬৭৮৯'), '0123456789');
    });
  });

  describe('2. Catalog Matcher & Suggestion Engine', () => {
    it('matches DBMS subject via academic alias from "database" or "dbms"', () => {
      const cmd = parseStudyCommand('Review database Unit 1 by tomorrow');
      const matches = matchSubjects(cmd, subjects);
      assert.ok(matches.length > 0, 'Should match at least one subject');
      const top = matches[0];
      assert.ok(top.subject.code.toLowerCase().includes('dbms'));
      assert.ok(top.score >= 80, `Expected score >= 80, got ${top.score}`);
    });

    it('matches OS subject via alias from "Operating System"', () => {
      const cmd = parseStudyCommand('Study Operating System Chapter 2');
      const matches = matchSubjects(cmd, subjects);
      assert.ok(matches.length > 0);
      assert.ok(matches[0].subject.code.toLowerCase().includes('os'));
    });

    it('matches DSA subject via alias from "data structures"', () => {
      const cmd = parseStudyCommand('Practice data structures trees');
      const matches = matchSubjects(cmd, subjects);
      assert.ok(matches.length > 0);
      assert.ok(matches[0].subject.code.toLowerCase().includes('dsa'));
    });

    it('matches units and topics strictly without inventing records', () => {
      const dbmsSubject = subjects.find((s) => s.code.toLowerCase().includes('dbms'))!;
      assert.ok(dbmsSubject, 'DBMS subject must exist in seed');

      const cmd = parseStudyCommand('Complete DBMS Unit 1 this week');
      const groups = matchUnitsAndTopics(dbmsSubject, cmd, topics, []);
      assert.ok(groups.length > 0, 'Should return matching unit groups');

      // Check that all topics in groups belong strictly to DBMS and existing seed topics
      for (const g of groups) {
        assert.equal(g.subject.code, dbmsSubject.code);
        for (const item of g.topics) {
          assert.equal(item.topic.subjectCode, dbmsSubject.code);
          assert.ok(topics.some((t) => t.id === item.topic.id));
        }
      }
    });

    it('generates real-data syllabus suggestions with pending counts and completion %', () => {
      const suggestions = generateSyllabusSuggestions(subjects, topics, []);
      assert.ok(suggestions.length > 0, 'Should generate syllabus suggestions from seed');
      for (const sug of suggestions) {
        assert.ok(sug.subjectCode);
        assert.ok(sug.unitName);
        assert.ok(sug.pendingCount > 0);
        assert.ok(sug.commandPreset.length > 5);
        assert.ok(typeof sug.completionPct === 'number');
      }
    });
  });

  describe('3. Task Breakdown Engine (Parent with Subtasks vs Individual Tasks)', () => {
    const dbmsSubject = subjects.find((s) => s.code.toLowerCase().includes('dbms'))!;
    const dbmsTopics = topics.filter((t) => t.subjectCode === dbmsSubject.code).slice(0, 3);

    it('creates Parent Task with Subtasks blueprint', () => {
      const cmd = parseStudyCommand('Complete DBMS Unit 1 by Friday', 'Asia/Kolkata');
      const blueprints = generateTaskBlueprints({
        mode: 'parent_with_subtasks',
        subject: dbmsSubject,
        unitName: dbmsTopics[0].unit,
        selectedTopics: dbmsTopics,
        command: cmd,
        existingTasks: [],
      });

      assert.equal(blueprints.length, 1);
      const parent = blueprints[0];
      assert.ok(parent.title.includes(dbmsSubject.code.replace(/^Sub_/i, '')));
      assert.equal(parent.subtasks.length, dbmsTopics.length);
      assert.equal(parent.category, 'Learning');
      assert.equal(parent.subjectCode, dbmsSubject.code);
      assert.equal(parent.sourceTopicIds.length, dbmsTopics.length);
      assert.equal(parent.isDuplicate, false);
    });

    it('creates Individual Tasks blueprints', () => {
      const cmd = parseStudyCommand('Study DBMS topics', 'Asia/Kolkata');
      const blueprints = generateTaskBlueprints({
        mode: 'individual_tasks',
        subject: dbmsSubject,
        unitName: dbmsTopics[0].unit,
        selectedTopics: dbmsTopics,
        command: cmd,
        existingTasks: [],
      });

      assert.equal(blueprints.length, dbmsTopics.length);
      for (let i = 0; i < blueprints.length; i++) {
        const bp = blueprints[i];
        assert.ok(bp.title.includes(dbmsTopics[i].subtopic));
        assert.equal(bp.topicId, dbmsTopics[i].id);
        assert.equal(bp.subjectCode, dbmsSubject.code);
        assert.equal(bp.subtasks.length, 0);
      }
    });

    it('detects duplicate tasks against active task list', () => {
      const existingActiveTask: Task = {
        id: 'tsk_active_1',
        userId: 'test_user_syllabus',
        title: `[DBMS] ${dbmsTopics[0].subtopic}`,
        description: 'Existing task',
        priority: 'medium',
        status: 'todo',
        estimatedPomodoros: 2,
        completedPomodoros: 0,
        dueDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        topicId: dbmsTopics[0].id,
      };

      const dupCheck = checkDuplicateTask(
        `[DBMS] ${dbmsTopics[0].subtopic}`,
        dbmsTopics[0].id,
        dbmsSubject.code,
        [existingActiveTask]
      );
      assert.equal(dupCheck.isDuplicate, true);

      // Completed task should NOT trigger duplicate warning
      const completedTask: Task = {
        ...existingActiveTask,
        status: 'completed',
      };
      const nonDupCheck = checkDuplicateTask(
        `[DBMS] ${dbmsTopics[0].subtopic}`,
        dbmsTopics[0].id,
        dbmsSubject.code,
        [completedTask]
      );
      assert.equal(nonDupCheck.isDuplicate, false);
    });
  });

  describe('4. Task Integration & Study Progress Synchronization', () => {
    it('creates syllabus tasks via createSyllabusTasks', async () => {
      const dbmsSubject = subjects.find((s) => s.code.toLowerCase().includes('dbms'))!;
      const selected = topics.filter((t) => t.subjectCode === dbmsSubject.code).slice(0, 2);
      const cmd = parseStudyCommand('Complete DBMS Unit 1');

      const blueprints = generateTaskBlueprints({
        mode: 'individual_tasks',
        subject: dbmsSubject,
        unitName: selected[0].unit,
        selectedTopics: selected,
        command: cmd,
      });

      const mockCreatedDb: Task[] = [];
      const result = await createSyllabusTasks(blueprints, async (taskInput) => {
        const newTask: Task = {
          id: `tsk_${Date.now()}_${Math.random()}`,
          userId: 'test_user_syllabus',
          title: taskInput.title || '',
          description: taskInput.description || '',
          priority: taskInput.priority || 'medium',
          status: 'todo',
          estimatedPomodoros: taskInput.estimatedPomodoros || 1,
          completedPomodoros: 0,
          dueDate: taskInput.dueDate || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          subjectId: taskInput.subjectId,
          subjectCode: taskInput.subjectCode,
          topicId: taskInput.topicId,
          unit: taskInput.unit,
          subtopicTitle: taskInput.subtopicTitle,
        };
        mockCreatedDb.push(newTask);
        return newTask;
      });

      assert.equal(result.failedCount, 0);
      assert.equal(result.createdTasks.length, 2);
      assert.equal(mockCreatedDb.length, 2);
      assert.equal(mockCreatedDb[0].subjectCode, dbmsSubject.code);
    });

    it('syncs progress to StudyTopic and StudySubject when a task is completed', async () => {
      const testSubject: StudySubject = {
        id: 'sub_test_1',
        userId: 'test_user_syllabus',
        code: 'Sub_TEST',
        name: 'Test Subject',
        tierId: 'tier1',
        totalSubtopics: 5,
        completedSubtopics: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const testTopic: StudyTopic = {
        id: 'top_test_1',
        userId: 'test_user_syllabus',
        subjectCode: 'Sub_TEST',
        unit: 'Unit 1',
        topic: 'Relational Calculus',
        subtopic: 'Tuple Relational Calculus',
        priority: 'High',
        theory: false,
        practice: false,
        pyq: false,
        revisionCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const completedTask: Task = {
        id: 'tsk_101',
        userId: 'test_user_syllabus',
        title: '[TEST] Tuple Relational Calculus',
        description: 'Complete TRC',
        priority: 'high',
        status: 'completed',
        estimatedPomodoros: 2,
        completedPomodoros: 2,
        dueDate: '2026-11-28',
        topicId: testTopic.id,
        subjectCode: testSubject.code,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      let savedTopic: Partial<StudyTopic> | null = null;
      let savedSubject: Partial<StudySubject> | null = null;

      const progressResult = await syncStudyProgressFromTask(
        completedTask,
        [testTopic],
        [testSubject],
        async (topic) => {
          savedTopic = topic;
          return topic as StudyTopic;
        },
        async (subj) => {
          savedSubject = subj;
          return subj as StudySubject;
        }
      );

      assert.equal(progressResult.updatedTopicIds.length, 1);
      assert.equal(progressResult.updatedTopicIds[0], testTopic.id);
      assert.ok(savedTopic);
      assert.equal((savedTopic as any).theory, true);
      assert.equal((savedTopic as any).practice, true);

      assert.ok(savedSubject);
      assert.equal((savedSubject as any).completedSubtopics, 2, 'Subject completed subtopics should increment from 1 to 2');
    });

    it('is idempotent: does not double count if topic is already completed', async () => {
      const testSubject: StudySubject = {
        id: 'sub_test_2',
        userId: 'test_user_syllabus',
        code: 'Sub_TEST2',
        name: 'Test Subject 2',
        tierId: 'tier1',
        totalSubtopics: 5,
        completedSubtopics: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Already completed topic
      const alreadyDoneTopic: StudyTopic = {
        id: 'top_test_2',
        userId: 'test_user_syllabus',
        subjectCode: 'Sub_TEST2',
        unit: 'Unit 1',
        topic: 'Relational Algebra',
        subtopic: 'Projection & Selection',
        priority: 'High',
        theory: true,
        practice: true,
        pyq: false,
        revisionCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const task: Task = {
        id: 'tsk_102',
        userId: 'test_user_syllabus',
        title: '[TEST2] Projection & Selection',
        description: 'Complete PA',
        priority: 'medium',
        status: 'completed',
        estimatedPomodoros: 1,
        completedPomodoros: 1,
        dueDate: null,
        topicId: alreadyDoneTopic.id,
        subjectCode: testSubject.code,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      let subjectUpdateCount = 0;
      const progressResult = await syncStudyProgressFromTask(
        task,
        [alreadyDoneTopic],
        [testSubject],
        async (t) => t as StudyTopic,
        async (s) => {
          subjectUpdateCount++;
          return s as StudySubject;
        }
      );

      assert.equal(progressResult.updatedTopicIds.length, 0);
      assert.equal(subjectUpdateCount, 0, 'Should not increment subject stats again');
    });

    it('syncs parent task subtask completion to corresponding StudyTopic', async () => {
      const testSubject: StudySubject = {
        id: 'sub_test_3',
        userId: 'test_user_syllabus',
        code: 'Sub_OS',
        name: 'Operating Systems',
        tierId: 'tier1',
        totalSubtopics: 10,
        completedSubtopics: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const topicA: StudyTopic = {
        id: 'top_os_1',
        userId: 'test_user_syllabus',
        subjectCode: 'Sub_OS',
        unit: 'Unit 2',
        topic: 'Deadlocks',
        subtopic: "Banker's Algorithm",
        priority: 'High',
        theory: false,
        practice: false,
        pyq: false,
        revisionCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const topicB: StudyTopic = {
        id: 'top_os_2',
        userId: 'test_user_syllabus',
        subjectCode: 'Sub_OS',
        unit: 'Unit 2',
        topic: 'Deadlocks',
        subtopic: 'Resource Allocation Graph',
        priority: 'High',
        theory: false,
        practice: false,
        pyq: false,
        revisionCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Parent task with 2 subtasks, only topicA is checked done
      const parentTask: Task = {
        id: 'tsk_parent_1',
        userId: 'test_user_syllabus',
        title: '[OS] Unit 2: Deadlocks',
        description: 'Deadlock algorithms',
        priority: 'high',
        status: 'in_progress',
        estimatedPomodoros: 4,
        completedPomodoros: 2,
        dueDate: '2026-11-30',
        subjectCode: 'Sub_OS',
        subtasks: [
          { id: 'sub_1', title: "Banker's Algorithm", done: true },
          { id: 'sub_2', title: 'Resource Allocation Graph', done: false },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const updatedTopics: string[] = [];
      const result = await syncStudyProgressFromTask(
        parentTask,
        [topicA, topicB],
        [testSubject],
        async (t) => {
          updatedTopics.push(t.id!);
          return t as StudyTopic;
        },
        async (s) => s as StudySubject
      );

      assert.equal(result.updatedTopicIds.length, 1);
      assert.equal(result.updatedTopicIds[0], topicA.id);
      assert.equal(updatedTopics.includes(topicA.id), true);
      assert.equal(updatedTopics.includes(topicB.id), false);
    });
  });
});
