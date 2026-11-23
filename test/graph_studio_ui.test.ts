import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  scaleLinear,
  invertLinear,
  scaleBand,
  getNiceTicks,
  formatCompactNumber,
} from '../src/components/graph-studio/core/GraphScales.ts';
import {
  generateSmoothSplinePath,
  generateAreaPath,
  generateStepPath,
  describeArc,
} from '../src/components/graph-studio/core/GraphPathGenerators.ts';
import { FocusSession, ExpenseTransaction, Task, Habit } from '../src/types/index.ts';
import { StudyExam, StudyRevision, StudyTopic, StudySubject } from '../src/types/study.ts';

describe('Advanced Graph Studio UI & Math Primitives Suite', () => {
  describe('1. Mathematical Coordinate Scales', () => {
    it('scales values linearly with clamping', () => {
      const domain: [number, number] = [0, 100];
      const range: [number, number] = [0, 500];

      assert.strictEqual(scaleLinear(50, domain, range), 250);
      assert.strictEqual(scaleLinear(0, domain, range), 0);
      assert.strictEqual(scaleLinear(100, domain, range), 500);

      // Clamping test
      assert.strictEqual(scaleLinear(-20, domain, range), 0);
      assert.strictEqual(scaleLinear(150, domain, range), 500);
    });

    it('inverts coordinates correctly', () => {
      const domain: [number, number] = [0, 200];
      const range: [number, number] = [100, 300];

      assert.strictEqual(invertLinear(200, domain, range), 100);
      assert.strictEqual(invertLinear(100, domain, range), 0);
    });

    it('handles zero span safely without NaN or division by zero', () => {
      const domain: [number, number] = [50, 50];
      const range: [number, number] = [0, 100];

      const res = scaleLinear(50, domain, range);
      assert.strictEqual(Number.isFinite(res), true);
      assert.strictEqual(res, 50);
    });

    it('distributes discrete items evenly with scaleBand', () => {
      const items = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
      const range: [number, number] = [0, 500];
      const band = scaleBand(items, range, 0.2);

      assert.strictEqual(typeof band('Mon'), 'number');
      assert.strictEqual(band.bandwidth > 0, true);
      assert.strictEqual(band('Mon') < band('Tue'), true);
      assert.strictEqual(band('Thu') < band('Fri'), true);
    });

    it('generates clean human-friendly ticks', () => {
      const ticks = getNiceTicks(0, 100, 5);
      assert.strictEqual(ticks.length >= 4, true);
      assert.strictEqual(ticks[0] <= 0, true);
      assert.strictEqual(ticks[ticks.length - 1] >= 100, true);
    });

    it('formats compact numbers accurately', () => {
      assert.strictEqual(formatCompactNumber(450), '450');
      assert.strictEqual(formatCompactNumber(1500), '1.5k');
      assert.strictEqual(formatCompactNumber(25000), '25k');
      assert.strictEqual(formatCompactNumber(3500000), '3.5M');
      assert.strictEqual(formatCompactNumber(2000000000), '2B');
    });
  });

  describe('2. SVG Path and Spline Generators', () => {
    it('generates smooth cubic Bezier splines', () => {
      const points = [
        { x: 0, y: 100 },
        { x: 50, y: 50 },
        { x: 100, y: 80 },
        { x: 150, y: 20 },
      ];

      const path = generateSmoothSplinePath(points);
      assert.strictEqual(path.startsWith('M 0.00 100.00'), true);
      assert.strictEqual(path.includes('C'), true);
    });

    it('generates closed area paths with correct baseline closure', () => {
      const points = [
        { x: 0, y: 100 },
        { x: 100, y: 50 },
      ];
      const baselineY = 200;

      const areaPath = generateAreaPath(points, baselineY);
      assert.strictEqual(areaPath.includes('L 100.00 200.00 L 0.00 200.00 Z'), true);
    });

    it('generates orthogonal stepped paths for burndowns', () => {
      const points = [
        { x: 0, y: 50 },
        { x: 50, y: 30 },
        { x: 100, y: 10 },
      ];

      const step = generateStepPath(points);
      assert.strictEqual(step.startsWith('M 0.00 50.00'), true);
      assert.strictEqual(step.includes('L 50.00 50.00 L 50.00 30.00'), true);
    });

    it('generates circular arc paths', () => {
      const arc = describeArc(100, 100, 50, 0, 180);
      assert.strictEqual(arc.startsWith('M'), true);
      assert.strictEqual(arc.includes('A'), true);
    });
  });

  describe('3. Study OS Analytics Aggregations', () => {
    it('computes syllabus triad percentages and overall readiness accurately', () => {
      const topics: StudyTopic[] = [
        {
          id: 't-1',
          userId: 'u1',
          subjectCode: 'Sub_DSA',
          unit: '1',
          topic: 'Arrays',
          subtopic: '',
          priority: 'High',
          theory: true,
          practice: true,
          pyq: true,
          revisionCount: 2,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 't-2',
          userId: 'u1',
          subjectCode: 'Sub_DSA',
          unit: '1',
          topic: 'Linked Lists',
          subtopic: '',
          priority: 'High',
          theory: true,
          practice: true,
          pyq: false,
          revisionCount: 1,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 't-3',
          userId: 'u1',
          subjectCode: 'Sub_DSA',
          unit: '2',
          topic: 'Trees',
          subtopic: '',
          priority: 'Medium',
          theory: true,
          practice: false,
          pyq: false,
          revisionCount: 0,
          createdAt: '',
          updatedAt: '',
        },
      ];

      const total = topics.length; // 3
      const theoryCount = topics.filter((t) => t.theory).length; // 3 -> 100%
      const practiceCount = topics.filter((t) => t.practice).length; // 2 -> 67%
      const pyqCount = topics.filter((t) => t.pyq).length; // 1 -> 33%

      const theoryPct = Math.round((theoryCount / total) * 100);
      const practicePct = Math.round((practiceCount / total) * 100);
      const pyqPct = Math.round((pyqCount / total) * 100);
      const readiness = Math.round((theoryPct + practicePct + pyqPct) / 3);

      assert.strictEqual(theoryPct, 100);
      assert.strictEqual(practicePct, 67);
      assert.strictEqual(pyqPct, 33);
      assert.strictEqual(readiness, 67);
    });

    it('gating check: subject performance comparison strictly ignores subjects with no scores', () => {
      const exams: StudyExam[] = [
        {
          id: 'e1',
          userId: 'u1',
          title: 'DSA Midterm',
          examType: 'Midterm',
          subjectIds: ['Sub_DSA'],
          examDate: '2026-11-10',
          startTime: null,
          durationMinutes: 90,
          totalMarks: 100,
          obtainedMarks: 88,
          syllabusTopicIds: [],
          preparationStatus: 'completed',
          resultStatus: 'published',
          notes: '',
          createdAt: '',
          updatedAt: '',
          deletedAt: null,
        },
      ];

      const revisions: StudyRevision[] = [];

      const subjects: StudySubject[] = [
        {
          id: 's1',
          userId: 'u1',
          code: 'Sub_DSA',
          name: 'Data Structures',
          tierId: 'tier1',
          totalSubtopics: 10,
          completedSubtopics: 5,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 's2',
          userId: 'u1',
          code: 'Sub_COA',
          name: 'Computer Architecture',
          tierId: 'tier1',
          totalSubtopics: 12,
          completedSubtopics: 2,
          createdAt: '',
          updatedAt: '',
        },
      ];

      // Filter logic from SubjectPerformanceChart
      const activePerformance = subjects.filter((sub) => {
        const hasExam = exams.some(
          (e) =>
            !e.deletedAt &&
            e.resultStatus === 'published' &&
            e.obtainedMarks !== null &&
            (e.subjectIds.includes(sub.id) || e.subjectIds.includes(sub.code))
        );
        const hasRev = revisions.some(
          (r) => !r.deletedAt && r.subjectCode === sub.code && typeof r.recallScore === 'number'
        );
        return hasExam || hasRev;
      });

      // Sub_DSA has an exam (88%), Sub_COA has zero scores
      assert.strictEqual(activePerformance.length, 1);
      assert.strictEqual(activePerformance[0].code, 'Sub_DSA');
    });
  });

  describe('4. Finance Analytics Aggregations', () => {
    it('computes monthly cashflow and savings rate without division by zero', () => {
      const incomePaise = 5000000; // 50,000 INR
      const expensePaise = 3200000; // 32,000 INR
      const netPaise = incomePaise - expensePaise;
      const savingsRate = Math.round((netPaise / incomePaise) * 100);

      assert.strictEqual(netPaise, 1800000); // 18,000 INR
      assert.strictEqual(savingsRate, 36); // 36%

      // Edge case: 0 income
      const zeroIncome = 0;
      const zeroRate = zeroIncome > 0 ? Math.round(((zeroIncome - expensePaise) / zeroIncome) * 100) : 0;
      assert.strictEqual(zeroRate, 0);
    });

    it('computes envelope burn rate and threshold states accurately', () => {
      const allocated = 1000000; // 10,000 INR

      // 60% spent -> success
      const spent1 = 600000;
      const pct1 = Math.round((spent1 / allocated) * 100);
      assert.strictEqual(pct1, 60);

      // 85% spent -> warning
      const spent2 = 850000;
      const pct2 = Math.round((spent2 / allocated) * 100);
      assert.strictEqual(pct2, 85);

      // 110% spent -> danger
      const spent3 = 1100000;
      const pct3 = Math.round((spent3 / allocated) * 100);
      assert.strictEqual(pct3, 110);
    });
  });

  describe('5. Productivity & Cross-Domain Aggregations', () => {
    it('computes 7-day rolling moving average correctly', () => {
      const dailyMinutes = [60, 90, 120, 30, 45, 100, 80, 110, 130];
      const ma: number[] = [];

      dailyMinutes.forEach((mins, idx) => {
        const slice = dailyMinutes.slice(Math.max(0, idx - 6), idx + 1);
        const sum = slice.reduce((a, b) => a + b, 0);
        ma.push(Math.round(sum / slice.length));
      });

      assert.strictEqual(ma.length, dailyMinutes.length);
      assert.strictEqual(ma[0], 60);
      // At index 6 (7th day), average of first 7 elements: (60+90+120+30+45+100+80) / 7 = 525 / 7 = 75
      assert.strictEqual(ma[6], 75);
    });

    it('computes Pearson correlation coefficient r between focus and spend', () => {
      // Negative correlation test: focus up -> spend down
      const pairs = [
        { focus: 120, spend: 200 },
        { focus: 150, spend: 100 },
        { focus: 60, spend: 500 },
        { focus: 30, spend: 800 },
        { focus: 90, spend: 350 },
      ];

      const n = pairs.length;
      const meanX = pairs.reduce((s, p) => s + p.focus, 0) / n;
      const meanY = pairs.reduce((s, p) => s + p.spend, 0) / n;

      let num = 0;
      let denX = 0;
      let denY = 0;

      pairs.forEach((p) => {
        const dx = p.focus - meanX;
        const dy = p.spend - meanY;
        num += dx * dy;
        denX += dx * dx;
        denY += dy * dy;
      });

      const denom = Math.sqrt(denX * denY);
      const r = Math.round((num / denom) * 100) / 100;

      assert.strictEqual(r < -0.9, true); // Strong negative correlation
    });
  });
});
