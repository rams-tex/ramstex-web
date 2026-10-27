// Lista de fotos que usa el diseñador de logos y que el navegador no puede analizar (sin CORS: TopTex, Falk&Ross, Stamina…).
// Usa las mismas funciones de index.html (dzKey, dzTpl, dzKind, dzPick, srcList…), sacadas del propio archivo, para no desincronizarse.
// Exporta fotosDisenador() → [{st, k (f|b|s|sl|sr), ref, sup, side (i|d), tpl, url}]
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";

function trozo(src, nombre) {
  const i = src.indexOf("function " + nombre + "(");
  if (i < 0) throw new Error("No encuentro " + nombre + " en index.html");
  let j = src.indexOf("{", i), n = 0;
  for (; j < src.length; j++) { const c = src[j]; if (c === "{") n++; else if (c === "}") { n--; if (!n) break; } }
  return src.slice(i, j + 1);
}
function linea(src, empieza) {
  const i = src.indexOf(empieza); if (i < 0) throw new Error("No encuentro " + empieza);
  return src.slice(i, src.indexOf("\n", i));
}

export function contexto(html = readFileSync("index.html", "utf8")) {
  const a = html.indexOf("var DZ_DPI="), b = html.indexOf("var DZ_ICON=");
  const code = [
    linea(html, "var IMG="), linea(html, "var IMGR="), linea(html, "var IMGJ="), linea(html, "var IMGS="),
    linea(html, "var DZ_ORD="), html.slice(a, b),
    ...["norm", "isR", "isJ", "isS", "isT", "isF", "isPack", "ext", "srcList", "dzKey", "dzTpl", "dzKind", "dzSup", "dzPick", "dzUrls", "dzEnc", "dzScale", "dzGeom"].map(n => trozo(html, n)),
  ].join("\n");
  const ctx = { D: null, console };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return ctx;
}

// ¿Manga corta (y sin capucha)? Solo entonces se busca el bajo de la manga en la foto lateral
function corta(ctx, it) {
  const nm = ctx.norm(it.n + " " + (it.st || ""));
  if (/capucha|hood/.test(nm)) return false;
  if (it.m === "Manga corta") return true;
  if (it.m === "Manga larga" || it.m === "Sin mangas") return false;
  return /camiseta|polo|tee|t-shirt/.test(nm) && !/manga larga|long/.test(nm);
}

// Dirección para descargar la foto en el servidor (Stanley/Stella: el original, que la web sirve reducido desde /st/)
const STANLEY = "https://res.cloudinary.com/www-stanleystella-com/t_pim/TechnicalNames/";
function urls(ctx, st) { return ctx.isT(st) ? [STANLEY + encodeURIComponent(st.slice(2))] : ctx.dzUrls(st, 800); }

// todos: también los proveedores cuyas fotos el navegador sí puede medir · colores: "todos" | "uno" (uno al azar por producto)
export function fotosDisenador({ todos = false, colores = "todos" } = {}) {
  const ctx = contexto();
  const D = JSON.parse(readFileSync("data/catalogo.json", "utf8"));
  ctx.D = D;
  const F = {};
  for (const f of readdirSync("data/fichas")) F[f.replace(/\.json$/, "")] = JSON.parse(readFileSync("data/fichas/" + f, "utf8"));
  const out = new Map();
  let prods = 0;
  for (const it of D.items) {
    const tpl = ctx.dzTpl(it); if (!tpl) continue;
    const f = (F[it.c] || {})[it.r] || {};
    const sup = ctx.dzSup(f);
    let usa = false;
    /* fotos que el navegador ya mide: basta con el primer color y el más oscuro (para la manga y por si la foto blanca no se distingue) */
    const oscuro = () => { let b = 0, bl = 1e9; it.k.forEach((k, i) => { const h = /^#[0-9a-f]{6}$/i.test(k[1] || "") ? k[1] : "#808080", l = .299 * parseInt(h.substr(1, 2), 16) + .587 * parseInt(h.substr(3, 2), 16) + .114 * parseInt(h.substr(5, 2), 16); if (l < bl) { bl = l; b = i; } }); return b; };
    const cols = colores === "uno" ? [Math.floor(Math.random() * it.k.length)] : sup.cors ? [...new Set([0, oscuro()])] : it.k.map((_, i) => i);
    for (const ci of cols) for (const pos of tpl.pos) {
      const p = ctx.dzPick(it, f, ci, pos, tpl.key);
      if (!p.st) continue;
      if (!todos && (sup.cors || ctx.isT(p.st))) continue; /* esta foto ya se mide en el navegador */
      usa = true;
      const prev = out.get(p.st);
      if (prev) { if (!prev.pos.includes(pos)) prev.pos.push(pos); continue; }
      out.set(p.st, { st: p.st, k: ctx.dzKind(p.st), vista: p.kind, flip: !!p.flip, pos: [pos], ref: it.r, c: it.c, n: it.n, sup: f.src || "", cors: !!(sup.cors || ctx.isT(p.st)), side: sup.side, tpl: tpl.key, tbw: tpl.bw, corta: corta(ctx, it), capucha: it.f.indexOf("h") >= 0 || /capucha|hood/.test(ctx.norm(it.n + " " + (it.st || ""))), hex: it.k[ci][1] || "", col: it.k[ci][0], url: urls(ctx, p.st) });
    }
    if (usa) prods++;
  }
  return { fotos: [...out.values()], prods };
}

if (import.meta.url === "file://" + process.argv[1]) {
  const { fotos, prods } = fotosDisenador();
  const by = {};
  for (const x of fotos) { const k = x.sup + ":" + x.k; by[k] = (by[k] || 0) + 1; }
  console.log("Productos:", prods, "· fotos:", fotos.length, by);
  console.log(fotos.slice(0, 3));
}
