import React, { useState } from 'react';
import { SavedCustomTheme, ThemeConfig } from '../../types/theme.ts';
import { getStyleDefinition } from '../../theme/stylesRegistry.ts';
import { sanitizeThemeConfig } from '../../theme/themeEngine.ts';
import { ConfirmDialogOptions } from '../common/ConfirmDialogModal.tsx';
import { ThemeBadge, ThemeButton, ThemeCard } from '../ui/ThemePrimitives.tsx';
import {
  BookmarkPlus,
  Check,
  Copy,
  Download,
  Edit2,
  Eye,
  FileCode,
  FolderHeart,
  RotateCcw,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';

interface ThemeManagementLibraryProps {
  draftConfig: ThemeConfig;
  savedThemes: SavedCustomTheme[];
  activeSavedThemeId: string | null;
  favoriteThemeIds: string[];
  saveCustomTheme: (name: string, config: ThemeConfig, description?: string) => Promise<SavedCustomTheme>;
  renameCustomTheme: (themeId: string, newName: string) => Promise<void>;
  duplicateSavedTheme: (themeId: string) => Promise<SavedCustomTheme | null>;
  deleteSavedTheme: (themeId: string) => Promise<void>;
  applySavedTheme: (themeId: string) => Promise<void>;
  resetThemeToDefault: () => Promise<void>;
  toggleFavoriteTheme: (themeId: string) => Promise<void>;
  onPreviewTheme: (config: ThemeConfig) => void;
  showToast: (message: string, tone?: 'success' | 'error' | 'info') => void;
  confirmAction: (options: ConfirmDialogOptions) => Promise<boolean>;
}

export const ThemeManagementLibrary: React.FC<ThemeManagementLibraryProps> = ({
  draftConfig,
  savedThemes,
  activeSavedThemeId,
  favoriteThemeIds,
  saveCustomTheme,
  renameCustomTheme,
  duplicateSavedTheme,
  deleteSavedTheme,
  applySavedTheme,
  resetThemeToDefault,
  toggleFavoriteTheme,
  onPreviewTheme,
  showToast,
  confirmAction,
}) => {
  const [newThemeName, setNewThemeName] = useState('');
  const [newThemeDesc, setNewThemeDesc] = useState('');
  const [showSaveCard, setShowSaveCard] = useState(false);

  // Inline rename state
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // JSON Import/Export state
  const [jsonDialogMode, setJsonDialogMode] = useState<'export' | 'import' | null>(null);
  const [importJsonText, setImportJsonText] = useState('');
  const [importJsonError, setImportJsonError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const handleSaveDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newThemeName.trim()) return;
    try {
      await saveCustomTheme(newThemeName.trim(), draftConfig, newThemeDesc.trim());
      setNewThemeName('');
      setNewThemeDesc('');
      setShowSaveCard(false);
      showToast('Custom theme saved successfully', 'success');
    } catch {
      showToast('Failed to save custom theme', 'error');
    }
  };

  const handleStartRename = (theme: SavedCustomTheme) => {
    setEditingThemeId(theme.id);
    setEditingName(theme.name);
  };

  const handleCommitRename = async (themeId: string) => {
    if (!editingName.trim()) {
      setEditingThemeId(null);
      return;
    }
    try {
      await renameCustomTheme(themeId, editingName.trim());
      setEditingThemeId(null);
      showToast('Theme renamed', 'success');
    } catch {
      showToast('Failed to rename theme', 'error');
    }
  };

  const handleDeleteWithConfirm = async (theme: SavedCustomTheme) => {
    const confirmed = await confirmAction({
      title: 'Delete Custom Theme',
      message: 'Are you sure you want to delete this custom theme? This action cannot be undone.',
      itemLabel: theme.name,
      confirmLabel: 'Delete Theme',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await deleteSavedTheme(theme.id);
      showToast('Theme deleted', 'info');
    } catch {
      showToast('Failed to delete theme', 'error');
    }
  };

  const handleResetDefaultsWithConfirm = async () => {
    const confirmed = await confirmAction({
      title: 'Restore Default Theme',
      message: 'Reset all active theme settings and overrides back to the factory system defaults?',
      confirmLabel: 'Reset Defaults',
      tone: 'warning',
    });
    if (!confirmed) return;

    try {
      await resetThemeToDefault();
      showToast('Default theme restored', 'info');
    } catch {
      showToast('Failed to reset default theme', 'error');
    }
  };

  const exportPayload = {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    generator: 'FocusFlow & Finance Theme Studio 2.0',
    config: draftConfig,
    savedThemesCount: savedThemes.length,
    savedThemes,
  };

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(exportPayload, null, 2));
      setCopiedCode(true);
      showToast('Theme JSON copied to clipboard', 'success');
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      showToast('Could not copy to clipboard', 'error');
    }
  };

  const handleDownloadJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `focusflow-theme-${draftConfig.styleId}-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Theme JSON file downloaded', 'success');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setImportJsonText(content);
      setImportJsonError(null);
    };
    reader.readAsText(file);
  };

  const handleProcessImport = async (saveAsPreset = false) => {
    if (!importJsonText.trim()) {
      setImportJsonError('Please paste valid JSON or choose a JSON file.');
      return;
    }
    try {
      const parsed = JSON.parse(importJsonText);
      const targetConfigRaw = parsed.config || parsed.themeConfig || parsed;
      const sanitized = sanitizeThemeConfig(targetConfigRaw);

      if (saveAsPreset) {
        const themeName = parsed.name || `${getStyleDefinition(sanitized.styleId).name} (Imported)`;
        await saveCustomTheme(themeName, sanitized, 'Imported from Theme Studio JSON');
      } else {
        onPreviewTheme(sanitized);
      }

      setJsonDialogMode(null);
      setImportJsonText('');
      setImportJsonError(null);
      showToast(
        saveAsPreset ? 'Theme imported and saved to presets' : 'Theme loaded into draft preview',
        'success'
      );
    } catch (err: unknown) {
      setImportJsonError(err instanceof Error ? err.message : 'Invalid JSON format');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FolderHeart className="w-4 h-4 text-[var(--ff-accent-text)]" />
            <h3 className="text-base font-bold text-[var(--ff-text-primary)]">
              Theme Management &amp; Preset Library
            </h3>
            <ThemeBadge tone="accent">{savedThemes.length} Saved Presets</ThemeBadge>
          </div>
          <p className="text-xs text-[var(--ff-text-muted)] max-w-2xl">
            Save custom palettes, export JSON backups, duplicate setups, and sync presets across devices.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <ThemeButton
            variant={showSaveCard ? 'secondary' : 'primary'}
            size="xs"
            onClick={() => setShowSaveCard(!showSaveCard)}
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            <span>{showSaveCard ? 'Cancel' : 'Save Current Draft'}</span>
          </ThemeButton>

          <button
            type="button"
            onClick={() => setJsonDialogMode('export')}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-[var(--ff-border-color)] bg-[var(--ff-surface-card)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setImportJsonError(null);
              setImportJsonText('');
              setJsonDialogMode('import');
            }}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-[var(--ff-border-color)] bg-[var(--ff-surface-card)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import</span>
          </button>

          <ThemeButton variant="secondary" size="xs" onClick={handleResetDefaultsWithConfirm}>
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restore Defaults</span>
          </ThemeButton>
        </div>
      </div>

      {/* Save Draft Form */}
      {showSaveCard && (
        <ThemeCard className="space-y-3 border-[var(--ff-accent-border)] bg-[var(--ff-accent-soft)]/20">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[var(--ff-text-primary)] uppercase tracking-wider flex items-center gap-1.5">
              <BookmarkPlus className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />
              <span>Save Current Theme as Preset</span>
            </h4>
            <span className="text-[11px] text-[var(--ff-text-muted)]">
              Architecture: {getStyleDefinition(draftConfig.styleId).name}
            </span>
          </div>

          <form onSubmit={handleSaveDraft} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-5">
              <label htmlFor="save-theme-name" className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1">
                Theme Preset Name *
              </label>
              <input
                id="save-theme-name"
                type="text"
                required
                value={newThemeName}
                onChange={(e) => setNewThemeName(e.target.value)}
                placeholder="e.g., Midnight Obsidian Studio"
                className="ff-input w-full px-3 py-1.5 text-xs"
              />
            </div>

            <div className="sm:col-span-5">
              <label htmlFor="save-theme-desc" className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1">
                Description (Optional)
              </label>
              <input
                id="save-theme-desc"
                type="text"
                value={newThemeDesc}
                onChange={(e) => setNewThemeDesc(e.target.value)}
                placeholder="e.g., Ultra-dark with violet glow"
                className="ff-input w-full px-3 py-1.5 text-xs"
              />
            </div>

            <div className="sm:col-span-2">
              <ThemeButton variant="primary" size="sm" type="submit" className="w-full justify-center">
                <span>Save Preset</span>
              </ThemeButton>
            </div>
          </form>
        </ThemeCard>
      )}

      {/* JSON Export Panel */}
      {jsonDialogMode === 'export' && (
        <ThemeCard className="space-y-3 border-[var(--ff-accent-border)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-[var(--ff-accent-text)]" />
              <h4 className="text-sm font-bold text-[var(--ff-text-primary)]">
                Export Theme JSON Configuration
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setJsonDialogMode(null)}
              className="text-xs text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
            >
              Close
            </button>
          </div>
          <p className="text-xs text-[var(--ff-text-muted)]">
            Export all theme tokens, color assignments, 3D lighting parameters, and custom gradients as a portable JSON file.
          </p>
          <pre className="p-3 rounded-xl bg-[var(--ff-surface-inset)] border border-[var(--ff-border-color)] text-[11px] font-mono overflow-x-auto max-h-48 text-[var(--ff-text-secondary)] select-all">
            {JSON.stringify(exportPayload, null, 2)}
          </pre>
          <div className="flex items-center justify-end gap-2 pt-1">
            <ThemeButton variant="secondary" size="xs" onClick={handleCopyJson}>
              {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'Copied!' : 'Copy to Clipboard'}</span>
            </ThemeButton>
            <ThemeButton variant="primary" size="xs" onClick={handleDownloadJson}>
              <Download className="w-3.5 h-3.5" />
              <span>Download JSON File</span>
            </ThemeButton>
          </div>
        </ThemeCard>
      )}

      {/* JSON Import Panel */}
      {jsonDialogMode === 'import' && (
        <ThemeCard className="space-y-3 border-[var(--ff-accent-border)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-[var(--ff-accent-text)]" />
              <h4 className="text-sm font-bold text-[var(--ff-text-primary)]">
                Import Theme JSON Configuration
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setJsonDialogMode(null)}
              className="text-xs text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
            >
              Close
            </button>
          </div>
          <p className="text-xs text-[var(--ff-text-muted)]">
            Paste theme JSON or upload a saved <code>.json</code> file to inspect or apply.
          </p>
          <textarea
            rows={4}
            value={importJsonText}
            onChange={(e) => {
              setImportJsonText(e.target.value);
              setImportJsonError(null);
            }}
            placeholder='Paste theme JSON here, e.g. { "config": { "styleId": "cyberpunk", ... } }'
            className="ff-input p-3 text-xs font-mono w-full"
          />
          {importJsonError && (
            <p className="text-xs font-semibold text-[var(--ff-danger)]">
              {importJsonError}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-medium text-[var(--ff-accent-text)] hover:underline">
              <Upload className="w-3.5 h-3.5" />
              <span>Choose .json File</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <div className="flex items-center gap-2">
              <ThemeButton
                variant="secondary"
                size="xs"
                onClick={() => void handleProcessImport(false)}
              >
                <span>Load into Draft</span>
              </ThemeButton>
              <ThemeButton
                variant="primary"
                size="xs"
                onClick={() => void handleProcessImport(true)}
              >
                <span>Import &amp; Save Preset</span>
              </ThemeButton>
            </div>
          </div>
        </ThemeCard>
      )}

      {/* Saved Themes Grid */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-[var(--ff-text-primary)] uppercase tracking-wider">
          Saved Custom Themes ({savedThemes.length})
        </h4>

        {savedThemes.length === 0 ? (
          <ThemeCard variant="inset" className="text-center py-8 space-y-2">
            <FolderHeart className="w-8 h-8 mx-auto text-[var(--ff-text-muted)] opacity-50" />
            <div className="text-sm font-semibold text-[var(--ff-text-primary)]">
              No custom presets saved yet
            </div>
            <p className="text-xs text-[var(--ff-text-muted)] max-w-sm mx-auto">
              Tweak colors, 3D refraction, and geometry, then click &ldquo;Save Current Draft&rdquo; to store reusable presets.
            </p>
          </ThemeCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {savedThemes.map((saved) => {
              const isActive = activeSavedThemeId === saved.id;
              const isFavorite = favoriteThemeIds.includes(saved.id);
              const style = getStyleDefinition(saved.config.styleId);
              const accentHex = saved.config.accentColor || style.dark.accentDefault;
              const secondaryHex = saved.config.secondaryAccentColor || style.dark.secondaryDefault;

              return (
                <div
                  key={saved.id}
                  className="p-4 rounded-xl border flex flex-col justify-between gap-3 transition-all"
                  style={{
                    background: isActive ? 'var(--ff-accent-soft)' : 'var(--ff-surface-card)',
                    borderColor: isActive ? 'var(--ff-accent)' : 'var(--ff-border-color)',
                  }}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      {/* Name or Rename Input */}
                      {editingThemeId === saved.id ? (
                        <div className="flex items-center gap-1.5 flex-1">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void handleCommitRename(saved.id);
                              if (e.key === 'Escape') setEditingThemeId(null);
                            }}
                            autoFocus
                            className="ff-input px-2 py-1 text-xs flex-1"
                          />
                          <button
                            type="button"
                            onClick={() => void handleCommitRename(saved.id)}
                            className="p-1 text-[var(--ff-success)]"
                            title="Save name"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 min-w-0">
                          <h5 className="text-sm font-bold truncate text-[var(--ff-text-primary)]">
                            {saved.name}
                          </h5>
                          <button
                            type="button"
                            onClick={() => handleStartRename(saved)}
                            className="text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
                            title="Rename preset"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Favorite button */}
                        <button
                          type="button"
                          onClick={() => void toggleFavoriteTheme(saved.id)}
                          className="p-1 rounded text-[var(--ff-text-muted)] hover:text-amber-400"
                          title="Favorite preset"
                        >
                          <Star className={`w-3.5 h-3.5 ${isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
                        </button>
                        {isActive && <ThemeBadge tone="success">Active</ThemeBadge>}
                      </div>
                    </div>

                    {saved.description && (
                      <p className="text-xs text-[var(--ff-text-muted)] line-clamp-1">
                        {saved.description}
                      </p>
                    )}

                    {/* Color Swatch Strip */}
                    <div className="flex items-center gap-1.5 pt-1">
                      <div
                        className="w-5 h-5 rounded-full border border-white/20 shadow-sm"
                        style={{ background: accentHex }}
                        title={`Accent: ${accentHex}`}
                      />
                      <div
                        className="w-5 h-5 rounded-full border border-white/20 shadow-sm"
                        style={{ background: secondaryHex }}
                        title={`Secondary: ${secondaryHex}`}
                      />
                      <span className="text-[10px] text-[var(--ff-text-muted)] capitalize ml-1">
                        {style.name} · {saved.config.colorMode}
                      </span>
                    </div>
                  </div>

                  {/* Actions Strip */}
                  <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-[var(--ff-border-color)]">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onPreviewTheme(saved.config)}
                        className="p-1.5 rounded-lg border border-[var(--ff-border-color)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] text-xs flex items-center gap-1"
                        title="Preview in sandbox"
                      >
                        <Eye className="w-3 h-3" />
                        <span className="text-[11px]">Preview</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void duplicateSavedTheme(saved.id)}
                        className="p-1.5 rounded-lg border border-[var(--ff-border-color)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] text-xs flex items-center gap-1"
                        title="Duplicate preset"
                      >
                        <Copy className="w-3 h-3" />
                        <span className="text-[11px]">Copy</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleDeleteWithConfirm(saved)}
                        className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-danger)] transition-colors"
                        title="Delete preset"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <ThemeButton
                        variant={isActive ? 'secondary' : 'primary'}
                        size="xs"
                        onClick={() => void applySavedTheme(saved.id)}
                      >
                        <Check className="w-3 h-3" />
                        <span>{isActive ? 'Current' : 'Apply'}</span>
                      </ThemeButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
