import React from 'react';
import type { StudyActivity } from '../../features/study-room/types.ts';
import './StudyActivityBar.css';

interface StudyActivityBarProps {
  value: StudyActivity;
  onChange: (activity: StudyActivity) => void;
  disabled?: boolean;
}

const activities: {
  value: StudyActivity;
  label: string;
  icon: string;
}[] = [
  { value: 'studying', label: 'Studying', icon: '📚' },
  { value: 'typing', label: 'Typing', icon: '💻' },
  { value: 'reading', label: 'Reading', icon: '📖' },
  { value: 'writing', label: 'Writing', icon: '✍️' },
  { value: 'break', label: 'Taking Break', icon: '☕' },
  { value: 'idle', label: 'Idle', icon: '🌙' },
];

export default function StudyActivityBar({
  value,
  onChange,
  disabled = false,
}: StudyActivityBarProps) {
  return (
    <div className="study-activity-bar" role="group" aria-label="Study room activity">
      {activities.map((activity) => {
        const active = activity.value === value;
        return (
          <button
            key={activity.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            className={`study-activity-button ${active ? 'active' : ''}`}
            onClick={() => onChange(activity.value)}
          >
            <span className="activity-icon" aria-hidden="true">
              {activity.icon}
            </span>
            <span>{activity.label}</span>
          </button>
        );
      })}
    </div>
  );
}

