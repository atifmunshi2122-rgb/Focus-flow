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
  | 'aurora';

export type DesignStyleCategory =
  | 'all'
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
