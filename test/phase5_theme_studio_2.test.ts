import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPLETE_THEME_COLLECTION, getPresetThemeById } from '../src/theme/presetThemes.ts';
import { buildThemeCssVariables, sanitizeThemeConfig } from '../src/theme/themeEngine.ts';
import { getAccessibleContrastText, getContrastRatio, normalizeHex } from '../src/theme/colorUtils.ts';
import {
  getIntensityFactor,
  getPageTransition,
  getSpringTransition,
  MOTION_DURATION,
} from '../src/theme/motionTokens.ts';
import { ThemeConfig } from '../src/types/theme.ts';

test('Phase 5 — Theme Studio 2.0: Exact 20 Signature Themes Collection Integrity', () => {
  assert.equal(
    COMPLETE_THEME_COLLECTION.length,
    20,
    'COMPLETE_THEME_COLLECTION must contain exactly 20 distinct signature themes'
  );

  const expectedNames = [
    'Glassmorphism',
    'Liquid Glass',
    'Claymorphism',
    'Neumorphism',
    'Skeuomorphism',
    'Aurora',
    'Cyberpunk',
    'Midnight Dark',
    'Minimal Light',
    'Soft Pastel',
    'AMOLED Black',
    'Ocean Blue',
    'Sunset Gradient',
    'Lavender Dream',
    'Emerald Forest',
    'Luxury Gold',
    'Frosted Crystal',
    'Holographic',
    'Material Design',
    'Soft 3D',
  ];

  const presentNames = COMPLETE_THEME_COLLECTION.map((t) => t.name);
  for (const name of expectedNames) {
    assert.ok(
      presentNames.includes(name),
      `Signature theme "${name}" must be present in COMPLETE_THEME_COLLECTION`
    );
  }

  // Ensure unique IDs
  const ids = new Set<string>();
  for (const theme of COMPLETE_THEME_COLLECTION) {
    assert.ok(!ids.has(theme.id), `Theme ID "${theme.id}" must be unique`);
    ids.add(theme.id);

    // Validate theme configuration completeness
    assert.ok(theme.id.length > 0, 'Theme ID cannot be empty');
    assert.ok(theme.name.length > 0, 'Theme name cannot be empty');
    assert.ok(theme.description.length > 0, 'Theme description cannot be empty');
    assert.ok(theme.category.length > 0, 'Theme category cannot be empty');
    assert.equal(theme.previewColors.length, 4, 'Theme must define 4 preview color swatches');

    const cfg = theme.config;
    assert.ok(cfg.styleId, 'ThemeConfig must have valid styleId');
    assert.ok(['light', 'dark', 'system'].includes(cfg.colorMode), 'Valid colorMode required');
    assert.ok(
      ['none', 'subtle', 'standard', 'expressive'].includes(cfg.animationIntensity),
      'Valid animationIntensity required'
    );
    assert.ok(
      ['compact', 'comfortable', 'spacious'].includes(cfg.density),
      'Valid density required'
    );

    // Test getPresetThemeById
    const fetched = getPresetThemeById(theme.id);
    assert.ok(fetched, `getPresetThemeById must resolve theme with id "${theme.id}"`);
    assert.equal(fetched?.id, theme.id);
  }

  // Unknown theme resolution
  const unknown = getPresetThemeById('non-existent-theme-xyz');
  assert.equal(unknown, undefined);
});

test('Phase 5 — Theme Studio 2.0: 3D Lighting & Physics CSS Variable Generation', () => {
  const customConfig: ThemeConfig = {
    styleId: 'glassmorphism',
    colorMode: 'dark',
    accentColor: '#6366f1',
    secondaryAccentColor: '#a855f7',
    fontPairing: 'jakarta',
    fontScale: 'default',
    cardRadius: 18,
    shadowIntensity: 'elevated',
    backgroundMode: 'aurora',
    customGradient: null,
    animationIntensity: 'standard',
    density: 'comfortable',
    threeDLighting: {
      ambientLightColor: '#8b5cf6',
      ambientLightIntensity: 65,
      glowColor: '#38bdf8',
      glowIntensity: 80,
      cardElevation: 20,
      glassBlur: 24,
      glassOpacity: 0.75,
      depthIntensity: 90,
    },
  };

  const cssVars = buildThemeCssVariables(customConfig, 'dark');

  // Verify core theme tokens
  assert.ok(cssVars['--ff-bg-canvas'], 'Must define --ff-bg-canvas');
  assert.ok(cssVars['--ff-surface-card'], 'Must define --ff-surface-card');
  assert.equal(cssVars['--ff-radius-card'], '18px', 'Radius must match cardRadius override');
  assert.ok(cssVars['--ff-accent'].toLowerCase().includes('6366f1'), 'Accent color must match override');

  // Verify 3D lighting tokens
  assert.equal(cssVars['--ff-ambient-light'], '#8b5cf6', 'Ambient light tint must match override');
  assert.equal(cssVars['--ff-card-elevation'], '20px', 'Card elevation must match override');
  assert.equal(cssVars['--ff-glass-blur'], '24px', 'Glass blur must match override');
  assert.equal(cssVars['--ff-glass-opacity'], '0.75', 'Glass opacity must match override');
  assert.equal(cssVars['--ff-depth-intensity'], '90%', 'Depth intensity must match override');
});

test('Phase 5 — Theme Studio 2.0: Color Customization & Accessible Contrast Verification', () => {
  // Test hex normalization
  assert.equal(normalizeHex('#fff'), '#ffffff');
  assert.equal(normalizeHex('#000'), '#000000');
  assert.equal(normalizeHex('6366f1'), '#6366f1');
  assert.equal(normalizeHex('invalid'), null);

  // Test accessible contrast calculation
  const lightBg = '#ffffff';
  const darkBg = '#0f172a';
  const lightContrast = getContrastRatio(lightBg, '#000000');
  const darkContrast = getContrastRatio(darkBg, '#ffffff');

  assert.ok(lightContrast >= 7.0, 'Black on white must achieve AAA contrast (>= 7:1)');
  assert.ok(darkContrast >= 7.0, 'White on dark slate must achieve AAA contrast (>= 7:1)');

  const vibrantAccent = '#f59e0b'; // Amber 500
  const accessibleText = getAccessibleContrastText(vibrantAccent);
  const ratio = getContrastRatio(vibrantAccent, accessibleText);
  assert.ok(ratio >= 4.5, `Accessible text on accent must meet WCAG AA (>= 4.5:1), got ${ratio}`);
});

test('Phase 5 — Theme Studio 2.0: Animation Kinetics & Zero-Motion Safety', () => {
  // Intensity factors
  assert.equal(getIntensityFactor('none'), 0);
  assert.equal(getIntensityFactor('subtle'), 0.65);
  assert.equal(getIntensityFactor('standard'), 1);
  assert.equal(getIntensityFactor('expressive'), 1.25);

  // Zero-motion (reduced-motion) safety
  const zeroTransition = getSpringTransition('none', false);
  assert.equal(zeroTransition.duration, 0, 'Zero motion must have 0s duration');

  const osReducedTransition = getSpringTransition('expressive', true);
  assert.equal(osReducedTransition.duration, 0, 'OS reduced motion flag must force 0s duration');

  const zeroPageTransition = getPageTransition('none', false);
  const initial = zeroPageTransition.initial as Record<string, unknown>;
  const animate = zeroPageTransition.animate as Record<string, unknown>;
  const exit = zeroPageTransition.exit as Record<string, unknown>;
  assert.equal(initial.opacity, 1, 'Zero motion page transition should be instant');
  assert.equal(animate.opacity, 1);
  assert.equal(exit.opacity, 1);

  // Standard durations
  assert.ok(MOTION_DURATION.micro <= 0.2);
  assert.ok(MOTION_DURATION.control <= 0.25);
  assert.ok(MOTION_DURATION.card <= 0.35);
  assert.ok(MOTION_DURATION.page <= 0.45);
});

test('Phase 5 — Theme Studio 2.0: Theme Config Sanitization & Schema Resilience', () => {
  // Test sanitization against dirty or malformed inputs
  const malformed = {
    styleId: 'non-existent-style',
    colorMode: 'invalid-mode',
    accentColor: 'not-a-color',
    cardRadius: 9999,
    shadowIntensity: 'crazy-shadow',
    animationIntensity: 'super-fast',
    density: 'ultra-wide',
  } as unknown as Partial<ThemeConfig>;

  const sanitized = sanitizeThemeConfig(malformed);
  assert.equal(sanitized.styleId, 'minimalism', 'Invalid styleId falls back to default style');
  assert.equal(sanitized.colorMode, 'dark', 'Invalid colorMode falls back safely');
  assert.equal(sanitized.cardRadius, 32, 'Excessive radius clamps to 32px max');
  assert.equal(sanitized.shadowIntensity, 'auto', 'Invalid shadow falls back to auto');
  assert.equal(sanitized.animationIntensity, 'standard', 'Invalid animation falls back to standard');
  assert.equal(sanitized.density, 'comfortable', 'Invalid density falls back to comfortable');
});
