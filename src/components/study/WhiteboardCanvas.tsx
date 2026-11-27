import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';
import {
  Pen,
  Highlighter,
  Eraser,
  Minus,
  Square,
  Circle as CircleIcon,
  Undo2,
  Redo2,
  Trash2,
  Download,
  Bookmark,
  Check,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { StudyTopic } from '../../types/study.ts';

export type DrawingTool = 'pen' | 'highlighter' | 'eraser' | 'line' | 'rect' | 'circle';

export interface WhiteboardCanvasProps {
  topics?: StudyTopic[];
  onSaveAttachment?: (dataUrl: string, topicId?: string) => void;
}

/**
 * Shared coordinate normalizer converting client coordinates to canvas backing dimensions.
 * Accounts for device pixel ratio, CSS layout scaling, and mobile pinch/scroll bounding boxes.
 */
export function getCanvasCoordinates(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return { x: 0, y: 0 };
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: Math.round((clientX - rect.left) * scaleX),
    y: Math.round((clientY - rect.top) * scaleY),
  };
}

/**
 * Dedicated blank-canvas rendering function.
 * Completely resets canvas background and renders an engineering/math dot-grid
 * without restoring any old buffer or previous drawings.
 */
export function renderBlankCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  // Dark slate background default
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, height);

  // Grid dots for engineering / math scratchpad
  ctx.fillStyle = 'rgba(148, 163, 184, 0.12)';
  const gridSize = 24;
  for (let x = gridSize; x < width; x += gridSize) {
    for (let y = gridSize; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export const WhiteboardCanvas: React.FC<WhiteboardCanvasProps> = ({
  topics = [],
  onSaveAttachment,
}) => {
  const { user, confirmAction } = useApp();
  const activeUid = user?.id || 'usr_guest';
  const storageKey = `focusflow_${activeUid}_whiteboard_latest`;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Offscreen buffer canvas to preserve pixels across intentional window resize events
  const bufferCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [activeTool, setActiveTool] = useState<DrawingTool>('pen');
  const [strokeColor, setStrokeColor] = useState<string>('#38bdf8'); // sky-400
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');

  // Save status states
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'saved_local_only' | 'error'
  >('idle');
  const [saveMessage, setSaveMessage] = useState<string>('');

  // Undo / Redo history
  const undoStackRef = useRef<ImageData[]>([]);
  const redoStackRef = useRef<ImageData[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const isDrawingRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const snapshotRef = useRef<ImageData | null>(null);

  // Initialize buffer canvas
  useEffect(() => {
    if (!bufferCanvasRef.current) {
      bufferCanvasRef.current = document.createElement('canvas');
    }
  }, []);

  // Save state for undo
  const pushUndoState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStackRef.current.push(imgData);
    if (undoStackRef.current.length > 25) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  // Handle Resize and Buffer Transfer safely
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const buffer = bufferCanvasRef.current;
    if (!canvas || !container || !buffer) return;

    const rect = container.getBoundingClientRect();
    const width = Math.max(600, Math.floor(rect.width));
    const height = Math.max(450, Math.floor(rect.height || 540));

    // Save existing canvas into buffer before resizing
    if (canvas.width > 0 && canvas.height > 0) {
      buffer.width = canvas.width;
      buffer.height = canvas.height;
      const bCtx = buffer.getContext('2d');
      if (bCtx) {
        bCtx.drawImage(canvas, 0, 0);
      }
    }

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      renderBlankCanvas(ctx, width, height);

      // Restore buffered drawing if buffer has content
      if (buffer.width > 0 && buffer.height > 0) {
        ctx.drawImage(buffer, 0, 0);
      }
    }
  }, []);

  // Load existing drawing from local storage if available
  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize);

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && saved.startsWith('data:image/')) {
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          const buffer = bufferCanvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
          }
          if (buffer) {
            buffer.width = canvas.width;
            buffer.height = canvas.height;
            const bCtx = buffer.getContext('2d');
            if (bCtx) {
              bCtx.drawImage(canvas, 0, 0);
            }
          }
        };
        img.src = saved;
      }
    } catch {}

    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize, storageKey]);

  // Pointer event handlers with device pixel ratio & backing scale accuracy
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {}

    pushUndoState();

    isDrawingRef.current = true;
    const pos = getCanvasCoordinates(e.clientX, e.clientY, canvas);
    startPosRef.current = pos;
    lastPosRef.current = pos;

    snapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getCanvasCoordinates(e.clientX, e.clientY, canvas);

    if (activeTool === 'pen') {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 1.0;
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    } else if (activeTool === 'highlighter') {
      if (snapshotRef.current) {
        ctx.putImageData(snapshotRef.current, 0, 0);
      }
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth * 3.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.25;
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    } else if (activeTool === 'eraser') {
      const eraserWidth = strokeWidth * 4;
      const radius = eraserWidth / 2;
      const prev = lastPosRef.current;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = eraserWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 1.0;
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();

      // Re-draw dot-grid points inside the erased segment bounding box so eraser preserves the grid
      const gridSize = 24;
      const minX = Math.max(gridSize, Math.floor((Math.min(prev.x, pos.x) - radius) / gridSize) * gridSize);
      const maxX = Math.min(canvas.width - 1, Math.ceil((Math.max(prev.x, pos.x) + radius) / gridSize) * gridSize);
      const minY = Math.max(gridSize, Math.floor((Math.min(prev.y, pos.y) - radius) / gridSize) * gridSize);
      const maxY = Math.min(canvas.height - 1, Math.ceil((Math.max(prev.y, pos.y) + radius) / gridSize) * gridSize);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.12)';
      for (let gx = minX; gx <= maxX; gx += gridSize) {
        for (let gy = minY; gy <= maxY; gy += gridSize) {
          ctx.beginPath();
          ctx.arc(gx, gy, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      lastPosRef.current = pos;
    } else if (['line', 'rect', 'circle'].includes(activeTool) && snapshotRef.current) {
      // Shape preview - restore snapshot then render shape preview
      ctx.putImageData(snapshotRef.current, 0, 0);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.globalAlpha = 1.0;

      const start = startPosRef.current;
      if (activeTool === 'line') {
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      } else if (activeTool === 'rect') {
        const w = pos.x - start.x;
        const h = pos.y - start.y;
        ctx.strokeRect(start.x, start.y, w, h);
      } else if (activeTool === 'circle') {
        const radius = Math.hypot(pos.x - start.x, pos.y - start.y);
        ctx.beginPath();
        ctx.arc(start.x, start.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  };

  const syncBufferAndLocalDraft = (canvas: HTMLCanvasElement) => {
    const buffer = bufferCanvasRef.current;
    if (buffer && canvas.width > 0 && canvas.height > 0) {
      buffer.width = canvas.width;
      buffer.height = canvas.height;
      const bCtx = buffer.getContext('2d');
      if (bCtx) {
        bCtx.drawImage(canvas, 0, 0);
      }
    }

    try {
      const dataUrl = canvas.toDataURL('image/png');
      localStorage.setItem(storageKey, dataUrl);
    } catch {}
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {}

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.globalAlpha = 1.0;
    }

    syncBufferAndLocalDraft(canvas);
  };

  // Undo / Redo operations
  const handleUndo = () => {
    const canvas = canvasRef.current;
    if (!canvas || undoStackRef.current.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Save current to redo
    const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    redoStackRef.current.push(current);

    const prev = undoStackRef.current.pop()!;
    ctx.putImageData(prev, 0, 0);

    syncBufferAndLocalDraft(canvas);

    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
  };

  const handleRedo = () => {
    const canvas = canvasRef.current;
    if (!canvas || redoStackRef.current.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStackRef.current.push(current);

    const next = redoStackRef.current.pop()!;
    ctx.putImageData(next, 0, 0);

    syncBufferAndLocalDraft(canvas);

    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
  };

  /**
   * Dedicated Clear Handler:
   * 1. Preserves current drawing in undo stack.
   * 2. Clears offscreen buffer so resize does NOT restore the old content.
   * 3. Renders dedicated blank canvas with dot grid.
   * 4. Updates undo/redo state so Undo can restore it.
   */
  const handleClear = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const confirmed = await confirmAction({
      title: 'Clear Whiteboard',
      message: 'Clear entire scratchpad?',
      confirmLabel: 'Clear',
      tone: 'danger',
    });
    if (!confirmed) return;

    // Save previous drawing state into undo stack
    pushUndoState();

    // Reset buffer canvas completely so resize doesn't restore old drawing
    const buffer = bufferCanvasRef.current;
    if (buffer) {
      buffer.width = 0;
      buffer.height = 0;
    }

    // Render pure blank canvas
    renderBlankCanvas(ctx, canvas.width, canvas.height);

    // Clear local storage
    try {
      localStorage.removeItem(storageKey);
    } catch {}

    setSaveStatus('idle');
    setSaveMessage('');
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `focusflow-scratchpad-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  };

  /**
   * Remote Save & Topic Linkage:
   * 1. Preserves local drawing first so drawing is never lost during network drops.
   * 2. Awaits remote API save before showing confirmation.
   * 3. Sets "saved_local_only" state with Retry if remote fails.
   * 4. Confirms topic linkage with topicId and topicTitle.
   */
  const handleAttachAndSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const sizeBytes = new TextEncoder().encode(dataUrl).length;
    const topic = topics.find((t) => t.id === selectedTopicId);
    const rawTitle = topic
      ? `${topic.subtopic || topic.topic || 'Topic'} Whiteboard Note`
      : 'Whiteboard Note';
    const title = rawTitle.trim().slice(0, 128) || 'Whiteboard Note';
    const topicTitle = topic
      ? (topic.subtopic || topic.topic || '').trim().slice(0, 128) || undefined
      : undefined;

    // Preserve local drawing first
    try {
      localStorage.setItem(storageKey, dataUrl);
    } catch {}

    if (onSaveAttachment) {
      onSaveAttachment(dataUrl, selectedTopicId || undefined);
    }

    setSaveStatus('saving');
    setSaveMessage('Saving note to cloud...');

    try {
      await api.saveWhiteboardDrawing({
        title,
        dataUrl,
        sizeBytes,
        topicId: selectedTopicId || undefined,
        topicTitle,
        width: Math.min(4096, Math.max(1, Math.round(canvas.width))),
        height: Math.min(4096, Math.max(1, Math.round(canvas.height))),
      });

      setSaveStatus('saved');
      setSaveMessage(
        topic
          ? `Whiteboard saved and attached to "${topic.subtopic || topic.topic}" successfully!`
          : 'Whiteboard snapshot saved to cloud successfully!'
      );
      setTimeout(() => {
        setSaveStatus((curr) => (curr === 'saved' ? 'idle' : curr));
      }, 4000);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Network error';
      setSaveStatus('saved_local_only');
      setSaveMessage(`Saved on this device — sync pending/failed (${errMsg})`);
    }
  };

  const COLORS = [
    { label: 'White', value: '#f8fafc' },
    { label: 'Sky Blue', value: '#38bdf8' },
    { label: 'Emerald', value: '#34d399' },
    { label: 'Amber', value: '#fbbf24' },
    { label: 'Rose Red', value: '#fb7185' },
    { label: 'Purple', value: '#c084fc' },
  ];

  return (
    <div className="space-y-4">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-[var(--ff-surface)] border border-[var(--ff-border)] shadow-sm">
        {/* Tools Selection */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setActiveTool('pen')}
            className={`p-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all ${
              activeTool === 'pen'
                ? 'bg-[var(--ff-accent)] text-white shadow-sm'
                : 'text-[var(--ff-text-muted)] hover:bg-[var(--ff-surface-muted)]'
            }`}
            title="Pen"
          >
            <Pen className="w-4 h-4" />
            <span className="hidden sm:inline">Pen</span>
          </button>

          <button
            onClick={() => setActiveTool('highlighter')}
            className={`p-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all ${
              activeTool === 'highlighter'
                ? 'bg-[var(--ff-accent)] text-white shadow-sm'
                : 'text-[var(--ff-text-muted)] hover:bg-[var(--ff-surface-muted)]'
            }`}
            title="Highlighter"
          >
            <Highlighter className="w-4 h-4" />
            <span className="hidden sm:inline">Highlight</span>
          </button>

          <button
            onClick={() => setActiveTool('eraser')}
            className={`p-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all ${
              activeTool === 'eraser'
                ? 'bg-[var(--ff-accent)] text-white shadow-sm'
                : 'text-[var(--ff-text-muted)] hover:bg-[var(--ff-surface-muted)]'
            }`}
            title="Eraser"
          >
            <Eraser className="w-4 h-4" />
            <span className="hidden sm:inline">Eraser</span>
          </button>

          <div className="h-5 w-px bg-[var(--ff-border)] mx-1" />

          {/* Geometric Shapes */}
          <button
            onClick={() => setActiveTool('line')}
            className={`p-2 rounded-xl transition-all ${
              activeTool === 'line'
                ? 'bg-[var(--ff-accent)] text-white'
                : 'text-[var(--ff-text-muted)] hover:bg-[var(--ff-surface-muted)]'
            }`}
            title="Straight Line"
          >
            <Minus className="w-4 h-4" />
          </button>

          <button
            onClick={() => setActiveTool('rect')}
            className={`p-2 rounded-xl transition-all ${
              activeTool === 'rect'
                ? 'bg-[var(--ff-accent)] text-white'
                : 'text-[var(--ff-text-muted)] hover:bg-[var(--ff-surface-muted)]'
            }`}
            title="Rectangle"
          >
            <Square className="w-4 h-4" />
          </button>

          <button
            onClick={() => setActiveTool('circle')}
            className={`p-2 rounded-xl transition-all ${
              activeTool === 'circle'
                ? 'bg-[var(--ff-accent)] text-white'
                : 'text-[var(--ff-text-muted)] hover:bg-[var(--ff-surface-muted)]'
            }`}
            title="Circle"
          >
            <CircleIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Color Palette & Stroke Width */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-[var(--ff-surface-muted)] p-1 rounded-xl border border-[var(--ff-border)]">
            {COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setStrokeColor(c.value)}
                style={{ backgroundColor: c.value }}
                className={`w-5 h-5 rounded-full transition-transform ${
                  strokeColor === c.value ? 'scale-125 ring-2 ring-white/80 ring-offset-1' : 'opacity-80 hover:opacity-100'
                }`}
                title={c.label}
              />
            ))}
          </div>

          {/* Width Selector */}
          <div className="flex items-center gap-1 bg-[var(--ff-surface-muted)] p-1 rounded-xl border border-[var(--ff-border)]">
            {[2, 4, 8].map((w) => (
              <button
                key={w}
                onClick={() => setStrokeWidth(w)}
                className={`px-2 py-0.5 text-xs rounded-lg font-mono font-bold ${
                  strokeWidth === w ? 'bg-[var(--ff-accent)] text-white' : 'text-[var(--ff-text-muted)]'
                }`}
              >
                {w}px
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-[var(--ff-border)] mx-1" />

          {/* Undo / Redo */}
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            className="p-2 rounded-xl text-[var(--ff-text-muted)] hover:bg-[var(--ff-surface-muted)] disabled:opacity-30 disabled:pointer-events-none"
            title="Undo"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleRedo}
            disabled={!canRedo}
            className="p-2 rounded-xl text-[var(--ff-text-muted)] hover:bg-[var(--ff-surface-muted)] disabled:opacity-30 disabled:pointer-events-none"
            title="Redo"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <button
            onClick={handleClear}
            className="p-2 rounded-xl text-rose-400 hover:bg-rose-500/10 transition-colors"
            title="Clear Scratchpad"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Export / Topic Attach Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {topics.length > 0 && (
            <select
              value={selectedTopicId}
              onChange={(e) => setSelectedTopicId(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border)] text-[var(--ff-text-primary)] max-w-[160px]"
            >
              <option value="">Attach to topic...</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.subtopic ? `${t.topic} — ${t.subtopic}` : t.topic}
                </option>
              ))}
            </select>
          )}

          <ThemeButton
            variant="secondary"
            size="sm"
            onClick={handleAttachAndSave}
            disabled={saveStatus === 'saving'}
          >
            <Bookmark className="w-3.5 h-3.5 mr-1" />
            {saveStatus === 'saving' ? 'Saving...' : 'Save & Attach'}
          </ThemeButton>

          <ThemeButton variant="ghost" size="sm" onClick={handleDownload} title="Download PNG">
            <Download className="w-3.5 h-3.5" />
          </ThemeButton>
        </div>
      </div>

      {/* Save Notification / Offline Status Banner */}
      {saveStatus === 'saved' && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 flex-shrink-0" />
          <span>{saveMessage}</span>
        </div>
      )}

      {saveStatus === 'saved_local_only' && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>{saveMessage}</span>
          </div>
          <button
            onClick={handleAttachAndSave}
            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold transition-colors flex items-center gap-1 flex-shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry Sync
          </button>
        </div>
      )}

      {/* Canvas Drawing Area with Pointer Events & Touch-Action None */}
      <div
        ref={containerRef}
        className="relative w-full h-[540px] rounded-2xl border border-[var(--ff-border)] overflow-hidden shadow-inner bg-[#0f172a] touch-none select-none cursor-crosshair"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="absolute inset-0 block w-full h-full touch-none"
        />

        <div className="absolute bottom-3 right-3 pointer-events-none text-[10px] text-slate-500/70 font-mono">
          FocusFlow Whiteboard Canvas • Pointer Events & Resize-Safe Buffer Active
        </div>
      </div>
    </div>
  );
};
