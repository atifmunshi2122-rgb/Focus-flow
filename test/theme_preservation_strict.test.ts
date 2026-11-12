import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESIGN_STYLES,
  ACCENT_PRESETS,
  BACKGROUND_GRADIENT_PRESETS,
  FONT_PAIRINGS,
  getStyleDefinition,
  getFontPairing,
} from '../src/theme/stylesRegistry.ts';
import { sanitizeThemeConfig, buildThemeCssVariables } from '../src/theme/themeEngine.ts';
import { CURATED_PALETTES } from '../src/theme/palettes100.ts';
import type { DesignStyleId } from '../src/types/theme.ts';

test('Theme Preservation — Strict Non-Negotiable Inventory Verification', () => {
  // 1. Verify exactly 19 design styles exist and none have been deleted
  assert.equal(DESIGN_STYLES.length, 19, 'Must retain all 19 design styles');

  const expectedStyleIds: DesignStyleId[] = [
    'glassmorphism',
    'claymorphism',
    'skeuomorphism',
    'neumorphism',
    'minimalism',
    'brutalism',
    'cyberpunk',
    'gradient3d',
    'material',
    'flat',
    'fluent',
    'editorial',
    'retro',
    'oled',
    'pastel',
    'aurora',
    'glazed_clay',
    'cyber_glass',
    'soft_glass',
  ];

  for (const id of expectedStyleIds) {
    const style = getStyleDefinition(id);
    assert.ok(style, `Design style "${id}" must exist`);
    assert.equal(style.id, id);
    assert.ok(style.name && style.name.length > 0);
    assert.ok(style.light.bgCanvas, `Style "${id}" must define light bgCanvas`);
    assert.ok(style.dark.bgCanvas, `Style "${id}" must define dark bgCanvas`);
    assert.ok(style.light.textPrimary, `Style "${id}" must define light textPrimary`);
    assert.ok(style.dark.textPrimary, `Style "${id}" must define dark textPrimary`);
  }

  // 2. Verify all 10 Accent Presets exist
  assert.equal(ACCENT_PRESETS.length, 10, 'Must retain all 10 accent presets');
  for (const acc of ACCENT_PRESETS) {
    assert.ok(acc.name);
    assert.ok(acc.primary && acc.primary.startsWith('#'));
    assert.ok(acc.secondary && acc.secondary.startsWith('#'));
  }

  // 3. Verify all 8 Font Pairings exist
  assert.equal(FONT_PAIRINGS.length, 8, 'Must retain all 8 font pairings');
  for (const fp of FONT_PAIRINGS) {
    assert.ok(fp.id);
    assert.ok(fp.name);
    assert.ok(fp.displayFont);
    assert.ok(fp.bodyFont);
  }

  // 4. Verify all 7 Background Gradient Presets exist
  assert.equal(BACKGROUND_GRADIENT_PRESETS.length, 7, 'Must retain all 7 gradient presets');
  for (const bg of BACKGROUND_GRADIENT_PRESETS) {
    assert.ok(bg.id);
    assert.ok(bg.name);
    assert.ok(bg.previewSwatch);
    if (bg.id !== 'auto') {
      assert.ok(bg.darkCss && bg.darkCss.length > 0);
      assert.ok(bg.lightCss && bg.lightCss.length > 0);
    }
  }

  // 5. Verify all 100 Curated Palettes in palettes100 exist
  assert.equal(CURATED_PALETTES.length, 100, 'Must retain all 100 curated palettes in Theme Studio');
});

test('Theme Engine — CSS Variables Generation and Subtle Surface Token', () => {
  const cfg = sanitizeThemeConfig({ styleId: 'glassmorphism', colorMode: 'dark' });
  const vars = buildThemeCssVariables(cfg, 'dark');

  // Verify core semantic surface tokens exist
  assert.ok(vars['--ff-bg-canvas']);
  assert.ok(vars['--ff-surface-card']);
  assert.ok(vars['--ff-surface-subtle'], '--ff-surface-subtle must be generated for all themes');
  assert.ok(vars['--ff-surface-elevated']);
  assert.ok(vars['--ff-surface-muted']);
  assert.ok(vars['--ff-accent']);
  assert.ok(vars['--ff-accent-contrast']);

  // Verify light mode also generates proper variables
  const lightVars = buildThemeCssVariables(cfg, 'light');
  assert.ok(lightVars['--ff-surface-subtle']);
  assert.notEqual(lightVars['--ff-bg-canvas'], vars['--ff-bg-canvas']);
});
