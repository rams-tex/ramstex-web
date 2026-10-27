// Medida de una foto (RGBA): lo mismo que dzMeasure en index.html, más la manga en las fotos laterales.
// Devuelve [x0,y0,x1,y1,bw,by0] (proporciones de la foto) o, en fotos laterales con manga detectada, [..., sx, sy]
// (centro de la manga en proporción al contorno de la prenda, foto sin voltear). null si no se distingue la prenda.

// Máscara de prenda como dzMeasure: transparencia si la foto la tiene, si no, todo lo que no es blanco
export function mascara(d, w, h) {
  const tr = d[3] < 128 || d[(w - 1) * 4 + 3] < 128 || d[(w * h - 1) * 4 + 3] < 128;
  const on = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) { const i = p * 4; on[p] = tr ? (d[i + 3] > 60 ? 1 : 0) : (d[i] < 249 || d[i + 1] < 249 || d[i + 2] < 249 ? 1 : 0); }
  return on;
}

// Reducción a ~240 px de lado (como el lienzo de dzMeasure)
export function reduce(d, W, H, max = 240) {
  const k = Math.min(1, max / Math.max(W, H)), w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const o = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx0 = Math.floor(x / k), sx1 = Math.max(sx0 + 1, Math.floor((x + 1) / k)), sy0 = Math.floor(y / k), sy1 = Math.max(sy0 + 1, Math.floor((y + 1) / k));
    const acc = [0, 0, 0, 0]; let n = 0;
    for (let yy = sy0; yy < Math.min(H, sy1); yy++) for (let xx = sx0; xx < Math.min(W, sx1); xx++) { const i = (yy * W + xx) * 4; acc[0] += d[i]; acc[1] += d[i + 1]; acc[2] += d[i + 2]; acc[3] += d[i + 3]; n++; }
    const j = (y * w + x) * 4; for (let c = 0; c < 4; c++) o[j + c] = acc[c] / n;
  }
  return { d: o, w, h };
}

export function contorno(d, w, h) {
  const on = mascara(d, w, h);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0 || (y1 - y0) < h * .35) return null;
  const cx = Math.round((x0 + x1) / 2), ws = [];
  for (let f = .6; f <= .861; f += .02) { const r = Math.round(y0 + f * (y1 - y0)); let L = cx, R = cx; if (!on[r * w + cx]) continue; while (L > 0 && on[r * w + L - 1]) L--; while (R < w - 1 && on[r * w + R + 1]) R++; ws.push(R - L + 1); }
  ws.sort((a, b) => a - b);
  const bw = ws.length ? ws[ws.length >> 1] : (x1 - x0 + 1);
  let by0 = y0;
  for (let ry = y0; ry <= y1; ry++) { let cnt = 0; for (let rx = x0; rx <= x1; rx++) cnt += on[ry * w + rx]; if (cnt >= bw * .6) { by0 = ry; break; } }
  return { on, x0, y0, x1, y1, bw, by0 };
}

export function mideFoto(d, W, H, vista) {
  const r = reduce(d, W, H, 240);
  const c = contorno(r.d, r.w, r.h);
  if (!c) return null;
  const { w, h } = r;
  const out = [c.x0 / w, c.y0 / h, (c.x1 + 1) / w, (c.y1 + 1) / h, c.bw / w, c.by0 / h];
  if (vista === "s" || vista === "sl" || vista === "sr") {
    const m = manga(d, W, H);
    if (m) out.push(m[0], m[1]);
  }
  return out;
}

// Centro de la manga en una foto lateral: de momento sin detección (se usa la proporción del proveedor)
export function manga(d, W, H) { return null; }
