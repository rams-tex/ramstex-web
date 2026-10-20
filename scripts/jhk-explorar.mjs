// Prueba de la API de JHK: muestra la ESTRUCTURA de los datos (sin precios ni el token).
import { writeFileSync, mkdirSync } from "node:fs";
const T = process.env.JHK_TOKEN;
const OUT = [];
const log = (...a) => { const t = a.map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" "); OUT.push(T ? t.split(T).join("(token)") : t); console.log(t.slice(0, 200)); };
process.on("exit", () => { mkdirSync("diagnostico", { recursive: true }); writeFileSync("diagnostico/jhk.txt", OUT.join("\n")); });
if (!T) { log("Falta el secreto JHK_TOKEN"); process.exit(0); }
const B = `https://www.jhktshirt.com/app/es/api/${T}`;
const PRIV = /price|precio|tarifa|cost|discount|descuento|pvp|stock/i;
function shape(v, d = 0) {
  if (Array.isArray(v)) return v.length ? [shape(v[0], d + 1), `(${v.length} elementos)`] : [];
  if (v && typeof v === "object") { if (d > 6) return "{…}"; const o = {}; for (const [k, x] of Object.entries(v)) o[k] = PRIV.test(k) ? "(oculto)" : shape(x, d + 1); return o; }
  if (typeof v === "string") return v.length > 90 ? v.slice(0, 90) + "…" : v;
  return v;
}
async function get(path) {
  const r = await fetch(B + path); const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t.slice(0, 300); }
  log(`\n== ${path} -> ${r.status}`); return j;
}
const quiet = async path => { const r = await fetch(B + path); try { return await r.json(); } catch { return null; } };
const cats = await quiet("/gallery/categories.json");
const mains = cats.filter(c => c.slug && c.categories).map(c => [c.slug, Object.values(c.categories).map(x => x.slug)]);
const all = new Map();
for (const [m, subs] of mains) for (const sub of subs) {
  const list = await quiet(`/gallery/${sub}/main/${m}/products.json`) || [];
  log(`${m}/${sub}: ${list.length}`);
  for (const p of list) { const e = all.get(p.reference) || { p, where: [] }; e.where.push(m + "/" + sub); all.set(p.reference, e); }
}
for (const l of Object.values(cats.find(c => c.name === "LINES")?.categories || {})) {
  const list = await quiet(`/gallery/${l.slug}/products.json`) || []; log(`linea ${l.slug}: ${list.length}`);
}
log("Modelos distintos:", all.size);
log("Ejemplo galería:", JSON.stringify([...all.values()].slice(0, 3).map(e => ({ ...e.p, where: e.where }))));
const ref = [...all.keys()][0];
const p = await quiet(`/clothes/5/${ref}/product.json`);
log("Claves ficha:", Object.keys(p).join(", "));
for (const [k, v] of Object.entries(p)) if (!["combinations", "sizes", "colors"].includes(k)) log("  ", k, "=", JSON.stringify(v).slice(0, 400));
log("Color ejemplo:", JSON.stringify(Object.values(p.colors)[0]));
log("Talla ejemplo:", JSON.stringify(Object.values(p.sizes)[0]));
const c0 = Object.values(p.combinations)[0]; log("Combinación ejemplo claves:", JSON.stringify(Object.keys(Object.values(c0)[0])));
