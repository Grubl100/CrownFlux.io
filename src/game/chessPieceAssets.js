// Conjuntos vetoriais SVG exclusivos para o Xadrez Clássico do Crownflux.io
// Exatamente 3 estilos distintos: 'standard' (Padrão), 'minimal' (Minimalista), 'medieval' (Medieval)
// Paleta fosca e equilibrada (sem branco puro ofuscante, sem brilho plástico/neon, contornos nítidos).

export const CHESS_PIECE_STYLES = [
  {
    id: 'standard',
    name: 'Padrão',
    desc: 'Formas tradicionais Staunton, proporções equilibradas e acabamento fosco.',
  },
  {
    id: 'minimal',
    name: 'Minimalista',
    desc: 'Silhuetas geométricas limpas, poucos detalhes e leitura instantânea.',
  },
  {
    id: 'medieval',
    name: 'Medieval',
    desc: 'Esculturas tradicionais com ameias, cruzes, elmos e coroas trabalhadas.',
  },
];

export const VALID_PIECE_STYLE_IDS = ['standard', 'minimal', 'medieval'];

export function normalizePieceStyle(style) {
  if (style === 'standard' || style === 'medallion') return 'standard';
  if (style === 'minimal') return 'minimal';
  if (style === 'medieval' || style === 'heraldic') return 'medieval';
  return 'standard';
}

// Paletas foscas de alto contraste para peças Brancas (marfim fosco) e Pretas (grafite/carvão fosco)
const PALETTE = {
  white: {
    fill: '#EAE2D0',      // Marfim fosco (sem branco puro #FFFFFF)
    shade: '#D6CCB6',     // Sombra fosca discreta para volume sem brilho
    accent: '#C4B79C',    // Detalhe sutil em marfim mais escuro
    stroke: '#22272F',    // Contorno externo escuro bem definido
    detail: '#343B45',    // Linhas internas nítidas
    eye: '#22272F',
  },
  black: {
    fill: '#2A3038',      // Grafite escuro fosco (nunca preto chapado sem forma)
    shade: '#1F242B',     // Base carvão fosco
    accent: '#3B434E',    // Plano secundário discreto sem brilho
    stroke: '#12161B',    // Contorno externo firme
    detail: '#C2BAAA',    // Traços internos em estanho fosco suave (legível em casas escuras e claras)
    eye: '#C2BAAA',
  },
};

// =========================================================================
// ESTILO 1: PADRÃO (Staunton tradicional, equilibrado e fosco)
// =========================================================================
function buildStandardShapes(type, p, isBlack) {
  const outer = `fill="${p.fill}" stroke="${p.stroke}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"`;
  const baseFill = `fill="${p.shade}" stroke="${p.stroke}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"`;
  const innerLine = `fill="none" stroke="${p.detail}" stroke-width="${isBlack ? '1.35' : '1.25'}" stroke-linecap="round" stroke-linejoin="round"`;
  const halo = isBlack ? `stroke="#B8B0A0" stroke-width="0.9" opacity="0.45"` : '';

  switch (type) {
    case 'K':
      return `
        <g ${outer}>
          <path d="M22.5 11.4V6.2M20 8.5h5" stroke="${p.stroke}" stroke-width="2.1"/>
          ${isBlack ? '<path d="M22.5 11.4V6.2M20 8.5h5" fill="none" stroke="' + p.detail + '" stroke-width="1.15"/>' : ''}
          <path d="M22.5 25c0 0 4.5-7.5 3-10.5 0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5z"/>
          <path d="M12.5 37c5.5 3.5 14.5 3.5 20 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7z"/>
        </g>
        <path d="M12.5 30c5.5-3 14.5-3 20 0" ${innerLine}/>
        <path d="M12.5 33.5c5.5-3 14.5-3 20 0" ${innerLine}/>
        <path d="M12.5 37c5.5-2.6 14.5-2.6 20 0" ${innerLine}/>
        <path d="M11 38.6h23v2.4H11z" ${baseFill}/>
        ${isBlack ? '<path d="M12.5 37c5.5 3.5 14.5 3.5 20 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7z" fill="none" ' + halo + '/>' : ''}
      `;

    case 'Q':
      return `
        <g ${outer}>
          <circle cx="6.5" cy="12.5" r="2.2"/>
          <circle cx="14" cy="9" r="2.2"/>
          <circle cx="22.5" cy="7.5" r="2.3"/>
          <circle cx="31" cy="9" r="2.2"/>
          <circle cx="38.5" cy="12.5" r="2.2"/>
          <path d="M9.5 26.5c8.5-1.5 21-1.5 26 0l2.5-12-7 10.5-0.3-13.5-5.7 12.2-2.5-14-2.5 14-5.7-12.2L14 25 7 14.5l2.5 12z"/>
          <path d="M9.5 26.5c0 2 1.5 2 2.5 4 1 1.5 1 1 0.5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5 0.5 2.5 0.5 2.5 6.5 1 15.5 1 22 0 0 0 1.5-1 0-2.5 0 0 0.5-1.5-1-2.5-0.5-2.5-0.5-2 0.5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-17.5-1.5-26 0z"/>
        </g>
        <path d="M11.5 30c3.5-1 18.5-1 22 0" ${innerLine}/>
        <path d="M12 33.8c6-1.1 15-1.1 21 0" ${innerLine}/>
        <path d="M11 38.2h23v2.5H11z" ${baseFill}/>
        ${isBlack ? '<path d="M9.5 26.5l-2.5-12 7 10.5 0.3-13.5 5.7 12.2 2.5-14 2.5 14 5.7-12.2 0.3 13.5 7-10.5-2.5 12" fill="none" ' + halo + '/>' : ''}
      `;

    case 'R':
      return `
        <g ${outer}>
          <path d="M9 39h27v-3H9v3z" ${baseFill}/>
          <path d="M12 36v-4h21v4H12z"/>
          <path d="M11 14V9h4v2h5V9h5v2h5V9h4v5"/>
          <path d="M34 14l-3 3H14l-3-3z"/>
          <path d="M31 17v12.5H14V17"/>
          <path d="M31 29.5l1.5 2.5h-20l1.5-2.5z"/>
        </g>
        <path d="M12 14h21" ${innerLine}/>
        <path d="M14.5 17.5h16" ${innerLine}/>
        <path d="M14.5 29.3h16" ${innerLine}/>
        <path d="M12.5 32.5h20" ${innerLine}/>
      `;

    case 'B':
      return `
        <g ${outer}>
          <path d="M9 36.5c3.4-1 10.1 0.4 13.5-2 3.4 2.4 10.1 1 13.5 2 0 0 1.6 0.6 3 2-0.7 1-1.6 1-3 0.5-3.4-1-10.1 0.5-13.5-1-3.4 1.5-10.1 0-13.5 1-1.4 0.5-2.3 0.5-3-0.5 1.4-1.4 3-2 3-2z" ${baseFill}/>
          <path d="M15 32c2.5 2.5 12.5 2.5 15 0 0.5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-0.5 0.5 0 2z"/>
          <circle cx="22.5" cy="8.2" r="2.5"/>
        </g>
        <path d="M17.5 26h10" ${innerLine}/>
        <path d="M15.5 30h14" ${innerLine}/>
        <path d="M22.5 15.2v5.2M20 17.8h5" ${innerLine}/>
      `;

    case 'N':
      return `
        <g ${outer}>
          <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21"/>
          <path d="M24 18c0.4 2.9-5.6 7.4-8 9-3 2-2.8 4.3-5 4-1-0.9 1.4-3 0-3-1 0 0.2 1.2-1 2-1 0-4 1-4-4 0-2 6-12 6-12s1.9-1.9 2-3.5c-0.7-1-0.5-2-0.5-3 1-1 3 2.5 3 2.5h2s0.8-2 2.5-3c1 0 1 3 1 3"/>
        </g>
        <path d="M11 39h28v2H11z" ${baseFill}/>
        <circle cx="15" cy="15.5" r="1.25" fill="${p.eye}"/>
        <circle cx="9.8" cy="25.2" r="0.8" fill="${p.eye}"/>
        <path d="M24.5 11.2c6.2 1.8 10.3 7.6 10.2 25.5" ${innerLine}/>
      `;

    case 'P':
    default:
      return `
        <g ${outer}>
          <path d="M22.5 9.5a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6z"/>
          <path d="M17.2 19.6h10.6c-0.8 2.8-1.4 4.8 1.2 7.4 2.4 2.4 4.8 4.5 5 11.5H11c0.2-7 2.6-9.1 5-11.5 2.6-2.6 2-4.6 1.2-7.4z"/>
          <path d="M9.8 38.5h25.4v2.6H9.8z" ${baseFill}/>
        </g>
        <path d="M16.2 20.5h12.6" ${innerLine}/>
        <path d="M14 35.5h17" ${innerLine}/>
      `;
  }
}

// =========================================================================
// ESTILO 2: MINIMALISTA (Geométrico moderno, silhueta limpa e contornos firmes)
// =========================================================================
function buildMinimalShapes(type, p, isBlack) {
  const outer = `fill="${p.fill}" stroke="${p.stroke}" stroke-width="2.0" stroke-linecap="round" stroke-linejoin="round"`;
  const baseFill = `fill="${p.shade}" stroke="${p.stroke}" stroke-width="2.0" stroke-linecap="round" stroke-linejoin="round"`;
  const line = `fill="none" stroke="${p.detail}" stroke-width="${isBlack ? '1.5' : '1.35'}" stroke-linecap="round" stroke-linejoin="round"`;

  switch (type) {
    case 'K':
      return `
        <g ${outer}>
          <rect x="20.7" y="5.5" width="3.6" height="9" rx="0.8"/>
          <rect x="17.8" y="8" width="9.4" height="3.2" rx="0.8"/>
          <path d="M13 15.5h19l-2.6 16.5H15.6L13 15.5z"/>
          <rect x="10.5" y="34.5" width="24" height="5.5" rx="2"/>
        </g>
        <path d="M14.8 21.5h15.4" ${line}/>
        <path d="M15.8 32h13.4" ${line}/>
      `;

    case 'Q':
      return `
        <g ${outer}>
          <path d="M9 12.5l6.8 9.2L22.5 9l6.7 12.7L36 12.5 32.5 33h-20L9 12.5z"/>
          <circle cx="9" cy="10.5" r="1.8"/>
          <circle cx="22.5" cy="7.5" r="2.0"/>
          <circle cx="36" cy="10.5" r="1.8"/>
          <rect x="10.5" y="34.5" width="24" height="5.5" rx="2"/>
        </g>
        <path d="M13.8 29.5h17.4" ${line}/>
      `;

    case 'R':
      return `
        <g ${outer}>
          <path d="M12 9.5h5v4.5h3V9.5h5v4.5h3V9.5h5v9.5l-2.2 2V33H14.2V21L12 19V9.5z"/>
          <rect x="10.5" y="34.5" width="24" height="5.5" rx="2"/>
        </g>
        <path d="M14.5 21h16" ${line}/>
        <path d="M14.5 31h16" ${line}/>
      `;

    case 'B':
      return `
        <g ${outer}>
          <circle cx="22.5" cy="7.8" r="2.2"/>
          <path d="M22.5 10.8c6.2 4.4 8.5 11.4 5.8 18.2l2.2 4H14.5l2.2-4c-2.7-6.8-0.4-13.8 5.8-18.2z"/>
          <rect x="11" y="34.5" width="23" height="5.5" rx="2"/>
        </g>
        <path d="M19.8 16.8l5.8 5.8" ${line}/>
        <path d="M16.8 29.5h11.4" ${line}/>
      `;

    case 'N':
      return `
        <g ${outer}>
          <path d="M14 33l2.2-10.2-5.2 2.2-2.2-3.2 7.8-11.2 2.4-2.8 2.6 2.2 1.8-2.2c7.5 1.8 12.2 9.4 11.8 25.2H14z"/>
          <rect x="10.5" y="34.5" width="24" height="5.5" rx="2"/>
        </g>
        <circle cx="17.8" cy="15.8" r="1.35" fill="${p.eye}"/>
        <path d="M25.5 12.5c3.8 3 6 8.2 6.2 18.5" ${line}/>
      `;

    case 'P':
    default:
      return `
        <g ${outer}>
          <circle cx="22.5" cy="14" r="5.5"/>
          <path d="M17.2 21.5h10.6L31.5 33h-18l3.7-11.5z"/>
          <rect x="11.5" y="34.5" width="22" height="5.5" rx="2"/>
        </g>
        <path d="M16.8 23.2h11.4" ${line}/>
      `;
  }
}

// =========================================================================
// ESTILO 3: MEDIEVAL (Esculturas tradicionais medievais com personalidade própria)
// =========================================================================
function buildMedievalShapes(type, p, isBlack) {
  const outer = `fill="${p.fill}" stroke="${p.stroke}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"`;
  const shade = `fill="${p.shade}" stroke="${p.stroke}" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"`;
  const accent = `fill="${p.accent}" stroke="${p.stroke}" stroke-width="1.4" stroke-linejoin="round"`;
  const carve = `fill="none" stroke="${p.detail}" stroke-width="${isBlack ? '1.35' : '1.2'}" stroke-linecap="round" stroke-linejoin="round"`;

  switch (type) {
    case 'K':
      return `
        <g ${outer}>
          <!-- Cruz gótica medieval -->
          <path d="M21 5h3v3h3.2v3H24v3.4h-3V11h-3.2V8H21V5z" ${accent}/>
          <!-- Coroa imperial recortada -->
          <path d="M10.5 15.5l4.2 3.2 3.8-4.4 4 4 4-4 3.8 4.4 4.2-3.2-2.4 10.5H12.9l-2.4-10.5z"/>
          <!-- Corpo esculpido -->
          <path d="M14.2 26h16.6l2.4 9.5H11.8L14.2 26z"/>
          <!-- Pedestal escalonado -->
          <path d="M9.5 35.5h26l1.5 4.8H8l1.5-4.8z" ${shade}/>
        </g>
        <path d="M13.5 23.2h18" ${carve}/>
        <path d="M16.5 28.5v5M22.5 28v5.5M28.5 28.5v5" ${carve}/>
        <path d="M11.2 37.8h22.6" ${carve}/>
      `;

    case 'Q':
      return `
        <g ${outer}>
          <!-- Tiara medieval com pontas e florão -->
          <path d="M8.5 13.5l5.5 7 3.5-9.5 5 8.5 5-8.5 3.5 9.5 5.5-7-3.5 12.5H12L8.5 13.5z"/>
          <circle cx="8.5" cy="12" r="1.7" ${accent}/>
          <circle cx="17.5" cy="9.2" r="1.8" ${accent}/>
          <circle cx="22.5" cy="7.4" r="2.1" ${accent}/>
          <circle cx="27.5" cy="9.2" r="1.8" ${accent}/>
          <circle cx="36.5" cy="12" r="1.7" ${accent}/>
          <!-- Manto acinturado -->
          <path d="M14.5 26h16l3.2 9.5H11.3L14.5 26z"/>
          <path d="M9.5 35.5h26l1.5 4.8H8l1.5-4.8z" ${shade}/>
        </g>
        <path d="M22.5 28l2.5 3-2.5 3-2.5-3 2.5-3z" ${carve}/>
        <path d="M13.2 24h18.6" ${carve}/>
        <path d="M11.2 37.8h22.6" ${carve}/>
      `;

    case 'R':
      return `
        <g ${outer}>
          <!-- Parapeito de castelo com ameias largas -->
          <path d="M9.5 8.5h5.2v4.2h3.1V8.5h9.4v4.2h3.1V8.5h5.2v8.8l-3.5 2.4H13l-3.5-2.4V8.5z"/>
          <!-- Torre fortificada -->
          <path d="M13.5 19.7h18l1.8 15.8H11.7l1.8-15.8z"/>
          <!-- Base de pedra -->
          <path d="M9.2 35.5h26.6l1.4 4.8H7.8l1.4-4.8z" ${shade}/>
        </g>
        <!-- Fenda de arqueiro e juntas de alvenaria -->
        <path d="M22.5 22.8v6.2M20.8 25.2h3.4" ${carve}/>
        <path d="M13.2 16.5h18.6" ${carve}/>
        <path d="M13 31.8h19" ${carve}/>
        <path d="M11 37.8h23" ${carve}/>
      `;

    case 'B':
      return `
        <g ${outer}>
          <!-- Mitra medieval alta e pontiaguda -->
          <path d="M22.5 6.2l2.3 3.2-2.3 2.2-2.3-2.2 2.3-3.2z" ${accent}/>
          <path d="M22.5 11c5.8 3.2 8.4 9.5 6.5 15.8H16c-1.9-6.3 0.7-12.6 6.5-15.8z"/>
          <!-- Colarinho e vestes -->
          <path d="M14.5 26.8h16l2.8 8.7H11.7l2.8-8.7z"/>
          <path d="M9.5 35.5h26l1.5 4.8H8l1.5-4.8z" ${shade}/>
        </g>
        <!-- Cruz esculpida na mitra -->
        <path d="M22.5 14.8v8.4M19.4 18.2h6.2" ${carve}/>
        <path d="M15.2 28.8h14.6" ${carve}/>
        <path d="M11.2 37.8h22.6" ${carve}/>
      `;

    case 'N':
      return `
        <g ${outer}>
          <!-- Cavalo de guerra medieval com crina escalonada e peitoral -->
          <path d="M13.5 35.5c0.4-6.2 4.6-9 7.8-11.2-2.6 0.6-5.8 2.6-8.4 3.4-2.8 0.8-4.5-1.2-4.2-4 0.3-2.6 4.2-8.2 7-11.4l1.2-4.5 3.6 2.6 2.5-3c8.2 1.2 14.8 8.4 14.5 28.1h-24z"/>
          <path d="M9.5 35.5h26.5l1.3 4.8H8.2l1.3-4.8z" ${shade}/>
        </g>
        <!-- Placa de armadura e crina esculpida -->
        <path d="M24 10.6c5.8 2.2 9.4 7.8 9.2 21.8" ${carve}/>
        <path d="M27.8 14.8l3.2 1.8M29.4 19.6l3.2 1.4M30.2 24.6l2.8 1" ${carve}/>
        <path d="M14.8 16.5l3.6-1.2-1.2 2.4z" fill="${p.eye}"/>
        <path d="M15.5 31.8h16.5" ${carve}/>
      `;

    case 'P':
    default:
      return `
        <g ${outer}>
          <!-- Elmo medieval de infantaria + escudo peitoral -->
          <path d="M22.5 8.5c4.2 0 6.2 3.2 6.2 6.8 0 2.5-1.2 4.2-2.8 5h-6.8c-1.6-0.8-2.8-2.5-2.8-5 0-3.6 2-6.8 6.2-6.8z"/>
          <path d="M16 20.3h13l3.6 15.2H12.4L16 20.3z"/>
          <path d="M10 35.5h25l1.4 4.8H8.6l1.4-4.8z" ${shade}/>
        </g>
        <!-- Viseira e detalhe de escudo -->
        <path d="M18.2 14.5h8.6M22.5 11.2v6.6" ${carve}/>
        <path d="M16.5 23h12" ${carve}/>
        <path d="M22.5 25.5l3 2.5-1 5h-4l-1-5 3-2.5z" ${carve}/>
      `;
  }
}

export function getChessPieceSvgMarkup(style = 'standard', type = 'P', owner = 0) {
  const normStyle = normalizePieceStyle(style);
  const isBlack = owner === 1;
  const palette = isBlack ? PALETTE.black : PALETTE.white;

  let body = '';
  if (normStyle === 'minimal') body = buildMinimalShapes(type, palette, isBlack);
  else if (normStyle === 'medieval') body = buildMedievalShapes(type, palette, isBlack);
  else body = buildStandardShapes(type, palette, isBlack);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="90" height="90">${body}</svg>`;
}

const dataUrlCache = new Map();
const imageCache = new Map();

export function getChessPieceDataUrl(style = 'standard', type = 'P', owner = 0) {
  const normStyle = normalizePieceStyle(style);
  const key = `${normStyle}:${type}:${owner === 1 ? 1 : 0}`;
  if (dataUrlCache.has(key)) return dataUrlCache.get(key);
  const svg = getChessPieceSvgMarkup(normStyle, type, owner);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  dataUrlCache.set(key, url);
  return url;
}

export function getChessPieceImage(style = 'standard', type = 'P', owner = 0, onLoad = null) {
  const normStyle = normalizePieceStyle(style);
  const key = `${normStyle}:${type}:${owner === 1 ? 1 : 0}`;
  const cached = imageCache.get(key);
  if (cached) {
    if (!cached.complete && onLoad) cached._listeners.add(onLoad);
    return cached;
  }
  if (typeof Image === 'undefined') return null;

  const img = new Image();
  img._listeners = new Set();
  if (onLoad) img._listeners.add(onLoad);
  img.onload = () => {
    for (const fn of img._listeners) {
      try { fn(); } catch { /* ignore */ }
    }
    img._listeners.clear();
  };
  img.src = getChessPieceDataUrl(normStyle, type, owner);
  imageCache.set(key, img);
  return img;
}

export function preloadChessPieceStyle(style = 'standard', onReady = null) {
  const normStyle = normalizePieceStyle(style);
  const types = ['K', 'Q', 'R', 'B', 'N', 'P'];
  let pending = 0;
  for (const owner of [0, 1]) {
    for (const t of types) {
      const img = getChessPieceImage(normStyle, t, owner, () => {
        pending--;
        if (pending <= 0 && onReady) onReady();
      });
      if (img && !img.complete) pending++;
    }
  }
  if (pending === 0 && onReady) onReady();
}
