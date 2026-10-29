// Zonas de marcaje sobre la foto de CADA color (para que el diseñador enseñe siempre la foto real del color elegido, sin teñir).
// Sin API: solo lee la caché de «Marcaje Makito» (mkm/v/: previsualizaciones con la zona en verde), las fotos que sirve la web
// (caché de «Importar Makito», mkimg/<id>.webp) y diagnostico/makito-marcaje/estado.json (zona detectada en cada previsualización).
// Por cada área y cada foto del producto (principal y una por color) compara las siluetas (comparar() de makito-marcaje-lib)
// y, si encajan, traslada la zona a esa foto.
// Salida: data/makito-marcaje/colores.json  { ref: { área: { foto: [x0,y0,x1,y1] | [x0,y0,x1,y1, quad(8)] } } }
//         diagnostico/makito-marcaje/colores-resumen.txt y hojas de contactos colores-ok-N.jpg / colores-no-N.jpg
// Uso: node scripts/makito-zonas-color.mjs <mkm> <mkimg> <makito.json>
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { cargar, mascaraVerde, comparar, trasladar, silueta } from "./makito-marcaje-lib.mjs";

// Segundo intento cuando comparar() no encaja: siluetas normalizadas a la caja del producto (rejilla 48×48, la zona verde no cuenta),
// admite cajas algo más anchas o estrechas (estira en x/y por separado) y la foto en espejo (la zona se refleja con el producto).
const G = 48;
function rejilla(sil, [x0, y0, x1, y1]) {
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
function iou(a, b, flip) {
  let i = 0, u = 0;
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    const A = a[y * G + x], B = b[y * G + (flip ? G - 1 - x : x)];
    if (A < 0 || B < 0) continue; if (A && B) i++; if (A || B) u++;
  }
  return u ? i / u : 0;
}
const UMBRAL = 0.78;
function comparar2(prev, verde, foto) {
  const sp = silueta(prev, verde), sf = silueta(foto, null);
  if (!sp.bb || !sf.bb) return { ok: false, iou: 0 };
  const ap = (sp.bb[2] - sp.bb[0]) / (sp.bb[3] - sp.bb[1]), af = (sf.bb[2] - sf.bb[0]) / (sf.bb[3] - sf.bb[1]);
  const asp = Math.abs(Math.log(ap / af));
  if (asp > 0.15) return { ok: false, iou: 0, asp };
  const gp = rejilla(sp, sp.bb), gf = rejilla(sf, sf.bb), i0 = iou(gp, gf, false), i1 = iou(gp, gf, true);
  const flip = i1 > i0 + 0.04, best = flip ? i1 : i0;
  if (best < UMBRAL) return { ok: false, iou: Math.round(best * 1000) / 1000, asp };
  const sx = (sf.bb[2] - sf.bb[0]) / (sp.bb[2] - sp.bb[0]), sy = (sf.bb[3] - sf.bb[1]) / (sp.bb[3] - sp.bb[1]);
  const map = (x, y) => {
    let X = (sf.bb[0] + (x * prev.w - sp.bb[0]) * sx) / foto.w;
    if (flip) X = (sf.bb[0] + sf.bb[2]) / foto.w - X;
    return [X, (sf.bb[1] + (y * prev.h - sp.bb[1]) * sy) / foto.h];
  };
  return { ok: true, iou: Math.round(best * 1000) / 1000, modo: flip ? "espejo" : "ajustado", map, flip };
}

const [MKM = "mkm", MKIMG = "mkimg", FULL = "data/makito.json"] = process.argv.slice(2);
const OUT = "data/makito-marcaje", DIAG = "diagnostico/makito-marcaje";
mkdirSync(DIAG, { recursive: true });
const t0 = Date.now();
const E = JSON.parse(readFileSync(join(DIAG, "estado.json"), "utf8")).a;
const prods = JSON.parse(readFileSync(FULL, "utf8")).filter(p => p.merch && p.mref);
const kid = st => st && st.startsWith("K:") ? st.slice(2) : "";
const r4 = v => Math.round(v * 10000) / 10000;

const out = {}, st = { areas: 0, conPrev: 0, pares: 0, ok: 0, sinFoto: 0, yaMapeada: 0, modo: {}, areaTodas: 0, areaAlguna: 0, areaNinguna: 0 };
const colSel = { total: 0, ok: 0 }; // colores (con foto) para los que hay zona exacta en la primera área
const okS = [], noS = [], dudS = []; st.hist = {}; st.no = {};
for (const p of prods) {
  const fotos = [...new Set([kid(p.img?.[0]), ...p.colors.map(c => kid(c.img))].filter(Boolean))].filter(f => existsSync(join(MKIMG, f + ".webp")));
  const areas = Object.keys(E).filter(k => k.startsWith(p.mref + "|"));
  if (!areas.length || !fotos.length) continue;
  const cache = {};
  const foto = async f => (cache[f] ||= await cargar(join(MKIMG, f + ".webp")).catch(() => null));
  for (const key of areas) {
    const r = E[key], aid = key.split("|")[1];
    st.areas++;
    const vf = join(MKM, "v", `${p.mref}-${aid}.webp`);
    if (!r.box || !existsSync(vf)) continue;
    st.conPrev++;
    const prev = await cargar(vf), verde = mascaraVerde(prev);
    const res = {};
    let n = 0;
    for (const f of fotos) {
      st.pares++;
      let box, quad, how;
      if (r.img === f && r.mbox) { box = r.mbox; quad = r.mquad; how = r.modo || "ya"; st.yaMapeada++; }
      else {
        const ph = await foto(f);
        if (!ph) { st.sinFoto++; continue; }
        let c = comparar(prev, verde, ph);
        if (!c.ok) { const c2 = comparar2(prev, verde, ph); if (c2.ok) c = c2; else c.iou = Math.max(c.iou || 0, c2.iou || 0); }
        if (c.ok) {
          const t = trasladar(c.map, r.box, r.quad); box = t.box; quad = t.quad; how = c.modo;
          if (c.flip) { box = [box[2], box[1], box[0], box[3]]; if (quad) quad = [quad[2], quad[3], quad[0], quad[1], quad[6], quad[7], quad[4], quad[5]]; }
          if (how === "ajustado" || how === "espejo") { const h = Math.floor(c.iou * 20) / 20; st.hist[h] = (st.hist[h] || 0) + 1; if (dudS.length < 400) dudS.push([p.ref, aid, f, box, quad, c.iou, how]); }
        }
        else { const h = Math.floor((c.iou || 0) * 10) / 10; st.no[h] = (st.no[h] || 0) + 1; if (noS.length < 400) noS.push([p.ref, aid, vf, f, c.iou]); }
      }
      if (!box) continue;
      st.ok++; n++; st.modo[how] = (st.modo[how] || 0) + 1;
      res[f] = quad ? [...box.map(r4), ...quad.map(r4)] : box.map(r4);
      if (okS.length < 400) okS.push([p.ref, aid, f, box, quad]);
    }
    if (n) ((out[p.ref] ||= {})[aid] = res);
    if (n === fotos.length) st.areaTodas++; else if (n) st.areaAlguna++; else st.areaNinguna++;
  }
}
writeFileSync(join(OUT, "colores.json"), JSON.stringify(out));

// ---------- Hojas de contactos (muestra al azar) ----------
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const S = 220, esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
async function hoja(items, file, tile) {
  const cols = 6, rows = Math.ceil(items.length / cols), tw = S, th = S + 18;
  const comp = [];
  for (let i = 0; i < items.length; i++) {
    try { const t = await tile(items[i]); comp.push({ input: t.buf, left: (i % cols) * (tw + 6), top: Math.floor(i / cols) * (th + 6) }); comp.push({ input: Buffer.from(`<svg width="${tw}" height="18"><text x="2" y="13" font-family="DejaVu Sans, sans-serif" font-size="11">${esc(t.cap)}</text></svg>`), left: (i % cols) * (tw + 6), top: Math.floor(i / cols) * (th + 6) + S }); } catch {}
  }
  await sharp({ create: { width: cols * (tw + 6), height: rows * (th + 6), channels: 3, background: "#ddd" } }).composite(comp).jpeg({ quality: 80 }).toFile(join(DIAG, file));
}
const okTile = async ([ref, aid, f, box, quad]) => {
  const im = sharp(join(MKIMG, f + ".webp")).flatten({ background: "#fff" }).resize(S, S, { fit: "contain", background: "#fff" });
  const m = await sharp(join(MKIMG, f + ".webp")).metadata(), k = Math.min(S / m.width, S / m.height), ox = (S - m.width * k) / 2, oy = (S - m.height * k) / 2;
  const X = v => ox + v * m.width * k, Y = v => oy + v * m.height * k;
  const shape = quad ? `<polygon points="${[0, 1, 2, 3].map(i => X(quad[2 * i]) + "," + Y(quad[2 * i + 1])).join(" ")}" fill="rgba(0,200,0,.25)" stroke="#0a0" stroke-width="1.5"/>`
    : `<rect x="${X(box[0])}" y="${Y(box[1])}" width="${X(box[2]) - X(box[0])}" height="${Y(box[3]) - Y(box[1])}" fill="rgba(0,200,0,.25)" stroke="#0a0" stroke-width="1.5"/>`;
  return { buf: await im.composite([{ input: Buffer.from(`<svg width="${S}" height="${S}">${shape}</svg>`), left: 0, top: 0 }]).png().toBuffer(), cap: `${ref} ${aid} ${f}` };
};
const noTile = async ([ref, aid, vf, f, iou]) => {
  const a = await sharp(vf).resize(S / 2 | 0, S / 2 | 0, { fit: "contain", background: "#fff" }).flatten({ background: "#fff" }).png().toBuffer();
  const b = await sharp(join(MKIMG, f + ".webp")).flatten({ background: "#fff" }).resize(S / 2 | 0, S / 2 | 0, { fit: "contain", background: "#fff" }).png().toBuffer();
  const buf = await sharp({ create: { width: S, height: S, channels: 3, background: "#fff" } }).composite([{ input: a, left: 0, top: S / 4 | 0 }, { input: b, left: S / 2 | 0, top: S / 4 | 0 }]).png().toBuffer();
  return { buf, cap: `${ref} ${aid} ${f} ${iou}` };
};
shuffle(okS); shuffle(noS); shuffle(dudS);
for (let i = 0; i < 2; i++) if (dudS.length > i * 48) await hoja(dudS.slice(i * 48, i * 48 + 48).map(([a, b, f, box, quad, io, how]) => [a + " " + io + (how === "espejo" ? " E" : ""), b, f, box, quad]), `colores-ajustado-${i + 1}.jpg`, okTile).catch(() => {});
for (let i = 0; i < 3; i++) if (okS.length > i * 48) await hoja(okS.slice(i * 48, i * 48 + 48), `colores-ok-${i + 1}.jpg`, okTile).catch(() => {});
for (let i = 0; i < 2; i++) if (noS.length > i * 48) await hoja(noS.slice(i * 48, i * 48 + 48), `colores-no-${i + 1}.jpg`, noTile).catch(() => {});

// ---------- Resumen ----------
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + "%" : "-";
const L = [
  `Zonas por color · ${new Date().toISOString()} · ${Math.round((Date.now() - t0) / 1000)} s`,
  `Áreas: ${st.areas} · con previsualización en la caché: ${st.conPrev}`,
  `Pares área × foto: ${st.pares} · con zona exacta: ${st.ok} (${pct(st.ok, st.pares)}) · ya calculadas antes: ${st.yaMapeada} · foto ilegible: ${st.sinFoto}`,
  `Modo: ${JSON.stringify(st.modo)} · segundo intento por IoU: ${JSON.stringify(st.hist)} · sin encajar por IoU: ${JSON.stringify(st.no)}`,
  `Áreas con zona en todas sus fotos: ${st.areaTodas} · en alguna: ${st.areaAlguna} · en ninguna: ${st.areaNinguna}`,
  `colores.json: ${(Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(0)} KB`,
];
writeFileSync(join(DIAG, "colores-resumen.txt"), L.join("\n") + "\n");
console.log(L.join("\n"));
