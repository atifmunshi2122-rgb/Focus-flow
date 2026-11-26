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
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import {
  AVATAR_CATALOG,
  DEFAULT_AVATAR_ID,
  getAvatarCatalogEntry,
  validateAndSanitizeAvatarConfig,
  type AvatarCatalogEntry,
  type UserAvatarConfig,
  type UserAvatarCustomization,
} from '../../features/avatar/avatar-catalog.ts';
import type { StudyActivity } from '../../features/study-room/types.ts';
import { updateUserAvatarConfig } from '../../lib/leaderboardService.ts';
import StudyAvatar from '../study-room/StudyAvatar.tsx';
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

const PREVIEW_ACTIVITIES: { id: StudyActivity; label: string }[] = [
  { id: 'idle', label: 'Idle' },
  { id: 'studying', label: 'Studying' },
  { id: 'typing', label: 'Typing' },
  { id: 'reading', label: 'Reading' },
  { id: 'writing', label: 'Writing' },
];

const LOCAL_AVATAR_STORAGE_KEY = 'ff_user_avatar_config';

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
  const [previewActivity, setPreviewActivity] = useState<StudyActivity>('studying');
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
    // Reset colors to the newly selected character's defaults, keeping supported accessories
    const supportedAcc = new Set(entry.supportedCustomization.accessories);
    const keptAccessories = (draftCustomization.accessories || []).filter((a) =>
      supportedAcc.has(a)
    );
    setDraftCustomization({
      hairColor: entry.defaults.hairColor,
      eyeColor: entry.defaults.eyeColor,
      outfitColor: entry.defaults.outfitColor,
      accessories: keptAccessories,
    });
  };

  const handleResetDefaults = () => {
    setDraftCustomization({
      hairColor: selectedEntry.defaults.hairColor,
      eyeColor: selectedEntry.defaults.eyeColor,
      outfitColor: selectedEntry.defaults.outfitColor,
      accessories: [],
    });
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

  const userDisplayName =
    firebaseUser?.displayName?.trim() ||
    'Your Avatar';

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-[var(--ff-surface)] border border-[var(--ff-border-color)] rounded-2xl p-5 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              Multi-User 3D Avatar Studio
            </span>
            {hasUnsavedChanges && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                Unsaved changes
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-[var(--ff-text-primary)]">
            Create & Customize Your 3D Study Avatar
          </h1>
          <p className="text-xs text-[var(--ff-text-muted)] max-w-2xl">
            Pick any anime scholar from the shared 3D model library, customize hair, eyes, outfit,
            and accessories, and preview in 360° before syncing to the Multiplayer Study Room.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
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
                <span>Save & Sync Avatar</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Split: 3D Viewport + Catalog & Customization */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Interactive 3D Preview */}
        <div className="lg:col-span-5 flex flex-col bg-[var(--ff-surface)] border border-[var(--ff-border-color)] rounded-2xl overflow-hidden shadow-xs">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--ff-border-color)]">
            <div>
              <p className="text-xs font-bold text-[var(--ff-text-primary)]">
                {selectedEntry.displayName}
              </p>
              <p className="text-[11px] text-[var(--ff-text-muted)]">
                Drag to rotate · Scroll to zoom · Rig: {selectedEntry.rigType}
              </p>
            </div>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)]">
              {selectedEntry.style}
            </span>
          </div>

          <div className="relative h-[300px] sm:h-[420px] w-full bg-gradient-to-b from-[#0b1120] via-[#131b2e] to-[#0f172a]">
            <AvatarWebGLErrorBoundary
              fallback={
                <div className="h-full w-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <div className="w-24 h-24">
                    <AnimeCharacterSvg
                      variant="bust"
                      activity={previewActivity}
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
                        outfitPrimary: sanitizedPreviewConfig.customization.outfitColor || selectedEntry.defaults.outfitColor,
                        outfitSecondary: selectedEntry.defaults.outfitSecondary,
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
                  camera={{ position: [0, 1.35, 2.35], fov: 38 }}
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
                      activity={previewActivity}
                      position={[0, -0.55, 0]}
                      rotation={[0, 0.2, 0]}
                      scale={1.08}
                      nameplateHeight={1.65}
                      customization={sanitizedPreviewConfig.customization}
                      isLive
                      isSelected
                      subtitle="Live 3D Preview"
                    />
                    <ContactShadows
                      position={[0, -0.55, 0]}
                      opacity={0.45}
                      scale={4}
                      blur={2}
                      far={2}
                    />
                  </Suspense>

                  <OrbitControls
                    enablePan={false}
                    minDistance={1.4}
                    maxDistance={3.8}
                    minPolarAngle={Math.PI / 6}
                    maxPolarAngle={Math.PI / 1.9}
                    target={[0, 0.35, 0]}
                  />
                </Canvas>
              </div>
            </AvatarWebGLErrorBoundary>

            {/* Activity Preview Bar */}
            <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-center gap-1.5 bg-slate-950/75 backdrop-blur-md border border-white/10 rounded-xl p-1.5">
              {PREVIEW_ACTIVITIES.map((act) => {
                const active = previewActivity === act.id;
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

        {/* Right: Character Catalog & Customization */}
        <div className="lg:col-span-7 space-y-5">
          {/* Character Selection */}
          <div className="bg-[var(--ff-surface)] border border-[var(--ff-border-color)] rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-[var(--ff-accent)]" />
                <h2 className="text-sm font-bold text-[var(--ff-text-primary)]">
                  1. Choose Character Model
                </h2>
              </div>

              <div className="flex items-center gap-1 bg-[var(--ff-surface-muted)] p-1 rounded-lg border border-[var(--ff-border-color)]">
                {(['all', 'male', 'female'] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setStyleFilter(filter)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold capitalize transition-colors ${
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredCatalog.map((entry) => {
                const selected = entry.id === selectedEntry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    disabled={!entry.available}
                    onClick={() => handleSelectCharacter(entry)}
                    className={`text-left p-3.5 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                      selected
                        ? 'border-[var(--ff-accent)] bg-[var(--ff-accent)]/10 ring-1 ring-[var(--ff-accent)]'
                        : 'border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] hover:border-[var(--ff-text-muted)]'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--ff-text-primary)]">
                          {entry.displayName}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--ff-text-muted)]">
                        {entry.previewLabel}
                      </p>
                      <div className="flex items-center gap-1.5 pt-1">
                        <span
                          className="w-3 h-3 rounded-full border border-white/20"
                          style={{ backgroundColor: entry.defaults.hairColor }}
                          title="Default Hair"
                        />
                        <span
                          className="w-3 h-3 rounded-full border border-white/20"
                          style={{ backgroundColor: entry.defaults.eyeColor }}
                          title="Default Eyes"
                        />
                        <span
                          className="w-3 h-3 rounded-full border border-white/20"
                          style={{ backgroundColor: entry.defaults.outfitColor }}
                          title="Default Outfit"
                        />
                        <span className="text-[10px] text-[var(--ff-text-muted)] ml-1">
                          {entry.license}
                        </span>
                      </div>
                    </div>

                    {selected && (
                      <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--ff-accent)] text-white flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Customization Controls (Scoped strictly to selected model capabilities) */}
          <div className="bg-[var(--ff-surface)] border border-[var(--ff-border-color)] rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-[var(--ff-accent)]" />
              <h2 className="text-sm font-bold text-[var(--ff-text-primary)]">
                2. Customize Appearance
              </h2>
            </div>

            {/* Hair Color */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--ff-text-secondary)] flex items-center gap-1.5">
                <span>Hair Color</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {selectedEntry.supportedCustomization.hairColors.map((hex) => {
                  const active =
                    (draftCustomization.hairColor || selectedEntry.defaults.hairColor) === hex;
                  return (
                    <button
                      key={hex}
                      type="button"
                      onClick={() =>
                        setDraftCustomization((prev) => ({ ...prev, hairColor: hex }))
                      }
                      className={`w-8 h-8 rounded-full border-2 transition-transform ${
                        active
                          ? 'border-white scale-110 ring-2 ring-[var(--ff-accent)]'
                          : 'border-white/20 hover:scale-105'
                      }`}
                      style={{ backgroundColor: hex }}
                      aria-label={`Select hair color ${hex}`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Eye Color */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--ff-text-secondary)] flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                <span>Eye Color</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {selectedEntry.supportedCustomization.eyeColors.map((hex) => {
                  const active =
                    (draftCustomization.eyeColor || selectedEntry.defaults.eyeColor) === hex;
                  return (
                    <button
                      key={hex}
                      type="button"
                      onClick={() =>
                        setDraftCustomization((prev) => ({ ...prev, eyeColor: hex }))
                      }
                      className={`w-8 h-8 rounded-full border-2 transition-transform ${
                        active
                          ? 'border-white scale-110 ring-2 ring-[var(--ff-accent)]'
                          : 'border-white/20 hover:scale-105'
                      }`}
                      style={{ backgroundColor: hex }}
                      aria-label={`Select eye color ${hex}`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Outfit Color */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--ff-text-secondary)] flex items-center gap-1.5">
                <Shirt className="w-3.5 h-3.5" />
                <span>Outfit Color</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {selectedEntry.supportedCustomization.outfitColors.map((hex) => {
                  const active =
                    (draftCustomization.outfitColor || selectedEntry.defaults.outfitColor) === hex;
                  return (
                    <button
                      key={hex}
                      type="button"
                      onClick={() =>
                        setDraftCustomization((prev) => ({ ...prev, outfitColor: hex }))
                      }
                      className={`w-8 h-8 rounded-full border-2 transition-transform ${
                        active
                          ? 'border-white scale-110 ring-2 ring-[var(--ff-accent)]'
                          : 'border-white/20 hover:scale-105'
                      }`}
                      style={{ backgroundColor: hex }}
                      aria-label={`Select outfit color ${hex}`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Accessories */}
            {selectedEntry.supportedCustomization.accessories.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-[var(--ff-text-secondary)]">
                  Accessories
                </label>
                <div className="flex flex-wrap gap-2">
                  {selectedEntry.supportedCustomization.accessories.map((acc) => {
                    const active = (draftCustomization.accessories || []).includes(acc);
                    const Icon = acc === 'glasses' ? Glasses : Headphones;
                    return (
                      <button
                        key={acc}
                        type="button"
                        onClick={() => toggleAccessory(acc)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all capitalize ${
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
    </div>
  );
};
