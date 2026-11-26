import React, { useEffect, useRef, useState } from 'react';
import { Gamepad2, Globe2, Send, Sparkles, X } from 'lucide-react';
import {
  DREAM_GLOBE_CITIES,
  type DreamGlobeDestination,
  type PaperAirplaneMessage,
} from '../../features/home/homeDreamAndArcade.ts';

/* ------------------------------------------------------------------ *
 * 1. Playable 2-Minute Break Retro Arcade (Snake & Pong)
 * ------------------------------------------------------------------ */
export const ArcadeMiniGameModal: React.FC<{
  highScore: number;
  onUpdateHighScore: (score: number) => void;
  onClose: () => void;
}> = ({ highScore, onUpdateHighScore, onClose }) => {
  const [gameMode, setGameMode] = useState<'snake' | 'pong'>('snake');
  const [score, setScore] = useState(0);
  const [breakSecLeft, setBreakSecLeft] = useState(120);
  const [gameOver, setGameOver] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dirRef = useRef<{ dx: number; dy: number }>({ dx: 1, dy: 0 });
  const paddleYRef = useRef(100);

  // 2-minute break timer
  useEffect(() => {
    const id = window.setInterval(() => {
      setBreakSecLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (gameMode === 'snake') {
        if ((k === 'arrowup' || k === 'w') && dirRef.current.dy !== 1) dirRef.current = { dx: 0, dy: -1 };
        else if ((k === 'arrowdown' || k === 's') && dirRef.current.dy !== -1) dirRef.current = { dx: 0, dy: 1 };
        else if ((k === 'arrowleft' || k === 'a') && dirRef.current.dx !== 1) dirRef.current = { dx: -1, dy: 0 };
        else if ((k === 'arrowright' || k === 'd') && dirRef.current.dx !== -1) dirRef.current = { dx: 1, dy: 0 };
      } else {
        if (k === 'arrowup' || k === 'w') paddleYRef.current = Math.max(10, paddleYRef.current - 22);
        else if (k === 'arrowdown' || k === 's') paddleYRef.current = Math.min(180, paddleYRef.current + 22);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gameMode]);

  // Game Loop (Snake & Pong)
  useEffect(() => {
    setScore(0);
    setGameOver(false);
    dirRef.current = { dx: 1, dy: 0 };

    const cols = 20;
    const rows = 15;
    const cell = 16;

    let snake = [
      { x: 6, y: 7 },
      { x: 5, y: 7 },
      { x: 4, y: 7 },
    ];
    let food = { x: 14, y: 7 };
    let localScore = 0;

    // Pong state
    let bx = 160;
    let by = 120;
    let bvx = 3.2;
    let bvy = 2.4;
    let aiY = 100;

    const tickMs = gameMode === 'snake' ? 125 : 22;
    const id = window.setInterval(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#060918';
      ctx.fillRect(0, 0, 320, 240);

      if (gameMode === 'snake') {
        const head = {
          x: (snake[0].x + dirRef.current.dx + cols) % cols,
          y: (snake[0].y + dirRef.current.dy + rows) % rows,
        };
        if (snake.some((s) => s.x === head.x && s.y === head.y)) {
          setGameOver(true);
          window.clearInterval(id);
          return;
        }
        snake = [head, ...snake];
        if (head.x === food.x && head.y === food.y) {
          localScore += 10;
          setScore(localScore);
          if (localScore > highScore) onUpdateHighScore(localScore);
          food = {
            x: Math.floor(Math.random() * cols),
            y: Math.floor(Math.random() * rows),
          };
        } else {
          snake.pop();
        }

        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(food.x * cell + 2, food.y * cell + 2, cell - 4, cell - 4);
        snake.forEach((seg, idx) => {
          ctx.fillStyle = idx === 0 ? '#34d399' : '#10b981';
          ctx.fillRect(seg.x * cell + 1, seg.y * cell + 1, cell - 2, cell - 2);
        });
      } else {
        bx += bvx;
        by += bvy;
        if (by <= 6 || by >= 234) bvy = -bvy;
        aiY += (by - (aiY + 25)) * 0.09;

        // Player left paddle
        if (bx <= 22 && bx >= 12 && by >= paddleYRef.current && by <= paddleYRef.current + 50) {
          bvx = Math.abs(bvx) * 1.03;
          localScore += 5;
          setScore(localScore);
          if (localScore > highScore) onUpdateHighScore(localScore);
        }
        // AI right paddle
        if (bx >= 298 && bx <= 308 && by >= aiY && by <= aiY + 50) {
          bvx = -Math.abs(bvx);
        }
        if (bx < 0 || bx > 320) {
          bx = 160;
          by = 120;
          bvx = 3.2;
        }

        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(14, paddleYRef.current, 8, 50);
        ctx.fillStyle = '#c084fc';
        ctx.fillRect(298, aiY, 8, 50);
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(bx, by, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }, tickMs);

    return () => window.clearInterval(id);
  }, [gameMode]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-purple-400/35 bg-[#090d24] text-slate-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-5 h-5 text-purple-300" />
            <div>
              <h3 className="text-sm font-bold text-white">Focus Break Arcade</h3>
              <p className="text-[11px] text-purple-200/80">
                Break Left: {Math.floor(breakSecLeft / 60)}:{String(breakSecLeft % 60).padStart(2, '0')} · Best: {highScore}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 flex flex-col items-center">
          <div className="flex items-center justify-between w-full text-xs">
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setGameMode('snake')}
                className={`px-3 py-1 rounded-lg font-semibold ${
                  gameMode === 'snake' ? 'bg-emerald-500 text-slate-950' : 'bg-white/10 text-slate-300'
                }`}
              >
                🐍 Snake
              </button>
              <button
                type="button"
                onClick={() => setGameMode('pong')}
                className={`px-3 py-1 rounded-lg font-semibold ${
                  gameMode === 'pong' ? 'bg-sky-500 text-slate-950' : 'bg-white/10 text-slate-300'
                }`}
              >
                🏓 Pong
              </button>
            </div>
            <span className="font-mono font-bold text-amber-300">Score: {score}</span>
          </div>

          <canvas
            ref={canvasRef}
            width={320}
            height={240}
            className="rounded-xl border border-purple-500/40 shadow-inner bg-[#060918]"
          />

          {gameOver && (
            <div className="text-xs font-semibold text-rose-300">
              Game Over! Switch game or reopen to play again.
            </div>
          )}

          {/* Touch / Click D-pad Controls */}
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() =>
                gameMode === 'snake'
                  ? dirRef.current.dx !== 1 && (dirRef.current = { dx: -1, dy: 0 })
                  : undefined
              }
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20"
            >
              ◀
            </button>
            <button
              type="button"
              onClick={() =>
                gameMode === 'snake'
                  ? dirRef.current.dy !== 1 && (dirRef.current = { dx: 0, dy: -1 })
                  : (paddleYRef.current = Math.max(10, paddleYRef.current - 26))
              }
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={() =>
                gameMode === 'snake'
                  ? dirRef.current.dy !== -1 && (dirRef.current = { dx: 0, dy: 1 })
                  : (paddleYRef.current = Math.min(180, paddleYRef.current + 26))
              }
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20"
            >
              ▼
            </button>
            <button
              type="button"
              onClick={() =>
                gameMode === 'snake'
                  ? dirRef.current.dx !== -1 && (dirRef.current = { dx: 1, dy: 0 })
                  : undefined
              }
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20"
            >
              ▶
            </button>
          </div>
          <p className="text-[10px] text-slate-400">Use Arrow Keys or WASD to play</p>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * 2. Paper Airplane Squad / Vault Message Inbox Modal
 * ------------------------------------------------------------------ */
export const PaperAirplaneInboxModal: React.FC<{
  messages: PaperAirplaneMessage[];
  onMarkAllRead: () => void;
  onSendSelfNote: (text: string) => void;
  onClose: () => void;
}> = ({ messages, onMarkAllRead, onSendSelfNote, onClose }) => {
  const [draft, setDraft] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0b1530]/95 text-slate-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-sky-500/20 border border-sky-400/35 flex items-center justify-center">
              <Send className="w-4 h-4 text-sky-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Paper Airplane Notes</h3>
              <p className="text-[11px] text-slate-300/75">Squad & Partner encouragement notes landed on desk</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-[68vh] overflow-y-auto">
          {messages.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">
              No paper airplane messages yet. Send a motivating reminder below!
            </p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-xl border p-3 text-xs ${
                  m.read ? 'border-white/10 bg-white/[0.03]' : 'border-sky-400/40 bg-sky-500/12'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] text-sky-200 font-semibold">
                  <span>
                    ✈️ {m.senderName} ({m.sourceLabel})
                  </span>
                  {!m.read && <span className="px-1.5 py-0.5 rounded bg-sky-500/30 text-[9px]">NEW</span>}
                </div>
                <p className="mt-1 text-slate-100">{m.message}</p>
              </div>
            ))
          )}

          {messages.some((m) => !m.read) && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="w-full py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium"
            >
              Mark All Read
            </button>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim()) return;
              onSendSelfNote(draft.trim());
              setDraft('');
            }}
            className="flex gap-2 pt-2 border-t border-white/10"
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Fly a quick encouragement note..."
              className="flex-1 rounded-lg bg-slate-950/70 border border-white/15 px-3 py-2 text-xs text-white focus:outline-none"
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold"
            >
              Fly ✈️
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * 3. Dream Globe Destination Selector Modal
 * ------------------------------------------------------------------ */
export const DreamGlobeModal: React.FC<{
  current: DreamGlobeDestination;
  bestSavingsPct: number;
  onSelectDestination: (dest: DreamGlobeDestination) => void;
  onClose: () => void;
}> = ({ current, bestSavingsPct, onSelectDestination, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
    <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0b1530]/95 text-slate-100 shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-amber-500/20 border border-amber-400/35 flex items-center justify-center">
            <Globe2 className="w-4.5 h-4.5 text-amber-300" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">3D Dream Globe Milestone</h3>
            <p className="text-[11px] text-amber-200">
              Flight Progress: {bestSavingsPct}% toward {current.city}
            </p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 space-y-2.5">
        {DREAM_GLOBE_CITIES.map((city) => {
          const active = city.id === current.id;
          return (
            <button
              key={city.id}
              type="button"
              onClick={() => {
                onSelectDestination(city);
                onClose();
              }}
              className={`w-full text-left flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs transition ${
                active
                  ? 'bg-amber-500/20 border-amber-400/50 text-white'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-slate-200'
              }`}
            >
              <div>
                <div className="font-semibold">
                  📍 {city.city}, {city.country}
                </div>
                <div className="text-[11px] text-slate-400">{city.goalLabel}</div>
              </div>
              {active && <Sparkles className="w-4 h-4 text-amber-300" />}
            </button>
          );
        })}
      </div>
    </div>
  </div>
);

