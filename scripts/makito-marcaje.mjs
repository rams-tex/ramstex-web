// Zonas de marcaje de Makito para el diseñador (solo merchandising). SOLO LECTURA de la API (catálogo de marcaje y fotos).
// 1. /print-config/files -> por producto y área: posición, medidas máximas (mm) y técnicas permitidas tal cual las define Makito
//    ("id(colores)") + data/makito-marcaje/tecnicas.json (id -> nombre sencillo, categoría, colores máx., a todo color…).
// 2. Descarga, poco a poco (25 peticiones/min compartidas con los demás flujos de Makito), la previsualización de cada área
//    (foto con la zona pintada en verde), la reduce a 600 px nada más bajarla (no se guardan originales) y detecta la zona
//    -> caja normalizada. Compara la previsualización con la foto principal (y si no coincide, con la primera foto de color)
//    para saber si la caja se puede dibujar sobre la foto que enseña la web; si no, prepara la previsualización limpia
//    (sin el verde, WebP 600 px) como vista de esa área.
// 3. Escribe data/makito-marcaje/<categoría>.json, tecnicas.json, y en diagnostico/makito-marcaje/ el estado (para seguir
//    donde se quedó), un resumen, la verificación de técnicas y hojas de contactos para revisar a ojo.
// Uso: node scripts/makito-marcaje.mjs <carpeta caché> <makito.json completo> [minutos de descarga] [--sin-api]
// Orden: primero una área por producto (A1 o la primera), repartiendo entre categorías; después el resto de áreas.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import sharp from "sharp";
import { makitoGet } from "./makito-api.mjs";
import { VERSION, cargar, detectar, mascaraVerde, comparar, limpiar, aSharp, nombreTecnica, etiquetaPosicion } from "./makito-marcaje-lib.mjs";

const CACHE = process.argv[2] || "mkm", FULL = process.argv[3] || "data/makito.json";
const BUDGET = (+process.argv[4] || 300) * 60000, OFFLINE = process.argv.includes("--sin-api");
const COMMIT = process.env.MARCAJE_COMMIT === "1";
const OUT = "data/makito-marcaje", DIAG = "diagnostico/makito-marcaje";
for (const d of [OUT, DIAG, join(CACHE, "p"), join(CACHE, "v"), join(CACHE, "z")]) mkdirSync(d, { recursive: true });
const t0 = Date.now();
const log = (...a) => console.log(`[${Math.round((Date.now() - t0) / 60000)} min]`, ...a);

// ---------- Productos de merchandising ----------
const prods = JSON.parse(readFileSync(FULL, "utf8")).filter(p => p.merch && p.mref);
log(`Productos de merchandising: ${prods.length}`);

// ---------- Configuración de marcaje ----------
let print;
const PRINT_LOCAL = join(CACHE, "print-config.json");
if (OFFLINE) print = JSON.parse(readFileSync(PRINT_LOCAL, "utf8"));
else { print = await makitoGet("/print-config/files?format=JSON&lang=es"); writeFileSync(PRINT_LOCAL, JSON.stringify(print)); }
const POS = Object.fromEntries((print.positions || []).map(x => [String(x.id), x.description]));
const AREAS = Object.fromEntries((print.products || []).map(x => [String(x.id), x.areas || []]));
// Técnicas: la API da a veces varias entradas por id ("100116", "100116_ANTIGUO_2"…). Se usa la exacta; si no hay,
// la versión no "ANTIGUO"; si solo hay antiguas, la de sufijo más alto.
const TRAW = print.techniques || [];
function tecnicaDe(id) {
  const exact = TRAW.find(t => String(t.id) === id);
  if (exact) return exact;
  const same = TRAW.filter(t => String(t.id).split("_")[0] === id);
  if (!same.length) return null;
  return same.find(t => !/ANTIGUO/i.test(t.id)) || same.sort((a, b) => String(b.id).localeCompare(String(a.id)))[0];
}
const parseTec = s => String(s || "").split(",").map(x => x.trim()).filter(Boolean).map(x => {
  const m = x.match(/^([^()]+?)\s*(?:\((\d+)\))?$/); return m ? [m[1].trim(), m[2] != null ? +m[2] : null] : [x, null];
});
const TEC = {}, tecDesconocidas = new Set();
const ficha = id => {
  if (TEC[id] !== undefined) return TEC[id];
  const t = tecnicaDe(id);
  if (!t) { tecDesconocidas.add(id); return (TEC[id] = null); }
  const o = { name: nombreTecnica(t), d: String(t.description || "").trim(), cat: t.category || null, max: t.maximumColors ?? null, full: String(t.fullColor) === "true" };
  if (t.minimumQuantity != null) o.minQ = +t.minimumQuantity;
  if (t.doublePass != null) o.doble = String(t.doublePass) === "true";
  if (t.embroidery != null && String(t.embroidery) !== "false") o.bordado = t.embroidery;
  if (t.stitches != null) o.puntadas = t.stitches;
  if (String(t.id) !== id) o.src = String(t.id);
  return (TEC[id] = o);
};

// ---------- Fotos ----------
const kid = st => st && st.startsWith("K:") ? st.slice(2) : "";
function fotosDe(p) {
  const main = kid(p.img[0]) || kid(p.colors.find(c => c.img)?.img);
  const col = p.colors.map(c => kid(c.img)).filter(f => f && f !== main);
  return { main, col: col[0] || "" };
}

// ---------- Estado (para continuar donde se quedó) ----------
const ESTADO = join(DIAG, "estado.json");
let E = { v: VERSION, a: {}, f: {}, err: {} };
try { const e = JSON.parse(readFileSync(ESTADO, "utf8")); if (e.a) E = { ...E, ...e }; } catch {}
const cacheV = (mref, aid) => join(CACHE, "v", `${mref}-${aid}.webp`);
const cacheP = f => join(CACHE, "p", f + ".webp");
const cacheZ = (mref, aid) => join(CACHE, "z", `${mref}-${aid}.webp`);
let peticiones = 0, bajadas = { v: 0, p: 0 }, fallos = 0;
const tiempo = () => Date.now() - t0 < BUDGET;

async function bajar(path, dest, q) {
  if (existsSync(dest)) return true;
  if (OFFLINE || !tiempo()) return false;
  peticiones++;
  const buf = await makitoGet(path, { raw: true });
  await sharp(buf).flatten({ background: "#ffffff" }).resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true }).webp({ quality: q, effort: 4 }).toFile(dest);
  return 2;
}
async function foto(f, p) {
  if (!f) return null;
  if (E.f[f] === "x") return null;
  const where = p.assets?.[f];
  if (!where) return null;
  try { const b = await bajar("/catalog/assets/" + where, cacheP(f), 72); if (!b) return null; if (b === 2) bajadas.p++; return await cargar(cacheP(f)); }
  catch (e) { fallos++; if (e.status === 404) E.f[f] = "x"; log("  foto no disponible", f, e.message); return null; }
}

// Analiza una área (desde la caché; descarga lo que falte). Devuelve false si se quedó sin tiempo.
async function analizar(p, a) {
  const key = `${p.mref}|${a.id}`, prev = E.a[key];
  if (prev && prev.v === VERSION) return true;
  if (prev && prev.sin) return true; // Makito no tiene previsualización (404)
  const rel = String(a.image || "").replace(/^https?:\/\/[^/]+/, "");
  if (!rel) { E.a[key] = { v: VERSION, sin: "sin-url" }; return true; }
  try { const b = await bajar(rel, cacheV(p.mref, a.id), 85); if (!b) return false; if (b === 2) bajadas.v++; }
  catch (e) {
    fallos++; E.err[key] = (E.err[key] || 0) + 1;
    if (e.status === 404 || E.err[key] >= 3) E.a[key] = { v: VERSION, sin: e.status === 404 ? "404" : "error" };
    log("  previsualización no disponible", key, e.message); return true;
  }
  const img = await cargar(cacheV(p.mref, a.id));
  const det = detectar(img), r = { v: VERSION, pw: img.w, ph: img.h, ...det };
  const verde = mascaraVerde(img);
  const { main, col } = fotosDe(p);
  const tries = [[main, 0], [col, 1]];
  for (const [f, cv] of tries) {
    if (!f) continue;
    const ph = await foto(f, p);
    if (!ph) { if (!tiempo() && !existsSync(cacheP(f))) return false; continue; }
    const c = comparar(img, verde, ph, det.box);
    r[cv ? "cmpCol" : "cmpMain"] = { f, iou: c.iou, asp: c.asp, desp: c.desp };
    if (c.ok) { r.img = f; r.cv = cv; r.mbox = c.box || null; break; }
  }
  if (!r.img) {
    // Encuadre distinto a nuestras fotos: vista = previsualización limpia
    if (det.box) {
      const cl = limpiar(img, verde);
      await aSharp(cl).webp({ quality: 72, effort: 5 }).toFile(cacheZ(p.mref, a.id));
      r.zkb = Math.round(statSync(cacheZ(p.mref, a.id)).size / 102.4) / 10;
    }
    r.img = "z"; r.mbox = det.box;
  }
  E.a[key] = r;
  return true;
}

// ---------- Cola: primero una área por producto (repartido entre categorías), luego el resto ----------
const byCat = {};
for (const p of prods) (byCat[p.merch] ||= []).push(p);
for (const c in byCat) byCat[c].sort((a, b) => a.ref.localeCompare(b.ref));
const cats = Object.keys(byCat).sort();
const tier0 = [], tier1 = [];
for (let i = 0, more = true; more; i++) {
  more = false;
  for (const c of cats) { const p = byCat[c][i]; if (!p) continue; more = true; const as = AREAS[p.mref] || []; if (as[0]) tier0.push([p, as[0]]); }
}
for (const c of cats) for (const p of byCat[c]) for (const a of (AREAS[p.mref] || []).slice(1)) tier1.push([p, a]);
// el resto de áreas: primero tazas, bolígrafos/escritura y bolsas (lo más pedido), luego lo demás
const PRIO = { "m-taz": 0, "m-esc": 1, "m-bol": 2 };
tier1.sort((x, y) => (PRIO[x[0].merch] ?? 9) - (PRIO[y[0].merch] ?? 9));
log(`Áreas: ${tier0.length} primeras + ${tier1.length} más`);

// ---------- Salida ----------
function escribirDatos() {
  const tamCat = {};
  for (const c of cats) {
    const o = {};
    for (const p of byCat[c]) {
      const as = AREAS[p.mref] || [];
      if (!as.length) { o[p.ref] = { m: p.mref, areas: [] }; continue; }
      o[p.ref] = {
        m: p.mref, areas: as.map(a => {
          const r = E.a[`${p.mref}|${a.id}`] || {};
          const tec = parseTec(a.techniques);
          tec.forEach(([id]) => ficha(id));
          const x = { id: a.id, pos: POS[String(a.position)] || "", lab: etiquetaPosicion(POS[String(a.position)]), pid: String(a.position), mm: [a.width, a.height], box: r.mbox || null, img: r.img || null, tec };
          if (r.img === "z") x.img = `z/${p.mref}-${a.id}`;
          if (r.cv) x.col = 1; // la caja va sobre las fotos de color (encuadre de producto suelto), no sobre la principal
          if (r.forma && r.forma !== "r") x.forma = r.forma;
          if (r.n > 1) x.zonas = r.n;
          if (r.sin || (r.v && !r.box && !r.sin)) x.sinZona = r.sin || r.motivo || "sin-verde";
          return x;
        }),
      };
    }
    const s = JSON.stringify(o);
    writeFileSync(join(OUT, c + ".json"), s); tamCat[c] = s.length;
  }
  // técnicas de todas las áreas de merchandising (incluidas las aún no analizadas)
  const t = Object.fromEntries(Object.keys(TEC).sort().filter(k => TEC[k]).map(k => [k, TEC[k]]));
  writeFileSync(join(OUT, "tecnicas.json"), JSON.stringify(t, null, 0));
  E.v = VERSION;
  writeFileSync(ESTADO, JSON.stringify(E));
  return tamCat;
}

function resumen(tamCat) {
  const L = [], pct = (a, b) => b ? (100 * a / b).toFixed(1) + "%" : "-";
  L.push(`Marcaje Makito · ${new Date().toISOString()} · versión de detección ${VERSION}`);
  L.push(`Esta ejecución: ${pendientes} áreas pendientes · ${peticiones} peticiones (${bajadas.v} previsualizaciones, ${bajadas.p} fotos), ${fallos} fallos, ${Math.round((Date.now() - t0) / 60000)} min`);
  let tot = { p: 0, a: 0, an: 0, box: 0, sin: 0, sinTec: 0, main: 0, col: 0, z: 0, multi: 0, forma: {}, pcon: 0, zkb: 0, sinTecP: 0, sinAreas: 0, nulCol: 0 };
  L.push("", "Categoría: productos (sin áreas) · áreas · analizadas · con zona · sin zona/sin previa · caja sobre foto principal / foto de color / previsualización limpia · varias zonas · formas");
  for (const c of cats) {
    const k = { p: 0, sinAreas: 0, a: 0, an: 0, box: 0, sin: 0, main: 0, col: 0, z: 0, multi: 0, forma: {}, pcon: 0 };
    for (const p of byCat[c]) {
      k.p++; const as = AREAS[p.mref] || []; if (!as.length) k.sinAreas++;
      let algun = false;
      for (const a of as) {
        k.a++; const tec = parseTec(a.techniques); if (!tec.length) tot.sinTec++;
        tec.forEach(([, n]) => { if (n == null) tot.nulCol++; });
        const r = E.a[`${p.mref}|${a.id}`]; if (!r) continue; k.an++;
        if (r.sin || !r.box) { k.sin++; continue; }
        k.box++; algun = true;
        if (r.img === "z") { k.z++; tot.zkb += r.zkb || 0; } else if (r.cv) k.col++; else k.main++;
        if (r.n > 1) k.multi++;
        k.forma[r.forma] = (k.forma[r.forma] || 0) + 1;
      }
      if (algun) k.pcon++;
    }
    L.push(`  ${c}: ${k.p} (${k.sinAreas}) · ${k.a} · ${k.an} · ${k.box} (${pct(k.box, k.an)}) · ${k.sin} · ${k.main}/${k.col}/${k.z} · ${k.multi} · ${JSON.stringify(k.forma)} · productos con alguna zona: ${k.pcon}`);
    for (const x of ["p", "a", "an", "box", "sin", "main", "col", "z", "multi", "pcon", "sinAreas"]) tot[x] += k[x];
    for (const f in k.forma) tot.forma[f] = (tot.forma[f] || 0) + k.forma[f];
  }
  L.push(`  TOTAL: ${tot.p} productos (${tot.sinAreas} sin áreas en Makito) · ${tot.a} áreas · analizadas ${tot.an} (${pct(tot.an, tot.a)}) · con zona ${tot.box} (${pct(tot.box, tot.an)}) · sin zona ${tot.sin}`);
  L.push(`  caja sobre foto principal ${tot.main} · sobre foto de color ${tot.col} · previsualización limpia ${tot.z} (${pct(tot.z, tot.box)})`);
  L.push(`  productos con alguna zona detectada: ${tot.pcon} de ${tot.p} · formas: ${JSON.stringify(tot.forma)} (r rectángulo, o redondeada/elipse, x irregular, l solo contorno) · varias zonas en la imagen: ${tot.multi}`);
  L.push(`  áreas sin técnicas en Makito: ${tot.sinTec} · técnicas sin nº de colores en el área: ${tot.nulCol} · ids de técnica desconocidos: ${[...tecDesconocidas].join(", ") || "ninguno"}`);
  const nz = tot.z, kb = tot.zkb;
  L.push(`  previsualizaciones limpias: ${nz} · ${(kb / 1024).toFixed(1)} MB (media ${nz ? (kb / nz).toFixed(1) : 0} KB) · estimado si se analizan todas las áreas: ~${tot.box ? Math.round(kb / 1024 * tot.a / tot.an) : "?"} MB`);
  let tamD = 0; for (const f of readdirSync(OUT)) tamD += statSync(join(OUT, f)).size;
  L.push(`  data/makito-marcaje: ${(tamD / 1024).toFixed(0)} KB (${Object.entries(tamCat).map(([c, s]) => `${c} ${(s / 1024).toFixed(0)}`).join(", ")} KB; tecnicas.json ${(statSync(join(OUT, "tecnicas.json")).size / 1024).toFixed(1)} KB)`);
  // IoU de las comparaciones (para ajustar el umbral)
  const hist = {}; for (const r of Object.values(E.a)) { const i = r.cmpMain?.iou; if (i == null) continue; const b = Math.min(9, Math.floor(i * 10)); hist[b / 10] = (hist[b / 10] || 0) + 1; }
  L.push(`  IoU silueta previsualización vs foto principal: ${JSON.stringify(hist)}`);
  const h2 = {}; for (const r of Object.values(E.a)) { const i = r.cmpCol?.iou; if (i == null) continue; const b = Math.min(9, Math.floor(i * 10)); h2[b / 10] = (h2[b / 10] || 0) + 1; }
  L.push(`  IoU silueta previsualización vs foto de color: ${JSON.stringify(h2)}`);
  const sinZ = Object.entries(E.a).filter(([, r]) => r.sin || !r.box).map(([k, r]) => `${k}:${r.sin || r.motivo}`);
  L.push("", `Áreas sin zona (${sinZ.length}): ${sinZ.slice(0, 300).join(" ")}`);
  writeFileSync(join(DIAG, "resumen.txt"), L.join("\n") + "\n");
  console.log(L.slice(0, 22).join("\n"));
}

// Verificación de técnicas: 2 productos por categoría (+ los que faltan hasta 20), texto de Makito vs lo guardado vs la importación
function verificacion() {
  const L = ["Verificación de técnicas por área: texto original de Makito (areas[].techniques) · lo guardado en data/makito-marcaje · lo que trae data/makito.json (importación, independiente)", ""];
  const pick = [];
  for (const c of cats) { const ps = byCat[c].filter(p => (AREAS[p.mref] || []).length); [...new Set([0, Math.floor(ps.length / 2)])].forEach(i => ps[i] && pick.push(ps[i])); }
  let bad = 0;
  for (const p of pick.slice(0, 22)) {
    const data = JSON.parse(readFileSync(join(OUT, p.merch + ".json"), "utf8"))[p.ref];
    L.push(`${p.ref} (${p.mref}) ${p.name} [${p.merch}]`);
    (AREAS[p.mref] || []).forEach((a, i) => {
      const g = data.areas[i], imp = (p.areas || []).find(x => x.id === a.id);
      const ours = g.tec.map(([id, n]) => `${TEC[id]?.name || "?"}${n != null ? "(" + n + ")" : ""}[${id}]`).join(", ");
      const theirs = imp ? imp.t.map(t => `${t.n}${t.col ? "(" + t.col + ")" : ""}`).join(", ") : "—";
      const okRaw = g.tec.map(([id, n]) => id + (n != null ? `(${n})` : "")).join(",") === String(a.techniques || "").replace(/\s+/g, "");
      const okImp = !imp || (imp.t.length === g.tec.length && imp.t.every((t, k) => (t.col || 0) === (g.tec[k][1] ?? (TEC[g.tec[k][0]]?.full ? 0 : TEC[g.tec[k][0]]?.max ?? 0)) && t.n === TEC[g.tec[k][0]]?.d));
      if (!okRaw || !okImp) bad++;
      L.push(`  ${a.id} «${g.pos}» ${a.width}×${a.height} mm · Makito: "${a.techniques}" · guardado: ${ours} · importación: ${theirs} · ${okRaw ? "igual al original" : "DISTINTO DEL ORIGINAL"}${okImp ? "" : " · DIFIERE DE LA IMPORTACIÓN"}`);
    });
  }
  L.push("", `Áreas con diferencias: ${bad}`);
  writeFileSync(join(DIAG, "verificacion-tecnicas.txt"), L.join("\n") + "\n");
}

// ---------- Hojas de contactos ----------
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
async function tile(p, a, r, S = 170) {
  // izquierda: previsualización de Makito (con el verde) · derecha: la imagen que enseñaríamos con la caja en rojo
  const left = existsSync(cacheV(p.mref, a.id)) ? await sharp(cacheV(p.mref, a.id)).resize(S, S, { fit: "contain", background: "#fff" }).png().toBuffer() : null;
  let rightSrc = r.img === "z" ? cacheZ(p.mref, a.id) : r.img ? cacheP(r.img) : null;
  if (rightSrc && !existsSync(rightSrc)) rightSrc = null;
  let right = null;
  if (rightSrc) {
    const m = await sharp(rightSrc).metadata(), sc = Math.min(S / m.width, S / m.height), w = Math.round(m.width * sc), h = Math.round(m.height * sc);
    const ox = (S - w) / 2, oy = (S - h) / 2, b = r.mbox;
    const svg = b ? `<svg width="${S}" height="${S}"><rect x="${ox + b[0] * w}" y="${oy + b[1] * h}" width="${Math.max(1, (b[2] - b[0]) * w)}" height="${Math.max(1, (b[3] - b[1]) * h)}" fill="rgba(255,0,0,0.12)" stroke="${r.img === "z" ? "#0050ff" : "#ff0000"}" stroke-width="2"/></svg>` : `<svg width="${S}" height="${S}"></svg>`;
    right = await sharp(rightSrc).resize(S, S, { fit: "contain", background: "#fff" }).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
  }
  const cap = `${p.ref} ${a.id} ${r.sin || (!r.box ? r.motivo || "sin zona" : (r.img === "z" ? "previa" : r.cv ? "color" : "principal") + " " + (r.forma || ""))}${r.n > 1 ? " x" + r.n : ""} ${r.cmpMain ? "iou " + r.cmpMain.iou : ""}${r.cmpCol ? "/" + r.cmpCol.iou : ""}`;
  const W = 2 * S + 6, H = S + 30;
  const capSvg = `<svg width="${W}" height="30"><text x="3" y="12" font-family="DejaVu Sans, sans-serif" font-size="11" fill="#000">${esc(cap)}</text><text x="3" y="26" font-family="DejaVu Sans, sans-serif" font-size="10" fill="#555">${esc((POS[String(a.position)] || "").slice(0, 48) + " · " + a.width + "×" + a.height + " mm")}</text></svg>`;
  const comp = [{ input: Buffer.from(capSvg), left: 0, top: S }];
  if (left) comp.push({ input: left, left: 0, top: 0 });
  if (right) comp.push({ input: right, left: S + 6, top: 0 });
  return sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } }).composite(comp).png().toBuffer();
}
async function hoja(nombre, items, cols = 4) {
  items = items.slice(0, 40);
  if (!items.length) return;
  const S = 170, W = 2 * S + 6, H = S + 30, G = 8, rows = Math.ceil(items.length / cols);
  const tiles = [];
  for (const [p, a, r] of items) { try { tiles.push(await tile(p, a, r, S)); } catch (e) { tiles.push(null); log("  hoja: no se pudo", p.ref, a.id, e.message); } }
  const comp = tiles.map((b, i) => b && { input: b, left: (i % cols) * (W + G), top: Math.floor(i / cols) * (H + G) }).filter(Boolean);
  await sharp({ create: { width: cols * (W + G), height: rows * (H + G), channels: 3, background: "#e8e8e8" } }).composite(comp).jpeg({ quality: 62, mozjpeg: true }).toFile(join(DIAG, nombre + ".jpg"));
}
async function hojas() {
  const all = [];
  for (const c of cats) for (const p of byCat[c]) (AREAS[p.mref] || []).forEach((a, i) => { const r = E.a[`${p.mref}|${a.id}`]; if (r) all.push([p, a, r, i]); });
  const visto = x => existsSync(cacheV(x[0].mref, x[1].id));
  for (const c of cats) await hoja(`hoja-${c}`, all.filter(x => x[0].merch === c && x[3] === 0 && visto(x)));
  for (const c of ["m-taz", "m-esc", "m-bol"]) await hoja(`hoja-${c}-otras-areas`, all.filter(x => x[0].merch === c && x[3] > 0 && visto(x)));
  await hoja("hoja-fallos", all.filter(x => visto(x) && (!x[2].box || x[2].forma === "x" || x[2].forma === "l" || x[2].n > 1)));
  await hoja("hoja-previsualizacion-limpia", all.filter(x => visto(x) && x[2].img === "z" && x[2].box));
}

function guardar(msg) {
  if (!COMMIT) return;
  try {
    execSync(`git add ${OUT} ${DIAG}`, { stdio: "inherit" });
    try { execSync("git diff --cached --quiet"); return; } catch {}
    execSync(`git commit -q -m "${msg} [skip netlify]"`, { stdio: "inherit" });
    for (let i = 0; i < 3; i++) {
      try { execSync(`git pull -q --rebase origin ${process.env.GITHUB_REF_NAME || "makito-marcaje"}`, { stdio: "inherit" }); execSync(`git push -q origin HEAD:${process.env.GITHUB_REF_NAME || "makito-marcaje"}`, { stdio: "inherit" }); return; }
      catch (e) { log("  push falló, reintento", e.message); execSync("sleep 15"); }
    }
  } catch (e) { log("  no se pudo guardar en git:", e.message); }
}

// ---------- Bucle principal ----------
let ultimo = Date.now(), hechas = 0, pendientes = 0;
async function lote(cola, nombre) {
  for (const [p, a] of cola) {
    if (!(await analizar(p, a))) { pendientes++; continue; } // sin tiempo/sin API: queda para la próxima ejecución
    hechas++;
    if (hechas % 200 === 0) log(`  ${hechas} áreas revisadas (${peticiones} peticiones)`);
    if (Date.now() - ultimo > 60 * 60000) { ultimo = Date.now(); resumen(escribirDatos()); guardar("Marcaje Makito: avance"); }
  }
  log(`${nombre}: ${pendientes} áreas pendientes para la próxima ejecución`);
}
// Las áreas analizadas con una versión anterior de la detección se recalculan desde la caché (sin API)
await lote(tier0, "primeras áreas");
await lote(tier1, "resto de áreas");
const tam = escribirDatos();
verificacion();
await hojas();
resumen(tam);
guardar("Marcaje Makito: zonas de marcaje, hojas de contactos y resumen");
log("Fin. Solo lectura: no se ha llamado a /orders.");
