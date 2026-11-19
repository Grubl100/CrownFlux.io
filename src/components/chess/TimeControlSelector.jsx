import React from 'react';
import { CLASSIC_CATEGORIES, CLASSIC_CONTROLS } from '../../utils/constants.js';

export default function TimeControlSelector({
  category,
  onCategoryChange,
  timeControl,
  onTimeControlChange,
  customTime,
  onCustomTimeChange,
  ratings = {},
}) {
  const controlsInCat = Object.entries(CLASSIC_CONTROLS).filter(([, c]) => c.category === category);

  return (
    <div className="tc-selector-box">
      <div className="tc-cat-tabs" role="tablist" aria-label="Categoria de controle de tempo">
        {CLASSIC_CATEGORIES.map((cat) => {
          const active = category === cat.id;
          const catRating = cat.id !== 'custom' ? (ratings?.[cat.id] || 1200) : null;
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`tc-cat-tab${active ? ' active' : ''}`}
              onClick={() => {
                onCategoryChange(cat.id);
                if (cat.id === 'custom') {
                  onTimeControlChange('custom');
                } else {
                  const first = Object.entries(CLASSIC_CONTROLS).find(([, c]) => c.category === cat.id);
                  if (first) onTimeControlChange(first[0]);
                }
              }}
            >
              <span className="tc-cat-title">{cat.name}</span>
              {catRating ? (
                <small className="tc-cat-elo">Elo {catRating}</small>
              ) : (
                <small className="tc-cat-elo">Livre</small>
              )}
            </button>
          );
        })}
      </div>

      {category !== 'custom' ? (
        <div className="tc-presets-grid">
          {controlsInCat.map(([key, ctrl]) => {
            const active = timeControl === key;
            const mins = Math.floor(ctrl.seconds / 60);
            return (
              <button
                key={key}
                type="button"
                className={`tc-preset-card${active ? ' active' : ''}`}
                onClick={() => onTimeControlChange(key)}
              >
                <strong className="tc-preset-main">{ctrl.shortLabel}</strong>
                <span className="tc-preset-sub">
                  {mins} min {ctrl.increment > 0 ? `+ ${ctrl.increment}s/lance` : 'sem incremento'}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="tc-custom-panel">
          <div className="tc-custom-fields">
            <label>
              <span>Tempo inicial (minutos: 1–180)</span>
              <input
                type="number"
                min={1}
                max={180}
                value={customTime.minutes}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(180, Number(e.target.value) || 1));
                  onCustomTimeChange({ ...customTime, minutes: val });
                  onTimeControlChange('custom');
                }}
              />
            </label>
            <label>
              <span>Incremento por lance (segundos: 0–60)</span>
              <input
                type="number"
                min={0}
                max={60}
                value={customTime.increment}
                onChange={(e) => {
                  const val = Math.max(0, Math.min(60, Number(e.target.value) || 0));
                  onCustomTimeChange({ ...customTime, increment: val });
                  onTimeControlChange('custom');
                }}
              />
            </label>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Controles personalizados funcionam em Salas Privadas, Contra Bot e Duelo Local (não alteram o rating Elo ranqueado).
          </p>
        </div>
      )}
    </div>
  );
}
