import { CuratedPalette, ColorPaletteCategory } from '../types/theme.ts';

export const PALETTE_CATEGORIES: Array<{
  id: ColorPaletteCategory;
  label: string;
  iconName: string;
  description: string;
}> = [
  { id: 'dark-luxury', label: 'Dark Luxury', iconName: 'Crown', description: 'Deep velvet, obsidian & sovereign gold' },
  { id: 'light-minimal', label: 'Light Minimal', iconName: 'Sun', description: 'Swiss architectural hairlines & clean space' },
  { id: 'pastel', label: 'Pastel', iconName: 'Heart', description: 'Dreamy lavender, macaron blush & matcha mint' },
  { id: 'neon', label: 'Neon', iconName: 'Zap', description: 'High-voltage electric pulses on midnight' },
  { id: 'cyberpunk', label: 'Cyberpunk', iconName: 'Terminal', description: 'Tech-noir telemetry, cyan HUD & magenta wire' },
  { id: 'glassmorphism', label: 'Glassmorphism', iconName: 'Layers', description: 'Frosted crystalline panes with luminous depth' },
  { id: 'claymorphism', label: 'Claymorphism', iconName: 'Smile', description: 'Chunky 3D inflated pillowy clay forms' },
  { id: 'neumorphism', label: 'Neumorphism', iconName: 'Box', description: 'Extruded monolithic soft relief controls' },
  { id: 'skeuomorphism', label: 'Skeuomorphism', iconName: 'Gauge', description: 'Tactile brushed metallic bezels & instrument dials' },
  { id: 'aurora', label: 'Aurora', iconName: 'Sparkles', description: 'Northern lights mesh & atmospheric emerald/violet' },
  { id: 'gradient', label: 'Gradient', iconName: 'Palette', description: 'Multi-stop directional flow & spatial bloom' },
  { id: '3d-metallic', label: '3D Metallic', iconName: 'Shield', description: 'Titanium, platinum, forged bronze & chrome' },
  { id: 'royal', label: 'Royal', iconName: 'Gem', description: 'Imperial amethyst, sapphire sovereign & ruby' },
  { id: 'corporate', label: 'Corporate', iconName: 'Briefcase', description: 'Executive navy, slate trust & calm precision' },
  { id: 'nature', label: 'Nature', iconName: 'Leaf', description: 'Alpine fir, botanical moss & cedar bark' },
  { id: 'ocean', label: 'Ocean', iconName: 'Droplets', description: 'Abyssal navy, turquoise reefs & seafoam wave' },
  { id: 'sunset', label: 'Sunset', iconName: 'Flame', description: 'Golden hour amber, coral fire & twilight velvet' },
  { id: 'monochrome', label: 'Monochrome', iconName: 'Contrast', description: 'Pure binary contrast & calibrated gray steps' },
  { id: 'warm-neutral', label: 'Warm Neutral', iconName: 'Coffee', description: 'Artisanal linen, oat parchment & espresso' },
  { id: 'cool-neutral', label: 'Cool Neutral', iconName: 'Compass', description: 'Frosted zinc, glacial titanium & architectural slate' },
];

export const CATEGORY_METADATA: Record<
  ColorPaletteCategory,
  { name: string; description: string; iconName: string }
> = Object.fromEntries(
  PALETTE_CATEGORIES.map((c) => [
    c.id,
    { name: c.label, description: c.description, iconName: c.iconName },
  ])
) as Record<ColorPaletteCategory, { name: string; description: string; iconName: string }>;

function makePal(
  id: string,
  name: string,
  category: ColorPaletteCategory,
  categoryLabel: string,
  description: string,
  isDark: boolean,
  primary: string,
  secondary: string,
  accent: string,
  bgCanvas: string,
  surfaceCard: string,
  surfaceElevated: string,
  surfaceMuted: string,
  surfaceInset: string,
  borderColor: string,
  borderGlow: string,
  textPrimary: string,
  textSecondary: string,
  textMuted: string,
  ambientLight: string,
  shadowTint: string,
  glassTint: string,
  highlight: string,
  tags: string[] = []
): CuratedPalette {
  const bgBackdrop = isDark
    ? `radial-gradient(at 15% 15%, ${primary}33 0px, transparent 52%), radial-gradient(at 85% 20%, ${secondary}26 0px, transparent 50%), ${bgCanvas}`
    : `radial-gradient(at 15% 15%, ${primary}22 0px, transparent 52%), radial-gradient(at 85% 20%, ${secondary}18 0px, transparent 50%), ${bgCanvas}`;

  return {
    id,
    name,
    category,
    categoryLabel,
    description,
    isDark,
    tags: [categoryLabel, isDark ? 'Dark' : 'Light', ...tags],
    tokens: {
      primary,
      secondary,
      accent,
      bgCanvas,
      bgBackdrop,
      surfaceCard,
      surfaceElevated,
      surfaceMuted,
      surfaceInset,
      borderColor,
      borderGlow,
      textPrimary,
      textSecondary,
      textMuted,
      ambientLight,
      shadowTint,
      glassTint,
      highlight,
      success: '#10b981',
      warning: '#f59e0b',
      danger: '#ef4444',
      info: '#0ea5e9',
    },
    gradientStops: [
      { color: primary, position: 0 },
      { color: secondary, position: 50 },
      { color: accent, position: 100 },
    ],
  };
}

export const CURATED_PALETTES: CuratedPalette[] = [
  // 1. DARK LUXURY (5 Palettes)
  makePal('dl_1', 'Obsidian Sovereign Gold', 'dark-luxury', 'Dark Luxury', 'Deepest onyx with lustrous 24k sovereign gold accents', true, '#d4af37', '#e5c07b', '#f3d999', '#08080a', '#121216', '#18181f', '#1c1c24', '#0d0d11', 'rgba(212,175,55,0.28)', 'rgba(212,175,55,0.45)', '#f8f8fa', '#e4e4e9', '#9999a6', 'rgba(212,175,55,0.18)', 'rgba(0,0,0,0.7)', 'rgba(18,18,22,0.85)', 'rgba(255,255,255,0.14)', ['Gold', 'Velvet']),
  makePal('dl_2', 'Black Velvet Diamond', 'dark-luxury', 'Dark Luxury', 'High-end jewelry salon aesthetic with platinum frost on carbon', true, '#e2e8f0', '#94a3b8', '#38bdf8', '#070709', '#0f1015', '#161822', '#1a1d29', '#0b0c10', 'rgba(226,232,240,0.24)', 'rgba(56,189,248,0.35)', '#ffffff', '#cbd5e1', '#94a3b8', 'rgba(56,189,248,0.15)', 'rgba(0,0,0,0.8)', 'rgba(15,16,21,0.85)', 'rgba(255,255,255,0.2)', ['Platinum', 'Diamond']),
  makePal('dl_3', 'Royal Cognac Leather', 'dark-luxury', 'Dark Luxury', 'Aged single-malt amber cognac with warm dark mahogany tones', true, '#d97706', '#b45309', '#f59e0b', '#0f0a07', '#1a120c', '#241a12', '#2c2017', '#140e09', 'rgba(217,119,6,0.28)', 'rgba(245,158,11,0.4)', '#fef3c7', '#fde68a', '#d97706', 'rgba(245,158,11,0.2)', 'rgba(0,0,0,0.7)', 'rgba(26,18,12,0.88)', 'rgba(254,243,199,0.15)', ['Amber', 'Cognac']),
  makePal('dl_4', 'Imperial Emerald Caviar', 'dark-luxury', 'Dark Luxury', 'Bespoke private wealth club with deep malachite green and brass', true, '#10b981', '#059669', '#34d399', '#040d0a', '#0a1914', '#0f241d', '#142e25', '#06130f', 'rgba(16,185,129,0.28)', 'rgba(52,211,153,0.4)', '#ecfdf5', '#d1fae5', '#6ee7b7', 'rgba(16,185,129,0.18)', 'rgba(0,0,0,0.75)', 'rgba(10,25,20,0.85)', 'rgba(255,255,255,0.15)', ['Emerald', 'Prestige']),
  makePal('dl_5', 'Midnight Burgundy Silk', 'dark-luxury', 'Dark Luxury', 'Vintage grand cru bordeaux with warm brushed champagne brass', true, '#be185d', '#9d174d', '#f43f5e', '#0f0509', '#1a0b12', '#24101a', '#2c1421', '#13080e', 'rgba(190,24,93,0.28)', 'rgba(244,63,94,0.4)', '#fff1f2', '#fce7f3', '#f472b6', 'rgba(190,24,93,0.2)', 'rgba(0,0,0,0.75)', 'rgba(26,11,18,0.85)', 'rgba(255,255,255,0.14)', ['Bordeaux', 'Ruby']),

  // 2. LIGHT MINIMAL (5 Palettes)
  makePal('lm_1', 'Swiss Architectural White', 'light-minimal', 'Light Minimal', 'Pure Basel architecture with stark 1px graphite rules', false, '#18181b', '#3f3f46', '#2563eb', '#fafafa', '#ffffff', '#f4f4f5', '#e4e4e7', '#ffffff', '#e4e4e7', 'rgba(37,99,235,0.25)', '#09090b', '#27272a', '#71717a', 'rgba(37,99,235,0.08)', 'rgba(0,0,0,0.05)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.95)', ['Swiss', 'Clean']),
  makePal('lm_2', 'Nordic Linen Frost', 'light-minimal', 'Light Minimal', 'Pale bleached birch and calm Copenhagen fog with subtle cobalt', false, '#2563eb', '#1d4ed8', '#0284c7', '#f8fafc', '#ffffff', '#f1f5f9', '#e2e8f0', '#ffffff', '#cbd5e1', 'rgba(37,99,235,0.22)', '#0f172a', '#334155', '#64748b', 'rgba(37,99,235,0.08)', 'rgba(15,23,42,0.06)', 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0.95)', ['Nordic', 'Copenhagen']),
  makePal('lm_3', 'Studio Travertine', 'light-minimal', 'Light Minimal', 'Warm Italian limestone with muted charcoal ink typography', false, '#292524', '#44403c', '#d97706', '#fdfbf7', '#ffffff', '#f7f4ee', '#ece7dc', '#ffffff', '#ded7c8', 'rgba(217,119,6,0.2)', '#1c1917', '#292524', '#78716c', 'rgba(217,119,6,0.08)', 'rgba(41,37,36,0.06)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.95)', ['Travertine', 'Italian']),
  makePal('lm_4', 'Tokyo Paper Gallery', 'light-minimal', 'Light Minimal', 'Delicate washi cardstock with indigo ink and vermilion stamp', false, '#1e1b4b', '#312e81', '#dc2626', '#fbfbfe', '#ffffff', '#f3f4fa', '#e5e7f2', '#ffffff', '#d5d9ea', 'rgba(220,38,38,0.22)', '#111827', '#1f2937', '#6b7280', 'rgba(30,27,75,0.08)', 'rgba(17,24,39,0.06)', 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0.95)', ['Washi', 'Tokyo']),
  makePal('lm_5', 'Minimal Sage Herbarium', 'light-minimal', 'Light Minimal', 'Crisp herbal sage and botanical white for tranquil deep focus', false, '#047857', '#065f46', '#059669', '#f7fdfa', '#ffffff', '#ecfdf5', '#d1fae5', '#ffffff', '#a7f3d0', 'rgba(5,150,105,0.25)', '#064e3b', '#065f46', '#047857', 'rgba(5,150,105,0.1)', 'rgba(6,78,59,0.05)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.95)', ['Sage', 'Herbal']),

  // 3. PASTEL (5 Palettes)
  makePal('pas_1', 'French Lavender Macaron', 'pastel', 'Pastel', 'Soft Parisian lilac and violet cream with rich blackberry text', false, '#7c3aed', '#8b5cf6', '#c084fc', '#faf7ff', '#ffffff', '#f5efff', '#ede3fe', '#f8f3ff', '#e0d0fb', 'rgba(124,58,237,0.28)', '#2e1065', '#3b0764', '#6b21a8', 'rgba(124,58,237,0.12)', 'rgba(124,58,237,0.08)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0.9)', ['Lavender', 'Paris']),
  makePal('pas_2', 'Matcha Mint Sorbet', 'pastel', 'Pastel', 'Calming ceremonial green tea sorbet with pistachio cream', false, '#059669', '#10b981', '#34d399', '#f4fcf7', '#ffffff', '#eafaf0', '#d8f4e2', '#f6fdf9', '#bcf0ce', 'rgba(16,185,129,0.25)', '#064e3b', '#065f46', '#047857', 'rgba(16,185,129,0.1)', 'rgba(5,150,105,0.08)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0.9)', ['Matcha', 'Mint']),
  makePal('pas_3', 'Peach Blossom Gelato', 'pastel', 'Pastel', 'Warm apricot and peach blossom with strawberry cream', false, '#ea580c', '#f97316', '#fb923c', '#fffaf5', '#ffffff', '#fff3e8', '#ffe4d0', '#fffcf8', '#fed7aa', 'rgba(249,115,22,0.28)', '#7c2d12', '#9a3412', '#c2410c', 'rgba(249,115,22,0.12)', 'rgba(234,88,12,0.08)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0.9)', ['Peach', 'Gelato']),
  makePal('pas_4', 'Baby Blue Cloud', 'pastel', 'Pastel', 'Fluffy robin-egg blue and airy morning sky with royal ink', false, '#0284c7', '#0ea5e9', '#38bdf8', '#f2f9fe', '#ffffff', '#e5f3fd', '#cee7fb', '#f7fbff', '#bae0fd', 'rgba(14,165,233,0.25)', '#0c4a6e', '#0369a1', '#0284c7', 'rgba(14,165,233,0.1)', 'rgba(2,132,199,0.08)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0.9)', ['Cloud', 'Sky']),
  makePal('pas_5', 'Cotton Candy Sunset', 'pastel', 'Pastel', 'Iridescent pastel gradient blending soft blush and cornflower blue', false, '#db2777', '#f43f5e', '#a855f7', '#fdf7fa', '#ffffff', '#fcf0f5', '#fae1ec', '#fffafc', '#f7c5dc', 'rgba(219,39,119,0.25)', '#831843', '#9d174d', '#be185d', 'rgba(219,39,119,0.12)', 'rgba(219,39,119,0.08)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0.9)', ['Cotton Candy', 'Blush']),

  // 4. NEON (5 Palettes)
  makePal('neo_1', 'Electric Laser Lime', 'neon', 'Neon', 'Blinding nuclear lime on deep stealth carbon for maximum pop', true, '#39ff14', '#10b981', '#00ff88', '#070a08', '#0d1610', '#142219', '#1a2e22', '#09100b', 'rgba(57,255,20,0.35)', 'rgba(57,255,20,0.65)', '#f0fff0', '#dcfce7', '#86efac', 'rgba(57,255,20,0.22)', 'rgba(0,0,0,0.7)', 'rgba(13,22,16,0.88)', 'rgba(57,255,20,0.2)', ['Laser', 'Lime']),
  makePal('neo_2', 'Ultra Violet Ray', 'neon', 'Neon', 'Supercharged ultraviolet neon with dark space violet backdrop', true, '#a855f7', '#c084fc', '#d946ef', '#0a0614', '#140c28', '#1e123c', '#281850', '#0f091e', 'rgba(168,85,247,0.35)', 'rgba(217,70,239,0.6)', '#faf5ff', '#f3e8ff', '#d8b4fe', 'rgba(168,85,247,0.22)', 'rgba(0,0,0,0.75)', 'rgba(20,12,40,0.88)', 'rgba(255,255,255,0.18)', ['Ultraviolet', 'Ray']),
  makePal('neo_3', 'Hyper Solar Flare', 'neon', 'Neon', 'Blazing neon amber-gold with molten volcanic embers', true, '#ffaa00', '#f59e0b', '#ff4400', '#0d0803', '#1c1106', '#2a1a09', '#38230c', '#140c04', 'rgba(255,170,0,0.35)', 'rgba(255,170,0,0.65)', '#fffbeb', '#fef3c7', '#fde68a', 'rgba(255,170,0,0.22)', 'rgba(0,0,0,0.75)', 'rgba(28,17,6,0.88)', 'rgba(255,255,255,0.18)', ['Solar', 'Flare']),
  makePal('neo_4', 'Shocking Toxic Pink', 'neon', 'Neon', 'Uncensored rave hot magenta and vibrant radioactive teal', true, '#ff007f', '#ec4899', '#00f0ff', '#0d0408', '#1c0912', '#2a0e1b', '#381324', '#14060d', 'rgba(255,0,127,0.35)', 'rgba(255,0,127,0.65)', '#fff1f2', '#fce7f3', '#f472b6', 'rgba(255,0,127,0.22)', 'rgba(0,0,0,0.75)', 'rgba(28,9,18,0.88)', 'rgba(255,255,255,0.18)', ['Pink', 'Rave']),
  makePal('neo_5', 'Radioactive Plasma Blue', 'neon', 'Neon', 'High-energy fusion reactor cyan beaming through deep space', true, '#00e5ff', '#38bdf8', '#0088ff', '#040b10', '#081722', '#0d2334', '#122f46', '#06111a', 'rgba(0,229,255,0.35)', 'rgba(0,229,255,0.65)', '#f0fdff', '#e0f2fe', '#7dd3fc', 'rgba(0,229,255,0.22)', 'rgba(0,0,0,0.75)', 'rgba(8,23,34,0.88)', 'rgba(255,255,255,0.2)', ['Plasma', 'Fusion']),

  // 5. CYBERPUNK (5 Palettes)
  makePal('cyb_1', 'Night City Matrix', 'cyberpunk', 'Cyberpunk', 'Iconic high-density HUD cyan and magenta over obsidian carbon', true, '#00f0ff', '#ff007f', '#ffe600', '#07080f', '#0d111e', '#13192c', '#18213a', '#0a0d18', 'rgba(0,240,255,0.35)', 'rgba(0,240,255,0.7)', '#e6f6ff', '#b8dcf0', '#7fb3cc', 'rgba(0,240,255,0.25)', 'rgba(0,0,0,0.8)', 'rgba(13,17,30,0.92)', 'rgba(0,240,255,0.25)', ['HUD', 'Matrix']),
  makePal('cyb_2', 'Neuromancer Glitch', 'cyberpunk', 'Cyberpunk', 'Chiba city terminal green scanlines and warning orange', true, '#00ff66', '#059669', '#ff5500', '#050a07', '#0b140e', '#111e15', '#17281c', '#080e0a', 'rgba(0,255,102,0.35)', 'rgba(0,255,102,0.7)', '#f0fff4', '#bbf7d0', '#86efac', 'rgba(0,255,102,0.22)', 'rgba(0,0,0,0.8)', 'rgba(11,20,14,0.92)', 'rgba(0,255,102,0.25)', ['Glitch', 'Gibson']),
  makePal('cyb_3', 'Akira Red District', 'cyberpunk', 'Cyberpunk', 'Neo-Tokyo expressway crimson with tactical hazard yellow', true, '#ff1a40', '#e11d48', '#facc15', '#0d0406', '#1c080d', '#2b0c14', '#3a101b', '#140609', 'rgba(255,26,64,0.35)', 'rgba(255,26,64,0.7)', '#fff1f2', '#fecdd3', '#fda4af', 'rgba(255,26,64,0.22)', 'rgba(0,0,0,0.8)', 'rgba(28,8,13,0.92)', 'rgba(255,26,64,0.25)', ['Neo-Tokyo', 'Akira']),
  makePal('cyb_4', 'Ghost Shell Operative', 'cyberpunk', 'Cyberpunk', 'Tactical cybernetic steel with cool ice-blue data telemetry', true, '#38bdf8', '#0284c7', '#a855f7', '#080c14', '#101826', '#182438', '#20304a', '#0c121e', 'rgba(56,189,248,0.35)', 'rgba(56,189,248,0.7)', '#f0f9ff', '#bae6fd', '#7dd3fc', 'rgba(56,189,248,0.22)', 'rgba(0,0,0,0.8)', 'rgba(16,24,38,0.92)', 'rgba(56,189,248,0.25)', ['Ghost', 'Cyborg']),
  makePal('cyb_5', 'Blade Runner 2049', 'cyberpunk', 'Cyberpunk', 'Desert orange haze cutting through Los Angeles monsoon slate', true, '#f97316', '#ea580c', '#06b6d4', '#0d0907', '#1a130e', '#271c15', '#34251c', '#130e0b', 'rgba(249,115,22,0.35)', 'rgba(249,115,22,0.7)', '#fff7ed', '#ffedd5', '#fed7aa', 'rgba(249,115,22,0.22)', 'rgba(0,0,0,0.8)', 'rgba(26,19,14,0.92)', 'rgba(249,115,22,0.25)', ['2049', 'Haze']),

  // 6. GLASSMORPHISM (5 Palettes)
  makePal('gla_1', 'Crystalline Prism Glass', 'glassmorphism', 'Glassmorphism', 'Translucent quartz crystal with rainbow specular edge rim', true, '#818cf8', '#22d3ee', '#ec4899', '#080d1e', 'rgba(17,25,48,0.58)', 'rgba(23,33,62,0.74)', 'rgba(255,255,255,0.08)', 'rgba(10,15,32,0.55)', 'rgba(255,255,255,0.18)', 'rgba(129,140,248,0.5)', '#f8fafc', '#e2e8f0', '#a5b4fc', 'rgba(129,140,248,0.25)', 'rgba(0,0,0,0.55)', 'rgba(17,25,48,0.65)', 'rgba(255,255,255,0.3)', ['Crystal', 'Frosted']),
  makePal('gla_2', 'Emerald Lake Glass', 'glassmorphism', 'Glassmorphism', 'Translucent mountain lake glass with deep alpine reflection', true, '#34d399', '#06b6d4', '#10b981', '#061314', 'rgba(11,32,32,0.58)', 'rgba(16,44,44,0.74)', 'rgba(255,255,255,0.08)', 'rgba(7,20,20,0.55)', 'rgba(52,211,153,0.22)', 'rgba(52,211,153,0.5)', '#ecfdf5', '#d1fae5', '#6ee7b7', 'rgba(52,211,153,0.22)', 'rgba(0,0,0,0.55)', 'rgba(11,32,32,0.65)', 'rgba(255,255,255,0.3)', ['Lake', 'Emerald']),
  makePal('gla_3', 'Frosted Rose Quartz', 'glassmorphism', 'Glassmorphism', 'Luminous rose quartz with pearlescent specular lighting', true, '#f472b6', '#c084fc', '#fb7185', '#160814', 'rgba(36,16,33,0.58)', 'rgba(48,22,44,0.74)', 'rgba(255,255,255,0.08)', 'rgba(24,10,22,0.55)', 'rgba(244,114,182,0.24)', 'rgba(244,114,182,0.5)', '#fdf2f8', '#fce7f3', '#f472b6', 'rgba(244,114,182,0.25)', 'rgba(0,0,0,0.55)', 'rgba(36,16,33,0.65)', 'rgba(255,255,255,0.3)', ['Rose', 'Quartz']),
  makePal('gla_4', 'Arctic Ice Shelf', 'glassmorphism', 'Glassmorphism', 'Ultra-clean sub-zero glacial pane with specular rim highlights', true, '#38bdf8', '#818cf8', '#0ea5e9', '#08101e', 'rgba(15,28,48,0.58)', 'rgba(20,38,64,0.74)', 'rgba(255,255,255,0.08)', 'rgba(10,18,32,0.55)', 'rgba(56,189,248,0.22)', 'rgba(56,189,248,0.5)', '#f0f9ff', '#e0f2fe', '#7dd3fc', 'rgba(56,189,248,0.25)', 'rgba(0,0,0,0.55)', 'rgba(15,28,48,0.65)', 'rgba(255,255,255,0.3)', ['Ice', 'Glacier']),
  makePal('gla_5', 'Smoked Obsidian Glass', 'glassmorphism', 'Glassmorphism', 'Dark tinted architectural glass pane with subtle neon rim', true, '#a1a1aa', '#e4e4e7', '#6366f1', '#060608', 'rgba(18,18,24,0.65)', 'rgba(26,26,34,0.8)', 'rgba(255,255,255,0.05)', 'rgba(12,12,16,0.6)', 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0.3)', '#ffffff', '#e4e4e7', '#a1a1aa', 'rgba(255,255,255,0.12)', 'rgba(0,0,0,0.75)', 'rgba(18,18,24,0.75)', 'rgba(255,255,255,0.2)', ['Smoked', 'Obsidian']),

  // 7. CLAYMORPHISM (5 Palettes)
  makePal('cla_1', 'Puffy Marshmallow', 'claymorphism', 'Claymorphism', 'Soft dimensional marshmallow curves with pillowy double shadows', false, '#6366f1', '#8b5cf6', '#ec4899', '#eef2ff', '#ffffff', '#fcfdff', '#e6edfe', '#e0e8fc', '#c7d2fe', 'rgba(99,102,241,0.4)', '#1e1b4b', '#312e81', '#4c4a7d', 'rgba(99,102,241,0.2)', 'rgba(99,102,241,0.14)', 'rgba(255,255,255,0.95)', 'rgba(255,255,255,1)', ['Puffy', 'Soft']),
  makePal('cla_2', 'Playful Bubblegum 3D', 'claymorphism', 'Claymorphism', 'Vibrant inflated bubblegum pink and electric cyan buttons', false, '#db2777', '#ec4899', '#06b6d4', '#fdf2f8', '#ffffff', '#fff7fc', '#fbe0f0', '#f9d2e7', '#f472b6', 'rgba(219,39,119,0.4)', '#831843', '#9d174d', '#be185d', 'rgba(219,39,119,0.2)', 'rgba(219,39,119,0.14)', 'rgba(255,255,255,0.95)', 'rgba(255,255,255,1)', ['Bubblegum', 'Playful']),
  makePal('cla_3', 'Pistachio Ceramic', 'claymorphism', 'Claymorphism', 'Smooth rounded glazed ceramic clay with pistachio and olive tones', false, '#059669', '#10b981', '#65a30d', '#f0fdf4', '#ffffff', '#f7fef9', '#def7e6', '#d1f2dc', '#a7f3d0', 'rgba(16,185,129,0.4)', '#064e3b', '#065f46', '#047857', 'rgba(16,185,129,0.2)', 'rgba(5,150,105,0.14)', 'rgba(255,255,255,0.95)', 'rgba(255,255,255,1)', ['Ceramic', 'Pistachio']),
  makePal('cla_4', 'Warm Terracotta Pot', 'claymorphism', 'Claymorphism', 'Handcrafted pottery clay with warm roasted pumpkin tones', false, '#c2410c', '#ea580c', '#d97706', '#fff7ed', '#ffffff', '#fffaf4', '#ffedd5', '#fed7aa', '#fdba74', 'rgba(234,88,12,0.4)', '#7c2d12', '#9a3412', '#c2410c', 'rgba(234,88,12,0.2)', 'rgba(194,65,12,0.14)', 'rgba(255,255,255,0.95)', 'rgba(255,255,255,1)', ['Terracotta', 'Pottery']),
  makePal('cla_5', 'Twilight Lavender Clay', 'claymorphism', 'Claymorphism', 'Dark inflated tactile clay forms with soft glowing lilac relief', true, '#a78bfa', '#c084fc', '#f472b6', '#1c1a2e', '#282542', '#322e52', '#221f39', '#1a182a', '#4c4573', 'rgba(167,139,250,0.4)', '#f8fafc', '#e2e8f0', '#b8b5e0', 'rgba(167,139,250,0.25)', 'rgba(6,5,18,0.55)', 'rgba(40,37,66,0.9)', 'rgba(255,255,255,0.15)', ['Twilight', 'Lilac']),

  // 8. NEUMORPHISM (5 Palettes)
  makePal('neu_1', 'Soft Monolith Slate', 'neumorphism', 'Neumorphism', 'Continuous monolithic surface carved with light/dark relief vectors', false, '#4f46e5', '#6366f1', '#0d9488', '#e4e9f2', '#e4e9f2', '#e9eef7', '#dde3ee', '#e4e9f2', 'rgba(255,255,255,0.45)', 'rgba(79,70,229,0.3)', '#1e293b', '#334155', '#475569', 'rgba(79,70,229,0.15)', 'rgba(197,204,217,0.7)', '#e4e9f2', '#ffffff', ['Monolith', 'Relief']),
  makePal('neu_2', 'Dark Alloy Neumorph', 'neumorphism', 'Neumorphism', 'Deep gunmetal alloy with dual soft directional light vectors', true, '#818cf8', '#6366f1', '#2dd4bf', '#232732', '#232732', '#272b37', '#1f232d', '#232732', 'rgba(255,255,255,0.06)', 'rgba(129,140,248,0.3)', '#f1f5f9', '#cbd5e1', '#94a3b8', 'rgba(129,140,248,0.2)', 'rgba(23,26,34,0.8)', '#232732', 'rgba(255,255,255,0.08)', ['Alloy', 'Gunmetal']),
  makePal('neu_3', 'Parchment Sand Dune', 'neumorphism', 'Neumorphism', 'Warm desert dune sand surface with gentle carved buttons', false, '#d97706', '#b45309', '#059669', '#ede7de', '#ede7de', '#f3ede5', '#e4ded4', '#ede7de', 'rgba(255,255,255,0.55)', 'rgba(217,119,6,0.3)', '#292524', '#44403c', '#78716c', 'rgba(217,119,6,0.15)', 'rgba(205,198,187,0.7)', '#ede7de', '#ffffff', ['Sand', 'Dune']),
  makePal('neu_4', 'Frosted Sage Ceramic', 'neumorphism', 'Neumorphism', 'Cool herbal sage relief with seamless continuous recessed wells', false, '#059669', '#10b981', '#0284c7', '#e2ece7', '#e2ece7', '#e8f2ed', '#d8e3de', '#e2ece7', 'rgba(255,255,255,0.55)', 'rgba(5,150,105,0.3)', '#064e3b', '#065f46', '#047857', 'rgba(5,150,105,0.15)', 'rgba(192,206,200,0.7)', '#e2ece7', '#ffffff', ['Sage', 'Ceramic']),
  makePal('neu_5', 'Deep Carbon Stealth', 'neumorphism', 'Neumorphism', 'Pure matte carbon fiber with soft extruded controls and teal glow', true, '#14b8a6', '#0d9488', '#06b6d4', '#16191f', '#16191f', '#1c2028', '#121419', '#16191f', 'rgba(255,255,255,0.05)', 'rgba(20,184,166,0.3)', '#f8fafc', '#e2e8f0', '#94a3b8', 'rgba(20,184,166,0.2)', 'rgba(12,14,17,0.85)', '#16191f', 'rgba(255,255,255,0.06)', ['Carbon', 'Stealth']),

  // 9. SKEUOMORPHISM (5 Palettes)
  makePal('ske_1', 'Brushed Aluminum Hi-Fi', 'skeuomorphism', 'Skeuomorphism', 'Iconic Braun / Dieter Rams brushed aluminum console with tactile knobs', false, '#2563eb', '#1d4ed8', '#d97706', '#d6d9df', '#eef0f4', '#ffffff', '#cfd4dc', '#d9dde4', '#7e8796', 'rgba(37,99,235,0.35)', '#1a1d24', '#2d333f', '#4b5563', 'rgba(37,99,235,0.15)', 'rgba(0,0,0,0.18)', '#eef0f4', '#ffffff', ['Aluminum', 'Braun']),
  makePal('ske_2', 'Vintage Pilot Cockpit', 'skeuomorphism', 'Skeuomorphism', 'Dark titanium aviator gauges with amber illuminated dials', true, '#f59e0b', '#d97706', '#3b82f6', '#1a1c20', '#24272e', '#2d3139', '#14161a', '#1c1e23', '#5b6373', 'rgba(245,158,11,0.4)', '#f1f5f9', '#cbd5e1', '#9aa4b2', 'rgba(245,158,11,0.22)', 'rgba(0,0,0,0.6)', '#24272e', 'rgba(255,255,255,0.14)', ['Cockpit', 'Aviator']),
  makePal('ske_3', 'Stitched Oxford Saddle', 'skeuomorphism', 'Skeuomorphism', 'Hand-stitched full-grain saddle leather with antique brass buckles', false, '#b45309', '#92400e', '#0f766e', '#dfd5c6', '#ede5d8', '#f8f3eb', '#d2c5b3', '#dbd0bf', '#8d7963', 'rgba(180,83,9,0.35)', '#292524', '#44403c', '#78716c', 'rgba(180,83,9,0.15)', 'rgba(0,0,0,0.18)', '#ede5d8', '#ffffff', ['Leather', 'Saddle']),
  makePal('ske_4', 'Radar Navigational Slate', 'skeuomorphism', 'Skeuomorphism', 'Maritime naval navigation console with phosphor green sweeps', true, '#22c55e', '#16a34a', '#38bdf8', '#11181c', '#172228', '#1f2e37', '#0e1418', '#131b20', '#3e5665', 'rgba(34,197,94,0.4)', '#ecfdf5', '#d1fae5', '#86efac', 'rgba(34,197,94,0.22)', 'rgba(0,0,0,0.65)', '#172228', 'rgba(255,255,255,0.14)', ['Radar', 'Naval']),
  makePal('ske_5', 'Bespoke Chronometer', 'skeuomorphism', 'Skeuomorphism', 'Swiss mechanical watch face with rose gold indices on slate', true, '#fb7185', '#e11d48', '#38bdf8', '#14161d', '#1d202b', '#252a39', '#101217', '#171922', '#4b5568', 'rgba(251,113,133,0.35)', '#f8fafc', '#e2e8f0', '#94a3b8', 'rgba(251,113,133,0.2)', 'rgba(0,0,0,0.65)', '#1d202b', 'rgba(255,255,255,0.14)', ['Chronometer', 'Swiss']),

  // 10. AURORA (5 Palettes)
  makePal('aur_1', 'Borealis Emerald Dance', 'aurora', 'Aurora', 'Atmospheric green and indigo curtains drifting across northern sky', true, '#10b981', '#6366f1', '#06b6d4', '#040d12', 'rgba(10,22,30,0.65)', 'rgba(14,30,42,0.8)', 'rgba(255,255,255,0.06)', 'rgba(4,12,18,0.6)', 'rgba(45,212,191,0.28)', 'rgba(45,212,191,0.6)', '#ecfdf5', '#cceae0', '#86bfb0', 'rgba(16,185,129,0.3)', 'rgba(0,0,0,0.65)', 'rgba(10,22,30,0.7)', 'rgba(255,255,255,0.2)', ['Borealis', 'Northern']),
  makePal('aur_2', 'Southern Australis Pink', 'aurora', 'Aurora', 'Southern polar lights with magenta and purple ionospheric ribbons', true, '#ec4899', '#8b5cf6', '#06b6d4', '#0d0412', 'rgba(24,10,32,0.65)', 'rgba(34,14,44,0.8)', 'rgba(255,255,255,0.06)', 'rgba(14,6,20,0.6)', 'rgba(236,72,153,0.28)', 'rgba(236,72,153,0.6)', '#fdf2f8', '#fce7f3', '#f472b6', 'rgba(236,72,153,0.3)', 'rgba(0,0,0,0.65)', 'rgba(24,10,32,0.7)', 'rgba(255,255,255,0.2)', ['Australis', 'Polar']),
  makePal('aur_3', 'Solar Wind Cyan', 'aurora', 'Aurora', 'High-speed solar plasma streaming in bright cyan and emerald', true, '#06b6d4', '#10b981', '#8b5cf6', '#030e14', 'rgba(8,24,34,0.65)', 'rgba(12,34,48,0.8)', 'rgba(255,255,255,0.06)', 'rgba(4,14,20,0.6)', 'rgba(6,182,212,0.28)', 'rgba(6,182,212,0.6)', '#f0fdfa', '#ccfbf1', '#5eead4', 'rgba(6,182,212,0.3)', 'rgba(0,0,0,0.65)', 'rgba(8,24,34,0.7)', 'rgba(255,255,255,0.2)', ['Solar Wind', 'Plasma']),
  makePal('aur_4', 'Violet Aurora Glow', 'aurora', 'Aurora', 'Deep amethyst electromagnetic waves over silent snowy peaks', true, '#a855f7', '#06b6d4', '#10b981', '#0b0618', 'rgba(20,12,40,0.65)', 'rgba(28,16,56,0.8)', 'rgba(255,255,255,0.06)', 'rgba(12,8,24,0.6)', 'rgba(168,85,247,0.28)', 'rgba(168,85,247,0.6)', '#faf5ff', '#f3e8ff', '#d8b4fe', 'rgba(168,85,247,0.3)', 'rgba(0,0,0,0.65)', 'rgba(20,12,40,0.7)', 'rgba(255,255,255,0.2)', ['Amethyst', 'Violet']),
  makePal('aur_5', 'Dawn Horizon Aurora', 'aurora', 'Aurora', 'Early morning sunrise melding aurora borealis with coral dawn', false, '#0d9488', '#6366f1', '#f43f5e', '#ecfdf5', 'rgba(255,255,255,0.75)', 'rgba(255,255,255,0.9)', '#e0f2fe', 'rgba(255,255,255,0.65)', 'rgba(13,148,136,0.28)', 'rgba(13,148,136,0.5)', '#06201f', '#113a38', '#2a5956', 'rgba(13,148,136,0.18)', 'rgba(13,148,136,0.1)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0.95)', ['Dawn', 'Sunrise']),

  // 11. GRADIENT (5 Palettes)
  makePal('gra_1', 'Prismatic Hologram 3D', 'gradient', 'Gradient', 'Multidimensional rainbow sheen with vibrant directional depth', true, '#8b5cf6', '#ec4899', '#06b6d4', '#0b0a1a', '#181534', '#221e48', '#1c1936', '#0f0d20', 'rgba(167,139,250,0.26)', 'rgba(167,139,250,0.6)', '#f8fafc', '#e2e8f0', '#b5b2e0', 'rgba(139,92,246,0.3)', 'rgba(0,0,0,0.7)', '#181534', 'rgba(255,255,255,0.2)', ['Hologram', 'Prismatic']),
  makePal('gra_2', 'Sunset Horizon Bloom', 'gradient', 'Gradient', 'Molten tangerine dissolving into magenta and deep plum twilight', true, '#f97316', '#e11d48', '#8b5cf6', '#12070c', '#220f18', '#301522', '#260f1b', '#160810', 'rgba(249,115,22,0.28)', 'rgba(225,29,72,0.6)', '#fff7ed', '#ffe4e6', '#fca5a5', 'rgba(249,115,22,0.3)', 'rgba(0,0,0,0.7)', '#220f18', 'rgba(255,255,255,0.2)', ['Sunset', 'Bloom']),
  makePal('gra_3', 'Deep Oceanic Trench', 'gradient', 'Gradient', 'Sunlit cyan surface cascading to abyssal blue and navy midnight', true, '#0ea5e9', '#6366f1', '#06b6d4', '#050c18', '#0c182c', '#12223e', '#162238', '#071020', 'rgba(14,165,233,0.28)', 'rgba(14,165,233,0.6)', '#f0f9ff', '#e0f2fe', '#7dd3fc', 'rgba(14,165,233,0.3)', 'rgba(0,0,0,0.7)', '#0c182c', 'rgba(255,255,255,0.2)', ['Oceanic', 'Trench']),
  makePal('gra_4', 'Tropical Paradise Flora', 'gradient', 'Gradient', 'Vibrant guava pink blending smoothly into lime and turquoise', false, '#db2777', '#059669', '#0284c7', '#fdf2f8', '#ffffff', '#fff5f9', '#fce7f3', '#fdf2f8', '#fbcfe8', 'rgba(219,39,119,0.3)', '#831843', '#9d174d', '#be185d', 'rgba(219,39,119,0.15)', 'rgba(219,39,119,0.1)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.98)', ['Tropical', 'Flora']),
  makePal('gra_5', 'Stellar Cosmic Cloud', 'gradient', 'Gradient', 'Interstellar dust cloud with violet, cyan, and rose gold glow', true, '#a855f7', '#06b6d4', '#f43f5e', '#090814', '#151228', '#1e1a38', '#17142a', '#0d0b1a', 'rgba(168,85,247,0.28)', 'rgba(6,182,212,0.6)', '#faf5ff', '#f3e8ff', '#d8b4fe', 'rgba(168,85,247,0.3)', 'rgba(0,0,0,0.7)', '#151228', 'rgba(255,255,255,0.2)', ['Cosmic', 'Stellar']),

  // 12. 3D METALLIC (5 Palettes)
  makePal('met_1', 'Titanium Aerospace', '3d-metallic', '3D Metallic', 'Cold precision titanium with polished specular edge gleam', true, '#cbd5e1', '#94a3b8', '#38bdf8', '#0c1017', '#171d28', '#212938', '#1c2432', '#10141d', 'rgba(203,213,225,0.26)', 'rgba(56,189,248,0.4)', '#ffffff', '#e2e8f0', '#94a3b8', 'rgba(56,189,248,0.18)', 'rgba(0,0,0,0.75)', '#171d28', 'rgba(255,255,255,0.25)', ['Titanium', 'Aerospace']),
  makePal('met_2', 'Forged Rose Bronze', '3d-metallic', '3D Metallic', 'Burnished architectural bronze with warm specular rose highlights', true, '#fb7185', '#e11d48', '#f59e0b', '#140c0e', '#24161a', '#321f24', '#28171c', '#180e11', 'rgba(251,113,133,0.28)', 'rgba(251,113,133,0.5)', '#fff1f2', '#ffe4e6', '#fda4af', 'rgba(251,113,133,0.2)', 'rgba(0,0,0,0.75)', '#24161a', 'rgba(255,255,255,0.2)', ['Bronze', 'Forged']),
  makePal('met_3', 'Mirror Chrome Monolith', '3d-metallic', '3D Metallic', 'High-specular liquid chrome reflections on pure stealth black', true, '#f1f5f9', '#94a3b8', '#60a5fa', '#050608', '#0e1117', '#161a23', '#141820', '#090b0f', 'rgba(241,245,249,0.3)', 'rgba(255,255,255,0.5)', '#ffffff', '#e2e8f0', '#cbd5e1', 'rgba(96,165,250,0.2)', 'rgba(0,0,0,0.85)', '#0e1117', 'rgba(255,255,255,0.35)', ['Chrome', 'Mirror']),
  makePal('met_4', 'Antique Sovereign Brass', '3d-metallic', '3D Metallic', 'Brushed antique clockwork brass with rich patinated depths', true, '#f59e0b', '#d97706', '#10b981', '#120f06', '#221c0c', '#302812', '#28210f', '#181308', 'rgba(245,158,11,0.28)', 'rgba(245,158,11,0.5)', '#fef3c7', '#fde68a', '#fbbf24', 'rgba(245,158,11,0.2)', 'rgba(0,0,0,0.75)', '#221c0c', 'rgba(255,255,255,0.2)', ['Brass', 'Antique']),
  makePal('met_5', 'Platinum Sovereign White', '3d-metallic', '3D Metallic', 'Lustrous platinum alloy with crisp hairline bevels in high light', false, '#0f172a', '#334155', '#2563eb', '#f1f5f9', '#ffffff', '#f8fafc', '#e2e8f0', '#ffffff', '#cbd5e1', 'rgba(37,99,235,0.25)', '#0f172a', '#1e293b', '#64748b', 'rgba(37,99,235,0.1)', 'rgba(15,23,42,0.08)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.98)', ['Platinum', 'Lustrous']),

  // 13. ROYAL (5 Palettes)
  makePal('roy_1', 'Imperial Amethyst Crown', 'royal', 'Royal', 'Deep purple velvet with luminous amethyst crystal highlights', true, '#c084fc', '#a855f7', '#38bdf8', '#0c0716', '#170f2a', '#22163e', '#1c1133', '#100a1e', 'rgba(192,132,252,0.3)', 'rgba(192,132,252,0.6)', '#faf5ff', '#f3e8ff', '#d8b4fe', 'rgba(192,132,252,0.22)', 'rgba(0,0,0,0.75)', '#170f2a', 'rgba(255,255,255,0.2)', ['Imperial', 'Amethyst']),
  makePal('roy_2', 'Sovereign Royal Sapphire', 'royal', 'Royal', 'Deep sapphire ocean blue with bright diamond spark and gold', true, '#3b82f6', '#2563eb', '#f59e0b', '#060b18', '#0d162e', '#142144', '#101c3a', '#081022', 'rgba(59,130,246,0.3)', 'rgba(59,130,246,0.6)', '#eff6ff', '#dbeafe', '#93c5fd', 'rgba(59,130,246,0.22)', 'rgba(0,0,0,0.75)', '#0d162e', 'rgba(255,255,255,0.2)', ['Sapphire', 'Sovereign']),
  makePal('roy_3', 'Coronation Emerald Jewel', 'royal', 'Royal', 'Imperial Russian emerald with royal gold trim and ivory text', true, '#10b981', '#059669', '#f59e0b', '#04100c', '#0a2018', '#102e23', '#0d261d', '#061611', 'rgba(16,185,129,0.3)', 'rgba(16,185,129,0.6)', '#ecfdf5', '#d1fae5', '#6ee7b7', 'rgba(16,185,129,0.22)', 'rgba(0,0,0,0.75)', '#0a2018', 'rgba(255,255,255,0.2)', ['Coronation', 'Emerald']),
  makePal('roy_4', 'Sultan Ruby Garnet', 'royal', 'Royal', 'Opulent Persian crimson garnet with rich warm brass filigree', true, '#f43f5e', '#e11d48', '#f59e0b', '#14050a', '#240a13', '#320e1b', '#2a0c17', '#18060c', 'rgba(244,63,94,0.3)', 'rgba(244,63,94,0.6)', '#fff1f2', '#ffe4e6', '#fda4af', 'rgba(244,63,94,0.22)', 'rgba(0,0,0,0.75)', '#240a13', 'rgba(255,255,255,0.2)', ['Ruby', 'Garnet']),
  makePal('roy_5', 'Regal Ivory & Fleur', 'royal', 'Royal', 'French royal palace ivory with gilded trim and fleur-de-lis royal blue', false, '#1e3a8a', '#1d4ed8', '#d97706', '#fdfbf7', '#ffffff', '#f7f4ee', '#ede7dc', '#ffffff', '#ded7c8', 'rgba(30,58,138,0.25)', '#1e1b4b', '#1e3a8a', '#475569', 'rgba(30,58,138,0.1)', 'rgba(30,58,138,0.06)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.98)', ['Fleur', 'Palace']),

  // 14. CORPORATE (5 Palettes)
  makePal('cor_1', 'Executive Blue Chip', 'corporate', 'Corporate', 'Wall Street trust and high stability navy with clean ice highlight', true, '#3b82f6', '#1d4ed8', '#10b981', '#0b1120', '#131e36', '#1b2a4a', '#172440', '#0e172a', 'rgba(59,130,246,0.26)', 'rgba(59,130,246,0.5)', '#f8fafc', '#e2e8f0', '#94a3b8', 'rgba(59,130,246,0.18)', 'rgba(0,0,0,0.7)', '#131e36', 'rgba(255,255,255,0.16)', ['Blue Chip', 'Enterprise']),
  makePal('cor_2', 'Global Trust Financial', 'corporate', 'Corporate', 'Calm daylight corporate blue with high scannability and contrast', false, '#2563eb', '#1e40af', '#059669', '#f8fafc', '#ffffff', '#f1f5f9', '#e2e8f0', '#ffffff', '#cbd5e1', 'rgba(37,99,235,0.22)', '#0f172a', '#1e293b', '#64748b', 'rgba(37,99,235,0.08)', 'rgba(15,23,42,0.06)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.98)', ['Global', 'Trust']),
  makePal('cor_3', 'Apex Industrial Slate', 'corporate', 'Corporate', 'Heavy engineering precision with graphite frame and hazard amber', true, '#f59e0b', '#d97706', '#3b82f6', '#10141a', '#1a202a', '#232b38', '#1e2530', '#131820', 'rgba(245,158,11,0.26)', 'rgba(245,158,11,0.5)', '#f8fafc', '#e2e8f0', '#94a3b8', 'rgba(245,158,11,0.18)', 'rgba(0,0,0,0.7)', '#1a202a', 'rgba(255,255,255,0.16)', ['Industrial', 'Engineering']),
  makePal('cor_4', 'Sovereign Wealth Management', 'corporate', 'Corporate', 'Dark green institutional authority paired with crisp clean ledger lines', true, '#10b981', '#059669', '#38bdf8', '#07120e', '#0f221c', '#153027', '#122921', '#0a1a15', 'rgba(16,185,129,0.26)', 'rgba(16,185,129,0.5)', '#ecfdf5', '#d1fae5', '#86efac', 'rgba(16,185,129,0.18)', 'rgba(0,0,0,0.7)', '#0f221c', 'rgba(255,255,255,0.16)', ['Wealth', 'Institution']),
  makePal('cor_5', 'London Merchant Bank', 'corporate', 'Corporate', 'Pinstripe navy suit with deep burgundy seal and ivory paper background', false, '#1e3a8a', '#991b1b', '#047857', '#faf8f5', '#ffffff', '#f4efe8', '#e7dfd4', '#ffffff', '#d5cbbe', 'rgba(30,58,138,0.22)', '#111827', '#1f2937', '#4b5563', 'rgba(30,58,138,0.08)', 'rgba(17,24,39,0.06)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.98)', ['Merchant', 'London']),

  // 15. NATURE (5 Palettes)
  makePal('nat_1', 'Deep Alpine Forest', 'nature', 'Nature', 'Evergreen mountain pine needles with mossy undergrowth and amber sun', true, '#22c55e', '#16a34a', '#eab308', '#060e09', '#0d1b13', '#14271c', '#102117', '#08120c', 'rgba(34,197,94,0.26)', 'rgba(34,197,94,0.5)', '#f0fdf4', '#dcfce7', '#86efac', 'rgba(34,197,94,0.18)', 'rgba(0,0,0,0.7)', '#0d1b13', 'rgba(255,255,255,0.16)', ['Alpine', 'Pine']),
  makePal('nat_2', 'Rainforest Canopy', 'nature', 'Nature', 'Lush Amazonian flora with radiant toucan yellow and bright orchid', true, '#10b981', '#059669', '#facc15', '#04100c', '#0a221a', '#103227', '#0d2920', '#071812', 'rgba(16,185,129,0.28)', 'rgba(250,204,21,0.5)', '#ecfdf5', '#d1fae5', '#6ee7b7', 'rgba(16,185,129,0.2)', 'rgba(0,0,0,0.7)', '#0a221a', 'rgba(255,255,255,0.16)', ['Rainforest', 'Canopy']),
  makePal('nat_3', 'Autumn Birch Grove', 'nature', 'Nature', 'Warm golden birch leaves falling across rich earthy umber loam', false, '#c2410c', '#d97706', '#15803d', '#fffaf0', '#ffffff', '#fdf3e5', '#fbe5cd', '#ffffff', '#f8d2af', 'rgba(194,65,12,0.25)', '#431407', '#7c2d12', '#9a3412', 'rgba(194,65,12,0.1)', 'rgba(67,20,7,0.06)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.98)', ['Autumn', 'Birch']),
  makePal('nat_4', 'High Desert Succulent', 'nature', 'Nature', 'Muted agave blue-green with warm terracotta pottery contrast', false, '#0f766e', '#0d9488', '#ea580c', '#f2f9f8', '#ffffff', '#e6f4f2', '#cee8e4', '#ffffff', '#b2d9d3', 'rgba(15,118,110,0.25)', '#134e4a', '#115e59', '#0f766e', 'rgba(15,118,110,0.1)', 'rgba(19,78,74,0.06)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.98)', ['Agave', 'Desert']),
  makePal('nat_5', 'Lavender Meadow Wind', 'nature', 'Nature', 'Wild mountain lavender swaying over clean herbarium green', false, '#7c3aed', '#059669', '#ec4899', '#f9f6ff', '#ffffff', '#f3eeff', '#e7dcfe', '#ffffff', '#d6c4fc', 'rgba(124,58,237,0.25)', '#2e1065', '#3b0764', '#5b21b6', 'rgba(124,58,237,0.1)', 'rgba(46,16,101,0.06)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.98)', ['Meadow', 'Lavender']),

  // 16. OCEAN (5 Palettes)
  makePal('oce_1', 'Deep Abyssal Trench', 'ocean', 'Ocean', 'Bioluminescent cyan cutting through pitch-black oceanic depths', true, '#00f0ff', '#0284c7', '#38bdf8', '#03080e', '#07131e', '#0c1d2e', '#0a1826', '#050f18', 'rgba(0,240,255,0.28)', 'rgba(0,240,255,0.6)', '#f0fdff', '#e0f2fe', '#7dd3fc', 'rgba(0,240,255,0.22)', 'rgba(0,0,0,0.8)', '#07131e', 'rgba(255,255,255,0.2)', ['Abyssal', 'Bioluminescent']),
  makePal('oce_2', 'Bermuda Turquoise Reef', 'ocean', 'Ocean', 'Crystalline tropical reef lagoon with pure white sand reflection', false, '#0891b2', '#06b6d4', '#0d9488', '#f0fdfa', '#ffffff', '#e3faf6', '#cbf4ee', '#ffffff', '#9ee9df', 'rgba(8,145,178,0.25)', '#164e63', '#155e75', '#0e7490', 'rgba(8,145,178,0.1)', 'rgba(22,78,99,0.06)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.98)', ['Turquoise', 'Bermuda']),
  makePal('oce_3', 'Pacific Navy Swell', 'ocean', 'Ocean', 'Deep offshore rolling blue swells with bright cresting foam', true, '#38bdf8', '#0ea5e9', '#60a5fa', '#070e1b', '#0e1a30', '#152646', '#12203b', '#0a1426', 'rgba(56,189,248,0.28)', 'rgba(56,189,248,0.55)', '#f0f9ff', '#e0f2fe', '#93c5fd', 'rgba(56,189,248,0.2)', 'rgba(0,0,0,0.75)', '#0e1a30', 'rgba(255,255,255,0.18)', ['Pacific', 'Swell']),
  makePal('oce_4', 'Coral Atoll Shallows', 'ocean', 'Ocean', 'Warm tropical coral orange kissing turquoise tidal pools', false, '#f97316', '#06b6d4', '#059669', '#f0fcfd', '#ffffff', '#e3f9fb', '#ccf2f6', '#ffffff', '#9fe4ee', 'rgba(249,115,22,0.25)', '#164e63', '#155e75', '#0e7490', 'rgba(249,115,22,0.1)', 'rgba(22,78,99,0.06)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.98)', ['Atoll', 'Coral']),
  makePal('oce_5', 'Arctic Sea Glacial Drift', 'ocean', 'Ocean', 'Glacial deep blue icebergs floating in crystal clear subzero water', true, '#67e8f9', '#22d3ee', '#38bdf8', '#050d14', '#0c1b26', '#122737', '#0f202e', '#08141e', 'rgba(103,232,249,0.28)', 'rgba(103,232,249,0.55)', '#ecfeff', '#cffafe', '#a5f3fc', 'rgba(103,232,249,0.2)', 'rgba(0,0,0,0.75)', '#0c1b26', 'rgba(255,255,255,0.2)', ['Glacial', 'Arctic']),

  // 17. SUNSET (5 Palettes)
  makePal('sun_1', 'Malibu Sunset Glow', 'sunset', 'Sunset', 'Golden Pacific sunset blending hot coral into deep violet haze', true, '#f97316', '#ec4899', '#8b5cf6', '#120710', '#220e1f', '#30142c', '#271124', '#170915', 'rgba(249,115,22,0.28)', 'rgba(236,72,153,0.55)', '#fff7ed', '#fce7f3', '#fbcfe8', 'rgba(249,115,22,0.22)', 'rgba(0,0,0,0.75)', '#220e1f', 'rgba(255,255,255,0.2)', ['Malibu', 'Glow']),
  makePal('sun_2', 'Sahara Desert Twilight', 'sunset', 'Sunset', 'Dune horizon turning from burning orange to indigo starry night', true, '#ff6b35', '#f59e0b', '#7c3aed', '#110908', '#201210', '#2d1a17', '#251613', '#160c0b', 'rgba(255,107,53,0.3)', 'rgba(255,107,53,0.6)', '#fff7ed', '#fef3c7', '#fed7aa', 'rgba(255,107,53,0.22)', 'rgba(0,0,0,0.75)', '#201210', 'rgba(255,255,255,0.2)', ['Sahara', 'Twilight']),
  makePal('sun_3', 'Santorini Caldera Dusk', 'sunset', 'Sunset', 'Aegean whitewash walls bathed in warm apricot and caldera gold', false, '#ea580c', '#d97706', '#2563eb', '#fffbf5', '#ffffff', '#fff4e6', '#ffe6cc', '#ffffff', '#fed1a3', 'rgba(234,88,12,0.25)', '#431407', '#7c2d12', '#9a3412', 'rgba(234,88,12,0.1)', 'rgba(67,20,7,0.06)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.98)', ['Santorini', 'Caldera']),
  makePal('sun_4', 'Kyoto Maple Sundown', 'sunset', 'Sunset', 'Autumn temple maple leaves backlit by vermilion sunset rays', true, '#ef4444', '#f97316', '#eab308', '#140607', '#240c0f', '#331215', '#2a0f12', '#18080a', 'rgba(239,68,68,0.3)', 'rgba(249,115,22,0.6)', '#fef2f2', '#ffedd5', '#fca5a5', 'rgba(239,68,68,0.22)', 'rgba(0,0,0,0.75)', '#240c0f', 'rgba(255,255,255,0.2)', ['Kyoto', 'Maple']),
  makePal('sun_5', 'Golden Hour Ray', 'sunset', 'Sunset', 'Dreamy photographic 5 PM warm light beaming through hazy glass', false, '#d97706', '#f59e0b', '#c2410c', '#fffdf5', '#ffffff', '#fdf8e6', '#faecc4', '#ffffff', '#f6dc96', 'rgba(217,119,6,0.25)', '#451a03', '#78350f', '#92400e', 'rgba(217,119,6,0.1)', 'rgba(69,26,3,0.06)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.98)', ['Golden Hour', 'Warm']),

  // 18. MONOCHROME (5 Palettes)
  makePal('mon_1', 'True OLED Black 0x0', 'monochrome', 'Monochrome', 'Zero emission pure #000000 pixel-off canvas with 1px razor lines', true, '#ffffff', '#d4d4d8', '#38bdf8', '#000000', '#050507', '#0c0c10', '#0d0d12', '#000000', 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0.4)', '#ffffff', '#e4e4e7', '#a1a1aa', 'rgba(255,255,255,0.1)', 'rgba(0,0,0,0.95)', '#050507', 'rgba(255,255,255,0.2)', ['OLED', 'Pitch Black']),
  makePal('mon_2', 'Pure White Minimalist', 'monochrome', 'Monochrome', 'Laboratory clean paper white with subtle 1px charcoal wireframes', false, '#09090b', '#27272a', '#71717a', '#ffffff', '#ffffff', '#f8fafc', '#f1f5f9', '#ffffff', '#e2e8f0', 'rgba(9,9,11,0.2)', '#09090b', '#27272a', '#52525b', 'rgba(9,9,11,0.05)', 'rgba(0,0,0,0.06)', 'rgba(255,255,255,0.95)', 'rgba(255,255,255,1)', ['Paper', 'Clean']),
  makePal('mon_3', 'Charcoal Studio 900', 'monochrome', 'Monochrome', 'Industrial neutral dark gray scale with zero color saturation', true, '#f4f4f5', '#a1a1aa', '#71717a', '#09090b', '#121214', '#18181b', '#141416', '#0d0d0f', 'rgba(244,244,245,0.2)', 'rgba(244,244,245,0.4)', '#fafafa', '#e4e4e7', '#a1a1aa', 'rgba(244,244,245,0.1)', 'rgba(0,0,0,0.75)', '#121214', 'rgba(255,255,255,0.18)', ['Charcoal', 'Studio']),
  makePal('mon_4', 'Silver Platinum Foil', 'monochrome', 'Monochrome', 'High-contrast silver and metallic graphite with clean tabular numerals', false, '#1e293b', '#475569', '#0ea5e9', '#f8fafc', '#ffffff', '#f1f5f9', '#e2e8f0', '#ffffff', '#cbd5e1', 'rgba(30,41,59,0.2)', '#0f172a', '#334155', '#64748b', 'rgba(30,41,59,0.06)', 'rgba(15,23,42,0.05)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.98)', ['Silver', 'Foil']),
  makePal('mon_5', 'Ash & Ink Monolith', 'monochrome', 'Monochrome', 'Japanese sumi-e ink wash on stone gray for austere focus', true, '#e5e5e5', '#a3a3a3', '#525252', '#0a0a0a', '#141414', '#1c1c1c', '#181818', '#0f0f0f', 'rgba(229,229,229,0.22)', 'rgba(229,229,229,0.45)', '#f5f5f5', '#d4d4d4', '#737373', 'rgba(229,229,229,0.1)', 'rgba(0,0,0,0.8)', '#141414', 'rgba(255,255,255,0.16)', ['Sumi-e', 'Ash']),

  // 19. WARM NEUTRAL (5 Palettes)
  makePal('war_1', 'Espresso Roastery Bar', 'warm-neutral', 'Warm Neutral', 'Dark roasted Arabica bean tones with steamed caramel milk', true, '#f59e0b', '#d97706', '#b45309', '#120d09', '#1c1510', '#261e17', '#201812', '#150f0b', 'rgba(245,158,11,0.28)', 'rgba(245,158,11,0.5)', '#fef3c7', '#fde68a', '#d97706', 'rgba(245,158,11,0.18)', 'rgba(0,0,0,0.7)', '#1c1510', 'rgba(255,255,255,0.15)', ['Espresso', 'Caramel']),
  makePal('war_2', 'Artisanal Oat Linen', 'warm-neutral', 'Warm Neutral', 'Unbleached natural linen and woven jute paper with espresso ink', false, '#78350f', '#92400e', '#b45309', '#faf6ef', '#ffffff', '#f4ede1', '#ebdccb', '#ffffff', '#decbb5', 'rgba(120,53,15,0.25)', '#292524', '#44403c', '#78716c', 'rgba(120,53,15,0.1)', 'rgba(41,37,36,0.06)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.98)', ['Linen', 'Oat']),
  makePal('war_3', 'Tuscan Sunlit Villa', 'warm-neutral', 'Warm Neutral', 'Aged terracotta roof tiles and sun-drenched stucco walls', false, '#c2410c', '#ea580c', '#d97706', '#fdfbf7', '#ffffff', '#f9f3e9', '#f2e5d0', '#ffffff', '#e8d2b0', 'rgba(194,65,12,0.25)', '#431407', '#7c2d12', '#9a3412', 'rgba(194,65,12,0.1)', 'rgba(67,20,7,0.06)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.98)', ['Tuscan', 'Villa']),
  makePal('war_4', 'Smoked Walnut Woodcraft', 'warm-neutral', 'Warm Neutral', 'Dark oiled American walnut grain with warm brass accents', true, '#d97706', '#f59e0b', '#fbbf24', '#130e0a', '#1e1611', '#281f18', '#221a14', '#16100c', 'rgba(217,119,6,0.28)', 'rgba(245,158,11,0.5)', '#fef3c7', '#fed7aa', '#f59e0b', 'rgba(217,119,6,0.18)', 'rgba(0,0,0,0.7)', '#1e1611', 'rgba(255,255,255,0.15)', ['Walnut', 'Wood']),
  makePal('war_5', 'Japanese Cedar Soba', 'warm-neutral', 'Warm Neutral', 'Tranquil soba noodle shop with pale cedar wood counters', false, '#854d0e', '#a16207', '#059669', '#fbf8f2', '#ffffff', '#f5eedf', '#eae0cb', '#ffffff', '#dccbb1', 'rgba(133,77,14,0.25)', '#422006', '#713f12', '#854d0e', 'rgba(133,77,14,0.1)', 'rgba(66,32,6,0.06)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.98)', ['Cedar', 'Soba']),

  // 20. COOL NEUTRAL (5 Palettes)
  makePal('coo_1', 'Glacial Slate Titanium', 'cool-neutral', 'Cool Neutral', 'Precision aerospace graphite with frosted glacier blue edge', true, '#38bdf8', '#0284c7', '#818cf8', '#0a0e14', '#131a24', '#1b2534', '#17202c', '#0f151e', 'rgba(56,189,248,0.26)', 'rgba(56,189,248,0.5)', '#f0f9ff', '#e2e8f0', '#94a3b8', 'rgba(56,189,248,0.18)', 'rgba(0,0,0,0.7)', '#131a24', 'rgba(255,255,255,0.16)', ['Glacial', 'Titanium']),
  makePal('coo_2', 'Architectural Zinc Grid', 'cool-neutral', 'Cool Neutral', 'Muted cool gray zinc surfaces with crisp architectural lines', false, '#0284c7', '#0369a1', '#2563eb', '#f1f5f9', '#ffffff', '#e2e8f0', '#cbd5e1', '#ffffff', '#94a3b8', 'rgba(2,132,199,0.25)', '#0f172a', '#1e293b', '#475569', 'rgba(2,132,199,0.08)', 'rgba(15,23,42,0.06)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.98)', ['Zinc', 'Grid']),
  makePal('coo_3', 'Sub-Zero Frosted Glass', 'cool-neutral', 'Cool Neutral', 'Icy atmospheric blue-gray haze over dark fjord waters', true, '#7dd3fc', '#38bdf8', '#a5b4fc', '#060c13', '#0e1722', '#142131', '#111c2a', '#0a121b', 'rgba(125,211,252,0.26)', 'rgba(125,211,252,0.5)', '#f0f9ff', '#e0f2fe', '#94a3b8', 'rgba(125,211,252,0.18)', 'rgba(0,0,0,0.7)', '#0e1722', 'rgba(255,255,255,0.16)', ['Sub-Zero', 'Fjord']),
  makePal('coo_4', 'Oslo Foggy Morning', 'cool-neutral', 'Cool Neutral', 'Soft low-contrast morning fog over Scandinavian granite piers', false, '#334155', '#475569', '#0284c7', '#f8fafc', '#ffffff', '#f1f5f9', '#e2e8f0', '#ffffff', '#cbd5e1', 'rgba(51,65,85,0.2)', '#0f172a', '#334155', '#64748b', 'rgba(51,65,85,0.06)', 'rgba(15,23,42,0.05)', 'rgba(255,255,255,0.92)', 'rgba(255,255,255,0.98)', ['Oslo', 'Fog']),
  makePal('coo_5', 'Deep Carbon Fiber 3K', 'cool-neutral', 'Cool Neutral', 'Textured 3K carbon weave with cool titanium and cerulean trim', true, '#60a5fa', '#3b82f6', '#38bdf8', '#080a0e', '#10141c', '#181e2a', '#141924', '#0c0f16', 'rgba(96,165,250,0.26)', 'rgba(96,165,250,0.5)', '#f8fafc', '#e2e8f0', '#94a3b8', 'rgba(96,165,250,0.18)', 'rgba(0,0,0,0.75)', '#10141c', 'rgba(255,255,255,0.16)', ['Carbon', '3K']),
];

export function getPaletteById(id: string): CuratedPalette | undefined {
  return CURATED_PALETTES.find((p) => p.id === id);
}

export function getPalettesByCategory(cat: ColorPaletteCategory): CuratedPalette[] {
  return CURATED_PALETTES.filter((p) => p.category === cat);
}
