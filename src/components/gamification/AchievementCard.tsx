import React from 'react';
import type { Achievement } from '../../features/gamification/types.ts';
import './AchievementCard.css';

interface Props {
  achievement: Achievement;
}

export default function AchievementCard({ achievement }: Props) {
  const progress = Math.min(100, Math.max(0, achievement.progress));

  return (
    <article
      className={`achievement-card ${achievement.unlocked ? 'unlocked' : 'locked'}`}
    >
      <div className="achievement-icon">{achievement.icon}</div>

      <div className="achievement-details">
        <h3>{achievement.title}</h3>

        <p>{achievement.description}</p>

        <div className="achievement-progress">
          <div style={{ width: `${progress}%` }} />
        </div>

        <small>
          {progress}% completed · +{achievement.rewardXP} XP
        </small>
      </div>

      {achievement.unlocked && <span className="achievement-check">✓</span>}
    </article>
  );
}

