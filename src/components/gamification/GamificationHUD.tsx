import React from 'react';
import type { XPProgress } from '../../features/gamification/types.ts';
import { getLevelTitle } from '../../features/gamification/reward-config.ts';
import { XP_PER_LEVEL } from '../../features/gamification/xp-calculator.ts';
import './GamificationHUD.css';

interface GamificationHUDProps {
  progress: XPProgress;
  streak: number;
  dailyXP: number;
  onOpenAchievements: () => void;
  onOpenLeaderboard: () => void;
}

export default function GamificationHUD({
  progress,
  streak,
  dailyXP,
  onOpenAchievements,
  onOpenLeaderboard,
}: GamificationHUDProps) {
  const rankTitle = getLevelTitle(progress.level);

  return (
    <section className="gamification-hud" aria-label="Study RPG XP Progress">
      <div className="gamification-profile">
        <div className="gamification-level">{progress.level}</div>

        <div className="gamification-info">
          <h3>
            Level {progress.level} · {rankTitle}
          </h3>

          <p>{progress.totalXP.toLocaleString()} Total XP</p>

          <div className="xp-progress-track">
            <div
              className="xp-progress-fill"
              style={{ width: `${progress.progressPercent}%` }}
            />
          </div>

          <small>
            {progress.currentLevelXP} / {XP_PER_LEVEL} XP to next level
          </small>
        </div>
      </div>

      <div className="gamification-stats">
        <div className="gamification-stat">
          <span>🔥</span>
          <strong>{streak}</strong>
          <small>Day Streak</small>
        </div>

        <div className="gamification-stat">
          <span>⚡</span>
          <strong>{dailyXP}</strong>
          <small>Today&apos;s XP</small>
        </div>
      </div>

      <div className="gamification-actions">
        <button type="button" onClick={onOpenAchievements}>
          🏆 Achievements
        </button>

        <button type="button" onClick={onOpenLeaderboard}>
          👑 Leaderboard
        </button>
      </div>
    </section>
  );
}

