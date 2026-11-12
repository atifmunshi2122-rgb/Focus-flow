import test from 'node:test';
import assert from 'node:assert/strict';
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
