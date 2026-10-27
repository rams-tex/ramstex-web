// Prueba de la API B2B de Makito (merchandising): muestra la ESTRUCTURA de catálogo, stock, imágenes y
// configuración de marcaje, sin precios ni datos de acceso. Solo lectura: NO llama nunca a pedidos (/orders).
// Credenciales: secretos MAKITO_CLIENT_ID / MAKITO_CLIENT_SECRET. Resultado en diagnostico/makito/.
// Límite de la API: 100 peticiones de golpe y 25 por minuto -> se espera 2,5 s entre peticiones.
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://apis.makito.es";
const DIR = "diagnostico/makito";
mkdirSync(DIR, { recursive: true });
const OUT = [];
const SECRETS = [process.env.MAKITO_CLIENT_ID, process.env.MAKITO_CLIENT_SECRET].filter(Boolean);
let TOKEN = "";
const scrub = s => { s = String(s); for (const x of [...SECRETS, TOKEN]) if (x) s = s.split(x).join("(oculto)"); return s.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "(token oculto)"); };
const log = (...a) => { const t = scrub(a.map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" ")); OUT.push(t); console.log(t.slice(0, 400)); };
const save = () => writeFileSync(DIR + "/estructura.txt", OUT.join("\n") + "\n");
process.on("exit", save);

if (!process.env.MAKITO_CLIENT_ID || !process.env.MAKITO_CLIENT_SECRET) {
  log("Faltan los secretos MAKITO_CLIENT_ID y MAKITO_CLIENT_SECRET.");
  process.exit(1);
}

const PRIV = /price|precio|tarifa|cost|amount|scale|discount|descuento|password|secret|token|importe|netvalue|total/i;
function shape(v, depth = 0) {
  if (Array.isArray(v)) return v.length ? [shape(v[0], depth + 1), `(${v.length} elementos)`] : [];
  if (v && typeof v === "object") {
    if (depth > 6) return "{…}";
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = PRIV.test(k) ? "(oculto)" : shape(x, depth + 1);
    return o;
  }
  if (typeof v === "string") return v.length > 120 ? v.slice(0, 120) + "…" : v;
  return v;
}
const hide = v => JSON.parse(JSON.stringify(v, (k, x) => PRIV.test(k) ? "(oculto)" : (typeof x === "string" && x.length > 400 ? x.slice(0, 400) + "…" : x)));

// Cliente con espera entre peticiones (máx. 25 por minuto)
let last = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(path, { auth = true, headers = {}, raw = false } = {}) {
  const wait = last + 2500 - Date.now(); if (wait > 0) await sleep(wait);
  last = Date.now();
  const t = Date.now();
  let r;
  try { r = await fetch(path.startsWith("http") ? path : BASE + path, { headers: { ...(auth && TOKEN ? { Authorization: "Bearer " + TOKEN } : {}), ...headers } }); }
  catch (e) { log(`GET ${path}: ERROR ${e.message} ${e.cause?.code || ""}`); return { status: 0 }; }
  const ct = r.headers.get("content-type") || "";
  const rl = [...r.headers.entries()].filter(([k]) => /rate|limit|retry|remaining/i.test(k)).map(x => x.join(": ")).join(", ");
  if (rl) log(`  cabeceras de límite (${path.replace(BASE, "").slice(0, 60)}): ${rl}`);
  const info = { status: r.status, ct, len: r.headers.get("content-length"), acao: r.headers.get("access-control-allow-origin"), cache: r.headers.get("cache-control"), ms: Date.now() - t };
  if (raw) { const b = Buffer.from(await r.arrayBuffer()); return { ...info, bytes: b.length, buf: b, headers: Object.fromEntries(r.headers) }; }
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  log(`GET ${path.replace(BASE, "")} -> HTTP ${r.status} ${ct} ${text.length} bytes ${info.ms} ms`);
  return { ...info, data };
}
// Algunos "files" devuelven un enlace al fichero en lugar del contenido: se sigue
async function getFile(path) {
  let r = await get(path);
  if (r.status !== 200) { log("  respuesta:", typeof r.data === "string" ? r.data.slice(0, 300) : JSON.stringify(shape(r.data)).slice(0, 600)); return null; }
  let d = r.data;
  const link = d && typeof d === "object" && !Array.isArray(d) && (d.url || d.link || d.file || d.fileUrl);
  if (typeof link === "string" && /^https?:/.test(link)) { log("  devuelve enlace a fichero; se descarga"); d = (await get(link, { auth: !/amazonaws|blob\.core/.test(link) })).data; }
  return d;
}
const listIn = d => Array.isArray(d) ? d : d && typeof d === "object" ? (Object.values(d).find(Array.isArray) || []) : [];

// ---------- Login ----------
{
  const r = await fetch(BASE + "/access/auth/login", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: process.env.MAKITO_CLIENT_ID, clientSecret: process.env.MAKITO_CLIENT_SECRET }) });
  last = Date.now();
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = {}; }
  TOKEN = j.token || j.access_token || "";
  log(`POST /access/auth/login -> HTTP ${r.status}; campos de la respuesta: ${Object.keys(j).join(", ") || "(no JSON)"}`);
  if (!TOKEN) { log("Sin token. Respuesta:", scrub(t.slice(0, 300))); process.exit(1); }
  try { const pl = JSON.parse(Buffer.from(TOKEN.split(".")[1], "base64url").toString()); log("JWT: rateLimit =", JSON.stringify(pl.rateLimit), "· scope =", JSON.stringify(pl.scope), "· roles =", JSON.stringify(pl.roles), "· sandbox =", JSON.stringify(pl.sandbox), "· resources =", JSON.stringify(pl.resources)); log("JWT: caduca en", pl.exp ? Math.round((pl.exp * 1000 - Date.now()) / 60000) + " min" : "(sin exp)", "· campos:", Object.keys(pl).join(", ")); } catch (e) {}
}

// ---------- Catálogo ----------
const cat = await getFile("/catalog/files?format=JSON&lang=es");
const prods = listIn(cat);
mkdirSync("tmp-makito", { recursive: true });
if (prods.length) writeFileSync("tmp-makito/catalogo.json", JSON.stringify(cat));
const imgUrls = [];
if (prods.length) {
  log(`\n== CATÁLOGO: ${prods.length} productos. Claves de la raíz: ${cat && !Array.isArray(cat) ? Object.keys(cat).join(", ") : "(lista)"}`);
  log("Forma de un producto:\n" + JSON.stringify(shape(prods[0]), null, 1));
  // Todas las claves que aparecen y cuántas veces
  const keys = {}; for (const p of prods) for (const k of Object.keys(p)) keys[k] = (keys[k] || 0) + 1;
  log("Claves (nº de productos que la tienen): " + JSON.stringify(keys));
  // Distribución de valores de campos cortos (categorías, marcas, etc.)
  const dist = {};
  const walk = (v, path) => {
    if (Array.isArray(v)) { for (const x of v) walk(x, path + "[]"); return; }
    if (v && typeof v === "object") { for (const [k, x] of Object.entries(v)) if (!PRIV.test(k)) walk(x, path + "." + k); return; }
    if (typeof v === "string" && v.length <= 60 && !/^https?:/.test(v)) { const m = (dist[path] ??= new Map()); m.set(v, (m.get(v) || 0) + 1); }
    if (typeof v === "string" && /^https?:/.test(v) && imgUrls.length < 400) imgUrls.push([path, v]);
  };
  for (const p of prods) walk(p, "");
  for (const [path, m] of Object.entries(dist)) {
    const arr = [...m.entries()].sort((a, b) => b[1] - a[1]);
    log(`\n-- ${path}: ${arr.length} valores distintos` + (arr.length <= 400 ? ":\n" + arr.map(x => x[1] + " × " + x[0]).join(" | ") : " (ej.: " + arr.slice(0, 25).map(x => x[0]).join(" | ") + ")"));
  }
  const cats = {}; for (const p of prods) for (const c of p.categories || []) cats[c] = (cats[c] || 0) + 1;
  log("\n-- TODAS las categorías (" + Object.keys(cats).length + "); productos sin categoría: " + prods.filter(p => !(p.categories || []).length).length + "\n" + Object.entries(cats).sort().map(x => x[1] + " × " + x[0].replace(/^Produccion > /, "")).join("\n"));
  // Muestra: 3 productos completos (sin precios) y 40 recortados
  const pickBy = re => prods.find(p => re.test(JSON.stringify(p).slice(0, 2000)));
  const sample = [prods[0], pickBy(/taza|mug/i), pickBy(/bol[ií]grafo|pen\b/i), pickBy(/camiseta|t-shirt/i), pickBy(/mochila|bolsa/i)].filter(Boolean);
  writeFileSync(DIR + "/muestra.json", JSON.stringify(hide(sample), null, 1));
  const step = Math.max(1, Math.floor(prods.length / 40));
  writeFileSync(DIR + "/muestra-40.json", JSON.stringify(hide(prods.filter((_, i) => i % step === 0).slice(0, 40)), null, 1));
  log("\nURLs de ejemplo:\n" + imgUrls.filter((_, i) => i % 20 === 0).slice(0, 20).map(x => x.join(" = ")).join("\n"));
} else log("Catálogo vacío o forma desconocida:", JSON.stringify(shape(cat)).slice(0, 1500));

// ---------- Imágenes: ¿se pueden enlazar desde ramstex.com sin token? ----------
const imgs = imgUrls.filter(x => /\.(jpe?g|png|webp)(\?|$)/i.test(x[1]) || /assets|image/i.test(x[0])).slice(0, 3);
for (const [path, u] of imgs) {
  const a = await get(u, { auth: false, raw: true, headers: { Origin: "https://ramstex.com", Referer: "https://ramstex.com/" } });
  log(`\nImagen ${path}: ${u}\n  sin token: HTTP ${a.status} ${a.ct} ${a.bytes} bytes · Access-Control-Allow-Origin: ${a.acao} · Cache-Control: ${a.cache}`);
  if (a.status !== 200) {
    const b = await get(u, { auth: true, raw: true, headers: { Origin: "https://ramstex.com" } });
    log(`  con token: HTTP ${b.status} ${b.ct} ${b.bytes} bytes · ACAO: ${b.acao}`);
  }
}
{ // ejemplo de la documentación
  const a = await get(BASE + "/catalog/assets/15246/principal/5246-W.jpg", { auth: false, raw: true, headers: { Origin: "https://ramstex.com" } });
  log(`\n/catalog/assets/15246/principal/5246-W.jpg sin token: HTTP ${a.status} ${a.ct} ${a.bytes} bytes · ACAO: ${a.acao}`);
  if (a.status !== 200) { const b = await get(BASE + "/catalog/assets/15246/principal/5246-W.jpg", { raw: true }); log(`  con token: HTTP ${b.status} ${b.ct} ${b.bytes} bytes · ACAO: ${b.acao} · Cache-Control: ${b.cache}`); }
}

// ---------- Stock ----------
const st = await getFile("/stock/files?format=JSON");
const sl = listIn(st);
if (sl.length) writeFileSync("tmp-makito/stock.json", JSON.stringify(st));
log(`\n== STOCK: ${sl.length} filas. Claves de la raíz: ${st && !Array.isArray(st) ? Object.keys(st).join(", ") : "(lista)"}`);
if (sl.length) {
  log("Forma:\n" + JSON.stringify(shape(sl[0]), null, 1));
  log("Ejemplos:\n" + JSON.stringify(hide(sl.slice(0, 12))));
  const loc = {}; for (const x of sl) { const k = [x.plant, x.storageLocation, x.storageId].join("|"); loc[k] = (loc[k] || 0) + 1; }
  log("Almacenes (plant|storageLocation|storageId): " + JSON.stringify(loc));
  log("Materiales distintos: " + new Set(sl.map(x => x.material)).size + " · con fecha de disponibilidad: " + sl.filter(x => x.availableDate).length);
}

// ---------- Precios: SOLO la forma (valores ocultos) ----------
const pr = await getFile("/price-list/files?format=JSON");
const pl = listIn(pr);
log(`\n== PRECIOS: ${pl.length} filas. Claves de la raíz: ${pr && !Array.isArray(pr) ? Object.keys(pr).join(", ") : "(lista)"}`);
if (pl.length) log("Forma (valores ocultos): " + JSON.stringify(shape(pl[0])) + " · claves de una fila: " + Object.keys(pl[0]).join(", ") + (Array.isArray(pl[0].scales) && pl[0].scales[0] ? " · claves de scales[]: " + Object.keys(pl[0].scales[0]).join(", ") : "") + " · ej. material: " + pl[0].material);

// ---------- Configuración de marcaje (técnicas, posiciones y áreas por producto) ----------
const pc = await getFile("/print-config/files?format=JSON&lang=es");
const pcl = listIn(pc?.products || pc);
log(`\n== MARCAJE: ${pcl.length} productos. Claves de la raíz: ${pc && !Array.isArray(pc) ? Object.keys(pc).join(", ") : "(lista)"}`);
if (pcl.length) {
  writeFileSync("tmp-makito/marcaje.json", JSON.stringify(pc));
  log("Forma de un producto:\n" + JSON.stringify(shape(pcl[0]), null, 1).slice(0, 3000));
  const akeys = {}; for (const p of pcl) for (const a of p.areas || []) for (const k of Object.keys(a)) akeys[k] = (akeys[k] || 0) + 1;
  log("Claves de las áreas (nº): " + JSON.stringify(akeys));
  const na = pcl.map(p => (p.areas || []).length); log("Áreas por producto: máx " + Math.max(...na) + ", media " + (na.reduce((a, b) => a + b, 0) / na.length).toFixed(1) + ", sin áreas " + na.filter(x => !x).length);
  log("Ejemplos del campo techniques de las áreas: " + [...new Set(pcl.flatMap(p => (p.areas || []).map(a => a.techniques)))].slice(0, 30).join(" | "));
  for (const k of ["positions", "techniques"]) {
    const L = pc[k];
    if (!Array.isArray(L)) { log(`${k}: ${JSON.stringify(shape(L)).slice(0, 1500)}`); continue; }
    log(`\n-- ${k}: ${L.length} elementos. Forma: ${JSON.stringify(shape(L[0]))}`);
    log(JSON.stringify(hide(L.slice(0, k === "techniques" ? 400 : 60))).slice(0, 30000));
  }
  if (Array.isArray(pc.techniques)) {
    const tc = {}; for (const t of pc.techniques) { const k = t.category + " (máx. colores " + t.maximumColors + ", fullColor " + t.fullColor + ")"; tc[k] = (tc[k] || 0) + 1; }
    log("Técnicas por categoría: " + JSON.stringify(tc));
    const tk = new Set(); pc.techniques.forEach(t => Object.keys(t).forEach(k => tk.add(k))); log("Claves de técnicas: " + [...tk].join(", "));
    log("Nombres de técnicas: " + [...new Set(pc.techniques.map(t => t.description))].join(" | "));
  }
  const POS = Object.fromEntries((pc.positions || []).map(x => [String(x.id), x.description]));
  // Ejemplos: taza, bolígrafo, bolsa (tote) y camiseta
  const byRef = Object.fromEntries(pcl.map(p => [String(p.id), p]));
  const ex = [];
  for (const re of [/^Taza$/i, /^Bolígrafo$/i, /^Bolsa$/i, /^Camiseta Adulto$/i]) {
    const p = prods.find(x => re.test(x.type || "") && byRef[String(x.ref)]);
    if (p) { ex.push({ ref: p.ref, name: p.name, type: p.type, printcode: p.printcode, length: p.length, height: p.height, width: p.width, diameter: p.diameter, image: p.image, config: byRef[String(p.ref)], posiciones: Object.fromEntries((byRef[String(p.ref)].areas || []).map(a => [a.position, POS[String(a.position)]])) }); }
  }
  writeFileSync(DIR + "/marcaje-ejemplos.json", JSON.stringify(hide(ex), null, 1));
  log("\nEjemplos de marcaje guardados (taza, bolígrafo, bolsa, camiseta): " + ex.map(e => e.ref + " " + e.type + " " + e.name).join(" | "));
  // Fotos de área de 2 ejemplos (para ver si dibujan la zona sobre el producto)
  let n = 0;
  for (const e of ex.slice(0, 3)) for (const a of (e.config.areas || []).slice(0, 1)) {
    if (!a.image || n >= 3) continue;
    const r = await get(a.image, { raw: true });
    log(`Foto del área ${e.ref} ${a.id}: HTTP ${r.status} ${r.ct} ${r.bytes} bytes`);
    if (r.status === 200 && r.bytes < 600000) { writeFileSync(`${DIR}/area-${e.ref}-${a.id}.jpg`, r.buf); n++; }
  }
}
// Tarifas de marcaje: SOLO la forma (valores ocultos)
const pp = await getFile("/print-price-list/files?format=JSON");
const ppl = listIn(pp?.printPriceList || pp);
log(`\n== TARIFA DE MARCAJE: ${ppl.length} filas. Claves de la raíz: ${pp && !Array.isArray(pp) ? Object.keys(pp).join(", ") : "(lista)"}`);
if (ppl.length) {
  const keys = new Set(), pk = new Set(), ik = new Set();
  for (const x of ppl) { Object.keys(x).forEach(k => keys.add(k)); if (x.prices && typeof x.prices === "object") { Object.keys(x.prices).forEach(k => pk.add(k)); for (const it of x.prices.items || []) Object.keys(it).forEach(k => ik.add(k)); } }
  const tk = new Set(); for (const x of ppl) for (const t of (Array.isArray(x.prices?.tiers) ? x.prices.tiers : [])) Object.keys(t).forEach(k => tk.add(k));
  log("Claves de prices.tiers[]: " + [...tk].join(", ") + " · forma de terms: " + JSON.stringify(shape(ppl[0].terms)));
  log("Claves de una fila: " + [...keys].join(", ") + " · prices: " + [...pk].join(", ") + " · prices.items[]: " + [...ik].join(", "));
  log("Ejemplos (sin importes): " + JSON.stringify(ppl.slice(0, 15).map(x => ({ id: x.id, category: x.category, code: x.code, name: x.name, tramos: (x.prices?.items || []).length, tipos: [...new Set((x.prices?.items || []).map(i => i.type))] }))));
}

// ¿Hay fotos públicas (sin token) en la web de Makito o en etools.boxpromotions.com?
for (const u of ["https://www.makito.es/", "https://etools.boxpromotions.com/videos/5246/360/output/5246.html"]) {
  try {
    const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } }); const t = await r.text();
    const hosts = {}; for (const m of t.matchAll(/(?:src|href|data-src)=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)/gi)) { const h = m[1].replace(/^(https?:\/\/[^/]+)?(\/[^/]*\/?[^/]*).*$/, "$1$2"); hosts[h] = (hosts[h] || 0) + 1; }
    log(`\nPágina pública ${u}: HTTP ${r.status}, ${t.length} bytes. Fotos por ruta: ${JSON.stringify(hosts).slice(0, 1500)}`);
    log("  ejemplos: " + [...t.matchAll(/(?:src|data-src)=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)/gi)].slice(0, 8).map(m => m[1]).join(" | "));
  } catch (e) { log("Página pública " + u + ": error " + e.message); }
}

log("\nFin. Peticiones de solo lectura; no se ha llamado a /orders.");
