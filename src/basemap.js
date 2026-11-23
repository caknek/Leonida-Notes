// Mapa base ilustrado propio (estilo carta de campo). No reproduce el mapa del juego:
// es una costa subtropical estilizada para usar mientras no cargas tu captura.
const S = 2048;

function rng(seed) { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

// Contorno principal (coordenadas 0..1): península con franja norte
const COAST = [
  [0.03, 0.13], [0.16, 0.12], [0.30, 0.125], [0.34, 0.105], [0.50, 0.11], [0.62, 0.12], [0.73, 0.13],
  [0.75, 0.20], [0.765, 0.29], [0.79, 0.38], [0.815, 0.47], [0.845, 0.56], [0.87, 0.65], [0.875, 0.73], [0.86, 0.80], [0.83, 0.86], [0.79, 0.89],
  [0.75, 0.875], [0.715, 0.83], [0.68, 0.77], [0.645, 0.70], [0.615, 0.62], [0.595, 0.54], [0.575, 0.46], [0.555, 0.385], [0.52, 0.31], [0.475, 0.26],
  [0.43, 0.235], [0.38, 0.225], [0.32, 0.235], [0.25, 0.25], [0.18, 0.235], [0.10, 0.225], [0.03, 0.22],
];
const KEYS = [[0.78, 0.915], [0.75, 0.935], [0.715, 0.95], [0.68, 0.962], [0.645, 0.97], [0.61, 0.975], [0.575, 0.977]];
const ISLANDS = [[0.9, 0.48, 0.012], [0.92, 0.62, 0.009], [0.53, 0.6, 0.014], [0.5, 0.67, 0.01]];

function smooth(pts, jag, r) {
  // Catmull-Rom + ruido para una costa natural
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let t = 0; t < 1; t += 0.08) {
      const t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push([x + (r() - 0.5) * jag, y + (r() - 0.5) * jag]);
    }
  }
  return out;
}
const path = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * S, y * S) : g.moveTo(x * S, y * S))); g.closePath(); };
const blob = (g, cx, cy, rad, r, k = 14) => { const pts = []; for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2; const rr = rad * (0.75 + r() * 0.5); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } return smooth(pts, 0.002, r); };

export function drawBaseMap() {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const r = rng(20261119);

  // Océano
  const sea = g.createRadialGradient(S * 0.65, S * 0.5, S * 0.1, S * 0.6, S * 0.5, S * 0.85);
  sea.addColorStop(0, '#16506a'); sea.addColorStop(0.55, '#0f3550'); sea.addColorStop(1, '#0a1d33');
  g.fillStyle = sea; g.fillRect(0, 0, S, S);
  // textura de olas
  g.strokeStyle = 'rgba(160,220,235,0.045)'; g.lineWidth = 2;
  for (let i = 0; i < 900; i++) {
    const x = r() * S, y = r() * S, w = 10 + r() * 22;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 4, x + w, y); g.stroke();
  }

  const coast = smooth(COAST, 0.004, r);
  const islands = [...KEYS.map(([x, y]) => blob(g, x, y, 0.011 + r() * 0.006, r, 9)), ...ISLANDS.map(([x, y, s]) => blob(g, x, y, s, r))];

  // Batimetría: halos alrededor de la costa
  [[70, 0.05], [44, 0.07], [24, 0.1], [10, 0.16]].forEach(([w, a]) => {
    g.strokeStyle = `rgba(57,211,195,${a})`; g.lineWidth = w; g.lineJoin = 'round';
    path(g, coast); g.stroke();
    islands.forEach((p) => { path(g, p); g.stroke(); });
  });
  // aguas someras turquesa
  g.save(); g.shadowColor = 'rgba(80,230,210,.55)'; g.shadowBlur = 40;
  g.fillStyle = '#2a7f86'; path(g, coast); g.fill(); islands.forEach((p) => { path(g, p); g.fill(); }); g.restore();

  // Tierra
  const land = g.createLinearGradient(0, S * 0.1, 0, S * 0.95);
  land.addColorStop(0, '#3d5a3f'); land.addColorStop(0.5, '#3a5a44'); land.addColorStop(1, '#2f4f45');
  g.fillStyle = land; path(g, coast); g.fill(); islands.forEach((p) => { path(g, p); g.fill(); });
  // arena de playa
  g.strokeStyle = '#d9c38f'; g.lineWidth = 7; path(g, coast); g.stroke();
  g.lineWidth = 4; islands.forEach((p) => { path(g, p); g.stroke(); });

  g.save(); path(g, coast); g.clip();
  // textura de vegetación
  for (let i = 0; i < 2600; i++) {
    const x = r() * S, y = r() * S;
    g.fillStyle = `rgba(${r() > 0.5 ? '120,170,110' : '30,60,40'},${0.12 + r() * 0.12})`;
    g.beginPath(); g.arc(x, y, 2 + r() * 6, 0, Math.PI * 2); g.fill();
  }
  // humedal al sur (rayado)
  const swamp = blob(g, 0.755, 0.79, 0.075, r, 16);
  g.save(); path(g, swamp); g.clip();
  g.fillStyle = 'rgba(70,110,80,.55)'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(150,200,140,.28)'; g.lineWidth = 2;
  for (let y = 0; y < S; y += 14) { g.beginPath(); for (let x = 0; x < S; x += 24) g.lineTo(x, y + Math.sin(x / 40 + y) * 3); g.stroke(); }
  g.restore();
  // lago
  const lake = blob(g, 0.755, 0.6, 0.032, r, 12);
  g.fillStyle = '#1f6a7a'; path(g, lake); g.fill(); g.strokeStyle = 'rgba(160,230,230,.35)'; g.lineWidth = 3; g.stroke();
  // colinas al norte (curvas de nivel)
  [[0.62, 0.17], [0.22, 0.17]].forEach(([cx, cy]) => {
    for (let k = 5; k > 0; k--) { const b = blob(g, cx, cy, 0.012 * k, r, 12); g.strokeStyle = `rgba(232,195,122,${0.08 + (5 - k) * 0.03})`; g.lineWidth = 2; path(g, b); g.stroke(); }
  });
  // carreteras
  g.lineCap = 'round';
  const road = (pts, w) => {
    g.strokeStyle = 'rgba(10,18,32,.55)'; g.lineWidth = w + 5; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * S, y * S) : g.moveTo(x * S, y * S))); g.stroke();
    g.strokeStyle = 'rgba(232,195,122,.75)'; g.lineWidth = w; g.stroke();
  };
  road([[0.72, 0.16], [0.74, 0.3], [0.77, 0.4], [0.8, 0.5], [0.83, 0.6], [0.845, 0.7], [0.83, 0.82]], 7);
  road([[0.06, 0.18], [0.3, 0.17], [0.5, 0.16], [0.7, 0.165]], 6);
  road([[0.58, 0.18], [0.6, 0.35], [0.62, 0.5], [0.66, 0.66], [0.72, 0.75]], 5);
  road([[0.6, 0.42], [0.7, 0.44], [0.79, 0.46]], 4);
  road([[0.64, 0.68], [0.75, 0.7], [0.84, 0.7]], 4);
  // luces de ciudades
  [[0.84, 0.75, 36], [0.79, 0.43, 22], [0.62, 0.62, 18], [0.45, 0.17, 18]].forEach(([x, y, n]) => {
    const gl = g.createRadialGradient(x * S, y * S, 0, x * S, y * S, n * 4);
    gl.addColorStop(0, 'rgba(255,190,110,.45)'); gl.addColorStop(1, 'rgba(255,190,110,0)');
    g.fillStyle = gl; g.fillRect(x * S - n * 4, y * S - n * 4, n * 8, n * 8);
    for (let i = 0; i < n; i++) { g.fillStyle = r() > 0.3 ? 'rgba(255,214,150,.9)' : 'rgba(255,120,160,.9)'; g.fillRect(x * S + (r() - 0.5) * n * 4, y * S + (r() - 0.5) * n * 4, 3, 3); }
  });
  g.restore();

  // cuadrícula de coordenadas
  g.strokeStyle = 'rgba(243,234,215,.07)'; g.lineWidth = 1.5;
  for (let i = 128; i < S; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); }
  g.fillStyle = 'rgba(243,234,215,.45)'; g.font = '600 22px Outfit, sans-serif'; g.textAlign = 'center';
  'ABCDEFGHIJKLMNOP'.split('').forEach((l, i) => { g.fillText(l, i * 128 + 64, 26); g.fillText(l, i * 128 + 64, S - 10); });
  for (let i = 0; i < 16; i++) { g.fillText(String(i + 1), 18, i * 128 + 72); g.fillText(String(i + 1), S - 18, i * 128 + 72); }
  // marco
  g.strokeStyle = 'rgba(232,195,122,.5)'; g.lineWidth = 3; g.strokeRect(36, 36, S - 72, S - 72);
  g.strokeStyle = 'rgba(232,195,122,.25)'; g.lineWidth = 1.5; g.strokeRect(46, 46, S - 92, S - 92);

  // cartela
  g.save(); g.translate(250, 1680);
  g.fillStyle = 'rgba(10,18,32,.72)'; g.strokeStyle = 'rgba(232,195,122,.6)'; g.lineWidth = 3;
  g.beginPath(); g.roundRect ? g.roundRect(-170, -110, 340, 220, 18) : g.rect(-170, -110, 340, 220); g.fill(); g.stroke();
  g.fillStyle = '#e8c37a'; g.textAlign = 'center';
  g.font = '700 64px "Playfair Display", Georgia, serif'; g.fillText('Leonida', 0, -18);
  g.font = '600 22px Outfit, sans-serif'; g.fillStyle = 'rgba(243,234,215,.8)'; g.fillText('CARTA DE CAMPO · FAN-MADE', 0, 24);
  g.font = '500 18px Outfit, sans-serif'; g.fillStyle = 'rgba(243,234,215,.55)'; g.fillText('Carga tu captura del juego', 0, 62);
  g.fillText('para máxima precisión', 0, 86);
  g.restore();
  return c.toDataURL('image/jpeg', 0.88);
}
