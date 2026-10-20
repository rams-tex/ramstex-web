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
const wh = await get("/gallery/warehouses.json"); log(JSON.stringify(shape(wh), null, 1).slice(0, 2000));
const cats = await get("/gallery/categories.json"); log(JSON.stringify(shape(cats), null, 1).slice(0, 3000));
log("Categorías completas:", JSON.stringify(cats).slice(0, 4000));
const prods = await get("/gallery/camisetas/products.json"); log(JSON.stringify(shape(prods), null, 1).slice(0, 6000));
// Una ficha concreta
const first = Array.isArray(prods) ? prods[0] : (prods.products || prods.items || Object.values(prods)[0] || [])[0];
log("Primer producto (claves):", first ? Object.keys(first).join(", ") : "-");
const ref = first && (first.reference || first.ref || first.code || first.slug);
const w = Array.isArray(wh) ? (wh[0]?.slug || wh[0]?.code || wh[0]?.id) : Object.keys(wh || {})[0];
if (ref) { const p = await get(`/clothes/${w || "es"}/${ref}/product.json`); log(JSON.stringify(shape(p), null, 1).slice(0, 8000)); }
