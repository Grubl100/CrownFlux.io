import React from 'react';
import { DOCTRINES_INFO } from '../utils/constants.js';

export default function DoctrineSelector({ value, onChange, compact = false }) {
  const list = Object.values(DOCTRINES_INFO);

  return (
    <div className={`doctrine-selector${compact ? ' compact' : ''}`}>
      <div className="doctrine-header">
        <strong>⚔️ Doutrina Estratégica de Combate</strong>
        <span className="muted">Escolha seu estilo para o Duelo 1v1</span>
      </div>
      <div className="doctrine-pills">
        {list.map((doc) => {
          const active = value === doc.id;
          return (
            <button
              key={doc.id}
              type="button"
              className={`doctrine-pill${active ? ' active' : ''}`}
              onClick={() => onChange(doc.id)}
            >
              <div className="doc-pill-top">
                <span className="doc-ic">{doc.icon}</span>
                <div>
                  <strong>{doc.name}</strong>
                  <small className="doc-tag">{doc.tag}</small>
                </div>
              </div>
              <div className="doc-desc">
                <span className="doc-pos">+ {doc.bonus}</span>
                <span className="doc-neg">− {doc.tradeoff}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
