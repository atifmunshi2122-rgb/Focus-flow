import React from 'react';
import {
  defaultRoomCustomization,
  type ChairStyle,
  type DeskStyle,
  type RoomCustomization,
  type RoomLighting,
  type RoomTheme,
  type RoomWeather,
} from '../../features/study-room/customization-types.ts';
import './RoomCustomizationPanel.css';

interface Props {
  value: RoomCustomization;
  onChange: (next: RoomCustomization) => void;
  onClose: () => void;
}

export default function RoomCustomizationPanel({ value, onChange, onClose }: Props) {
  function update<K extends keyof RoomCustomization>(key: K, nextValue: RoomCustomization[K]) {
    onChange({
      ...value,
      [key]: nextValue,
    });
  }

  return (
    <section className="room-customization-panel" aria-label="Customize Study Room">
      <header className="room-customization-header">
        <div>
          <h2>Customize Study Room</h2>
          <p>Personalize your 3D room, lighting, weather &amp; furniture</p>
        </div>

        <button type="button" onClick={onClose} aria-label="Close customization">
          ✕
        </button>
      </header>

      <label htmlFor="room-theme-select">Room Theme</label>
      <select
        id="room-theme-select"
        value={value.theme}
        onChange={(event) => update('theme', event.target.value as RoomTheme)}
      >
        <option value="cozy">Cozy Anime</option>
        <option value="minimal">Modern Minimal</option>
        <option value="academia">Dark Academia</option>
        <option value="neon">Neon Gaming</option>
        <option value="sakura">Sakura Garden</option>
        <option value="midnight">Midnight Study</option>
      </select>

      <label htmlFor="room-lighting-select">Lighting &amp; Time of Day</label>
      <select
        id="room-lighting-select"
        value={value.lighting}
        onChange={(event) => update('lighting', event.target.value as RoomLighting)}
      >
        <option value="morning">Morning</option>
        <option value="afternoon">Afternoon</option>
        <option value="sunset">Sunset</option>
        <option value="night">Night</option>
        <option value="auto">Auto Day / Night Cycle</option>
      </select>

      <label htmlFor="room-weather-select">Window Weather</label>
      <select
        id="room-weather-select"
        value={value.weather}
        onChange={(event) => update('weather', event.target.value as RoomWeather)}
      >
        <option value="clear">Clear</option>
        <option value="rain">Rain</option>
        <option value="snow">Snow</option>
      </select>

      <label htmlFor="room-desk-select">Desk Style</label>
      <select
        id="room-desk-select"
        value={value.deskStyle}
        onChange={(event) => update('deskStyle', event.target.value as DeskStyle)}
      >
        <option value="wood">Natural Wood</option>
        <option value="modern">Modern Matte</option>
        <option value="dark">Dark Walnut</option>
        <option value="neon">Neon Gaming</option>
      </select>

      <label htmlFor="room-chair-select">Chair Style</label>
      <select
        id="room-chair-select"
        value={value.chairStyle}
        onChange={(event) => update('chairStyle', event.target.value as ChairStyle)}
      >
        <option value="modern">Modern Ergonomic</option>
        <option value="gaming">Gaming Chair</option>
        <option value="classic">Classic Study</option>
      </select>

      <div className="room-customization-toggle">
        <label>
          <input
            type="checkbox"
            checked={value.showPlants}
            onChange={(event) => update('showPlants', event.target.checked)}
          />
          Show Indoor Plants
        </label>

        <label>
          <input
            type="checkbox"
            checked={value.showDecorations}
            onChange={(event) => update('showDecorations', event.target.checked)}
          />
          Show Wall Clock, Bookshelves &amp; Decor
        </label>

        <label>
          <input
            type="checkbox"
            checked={value.ambientEffects}
            onChange={(event) => update('ambientEffects', event.target.checked)}
          />
          Ambient Sunlight Particles
        </label>
      </div>

      <button
        type="button"
        className="room-customization-reset"
        onClick={() => onChange({ ...defaultRoomCustomization })}
      >
        Reset to Default Room
      </button>
    </section>
  );
}

