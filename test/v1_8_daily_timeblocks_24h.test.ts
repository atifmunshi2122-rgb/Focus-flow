import './test_bootstrap.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('DailyTimeBlockPlanner — 24-Hour Timeline Completeness', () => {
  const filePath = path.resolve('src/components/focus/DailyTimeBlockPlanner.tsx');
  const source = fs.readFileSync(filePath, 'utf8');

  // Verify timelineHours definition spans full 24 hours (0 to 23)
  assert.match(
    source,
    /Array\.from\(\{\s*length:\s*24\s*\}\s*,\s*\(_,\s*i\)\s*=>\s*i\)/,
    'DailyTimeBlockPlanner must generate all 24 hours (0 to 23)'
  );

  // Verify late night end-time handling does not break on 23:00
  assert.match(
    source,
    /h\s*>=\s*23\s*\?\s*23\s*:\s*h\s*\+\s*1/,
    'openCreateModal must safely handle 23:00 end-hour cap'
  );

  assert.match(
    source,
    /h\s*>=\s*23\s*\?\s*59\s*:\s*m/,
    'openCreateModal must set minute to 59 when starting at 23:00'
  );
});
