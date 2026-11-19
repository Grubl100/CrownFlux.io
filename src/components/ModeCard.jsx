import React from 'react';

export default function ModeCard({
  featured = false,
  badge,
  icon,
  title,
  subtitle,
  description,
  meta = [],
  ctaLabel = 'Explorar modalidade →',
  onClick,
}) {
  return (
    <article
      className={`cf-mode-card${featured ? ' featured' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <div className="cf-mode-card-head">
        <div className="cf-mode-emblem">{icon}</div>
        {badge && <span className={`cf-mode-badge${featured ? ' gold' : ''}`}>{badge}</span>}
      </div>
      <div className="cf-mode-card-body">
        {subtitle && <span className="cf-mode-sub">{subtitle}</span>}
        <h2>{title}</h2>
        <p>{description}</p>
        {meta.length > 0 && (
          <div className="cf-mode-meta">
            {meta.map((item) => (
              <span key={item} className="cf-meta-chip">
                {item}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="cf-mode-card-foot">
        <span className="cf-mode-cta">{ctaLabel}</span>
      </div>
    </article>
  );
}
