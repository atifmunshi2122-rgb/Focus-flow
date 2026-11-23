import React, { useRef, useState, useEffect, useCallback } from 'react';
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
  Share2,
  Bookmark,
  Check,
  Maximize2,
} from 'lucide-react';
import { StudyTopic } from '../../types/study.ts';

type DrawingTool = 'pen' | 'highlighter' | 'eraser' | 'line' | 'rect' | 'circle';

interface WhiteboardCanvasProps {
  topics?: StudyTopic[];
  onSaveAttachment?: (dataUrl: string, topicId?: string) => void;
}

export const WhiteboardCanvas: React.FC<WhiteboardCanvasProps> = ({
  topics = [],
  onSaveAttachment,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Offscreen buffer canvas to preserve pixels across resize events
  const bufferCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [activeTool, setActiveTool] = useState<DrawingTool>('pen');
  const [strokeColor, setStrokeColor] = useState<string>('#38bdf8'); // sky-400
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [isSavedToast, setIsSavedToast] = useState(false);

  // Undo / Redo history
  const undoStackRef = useRef<ImageData[]>([]);
  const redoStackRef = useRef<ImageData[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const isDrawingRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
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
    const height = Math.max(450, Math.floor(rect.height || 550));

    // Save existing canvas into buffer
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

      // Restore buffered drawing
      if (buffer.width > 0 && buffer.height > 0) {
        ctx.drawImage(buffer, 0, 0);
      }
    }
  }, []);

  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  // Coordinate normalizer
  const getPointerPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    } else if ('clientX' in e) {
      return {
        x: (e as React.MouseEvent).clientX - rect.left,
        y: (e as React.MouseEvent).clientY - rect.top,
      };
    }
    return { x: 0, y: 0 };
  };

  // Drawing event handlers
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    pushUndoState();

    isDrawingRef.current = true;
    const pos = getPointerPos(e);
    startPosRef.current = pos;

    snapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getPointerPos(e);

    if (activeTool === 'pen') {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 1.0;
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    } else if (activeTool === 'highlighter') {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth * 3.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.25;
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    } else if (activeTool === 'eraser') {
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = strokeWidth * 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 1.0;
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
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

  const stopDrawing = () => {
    isDrawingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.globalAlpha = 1.0;
    }
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

    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
  };

  const handleClear = () => {
    if (!window.confirm('Clear entire scratchpad?')) return;
    pushUndoState();
    handleResize();
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

  const handleAttach = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    if (onSaveAttachment) {
      onSaveAttachment(dataUrl, selectedTopicId || undefined);
    }
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 3000);
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
                  {t.topic}
                </option>
              ))}
            </select>
          )}

          <ThemeButton variant="secondary" size="sm" onClick={handleAttach}>
            <Bookmark className="w-3.5 h-3.5 mr-1" />
            Attach Note
          </ThemeButton>

          <ThemeButton variant="ghost" size="sm" onClick={handleDownload} title="Download PNG">
            <Download className="w-3.5 h-3.5" />
          </ThemeButton>
        </div>
      </div>

      {/* Save Notification */}
      {isSavedToast && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
          <Check className="w-4 h-4" />
          <span>Whiteboard snapshot attached to study topic successfully!</span>
        </div>
      )}

      {/* Canvas Drawing Area */}
      <div
        ref={containerRef}
        className="relative w-full h-[540px] rounded-2xl border border-[var(--ff-border)] overflow-hidden shadow-inner bg-[#0f172a] touch-none select-none cursor-crosshair"
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="absolute inset-0 block w-full h-full"
        />

        <div className="absolute bottom-3 right-3 pointer-events-none text-[10px] text-slate-500/70 font-mono">
          FocusFlow Whiteboard Canvas • Resize-Safe Buffer Active
        </div>
      </div>
    </div>
  );
};
