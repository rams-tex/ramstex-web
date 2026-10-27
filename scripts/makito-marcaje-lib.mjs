// Funciones de imagen para las zonas de marcaje de Makito (sin llamadas a la API).
// Las previsualizaciones de Makito son la foto del producto con la zona de marcaje pintada encima:
// relleno verde claro OPACO (~#C0F0B4) y borde verde intenso (~#4CD73E, a veces discontinuo).
// - detectar(): busca ese rectángulo -> caja normalizada [x0,y0,x1,y1] (fracciones de la imagen)
// - comparar(): ¿la previsualización tiene el mismo encuadre que una foto del catálogo? (silueta del producto,
//   sin contar la zona verde) -> si coincide, traslada la caja a las coordenadas de esa foto
// - limpiar(): borra la zona verde (relleno desde los bordes) para usar la previsualización como vista
import sharp from "sharp";

export const VERSION = 4; // sube si cambia la detección (se recalcula todo desde la caché, sin API)
export const MAXPX = 600;

// Imagen -> {d: RGB crudo, w, h} reducida a 600 px como mucho, sin transparencia
export async function cargar(input, max = MAXPX) {
  const { data, info } = await sharp(input).flatten({ background: "#ffffff" })
    .resize({ width: max, height: max, fit: "inside", withoutEnlargement: true })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { d: data, w: info.width, h: info.height };
}

// 1 = relleno de la zona, 2 = borde de la zona, 0 = resto
export function mascaraVerde(img) {
  const { d, w, h } = img, m = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < m.length; i++, p += 3) {
    const r = d[p], g = d[p + 1], b = d[p + 2];
    if (Math.abs(r - 192) <= 26 && Math.abs(g - 240) <= 18 && Math.abs(b - 180) <= 30 && g - r >= 28 && g - b >= 34) m[i] = 1;
    else if (g >= 130 && g - r >= 70 && g - b >= 70 && r <= 170) m[i] = 2;
  }
  return m;
}

// Componentes conexas (8 vecinos) de la máscara verde
function componentes(m, w, h) {
  const lab = new Int32Array(w * h).fill(-1), out = [], st = new Int32Array(w * h);
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || lab[s] >= 0) continue;
    const c = { id: out.length, ids: [out.length], n: 0, fill: 0, x0: w, y0: h, x1: -1, y1: -1 };
    let sp = 0; st[sp++] = s; lab[s] = c.id;
    while (sp) {
      const i = st[--sp], x = i % w, y = (i / w) | 0;
      c.n++; if (m[i] === 1) c.fill++;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const j = Y * w + X; if (m[j] && lab[j] < 0) { lab[j] = c.id; st[sp++] = j; }
      }
    }
    out.push(c);
  }
  out.lab = lab;
  return out;
}

// Busca la zona verde. Devuelve {box, n, forma, dens, px} o {box:null, motivo}
//  forma: "r" rectángulo · "o" redondeada/elipse/inclinada · "x" irregular (curva, deformada) · "l" solo contorno
export function detectar(img) {
  const { w, h } = img, m = mascaraVerde(img);
  const minN = Math.max(10, Math.round(w * h * 0.00004));
  const todas = componentes(m, w, h), lab = todas.lab;
  let cs = todas.filter(c => c.n >= minN);
  if (!cs.length) return { box: null, motivo: "sin-verde" };
  // Unir trozos cercanos (bordes discontinuos, zona partida por un reflejo)
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < cs.length && !merged; i++) for (let j = i + 1; j < cs.length && !merged; j++) {
      const a = cs[i], b = cs[j], g = 4;
      if (a.x0 - g <= b.x1 && b.x0 - g <= a.x1 && a.y0 - g <= b.y1 && b.y0 - g <= a.y1) {
        a.ids.push(...b.ids); a.n += b.n; a.fill += b.fill; a.x0 = Math.min(a.x0, b.x0); a.y0 = Math.min(a.y0, b.y0); a.x1 = Math.max(a.x1, b.x1); a.y1 = Math.max(a.y1, b.y1);
        cs.splice(j, 1); merged = true;
      }
    }
  }
  cs = cs.map(c => {
    const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
    // ¿el contorno está en los 4 lados de la caja? (zonas dibujadas solo con borde)
    let lados = 0;
    for (const [x0, y0, x1, y1] of [[c.x0, c.y0, c.x1, Math.min(c.y1, c.y0 + 2)], [c.x0, Math.max(c.y0, c.y1 - 2), c.x1, c.y1], [c.x0, c.y0, Math.min(c.x1, c.x0 + 2), c.y1], [Math.max(c.x0, c.x1 - 2), c.y0, c.x1, c.y1]]) {
      let k = 0, tot = 0;
      if (x1 - x0 > y1 - y0) { for (let x = x0; x <= x1; x++) { tot++; for (let y = y0; y <= y1; y++) if (m[y * w + x]) { k++; break; } } }
      else { for (let y = y0; y <= y1; y++) { tot++; for (let x = x0; x <= x1; x++) if (m[y * w + x]) { k++; break; } } }
      if (k / tot >= 0.45) lados++;
    }
    return { ...c, bw, bh, dens: c.n / (bw * bh), lados };
  });
  // Descarta manchas verdes que no parecen zonas: casi sin relleno ni contorno completo
  // (las zonas en diagonal, p. ej. cintas de lanyard, tienen poca densidad en su caja pero mucho relleno)
  const zonas = cs.filter(c => (c.fill >= c.n * 0.3 && (c.dens >= 0.35 || c.fill >= minN * 4)) || c.lados === 4);
  if (!zonas.length) return { box: null, motivo: "verde-sin-forma", n: cs.length };
  zonas.sort((a, b) => b.bw * b.bh - a.bw * a.bh);
  const z = zonas[0];
  const n = zonas.filter(c => c.bw * c.bh >= z.bw * z.bh * 0.08).length;
  const forma = z.fill < z.n * 0.3 ? "l" : z.dens >= 0.9 ? "r" : z.dens >= 0.7 ? "o" : "x";
  const r4 = v => Math.round(v * 10000) / 10000;
  const box = [r4(z.x0 / w), r4(z.y0 / h), r4((z.x1 + 1) / w), r4((z.y1 + 1) / h)];
  const out = { box, n, forma, dens: Math.round(z.dens * 100) / 100, px: [z.bw, z.bh] };
  if (forma !== "r") {
    // zona inclinada o deformada: 4 esquinas (los puntos extremos en las diagonales) para dibujarla como polígono
    const ids = new Set(z.ids), e = { tl: [1e9], br: [-1e9], tr: [-1e9], bl: [1e9] };
    for (let y = z.y0; y <= z.y1; y++) for (let x = z.x0; x <= z.x1; x++) {
      const i = y * w + x; if (!m[i] || !ids.has(lab[i])) continue;
      const s1 = x + y, s2 = x - y;
      if (s1 < e.tl[0]) e.tl = [s1, x, y]; if (s1 > e.br[0]) e.br = [s1, x + 1, y + 1];
      if (s2 > e.tr[0]) e.tr = [s2, x + 1, y]; if (s2 < e.bl[0]) e.bl = [s2, x, y + 1];
    }
    out.quad = [e.tl, e.tr, e.br, e.bl].flatMap(([, x, y]) => [r4(x / w), r4(y / h)]);
  }
  if (n > 1) out.otras = zonas.slice(1, 4).map(c => [r4(c.x0 / w), r4(c.y0 / h), r4((c.x1 + 1) / w), r4((c.y1 + 1) / h)]);
  return out;
}

// Color de fondo (mediana de los bordes) y silueta del producto (sin la zona verde)
function fondo(img) {
  const { d, w, h } = img, vals = [[], [], []];
  const add = i => { for (let k = 0; k < 3; k++) vals[k].push(d[i * 3 + k]); };
  for (let x = 0; x < w; x += 2) { add(x); add((h - 1) * w + x); }
  for (let y = 0; y < h; y += 2) { add(y * w); add(y * w + w - 1); }
  return vals.map(v => v.sort((a, b) => a - b)[v.length >> 1]);
}
export function silueta(img, verde) {
  const { d, w, h } = img, bg = fondo(img), s = new Uint8Array(w * h);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  const cols = new Uint16Array(w), rows = new Uint16Array(h);
  for (let i = 0, p = 0; i < s.length; i++, p += 3) {
    if (verde && verde[i]) { s[i] = 2; continue; }
    const df = Math.max(Math.abs(d[p] - bg[0]), Math.abs(d[p + 1] - bg[1]), Math.abs(d[p + 2] - bg[2]));
    if (df > 14) { s[i] = 1; cols[i % w]++; rows[(i / w) | 0]++; }
  }
  // Caja del producto: filas/columnas con algo de producto (ignora motas sueltas)
  const mc = Math.max(2, h * 0.004), mr = Math.max(2, w * 0.004);
  for (let x = 0; x < w; x++) if (cols[x] >= mc) { if (x < x0) x0 = x; x1 = x; }
  for (let y = 0; y < h; y++) if (rows[y] >= mr) { if (y < y0) y0 = y; y1 = y; }
  return { s, w, h, bb: x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1], bg };
}

// Rejilla binaria G×G de una región [x0,y0,x1,y1] (en px): 1 = hay producto, 0 = fondo, -1 = tapada por la zona verde.
// Binaria y gruesa a propósito: tolera productos finos (bolígrafos) y pequeños desplazamientos.
function rejillaBin(sil, [x0, y0, x1, y1], G) {
  const bw = x1 - x0, bh = y1 - y0, out = new Int8Array(G * G);
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    const ax = x0 + Math.floor(gx * bw / G), bx = Math.max(ax + 1, x0 + Math.floor((gx + 1) * bw / G));
    const ay = y0 + Math.floor(gy * bh / G), by = Math.max(ay + 1, y0 + Math.floor((gy + 1) * bh / G));
    let p = 0, v = 0, t = 0;
    for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) { const k = sil.s[y * sil.w + x]; t++; if (k === 1) p++; else if (k === 2) v++; }
    out[gy * G + gx] = v > t * 0.2 ? -1 : p >= Math.max(1, (t - v) * 0.12) ? 1 : 0;
  }
  return out;
}
function iouBin(a, b) {
  let i = 0, u = 0;
  for (let k = 0; k < a.length; k++) { if (a[k] < 0 || b[k] < 0) continue; if (a[k] && b[k]) i++; if (a[k] || b[k]) u++; }
  return u ? i / u : 0;
}

// ¿Mismo encuadre? Compara la silueta de la previsualización (sin la zona verde) con la de la foto:
//  - "lienzo": las dos imágenes enteras (misma proporción) -> la caja vale tal cual
//  - "producto": normalizadas a la caja del producto (otro margen/tamaño de lienzo) -> la caja se traslada
// Devuelve {ok, iou, iouL, iouP, asp, modo, map(x,y)->[x,y] en fracciones de la foto}
export function comparar(prev, verdePrev, foto) {
  const sp = silueta(prev, verdePrev), sf = silueta(foto, null);
  if (!sp.bb || !sf.bb) return { ok: false, iou: 0, motivo: "sin-silueta" };
  const r3 = v => Math.round(v * 1000) / 1000;
  const canvasAsp = Math.abs(Math.log((prev.w / prev.h) / (foto.w / foto.h)));
  const iouL = canvasAsp < 0.03 ? iouBin(rejillaBin(sp, [0, 0, sp.w, sp.h], 64), rejillaBin(sf, [0, 0, sf.w, sf.h], 64)) : 0;
  const ap = (sp.bb[2] - sp.bb[0]) / (sp.bb[3] - sp.bb[1]), af = (sf.bb[2] - sf.bb[0]) / (sf.bb[3] - sf.bb[1]);
  const asp = Math.abs(Math.log(ap / af));
  const iouP = asp <= 0.08 ? iouBin(rejillaBin(sp, sp.bb, 40), rejillaBin(sf, sf.bb, 40)) : 0;
  const r = { iou: r3(Math.max(iouL, iouP)), iouL: r3(iouL), iouP: r3(iouP), asp: r3(asp), ok: false };
  if (iouL >= 0.84 && iouL >= iouP - 0.03) { r.ok = true; r.modo = "lienzo"; r.map = (x, y) => [x, y]; }
  else if (iouP >= 0.84) {
    r.ok = true; r.modo = "producto";
    const sx = (sf.bb[2] - sf.bb[0]) / (sp.bb[2] - sp.bb[0]), sy = (sf.bb[3] - sf.bb[1]) / (sp.bb[3] - sp.bb[1]);
    r.map = (x, y) => [(sf.bb[0] + (x * prev.w - sp.bb[0]) * sx) / foto.w, (sf.bb[1] + (y * prev.h - sp.bb[1]) * sy) / foto.h];
  }
  return r;
}
// Traslada caja [x0,y0,x1,y1] y polígono [x,y,…] con la función de comparar()
export function trasladar(map, box, quad) {
  const c = v => Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000;
  const out = {};
  if (box) { const a = map(box[0], box[1]), b = map(box[2], box[3]); out.box = [c(a[0]), c(a[1]), c(b[0]), c(b[1])]; }
  if (quad) { out.quad = []; for (let i = 0; i < quad.length; i += 2) { const p = map(quad[i], quad[i + 1]); out.quad.push(c(p[0]), c(p[1])); } }
  return out;
}

// Borra la zona verde: hueco = máscara verde ensanchada 4 px + píxeles verdosos de alrededor (bordes suavizados del JPEG).
// Cada píxel del hueco se rellena interpolando entre los píxeles buenos más cercanos en horizontal y en vertical,
// dando más peso a la dirección cuyos dos extremos se parecen más (sigue el cuerpo de bolígrafos, tazas, bolsas…)
export function limpiar(img, verde) {
  const { w, h } = img, src = img.d, d = Buffer.from(src), N = w * h;
  const hole = new Uint8Array(N), R = 4;
  for (let i = 0; i < N; i++) if (verde[i]) {
    const x = i % w, y = (i / w) | 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) hole[Y * w + X] = 1; }
  }
  // se extiende a los píxeles verdosos pegados al hueco (halo del borde)
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < N; i++) {
    if (hole[i]) continue;
    const p = i * 3, g = src[p + 1] - Math.max(src[p], src[p + 2]);
    if (g < 10) continue;
    const x = i % w, y = (i / w) | 0;
    if ((x > 0 && hole[i - 1]) || (x < w - 1 && hole[i + 1]) || (y > 0 && hole[i - w]) || (y < h - 1 && hole[i + w])) hole[i] = 1;
  }
  const px = j => [src[j * 3], src[j * 3 + 1], src[j * 3 + 2]];
  const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  for (let i = 0; i < N; i++) {
    if (!hole[i]) continue;
    const x = i % w, y = (i / w) | 0, cand = [];
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      let a = 1, b = 1;
      while (x - dx * a >= 0 && y - dy * a >= 0 && hole[(y - dy * a) * w + x - dx * a]) a++;
      while (x + dx * b < w && y + dy * b < h && hole[(y + dy * b) * w + x + dx * b]) b++;
      const okA = x - dx * a >= 0 && y - dy * a >= 0, okB = x + dx * b < w && y + dy * b < h;
      if (!okA && !okB) continue;
      const A = okA ? px((y - dy * a) * w + x - dx * a) : null, B = okB ? px((y + dy * b) * w + x + dx * b) : null;
      const P = A && B ? A.map((v, c) => (v * b + B[c] * a) / (a + b)) : (A || B);
      const sim = A && B ? dist(A, B) : 120; // extremos parecidos = dirección fiable
      cand.push({ P, wt: 1 / (1 + sim) / (a + b) });
    }
    if (!cand.length) continue;
    const tw = cand.reduce((s, c) => s + c.wt, 0);
    for (let c = 0; c < 3; c++) d[i * 3 + c] = Math.round(cand.reduce((s, k) => s + k.P[c] * k.wt, 0) / tw);
  }
  return { d, w, h };
}

export const aSharp = img => sharp(img.d, { raw: { width: img.w, height: img.h, channels: 3 } });

// Nombre sencillo en español de una técnica de Makito
export function nombreTecnica(t) {
  const d = String(t.description || "").toUpperCase(), c = String(t.category || "").toUpperCase();
  const s = d + " " + c;
  if (/DTF/.test(s)) return "DTF";
  if (/L[AÁ]SER/.test(s)) return "Grabado láser";
  if (/BORDADO/.test(s)) return "Bordado";
  if (/SUBLIMACI/.test(s)) return "Sublimación";
  if (/TRANSFER SERIGR/.test(s)) return "Transfer serigráfico";
  if (/TRANSFER DIGITAL/.test(s)) return "Transfer digital";
  if (/TAMPOGRAF/.test(s)) return "Tampografía";
  if (/SERIGRAF/.test(s)) return "Serigrafía";
  if (/CUATRICROM|CUATRICOM/.test(s)) return "Cuatricromía";
  if (/DOMING|RESINA/.test(s)) return "Gota de resina";
  if (/TERMOGRABADO CINTA|CINTA COLOR/.test(s)) return "Termograbado a color";
  if (/TERMOGRABADO/.test(s)) return "Termograbado";
  if (/VINILO/.test(s)) return "Vinilo";
  if (/DIGITAL/.test(s)) return "Impresión digital";
  if (/UV/.test(s)) return "Impresión UV";
  return (t.category || t.description || "Marcaje").toString().toLowerCase().replace(/^./, x => x.toUpperCase());
}

// "En el cuerpo del portaminas cara A" -> "Cuerpo del portaminas cara A"
export function etiquetaPosicion(s) {
  s = String(s || "").trim().replace(/\s+/g, " ");
  const t = s.replace(/^(en|sobre|a)\s+(el|la|los|las|un|una)\s+/i, "").replace(/^(en|sobre)\s+/i, "");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : s;
}
