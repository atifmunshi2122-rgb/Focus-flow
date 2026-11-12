export type DesignStyleId =
  | 'glassmorphism'
  | 'claymorphism'
  | 'skeuomorphism'
  | 'neumorphism'
  | 'minimalism'
  | 'brutalism'
  | 'cyberpunk'
  | 'gradient3d'
  | 'material'
  | 'flat'
  | 'fluent'
  | 'editorial'
  | 'retro'
  | 'oled'
  | 'pastel'
  | 'aurora'
  | 'glazed_clay'
  | 'cyber_glass'
  | 'soft_glass';

export type DesignStyleCategory =
  | 'all'
  | 'hybrid'
  | 'tactile'
  | 'modern'
  | 'high-contrast'
  | 'classic'
  | 'dark-neon';

export type ColorModePreference = 'light' | 'dark' | 'system';

export type FontPairingId =
  | 'auto'
  | 'jakarta'
  | 'inter'
  | 'outfit'
  | 'space'
  | 'editorial'
  | 'cyber'
  | 'classic'
  | 'system';

export type FontScaleId = 'compact' | 'default' | 'large';

export type ShadowIntensity = 'auto' | 'none' | 'subtle' | 'elevated' | 'dramatic';

export type BackgroundMode = 'auto' | 'solid' | 'gradient' | 'mesh' | 'grid' | 'aurora';

export type AnimationIntensity = 'none' | 'subtle' | 'standard' | 'expressive';

export type InterfaceDensity = 'compact' | 'comfortable' | 'spacious';

export type ColorPaletteCategory =
  | 'dark-luxury'
  | 'light-minimal'
  | 'pastel'
  | 'neon'
  | 'cyberpunk'
  | 'glassmorphism'
  | 'claymorphism'
  | 'neumorphism'
  | 'skeuomorphism'
  | 'aurora'
  | 'gradient'
  | '3d-metallic'
  | 'royal'
  | 'corporate'
  | 'nature'
  | 'ocean'
  | 'sunset'
  | 'monochrome'
  | 'warm-neutral'
  | 'cool-neutral';

export type HarmonyType =
  | 'complementary'
  | 'analogous'
  | 'triadic'
  | 'split-complementary'
  | 'tetradic'
  | 'monochromatic';

export type GradientType =
  | 'linear'
  | 'radial'
  | 'conic'
  | 'mesh'
  | 'aurora'
  | 'metallic'
  | 'animated';

export interface GradientStop {
  id?: string;
  color: string;
  position: number; // 0 to 100
}

export interface GradientConfig {
  name?: string;
  type: GradientType;
  angle: number; // 0 to 360
  stops: GradientStop[]; // 2 to 5 stops
  animated?: boolean;
  speedSeconds?: number;
}

export interface PaletteTokens {
  primary: string;
  secondary: string;
  accent: string;
  bgCanvas: string;
  bgBackdrop: string;
  surfaceCard: string;
  surfaceElevated: string;
  surfaceMuted: string;
  surfaceInset: string;
  borderColor: string;
  borderGlow: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  ambientLight: string;
  shadowTint: string;
  glassTint: string;
  highlight: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
}

export interface CuratedPalette {
  id: string;
  name: string;
  category: ColorPaletteCategory;
  categoryLabel: string;
  description: string;
  isDark: boolean;
  tags: string[];
  tokens: PaletteTokens;
  gradientStops: Array<{ color: string; position: number }>;
  recommendedStyleId?: DesignStyleId;
}

export interface ThreeDLightingConfig {
  ambientLightColor?: string;
  ambientLightIntensity?: number; // 0 to 100
  shadowColor?: string;
  shadowIntensity?: number; // 0 to 100
  glassTint?: string;
  glassOpacity?: number; // 0 to 100
  glassBlur?: number; // 0 to 40
  glowColor?: string;
  glowIntensity?: number; // 0 to 100
  highlightColor?: string;
  cardElevation?: number; // 0 to 32
  depthIntensity?: number; // 0 to 100
}

export interface StyleFusionConfig {
  primaryStyleId: DesignStyleId;
  secondaryStyleId: DesignStyleId;
  blendRatio: number; // 0 to 100
  translucency: number; // 0 to 100
  inflation: number; // 0 to 100
  blur: number; // 0 to 32
  borderSpecularity: number; // 0 to 100
  shadowWeight: number; // 0 to 100
  springFactor: number; // 0 to 100
}

export interface ThemeConfig {
  styleId: DesignStyleId;
  colorMode: ColorModePreference;
  accentColor: string | null;
  secondaryAccentColor: string | null;
  fontPairing: FontPairingId;
  fontScale: FontScaleId;
  cardRadius: number | null;
  shadowIntensity: ShadowIntensity;
  backgroundMode: BackgroundMode;
  customGradient: string | null;
  animationIntensity: AnimationIntensity;
  density: InterfaceDensity;

  // Complete Color Ecosystem & 3D Customization Tokens
  activePaletteId?: string | null;
  customPalette?: Partial<PaletteTokens> | null;
  gradientConfig?: GradientConfig | null;
  threeDLighting?: Partial<ThreeDLightingConfig> | null;
  fusionConfig?: StyleFusionConfig | null;
}

export interface SavedCustomTheme {
  id: string;
  name: string;
  description?: string;
  config: ThemeConfig;
  createdAt: string;
  updatedAt: string;
}

export interface ModePalette {
  bgCanvas: string;
  bgBackdrop: string;
  surfaceCard: string;
  surfaceElevated: string;
  surfaceMuted: string;
  surfaceInset: string;
  surfaceHover: string;
  surfaceSidebar: string;
  surfaceHeader: string;
  surfaceHero: string;
  heroText: string;
  heroMuted: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  borderColor: string;
  borderStrong: string;
  borderHighlight: string;
  shadowCard: string;
  shadowElevated: string;
  shadowButton: string;
  shadowInset: string;
  neuLight: string;
  neuDark: string;
  accentDefault: string;
  secondaryDefault: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
}

export interface StyleDefinition {
  id: DesignStyleId;
  name: string;
  tagline: string;
  description: string;
  category: Exclude<DesignStyleCategory, 'all'>;
  preferredColorMode: 'light' | 'dark';
  defaultFontPairing: Exclude<FontPairingId, 'auto'>;
  defaultRadius: number;
  defaultBackgroundMode: Exclude<BackgroundMode, 'auto'>;
  borderWidth: string;
  backdropBlur: string;
  headingWeight: string;
  headingTracking: string;
  buttonRadius: string;
  badgeRadius: string;
  traits: string[];
  light: ModePalette;
  dark: ModePalette;
}

export interface FontPairingDefinition {
  id: Exclude<FontPairingId, 'auto'>;
  name: string;
  description: string;
  displayFont: string;
  bodyFont: string;
  monoFont: string;
  sampleHeadline: string;
}

export interface BackgroundGradientPreset {
  id: string;
  name: string;
  lightCss: string;
  darkCss: string;
  previewSwatch: string;
}
