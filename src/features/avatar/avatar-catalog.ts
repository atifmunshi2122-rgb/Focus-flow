/**
 * FocusFlow & Finance — Multi-User Avatar Catalog & Security Validation
 *
 * Shared, extensible 3D anime model library. Never hardcodes specific user names;
 * every user selects from approved catalog entries and customizes appearance safely.
 */

export type HairMaterialFinish = 'silky' | 'matte' | 'glossy';

export interface UserAvatarCustomization {
  hairstyle?: string;
  hairColor?: string;
  hairMaterial?: HairMaterialFinish;
  eyeColor?: string;
  irisColor?: string;
  outfit?: string;
  outfitColor?: string;
  outfitPrimary?: string;
  outfitSecondary?: string;
  pantsColor?: string;
  shoesColor?: string;
  accessories?: string[];
}

export interface UserAvatarConfig {
  avatarId: string;
  modelUrl: string;
  customization: UserAvatarCustomization;
  updatedAt: number;
}

export interface AvatarCatalogEntry {
  id: string;
  displayName: string;
  style: 'male' | 'female';
  modelUrl: string;
  previewLabel: string;
  modelFormat: 'glb';
  rigType: 'humanoid_21_bones' | 'static_unrigged' | 'humanoid_seated_v1';
  isRigged: boolean;
  hasHumanoidSkeleton: boolean;
  animationSupport: 'none' | 'whole_model_only' | 'procedural_skeletal' | 'embedded_clips';
  supportedPoses: readonly ('standing' | 'seated')[];
  rigStatus: 'unrigged_static' | 'rigged_21_bones_procedural' | 'rigged_full_clips';
  animationCompatibility: readonly string[];
  license: string;
  available: boolean;
  supportedCustomization: {
    hairColors: readonly string[];
    hairMaterials?: readonly HairMaterialFinish[];
    eyeColors: readonly string[];
    outfitColors: readonly string[];
    outfitSecondaryColors?: readonly string[];
    pantsColors?: readonly string[];
    shoesColors?: readonly string[];
    accessories: readonly string[];
  };
  defaults: {
    skinTone: string;
    hairColor: string;
    hairHighlight: string;
    hairMaterial?: HairMaterialFinish;
    eyeColor: string;
    outfitColor: string;
    outfitSecondary: string;
    pantsColor?: string;
    shoesColor?: string;
  };
}

export const AVATAR_CATALOG: AvatarCatalogEntry[] = [
  {
    id: 'avatar-01',
    displayName: 'Yuki — Anime Cardigan Scholar',
    style: 'female',
    modelUrl: '/models/avatars/avatar-01.glb',
    previewLabel: '21-Bone Rig · Layered Cardigan',
    modelFormat: 'glb',
    rigType: 'humanoid_21_bones',
    isRigged: true,
    hasHumanoidSkeleton: true,
    animationSupport: 'procedural_skeletal',
    supportedPoses: ['standing', 'seated'],
    rigStatus: 'rigged_21_bones_procedural',
    animationCompatibility: ['idle', 'studying', 'typing', 'reading', 'writing', 'walking', 'wave', 'celebrate'],
    license: 'User Uploaded GLB (Shared Library #1)',
    available: true,
    supportedCustomization: {
      hairColors: ['#2c1614', '#1e2438', '#4a2c2a', '#6d28d9', '#9f1239'],
      hairMaterials: ['silky', 'matte', 'glossy'],
      eyeColors: ['#4f46e5', '#0284c7', '#10b981', '#db2777', '#d97706'],
      outfitColors: ['#7c3aed', '#312e81', '#0f766e', '#be185d', '#334155'],
      outfitSecondaryColors: ['#f8fafc', '#fef3c7', '#e0e7ff', '#fce7f3', '#1e293b'],
      pantsColors: ['#1e293b', '#0f172a', '#312e81', '#3f3f46', '#475569'],
      shoesColors: ['#e9d5ff', '#f8fafc', '#1e293b', '#fda4af', '#93c5fd'],
      accessories: ['glasses', 'headphones'],
    },
    defaults: {
      skinTone: '#fce0c8',
      hairColor: '#2c1614',
      hairHighlight: '#5c3029',
      hairMaterial: 'silky',
      eyeColor: '#4f46e5',
      outfitColor: '#7c3aed',
      outfitSecondary: '#f8fafc',
      pantsColor: '#1e293b',
      shoesColor: '#e9d5ff',
    },
  },
  {
    id: 'avatar-02',
    displayName: 'Ren — Hoodie & Watch Student',
    style: 'male',
    modelUrl: '/models/avatars/avatar-02.glb',
    previewLabel: 'Unrigged Mesh · Navy Hoodie',
    modelFormat: 'glb',
    rigType: 'static_unrigged',
    isRigged: false,
    hasHumanoidSkeleton: false,
    animationSupport: 'whole_model_only',
    supportedPoses: ['standing'],
    rigStatus: 'unrigged_static',
    animationCompatibility: ['idle', 'studying'],
    license: 'User Uploaded GLB (Shared Library #2)',
    available: true,
    supportedCustomization: {
      hairColors: ['#141318', '#27272a', '#4a2c2a', '#1e3a8a', '#3f3f46'],
      hairMaterials: ['silky', 'matte', 'glossy'],
      eyeColors: ['#4a2518', '#0284c7', '#4f46e5', '#059669', '#d97706'],
      outfitColors: ['#1e3a8a', '#0f766e', '#334155', '#7f1d1d', '#4338ca'],
      outfitSecondaryColors: ['#ffffff', '#e2e8f0', '#fef3c7', '#cbd5e1', '#1e293b'],
      pantsColors: ['#111827', '#1e293b', '#334155', '#27272a', '#3f3f46'],
      shoesColors: ['#1e3a8a', '#111827', '#0f766e', '#7f1d1d', '#f8fafc'],
      accessories: ['glasses', 'headphones', 'watch'],
    },
    defaults: {
      skinTone: '#f5cbb0',
      hairColor: '#141318',
      hairHighlight: '#334155',
      hairMaterial: 'silky',
      eyeColor: '#4a2518',
      outfitColor: '#1e3a8a',
      outfitSecondary: '#ffffff',
      pantsColor: '#111827',
      shoesColor: '#1e3a8a',
    },
  },
  {
    id: 'anime-boy-01',
    displayName: 'Kaito — Varsity Scholar',
    style: 'male',
    modelUrl: '/models/avatars/anime-boy-01.glb',
    previewLabel: 'Spiky Navy · Varsity',
    modelFormat: 'glb',
    rigType: 'humanoid_seated_v1',
    isRigged: true,
    hasHumanoidSkeleton: true,
    animationSupport: 'embedded_clips',
    supportedPoses: ['standing', 'seated'],
    rigStatus: 'rigged_full_clips',
    animationCompatibility: ['idle', 'studying', 'typing', 'reading', 'writing'],
    license: 'MIT (FocusFlow Original Rig)',
    available: true,
    supportedCustomization: {
      hairColors: ['#1e2438', '#27272a', '#4a2c2a', '#4338ca', '#9f1239'],
      eyeColors: ['#4f46e5', '#0284c7', '#10b981', '#d97706', '#8b5cf6'],
      outfitColors: ['#312e81', '#0f766e', '#334155', '#7f1d1d', '#6d28d9'],
      accessories: ['glasses', 'headphones'],
    },
    defaults: {
      skinTone: '#fce0c8',
      hairColor: '#1e2438',
      hairHighlight: '#3b4a78',
      eyeColor: '#4f46e5',
      outfitColor: '#312e81',
      outfitSecondary: '#e2e8f0',
    },
  },
  {
    id: 'anime-boy-02',
    displayName: 'Ren — Minimalist Coder',
    style: 'male',
    modelUrl: '/models/avatars/anime-boy-02.glb',
    previewLabel: 'Swept Charcoal · Teal',
    modelFormat: 'glb',
    rigType: 'humanoid_seated_v1',
    isRigged: true,
    hasHumanoidSkeleton: true,
    animationSupport: 'embedded_clips',
    supportedPoses: ['standing', 'seated'],
    rigStatus: 'rigged_full_clips',
    animationCompatibility: ['idle', 'studying', 'typing', 'reading', 'writing'],
    license: 'MIT (FocusFlow Original Rig)',
    available: true,
    supportedCustomization: {
      hairColors: ['#27272a', '#1e293b', '#78350f', '#0f766e', '#6d28d9'],
      eyeColors: ['#0284c7', '#4f46e5', '#059669', '#e11d48', '#f59e0b'],
      outfitColors: ['#0f766e', '#1e293b', '#4338ca', '#b45309', '#475569'],
      accessories: ['glasses', 'headphones'],
    },
    defaults: {
      skinTone: '#f7d5b9',
      hairColor: '#27272a',
      hairHighlight: '#52525b',
      eyeColor: '#0284c7',
      outfitColor: '#0f766e',
      outfitSecondary: '#f1f5f9',
    },
  },
  {
    id: 'anime-girl-01',
    displayName: 'Sora — Ponytail Researcher',
    style: 'female',
    modelUrl: '/models/avatars/anime-girl-01.glb',
    previewLabel: 'Ponytail · Lavender',
    modelFormat: 'glb',
    rigType: 'humanoid_seated_v1',
    isRigged: true,
    hasHumanoidSkeleton: true,
    animationSupport: 'embedded_clips',
    supportedPoses: ['standing', 'seated'],
    rigStatus: 'rigged_full_clips',
    animationCompatibility: ['idle', 'studying', 'typing', 'reading', 'writing'],
    license: 'MIT (FocusFlow Original Rig)',
    available: true,
    supportedCustomization: {
      hairColors: ['#3b2436', '#1e2438', '#78350f', '#be185d', '#6d28d9'],
      eyeColors: ['#8b5cf6', '#ec4899', '#0ea5e9', '#10b981', '#f59e0b'],
      outfitColors: ['#c4b5fd', '#fbcfe8', '#a5f3fc', '#fde68a', '#312e81'],
      accessories: ['glasses', 'headphones', 'ribbon'],
    },
    defaults: {
      skinTone: '#fde4d0',
      hairColor: '#3b2436',
      hairHighlight: '#6b3e62',
      eyeColor: '#8b5cf6',
      outfitColor: '#c4b5fd',
      outfitSecondary: '#f8fafc',
    },
  },
  {
    id: 'anime-girl-02',
    displayName: 'Hana — Twin-Tail Strategist',
    style: 'female',
    modelUrl: '/models/avatars/anime-girl-02.glb',
    previewLabel: 'Twin-Tails · Sakura',
    modelFormat: 'glb',
    rigType: 'humanoid_seated_v1',
    isRigged: true,
    hasHumanoidSkeleton: true,
    animationSupport: 'embedded_clips',
    supportedPoses: ['standing', 'seated'],
    rigStatus: 'rigged_full_clips',
    animationCompatibility: ['idle', 'studying', 'typing', 'reading', 'writing'],
    license: 'MIT (FocusFlow Original Rig)',
    available: true,
    supportedCustomization: {
      hairColors: ['#4a2c2a', '#27272a', '#f472b6', '#4f46e5', '#92400e'],
      eyeColors: ['#db2777', '#8b5cf6', '#0284c7', '#10b981', '#d97706'],
      outfitColors: ['#fda4af', '#c4b5fd', '#93c5fd', '#86efac', '#1e293b'],
      accessories: ['glasses', 'headphones', 'ribbon'],
    },
    defaults: {
      skinTone: '#fce1cb',
      hairColor: '#4a2c2a',
      hairHighlight: '#7c4a46',
      eyeColor: '#db2777',
      outfitColor: '#fda4af',
      outfitSecondary: '#fff1f2',
    },
  },
];

export const DEFAULT_AVATAR_ID = 'avatar-01';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ALLOWED_ACCESSORIES = new Set(['glasses', 'headphones', 'ribbon', 'watch']);
const ALLOWED_HAIR_MATERIALS = new Set<HairMaterialFinish>(['silky', 'matte', 'glossy']);

export function getAvatarCatalogEntry(avatarId?: string | null): AvatarCatalogEntry {
  return (
    AVATAR_CATALOG.find((e) => e.id === avatarId && e.available) ||
    AVATAR_CATALOG[0]
  );
}

/**
 * Validates and sanitizes an incoming avatar configuration against the approved catalog.
 * NEVER trusts arbitrary client-provided modelUrl values.
 */
export function validateAndSanitizeAvatarConfig(raw: unknown): UserAvatarConfig {
  const fallbackEntry = getAvatarCatalogEntry(DEFAULT_AVATAR_ID);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      avatarId: fallbackEntry.id,
      modelUrl: fallbackEntry.modelUrl,
      customization: {
        hairColor: fallbackEntry.defaults.hairColor,
        eyeColor: fallbackEntry.defaults.eyeColor,
        outfitColor: fallbackEntry.defaults.outfitColor,
        accessories: [],
      },
      updatedAt: Date.now(),
    };
  }

  const obj = raw as Record<string, unknown>;
  const entry = getAvatarCatalogEntry(typeof obj.avatarId === 'string' ? obj.avatarId : null);
  const cust =
    obj.customization && typeof obj.customization === 'object' && !Array.isArray(obj.customization)
      ? (obj.customization as Record<string, unknown>)
      : {};

  const safeColor = (val: unknown, fallback: string) =>
    typeof val === 'string' && HEX_COLOR_RE.test(val.trim()) ? val.trim() : fallback;

  const accessories = Array.isArray(cust.accessories)
    ? Array.from(
        new Set(
          cust.accessories
            .filter((a): a is string => typeof a === 'string' && ALLOWED_ACCESSORIES.has(a))
            .filter((a) => entry.supportedCustomization.accessories.includes(a))
        )
      ).slice(0, 3)
    : [];

  const safeOptionalColor = (val: unknown, fallback?: string) =>
    typeof val === 'string' && HEX_COLOR_RE.test(val.trim()) ? val.trim() : fallback;

  const hairMat: HairMaterialFinish =
    typeof cust.hairMaterial === 'string' && ALLOWED_HAIR_MATERIALS.has(cust.hairMaterial as HairMaterialFinish)
      ? (cust.hairMaterial as HairMaterialFinish)
      : entry.defaults.hairMaterial || 'silky';

  const primaryHex = safeColor(cust.outfitPrimary ?? cust.outfitColor, entry.defaults.outfitColor);
  const eyeHex = safeColor(cust.irisColor ?? cust.eyeColor, entry.defaults.eyeColor);

  return {
    avatarId: entry.id,
    modelUrl: entry.modelUrl, // Authoritative catalog URL only
    customization: {
      hairstyle: typeof cust.hairstyle === 'string' ? cust.hairstyle.slice(0, 32) : undefined,
      hairColor: safeColor(cust.hairColor, entry.defaults.hairColor),
      hairMaterial: hairMat,
      eyeColor: eyeHex,
      irisColor: eyeHex,
      outfit: typeof cust.outfit === 'string' ? cust.outfit.slice(0, 32) : undefined,
      outfitColor: primaryHex,
      outfitPrimary: primaryHex,
      outfitSecondary: safeOptionalColor(cust.outfitSecondary, entry.defaults.outfitSecondary),
      pantsColor: safeOptionalColor(cust.pantsColor, entry.defaults.pantsColor),
      shoesColor: safeOptionalColor(cust.shoesColor, entry.defaults.shoesColor),
      accessories,
    },
    updatedAt: typeof obj.updatedAt === 'number' && Number.isFinite(obj.updatedAt) ? obj.updatedAt : Date.now(),
  };
}

