import React from 'react';

const baseProps = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
  className: 'cf-inline-icon',
};

export function IconArrowLeft(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M19 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </svg>
  );
}

export function IconArrowRight(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconBook(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
      <path d="M4 5.5V21.5" />
    </svg>
  );
}

export function IconFlip(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M8 3v18" />
      <path d="M4 7l4-4 4 4" />
      <path d="M16 21V3" />
      <path d="M12 17l4 4 4-4" />
    </svg>
  );
}

export function IconTargetArrow(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M5 19L19 5" />
      <path d="M11 5h8v8" />
    </svg>
  );
}

export function IconDashedArrow(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M5 19l4-4" />
      <path d="M12 12l4-4" />
      <path d="M12 5h7v7" />
    </svg>
  );
}

export function IconTouch(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 11V5a2 2 0 1 1 4 0v6" />
      <path d="M16 11a2 2 0 1 1 4 0v4a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.7L4.7 15a1.8 1.8 0 0 1 2.7-2.3L12 16" />
    </svg>
  );
}

export function IconTrash(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
    </svg>
  );
}

export function IconFlag(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M5 3v18" />
      <path d="M5 4h12l-2.5 5L17 14H5" />
    </svg>
  );
}

export function IconHandshake(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M3 12l4-4 4 2 4-2 6 4" />
      <path d="M7 16l4 2 4-2 4-4" />
    </svg>
  );
}

export function IconAnalysis(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M7 15l4-5 3 3 5-6" />
    </svg>
  );
}

export function IconCopy(props) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function IconSkipStart(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M6 5v14" />
      <path d="M18 6l-8 6 8 6V6z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconStepBack(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M15 6l-7 6 7 6V6z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconStepForward(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M9 6l7 6-7 6V6z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconSkipEnd(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M18 5v14" />
      <path d="M6 6l8 6-8 6V6z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconPlay(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M7 5l12 7-12 7V5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconPause(props) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconHome(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M3 10.5L12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
    </svg>
  );
}
