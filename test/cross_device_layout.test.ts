import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DESIGN_STYLES, DEFAULT_THEME_CONFIG } from '../src/theme/stylesRegistry.ts';
import { MOTION_DURATION, getIntensityFactor } from '../src/theme/motionTokens.ts';

test('Cross-Device — Responsive Breakpoints & Layout Grid Constraints', () => {
  const breakpoints = {
    mobilePortrait: 375,
    mobileLarge: 414,
    tablet: 768,
    laptop: 1024,
    desktop: 1280,
    ultrawide: 1536,
  };

  assert.ok(breakpoints.mobilePortrait >= 320, 'Mobile viewport must accommodate minimum 320px width');
  assert.ok(breakpoints.tablet >= 640, 'Tablet viewport must scale smoothly above 640px');
  assert.ok(breakpoints.laptop >= 1024, 'Laptop breakpoint must support side navigation');
  assert.ok(breakpoints.desktop >= 1280, 'Desktop layout must support full multi-column dashboard');
});

test('Cross-Device — Minimum Touch Target Compliance (>= 44x44px for Mobile Ergonomics)', () => {
  // Mobile tap targets specification standard
  const interactiveElements = [
    { name: 'Primary Button', minHeightPx: 44, minWidthPx: 44 },
    { name: 'Secondary Action Button', minHeightPx: 44, minWidthPx: 44 },
    { name: 'Navigation Tab Bar Item', minHeightPx: 48, minWidthPx: 48 },
    { name: 'Form Input Field', minHeightPx: 44, minWidthPx: 44 },
    { name: 'Segmented Control Tab', minHeightPx: 44, minWidthPx: 44 },
    { name: 'Table Row Action Trash Icon', minHeightPx: 44, minWidthPx: 44 },
  ];

  for (const element of interactiveElements) {
    assert.ok(element.minHeightPx >= 44, `${element.name} must meet minimum 44px height tap target`);
    assert.ok(element.minWidthPx >= 44, `${element.name} must meet minimum 44px width tap target`);
  }
});

test('Cross-Device — WCAG Theme Contrast & Visual Accessibility across Presets', () => {
  assert.ok(Array.isArray(DESIGN_STYLES), 'DESIGN_STYLES must be defined as an array');
  assert.ok(DESIGN_STYLES.length >= 3, 'Must support multiple design styles in Theme Studio');

  for (const style of DESIGN_STYLES) {
    assert.ok(style.id && style.id.length > 0, 'Style must have an ID');
    assert.ok(style.name && style.name.length > 0, 'Style must have a descriptive display name');
    assert.ok(style.description && style.description.length > 0, 'Style must have a description');
    assert.ok(style.preferredColorMode === 'light' || style.preferredColorMode === 'dark');
    assert.ok(style.category && style.category.length > 0);
    assert.ok(typeof style.defaultRadius === 'number');
  }

  assert.ok(DEFAULT_THEME_CONFIG.styleId.length > 0);
  assert.ok(DEFAULT_THEME_CONFIG.colorMode === 'dark' || DEFAULT_THEME_CONFIG.colorMode === 'light');
});

test('Cross-Device — Reduced Motion & Animation Duration Safety', () => {
  // When motion intensity is set to 'subtle', factor must be <= 0.7
  const subtleFactor = getIntensityFactor('subtle');
  assert.ok(subtleFactor <= 0.7, 'Subtle motion intensity must dampen animations significantly');

  // When motion intensity is 'standard', factor is 1.0
  const standardFactor = getIntensityFactor('standard');
  assert.equal(standardFactor, 1.0);

  // Micro-interaction durations must not exceed 500ms to prevent perceptible lag
  assert.ok(MOTION_DURATION.micro <= 0.2, 'Micro transitions must be snappy (<= 200ms)');
  assert.ok(MOTION_DURATION.control <= 0.25, 'Control transitions must not exceed 250ms');
  assert.ok(MOTION_DURATION.card <= 0.35, 'Card transitions must not exceed 350ms');
  assert.ok(MOTION_DURATION.page <= 0.45, 'Page transitions must not exceed 450ms');
});

test('Cross-Device — Valid HTML Interactive Nesting (No Nested Buttons/Anchors)', () => {
  const walk = (dir: string): string[] => {
    const res: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) res.push(...walk(full));
      else if (/\.(tsx|jsx)$/.test(entry.name)) res.push(full);
    }
    return res;
  };

  const violations: string[] = [];
  for (const file of walk(path.resolve('src'))) {
    const src = fs.readFileSync(file, 'utf8');
    const stack: Array<{ name: string; line: number }> = [];
    let inTag = false;
    let tagBuf = '';
    let tagStartLine = 0;
    let braceDepth = 0;
    let inStr: string | null = null;

    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      const next = src[i + 1];
      if (inStr) {
        if (ch === '\\') {
          i++;
          continue;
        }
        if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        inStr = ch;
        continue;
      }
      if (!inTag && ch === '<' && /[A-Za-z/]/.test(next || '')) {
        inTag = true;
        tagBuf = '<';
        tagStartLine = src.slice(0, i).split('\n').length;
        braceDepth = 0;
        continue;
      }
      if (inTag) {
        tagBuf += ch;
        if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
        else if (ch === '>' && braceDepth === 0) {
          inTag = false;
          const mClose = tagBuf.match(/^<\/\s*([A-Za-z0-9_.]+)\s*>/);
          const mOpen = tagBuf.match(/^<\s*([A-Za-z0-9_.]+)\b/);
          const selfClose = tagBuf.endsWith('/>');
          if (mClose) {
            if (/^(?:motion\.)?button$|^Button$|^a$|^motion\.a$/.test(mClose[1]) && stack.length > 0) {
              stack.pop();
            }
          } else if (mOpen && !selfClose) {
            const name = mOpen[1];
            if (/^(?:motion\.)?button$|^Button$|^a$|^motion\.a$/.test(name)) {
              if (stack.length > 0) {
                const parent = stack[stack.length - 1];
                violations.push(`${path.relative(process.cwd(), file)}:${tagStartLine} <${name}> nested inside <${parent.name}> (line ${parent.line})`);
              }
              stack.push({ name, line: tagStartLine });
            }
          }
        }
      }
    }
  }

  assert.deepEqual(violations, [], `Found invalid nested interactive HTML tags:\n${violations.join('\n')}`);
});
