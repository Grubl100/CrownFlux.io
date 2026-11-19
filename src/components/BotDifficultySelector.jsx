import React from 'react';
import { GLOBAL_AI_DIFFICULTIES, clampDifficulty } from '../ai/aiConfig.js';

export default function BotDifficultySelector({
  value = 3,
  onChange,
  mode = 'duel',
  compact = false,
  onPlayLevel = null,
}) {
  const current = clampDifficulty(value);

  if (compact) {
    const selectedInfo = GLOBAL_AI_DIFFICULTIES.find((d) => d.level === current) || GLOBAL_AI_DIFFICULTIES[2];
    return (
      <div className="ai-diff-compact">
        <div className="ai-diff-pills" role="radiogroup" aria-label="Dificuldade da IA">
          {GLOBAL_AI_DIFFICULTIES.map((item) => {
            const active = item.level === current;
            return (
              <button
                key={item.level}
                type="button"
                role="radio"
                aria-checked={active}
                className={`ai-diff-pill${active ? ' active' : ''}${item.level >= 4 ? ' hard' : ''}`}
                onClick={() => onChange?.(item.level)}
              >
                <span className="ai-diff-num">{item.level}</span>
                <span>{item.name}</span>
              </button>
            );
          })}
        </div>
        <div className="ai-diff-summary">
          <strong>{selectedInfo.name}</strong> · <span>{selectedInfo.challenge}</span>
          <p className="muted">{selectedInfo.modeDesc?.[mode] || selectedInfo.shortDesc}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cpu-levels-list">
      {GLOBAL_AI_DIFFICULTIES.map((item) => {
        const active = current === item.level;
        const desc = item.modeDesc?.[mode] || item.shortDesc;
        return (
          <div
            key={item.level}
            className={`diff-item${active ? ' selected' : ''}`}
            onClick={() => onChange?.(item.level)}
          >
            <div className="diff-main">
              <div className="diff-title-row">
                <span className="diff-name">{item.level}. {item.name}</span>
                <div className="diff-meter" aria-hidden="true">
                  {Array.from({ length: 5 }, (_, idx) => (
                    <i
                      key={idx}
                      className={`diff-bar${idx < item.level ? ' on' : ''}${idx < item.level && item.level >= 4 ? ' hard' : ''}`}
                    />
                  ))}
                </div>
                {item.recommended && <span className="rec-tag">Recomendado para iniciantes</span>}
              </div>
              <div className="diff-desc">{desc}</div>
              <small style={{ color: 'var(--gold)' }}>{item.challenge}</small>
            </div>
            {onPlayLevel && (
              <button
                type="button"
                className={active ? 'primary' : 'secondary'}
                onClick={(e) => {
                  e.stopPropagation();
                  onPlayLevel(item.level);
                }}
              >
                Jogar
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
