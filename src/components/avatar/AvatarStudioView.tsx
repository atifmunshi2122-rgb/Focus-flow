import React, { Component, Suspense, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import {
  Check,
  Eye,
  Glasses,
  Headphones,
  Palette,
  RotateCcw,
  Save,
  Shirt,
  Sparkles,
  UserCheck,
  Watch,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import {
  AVATAR_CATALOG,
  DEFAULT_AVATAR_ID,
  getAvatarCatalogEntry,
  validateAndSanitizeAvatarConfig,
  type AvatarCatalogEntry,
  type HairMaterialFinish,
  type UserAvatarConfig,
  type UserAvatarCustomization,
} from '../../features/avatar/avatar-catalog.ts';
import type { StudyActivity } from '../../features/study-room/types.ts';
import { updateUserAvatarConfig } from '../../lib/leaderboardService.ts';
import StudyAvatar, { type StudyAvatarActivity } from '../study-room/StudyAvatar.tsx';
import { AnimeCharacterSvg } from '../study-room/AnimeCharacterSvg.tsx';

class AvatarWebGLErrorBoundary extends Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('Avatar 3D WebGL fallback triggered:', err);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

const PREVIEW_ACTIVITIES: { id: StudyAvatarActivity; label: string }[] = [
  { id: 'idle', label: 'Idle' },
  { id: 'studying', label: 'Studying' },
  { id: 'typing', label: 'Typing' },
  { id: 'reading', label: 'Reading' },
  { id: 'writing', label: 'Writing' },
  { id: 'walking', label: 'Walking' },
];

type CustomizationTab = 'hair' | 'eyes' | 'outfit' | 'accessories';

const CUSTOMIZATION_TABS: { id: CustomizationTab; label: string }[] = [
  { id: 'hair', label: 'Hair' },
  { id: 'eyes', label: 'Eyes' },
  { id: 'outfit', label: 'Outfit' },
  { id: 'accessories', label: 'Gear' },
];

const LOCAL_AVATAR_STORAGE_KEY = 'ff_user_avatar_config';

function buildEntryDefaultsCustomization(entry: AvatarCatalogEntry): UserAvatarCustomization {
  return {
    hairColor: entry.defaults.hairColor,
    hairMaterial: entry.defaults.hairMaterial || 'silky',
    eyeColor: entry.defaults.eyeColor,
    irisColor: entry.defaults.eyeColor,
    outfitColor: entry.defaults.outfitColor,
    outfitPrimary: entry.defaults.outfitColor,
    outfitSecondary: entry.defaults.outfitSecondary,
    pantsColor: entry.defaults.pantsColor,
    shoesColor: entry.defaults.shoesColor,
    accessories: [],
  };
}

function loadInitialAvatarConfig(settingsAvatarConfig?: UserAvatarConfig | null): UserAvatarConfig {
  if (settingsAvatarConfig && typeof settingsAvatarConfig === 'object') {
    return validateAndSanitizeAvatarConfig(settingsAvatarConfig);
  }
  try {
    const raw = localStorage.getItem(LOCAL_AVATAR_STORAGE_KEY);
    if (raw) {
      return validateAndSanitizeAvatarConfig(JSON.parse(raw));
    }
  } catch {
    // ignore storage read errors
  }
  return validateAndSanitizeAvatarConfig({ avatarId: DEFAULT_AVATAR_ID });
}

export const AvatarStudioView: React.FC = () => {
  const { settings, updateSettings, firebaseUser, showToast } = useApp();

  const [savedConfig, setSavedConfig] = useState<UserAvatarConfig>(() =>
    loadInitialAvatarConfig(settings?.avatarConfig ?? null)
  );
  const [draftAvatarId, setDraftAvatarId] = useState<string>(savedConfig.avatarId);
  const [draftCustomization, setDraftCustomization] = useState<UserAvatarCustomization>(
    () => ({ ...savedConfig.customization })
  );
  const [previewActivity, setPreviewActivity] = useState<StudyAvatarActivity>('studying');
  const [activeCategory, setActiveCategory] = useState<CustomizationTab>('hair');
  const [styleFilter, setStyleFilter] = useState<'all' | 'male' | 'female'>('all');
  const [saving, setSaving] = useState(false);

  const selectedEntry: AvatarCatalogEntry = useMemo(
    () => getAvatarCatalogEntry(draftAvatarId),
    [draftAvatarId]
  );

  const filteredCatalog = useMemo(
    () =>
      AVATAR_CATALOG.filter((entry) =>
        styleFilter === 'all' ? true : entry.style === styleFilter
      ),
    [styleFilter]
  );

  const supportedActivities = useMemo(
    () =>
      PREVIEW_ACTIVITIES.filter((act) =>
        selectedEntry.animationCompatibility.includes(act.id)
      ),
    [selectedEntry]
  );

  const activePreviewActivity: StudyAvatarActivity = useMemo(() => {
    if (selectedEntry.animationCompatibility.includes(previewActivity)) {
      return previewActivity;
    }
    return 'idle';
  }, [selectedEntry, previewActivity]);

  const sanitizedPreviewConfig = useMemo(
    () =>
      validateAndSanitizeAvatarConfig({
        avatarId: selectedEntry.id,
        customization: draftCustomization,
      }),
    [selectedEntry.id, draftCustomization]
  );

  const handleSelectCharacter = (entry: AvatarCatalogEntry) => {
    if (!entry.available) return;
    setDraftAvatarId(entry.id);
    const supportedAcc = new Set(entry.supportedCustomization.accessories);
    const keptAccessories = (draftCustomization.accessories || []).filter((a) =>
      supportedAcc.has(a)
    );
    setDraftCustomization({
      ...buildEntryDefaultsCustomization(entry),
      accessories: keptAccessories,
    });
  };

  const handleResetAppearance = () => {
    setDraftCustomization(buildEntryDefaultsCustomization(selectedEntry));
  };

  const handleUseDefaultAvatar = () => {
    const defEntry = getAvatarCatalogEntry(DEFAULT_AVATAR_ID);
    setDraftAvatarId(defEntry.id);
    setDraftCustomization(buildEntryDefaultsCustomization(defEntry));
  };

  const handleCancelChanges = () => {
    setDraftAvatarId(savedConfig.avatarId);
    setDraftCustomization({ ...savedConfig.customization });
  };

  const toggleAccessory = (acc: string) => {
    setDraftCustomization((prev) => {
      const current = prev.accessories || [];
      const exists = current.includes(acc);
      return {
        ...prev,
        accessories: exists ? current.filter((item) => item !== acc) : [...current, acc],
      };
    });
  };

  const handleSaveAvatar = async () => {
    setSaving(true);
    try {
      const clean = validateAndSanitizeAvatarConfig({
        avatarId: selectedEntry.id,
        customization: draftCustomization,
        updatedAt: Date.now(),
      });

      try {
        localStorage.setItem(LOCAL_AVATAR_STORAGE_KEY, JSON.stringify(clean));
      } catch {
        // ignore storage errors
      }

      await updateSettings({ avatarConfig: clean }, { silent: true });

      if (firebaseUser?.uid) {
        await updateUserAvatarConfig(firebaseUser.uid, clean);
      }

      setSavedConfig(clean);
      showToast?.('Your 3D Study Avatar has been saved and synced!', 'success');
    } catch (err) {
      console.error('Failed to save avatar config:', err);
      showToast?.('Could not save avatar right now. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const hasUnsavedChanges = useMemo(() => {
    return (
      savedConfig.avatarId !== sanitizedPreviewConfig.avatarId ||
      JSON.stringify(savedConfig.customization) !==
        JSON.stringify(sanitizedPreviewConfig.customization)
    );
  }, [savedConfig, sanitizedPreviewConfig]);

  const userDisplayName = firebaseUser?.displayName?.trim() || 'Your Avatar';

  const renderColorRow = (
    label: string,
    colors: readonly string[] | undefined,
    currentHex: string | undefined,
    onSelect: (hex: string) => void
  ) => {
    if (!colors || colors.length === 0) return null;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--ff-text-secondary)]">{label}</span>
          <span className="text-[10px] font-mono text-[var(--ff-text-muted)]">{currentHex || colors[0]}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {colors.map((hex) => {
            const active = (currentHex || colors[0]).toLowerCase() === hex.toLowerCase();
            return (
              <button
                key={hex}
                type="button"
                onClick={() => onSelect(hex)}
                className={`w-7 h-7 rounded-full border-2 transition-transform ${
                  active
                    ? 'border-white scale-110 ring-2 ring-[var(--ff-accent)]'
                    : 'border-white/20 hover:scale-105'
                }`}
                style={{ backgroundColor: hex }}
                aria-label={`Select ${label} ${hex}`}
              />
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-[var(--ff-surface)] border border-[var(--ff-border-color)] rounded-2xl p-5 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              User-Wise 3D Avatar Studio
            </span>
            {hasUnsavedChanges && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                Unsaved changes
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-[var(--ff-text-primary)]">
            Customize Your 3D Study Character
          </h1>
          <p className="text-xs text-[var(--ff-text-muted)] max-w-2xl">
            Select a shared GLB character, customize supported hair, eye, outfit, and accessory materials in real time, and sync across all Study Room modes.
          </p>
        </div>

        <button
          type="button"
          onClick={handleUseDefaultAvatar}
          className="self-start md:self-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] transition-colors"
        >
          <UserCheck className="w-3.5 h-3.5" />
          <span>Default Avatar</span>
        </button>
      </div>

      {/* 3-Column Studio Layout: Left (Catalog) · Center (3D Preview) · Right (Categories) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT: Character Selection */}
        <div className="lg:col-span-3 bg-[var(--ff-surface)] border border-[var(--ff-border-color)] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--ff-text-secondary)]">
              Characters
            </h2>
            <div className="flex items-center gap-1 bg-[var(--ff-surface-muted)] p-0.5 rounded-lg border border-[var(--ff-border-color)]">
              {(['all', 'male', 'female'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setStyleFilter(filter)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold capitalize transition-colors ${
                    styleFilter === filter
                      ? 'bg-[var(--ff-accent)] text-white'
                      : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 max-h-[460px] overflow-y-auto pr-0.5">
            {filteredCatalog.map((entry) => {
              const selected = entry.id === selectedEntry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  disabled={!entry.available}
                  onClick={() => handleSelectCharacter(entry)}
                  className={`w-full text-left p-3 rounded-xl border transition-all flex items-start justify-between gap-2 ${
                    selected
                      ? 'border-[var(--ff-accent)] bg-[var(--ff-accent)]/10 ring-1 ring-[var(--ff-accent)]'
                      : 'border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] hover:border-[var(--ff-text-muted)]'
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="text-xs font-bold text-[var(--ff-text-primary)] truncate">
                      {entry.displayName}
                    </div>
                    <p className="text-[10px] text-[var(--ff-text-muted)] truncate">
                      {entry.previewLabel}
                    </p>
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                          entry.hasHumanoidSkeleton
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-amber-500/15 text-amber-400'
                        }`}
                      >
                        {entry.hasHumanoidSkeleton ? 'Rigged' : 'Static'}
                      </span>
                      <span className="text-[9px] uppercase text-[var(--ff-text-muted)]">
                        {entry.style}
                      </span>
                    </div>
                  </div>
                  {selected && (
                    <span className="shrink-0 w-4 h-4 rounded-full bg-[var(--ff-accent)] text-white flex items-center justify-center mt-0.5">
                      <Check className="w-2.5 h-2.5" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* CENTER: Large Interactive 3D Preview */}
        <div className="lg:col-span-5 flex flex-col bg-[var(--ff-surface)] border border-[var(--ff-border-color)] rounded-2xl overflow-hidden shadow-xs">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--ff-border-color)]">
            <div className="min-w-0">
              <p className="text-xs font-bold text-[var(--ff-text-primary)] truncate">
                {selectedEntry.displayName}
              </p>
              <p className="text-[11px] text-[var(--ff-text-muted)] truncate">
                Drag to rotate · Scroll to zoom ·{' '}
                {selectedEntry.hasHumanoidSkeleton
                  ? `Poses: ${selectedEntry.supportedPoses.join(' / ')}`
                  : 'Standing breathing only (unrigged)'}
              </p>
            </div>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)]">
              {selectedEntry.style}
            </span>
          </div>

          <div className="relative h-[320px] sm:h-[450px] w-full bg-gradient-to-b from-[#0b1120] via-[#131b2e] to-[#0f172a]">
            <AvatarWebGLErrorBoundary
              fallback={
                <div className="h-full w-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <div className="w-24 h-24">
                    <AnimeCharacterSvg
                      variant="bust"
                      activity={activePreviewActivity as StudyActivity}
                      isLive
                      identity={{
                        id: selectedEntry.id,
                        label: selectedEntry.displayName,
                        modelUrl: selectedEntry.modelUrl,
                        style: selectedEntry.style,
                        skinTone: selectedEntry.defaults.skinTone,
                        hairColor: sanitizedPreviewConfig.customization.hairColor || selectedEntry.defaults.hairColor,
                        hairHighlight: selectedEntry.defaults.hairHighlight,
                        eyeColor: sanitizedPreviewConfig.customization.eyeColor || selectedEntry.defaults.eyeColor,
                        outfitPrimary: sanitizedPreviewConfig.customization.outfitPrimary || selectedEntry.defaults.outfitColor,
                        outfitSecondary: sanitizedPreviewConfig.customization.outfitSecondary || selectedEntry.defaults.outfitSecondary,
                        accessories: sanitizedPreviewConfig.customization.accessories || [],
                        customization: sanitizedPreviewConfig.customization,
                      }}
                    />
                  </div>
                  <p className="text-xs text-slate-300 max-w-xs">
                    3D WebGL preview is unavailable on this device. Your customized avatar will still sync and render in 2D Lounge &amp; Pods!
                  </p>
                </div>
              }
            >
              <div className="h-full w-full touch-none">
                <Canvas
                  shadows
                  dpr={[1, 1.5]}
                  gl={{ powerPreference: 'high-performance', antialias: true }}
                  camera={{ position: [0, 0.35, 3.05], fov: 38 }}
                  onCreated={({ gl }) => {
                    gl.domElement.addEventListener(
                      'webglcontextlost',
                      (event) => {
                        event.preventDefault();
                      },
                      false
                    );
                  }}
                >
                  <ambientLight intensity={0.75} />
                  <hemisphereLight args={['#c7d2fe', '#1e293b', 0.9]} />
                  <directionalLight position={[2.5, 4, 2.5]} intensity={1.35} castShadow />
                  <directionalLight position={[-2.5, 2, -2]} intensity={0.45} color="#818cf8" />

                  <Suspense fallback={null}>
                    <StudyAvatar
                      modelUrl={sanitizedPreviewConfig.modelUrl}
                      name={userDisplayName}
                      activity={activePreviewActivity}
                      position={[0, -0.88, 0]}
                      rotation={[0, 0.18, 0]}
                      scale={1}
                      nameplateHeight={1.82}
                      showNameplate={false}
                      customization={sanitizedPreviewConfig.customization}
                      isLive
                      isSelected
                      subtitle="Live 3D Preview"
                    />
                    <ContactShadows
                      position={[0, -0.88, 0]}
                      opacity={0.45}
                      scale={4}
                      blur={2}
                      far={2}
                    />
                  </Suspense>

                  <OrbitControls
                    enablePan={false}
                    minDistance={1.5}
                    maxDistance={4.2}
                    minPolarAngle={Math.PI / 6}
                    maxPolarAngle={Math.PI / 1.8}
                    target={[0, 0.02, 0]}
                  />
                </Canvas>
              </div>
            </AvatarWebGLErrorBoundary>

            {/* Activity Preview Bar (scoped to selected model's actual animationCompatibility) */}
            <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-center gap-1.5 bg-slate-950/75 backdrop-blur-md border border-white/10 rounded-xl p-1.5">
              {supportedActivities.map((act) => {
                const active = activePreviewActivity === act.id;
                return (
                  <button
                    key={act.id}
                    type="button"
                    onClick={() => setPreviewActivity(act.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                      active
                        ? 'bg-indigo-500 text-white'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {act.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT: Customization Categories & Controls */}
        <div className="lg:col-span-4 bg-[var(--ff-surface)] border border-[var(--ff-border-color)] rounded-2xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-[var(--ff-accent)]" />
            <h2 className="text-sm font-bold text-[var(--ff-text-primary)]">
              Appearance Studio
            </h2>
          </div>

          {/* Category Tabs */}
          <div className="grid grid-cols-4 gap-1 bg-[var(--ff-surface-muted)] p-1 rounded-xl border border-[var(--ff-border-color)]">
            {CUSTOMIZATION_TABS.map((tab) => {
              const active = activeCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveCategory(tab.id)}
                  className={`py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                    active
                      ? 'bg-[var(--ff-accent)] text-white shadow-xs'
                      : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Category Controls */}
          <div className="space-y-4 min-h-[260px]">
            {activeCategory === 'hair' && (
              <>
                {renderColorRow(
                  'Hair Color',
                  selectedEntry.supportedCustomization.hairColors,
                  draftCustomization.hairColor || selectedEntry.defaults.hairColor,
                  (hex) => setDraftCustomization((prev) => ({ ...prev, hairColor: hex }))
                )}

                {selectedEntry.supportedCustomization.hairMaterials && (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-[var(--ff-text-secondary)]">
                      Hair Material Finish
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      {selectedEntry.supportedCustomization.hairMaterials.map((finish) => {
                        const active =
                          (draftCustomization.hairMaterial ||
                            selectedEntry.defaults.hairMaterial ||
                            'silky') === finish;
                        return (
                          <button
                            key={finish}
                            type="button"
                            onClick={() =>
                              setDraftCustomization((prev) => ({
                                ...prev,
                                hairMaterial: finish as HairMaterialFinish,
                              }))
                            }
                            className={`py-1.5 px-2 rounded-xl text-xs font-semibold border capitalize transition-all ${
                              active
                                ? 'bg-[var(--ff-accent)]/15 border-[var(--ff-accent)] text-[var(--ff-accent)]'
                                : 'bg-[var(--ff-surface-muted)] border-[var(--ff-border-color)] text-[var(--ff-text-secondary)]'
                            }`}
                          >
                            {finish}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-[var(--ff-text-muted)]">
                  Single-mesh hair geometry on this model; color and PBR sheen finish update in real time.
                </p>
              </>
            )}

            {activeCategory === 'eyes' && (
              <>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ff-text-secondary)]">
                  <Eye className="w-3.5 h-3.5 text-[var(--ff-accent)]" />
                  <span>Iris &amp; Eye Highlights</span>
                </div>
                {renderColorRow(
                  'Eye / Iris Color',
                  selectedEntry.supportedCustomization.eyeColors,
                  draftCustomization.irisColor ||
                    draftCustomization.eyeColor ||
                    selectedEntry.defaults.eyeColor,
                  (hex) =>
                    setDraftCustomization((prev) => ({
                      ...prev,
                      eyeColor: hex,
                      irisColor: hex,
                    }))
                )}
              </>
            )}

            {activeCategory === 'outfit' && (
              <>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ff-text-secondary)]">
                  <Shirt className="w-3.5 h-3.5 text-[var(--ff-accent)]" />
                  <span>Outfit Materials</span>
                </div>
                {renderColorRow(
                  selectedEntry.id === 'avatar-01' ? 'Cardigan Color' : 'Hoodie / Primary Color',
                  selectedEntry.supportedCustomization.outfitColors,
                  draftCustomization.outfitPrimary ||
                    draftCustomization.outfitColor ||
                    selectedEntry.defaults.outfitColor,
                  (hex) =>
                    setDraftCustomization((prev) => ({
                      ...prev,
                      outfitColor: hex,
                      outfitPrimary: hex,
                    }))
                )}
                {renderColorRow(
                  selectedEntry.id === 'avatar-01' ? 'Shirt & Trim' : 'Inner Tee Color',
                  selectedEntry.supportedCustomization.outfitSecondaryColors,
                  draftCustomization.outfitSecondary || selectedEntry.defaults.outfitSecondary,
                  (hex) => setDraftCustomization((prev) => ({ ...prev, outfitSecondary: hex }))
                )}
                {renderColorRow(
                  'Pants Color',
                  selectedEntry.supportedCustomization.pantsColors,
                  draftCustomization.pantsColor || selectedEntry.defaults.pantsColor,
                  (hex) => setDraftCustomization((prev) => ({ ...prev, pantsColor: hex }))
                )}
                {renderColorRow(
                  'Shoes Color',
                  selectedEntry.supportedCustomization.shoesColors,
                  draftCustomization.shoesColor || selectedEntry.defaults.shoesColor,
                  (hex) => setDraftCustomization((prev) => ({ ...prev, shoesColor: hex }))
                )}
              </>
            )}

            {activeCategory === 'accessories' && (
              <div className="space-y-3">
                <span className="text-xs font-semibold text-[var(--ff-text-secondary)]">
                  Supported Accessories
                </span>
                <div className="flex flex-wrap gap-2">
                  {selectedEntry.supportedCustomization.accessories.map((acc) => {
                    const active = (draftCustomization.accessories || []).includes(acc);
                    const Icon =
                      acc === 'glasses'
                        ? Glasses
                        : acc === 'watch'
                        ? Watch
                        : Headphones;
                    return (
                      <button
                        key={acc}
                        type="button"
                        onClick={() => toggleAccessory(acc)}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all capitalize ${
                          active
                            ? 'bg-[var(--ff-accent)]/15 border-[var(--ff-accent)] text-[var(--ff-accent)]'
                            : 'bg-[var(--ff-surface-muted)] border-[var(--ff-border-color)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)]'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{acc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM ACTION BAR: Save · Reset · Cancel */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--ff-surface)] border border-[var(--ff-border-color)] rounded-2xl px-5 py-3.5">
        <p className="text-xs text-[var(--ff-text-muted)]">
          Changes preview immediately in 3D. Click <strong>Save Changes</strong> to sync to your profile &amp; Study Rooms.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!hasUnsavedChanges || saving}
            onClick={handleCancelChanges}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] disabled:opacity-45 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            <span>Cancel</span>
          </button>

          <button
            type="button"
            onClick={handleResetAppearance}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Appearance</span>
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSaveAvatar()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--ff-accent)] text-white hover:opacity-95 disabled:opacity-60 transition-all shadow-sm"
          >
            {saving ? (
              <span>Saving...</span>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
