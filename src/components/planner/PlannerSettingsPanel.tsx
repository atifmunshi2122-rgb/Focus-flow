import React from 'react';
import type { StudyPlannerSettings } from '../../features/planner/types.ts';
import './PlannerSettingsPanel.css';

interface Props {
  value: StudyPlannerSettings;
  onChange: (next: StudyPlannerSettings) => void;
}

export default function PlannerSettingsPanel({ value, onChange }: Props) {
  function update(changes: Partial<StudyPlannerSettings>) {
    onChange({
      ...value,
      ...changes,
    });
  }

  return (
    <section className="planner-settings-panel" aria-label="Study Planner Settings">
      <h2>Study Planner Settings</h2>

      <label htmlFor="planner-daily-target">Daily Study Target (Minutes)</label>
      <input
        id="planner-daily-target"
        type="number"
        min={15}
        max={720}
        step={15}
        value={value.dailyTargetMinutes}
        onChange={(event) =>
          update({
            dailyTargetMinutes: Math.min(720, Math.max(15, Number(event.target.value) || 60)),
          })
        }
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="planner-start-hour" className="block text-xs text-[#bfc6e1] mb-1 font-semibold">
            Preferred Start Hour
          </label>
          <input
            id="planner-start-hour"
            type="number"
            min={0}
            max={22}
            value={value.preferredStartHour}
            onChange={(event) =>
              update({ preferredStartHour: Math.min(22, Math.max(0, Number(event.target.value) || 9)) })
            }
          />
        </div>
        <div>
          <label htmlFor="planner-end-hour" className="block text-xs text-[#bfc6e1] mb-1 font-semibold">
            Preferred End Hour
          </label>
          <input
            id="planner-end-hour"
            type="number"
            min={1}
            max={23}
            value={value.preferredEndHour}
            onChange={(event) =>
              update({ preferredEndHour: Math.min(23, Math.max(1, Number(event.target.value) || 21)) })
            }
          />
        </div>
      </div>

      <label htmlFor="planner-session-duration">Focus Session Duration</label>
      <select
        id="planner-session-duration"
        value={value.sessionDurationMinutes}
        onChange={(event) =>
          update({
            sessionDurationMinutes: Number(event.target.value),
          })
        }
      >
        <option value={25}>25 Minutes</option>
        <option value={45}>45 Minutes</option>
        <option value={50}>50 Minutes</option>
        <option value={60}>60 Minutes</option>
      </select>

      <label htmlFor="planner-break-duration">Break Duration</label>
      <select
        id="planner-break-duration"
        value={value.breakDurationMinutes}
        onChange={(event) =>
          update({
            breakDurationMinutes: Number(event.target.value),
          })
        }
      >
        <option value={5}>5 Minutes</option>
        <option value={10}>10 Minutes</option>
        <option value={15}>15 Minutes</option>
      </select>

      <label className="planner-toggle">
        <input
          type="checkbox"
          checked={value.autoSchedule}
          onChange={(event) => update({ autoSchedule: event.target.checked })}
        />
        Enable Automatic Planning
      </label>

      <label className="planner-toggle">
        <input
          type="checkbox"
          checked={value.allowDeadlineSplitting}
          onChange={(event) => update({ allowDeadlineSplitting: event.target.checked })}
        />
        Split Large Tasks Across Sessions
      </label>
    </section>
  );
}

