// Calcula los precios de venta de la web a partir del coste de cada prenda (APIs de los proveedores) y de las
// reglas privadas de Ramstex (privado/reglas.enc, descifradas por el flujo en $REGLAS, fuera del repositorio).
//
// El repositorio es PÚBLICO: aquí solo se escribe el precio de venta final (data/precios.json), que es lo que se
// enseña en la web. Los costes y el detalle del cálculo solo salen cifrados ($REVISION, para revisarlos).
//
// precio_web(cantidad) = coste + DTF del logo + margen_web × factor_del_tramo
//   (el margen se calcula para que a 50 uds dé el precio habitual de Ramstex con delante y detrás, menos el ajuste
//    por enseñar solo el logo delante; los tramos solo mueven el margen, nunca se vende por debajo de coste)
// Uso: REGLAS=/ruta/reglas.json REVISION=/ruta/revision.json node scripts/precios-calcular.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { makitoGet } from "./makito-api.mjs";

const R = JSON.parse(readFileSync(process.env.REGLAS, "utf8"));
const CAT = JSON.parse(readFileSync("data/catalogo.json", "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = [];
const items = CAT.items.filter(it => R.cats.includes(it.c));
const sup = it => /^J:/.test(it.i) ? "jhk" : /^R:/.test(it.i) ? "roly" : /^S:/.test(it.i) ? "sols" : /^T:/.test(it.i) ? "stanley" : /^F:/.test(it.i) ? "falkross" : /^K:/.test(it.i) || /^MK/.test(it.r) ? "" : "toptex";
const med = a => { a = a.filter(x => x > 0).sort((x, y) => x - y); return a.length ? a[(a.length - 1) >> 1] : 0; };
const mout = {}, mrev = []; // merchandising: precios de venta y revisión
const cost = {}; // ref -> [coste por color del catálogo]

// ---------- JHK: API por referencia (precio por color y talla) ----------
async function jhk() {
  const T = process.env.JHK_TOKEN; if (!T) return log.push("JHK: sin token");
  const L = items.filter(it => sup(it) === "jhk"); let ok = 0;
  await Promise.all(Array.from({ length: 4 }, async (_, w) => {
    for (let i = w; i < L.length; i += 4) {
      const it = L[i];
      for (let k = 0; k < 3; k++) {
        try {
          const p = await (await fetch(`https://www.jhktshirt.com/app/es/api/${T}/clothes/5/${encodeURIComponent(it.r)}/product.json`)).json();
          const C = p.combinations || {};
          cost[it.r] = it.k.map(c => { const code = String(c[3] || "").split("_").pop().toUpperCase(); return med(Object.values(C[code] || {}).map(v => +v.price)); });
          ok++; break;
        } catch (e) { await sleep(1500); }
      }
    }
  }));
  log.push(`JHK: ${ok}/${L.length}`);
}

// ---------- Roly: tarifa por modelo, despacio y recordando lo ya leído ----------
// La API de Roly corta (429) si se le piden muchos precios seguidos o la tarifa entera. Se piden los modelos de
// uno en uno, con pausa, y lo leído se guarda en una caché CIFRADA ($ROLY_CACHE; el flujo la cifra) para que cada
// día se completen los que falten y se renueven los más antiguos.
const T0 = Date.now(), TOPE = 40 * 60e3;
async function roly() {
  // 1) Tarifa del cliente (Excel de Roly, cifrada en privado/roly-tarifa.enc): {modelo: {blanco, color, bc, negro, marino, fluor}}
  let tar = 0;
  if (process.env.ROLY_TARIFA) {
    try {
      const T = JSON.parse(readFileSync(process.env.ROLY_TARIFA, "utf8"));
      for (const it of items.filter(x => sup(x) === "roly")) {
        const t = T[it.r.replace(/^[A-Z]+/, "")]; if (!t) continue;
        const any = t.color ?? t.bc ?? t.blanco ?? Object.values(t)[0];
        cost[it.r] = it.k.map(c => { const n = String(c[0]).toLowerCase(); return (/^blanco/.test(n) ? t.blanco ?? t.bc : /^negro/.test(n) ? t.negro ?? t.color ?? t.bc : /^marino/.test(n) ? t.marino ?? t.color ?? t.bc : /fl[uú]or/.test(n) ? t.fluor ?? t.color ?? t.bc : t.color ?? t.bc) ?? any; });
        tar++;
      }
    } catch (e) { log.push("Roly tarifa: " + e.message); }
  }
  if (tar) log.push(`Roly (tarifa Excel): ${tar}`);
  if (!process.env.ROLY_USER) return log.push("Roly: sin usuario");
  const B = "https://clientsws.gorfactory.es:2096", CF = process.env.ROLY_CACHE;
  let C = {}; try { if (CF) C = JSON.parse(readFileSync(CF, "utf8")); } catch {}
  const l = await (await fetch(B + "/api/v1.1/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: process.env.ROLY_USER, password: process.env.ROLY_PASSWORD }) })).json();
  const L = items.filter(it => sup(it) === "roly" && !cost[it.r]); // la API solo para lo que no esté en la tarifa
  const orden = [...L].sort((a, b) => ((C[a.r]?.f || "") < (C[b.r]?.f || "") ? -1 : 1)); // primero los que faltan y los más antiguos
  let leidos = 0, lim = 0, pausa = 4000;
  for (const it of orden) {
    if (Date.now() - T0 > TOPE || lim >= 6) break;
    const fd = new FormData(); fd.append("brand", "roly"); fd.append("model", it.r);
    const r = await fetch(`${B}/api/v1/item/pricelist`, { method: "POST", headers: { Authorization: "Bearer " + l.token }, body: fd });
    if (r.status === 429) { lim++; pausa = Math.min(pausa * 2, 60000); await sleep(90000); continue; }
    if (r.ok) {
      try { const j = await r.json(); const rows = Array.isArray(j) ? j : (Object.values(j).find(Array.isArray) || []); const by = {}; for (const x of rows) (by[String(x.color)] ||= []).push(+(x.price_unit ?? x.price_1) || 0); if (rows.length) { C[it.r] = { f: new Date().toISOString().slice(0, 10), c: by }; leidos++; } } catch {}
    }
    await sleep(pausa);
  }
  if (CF) writeFileSync(CF, JSON.stringify(C));
  let ok = 0;
  for (const it of L) {
    const b = C[it.r]?.c; if (!b) continue;
    cost[it.r] = it.k.map(c => { const m = String(c[3] || "").match(/_([A-Za-z0-9]+)_\d+_\d+$/); return m ? med(b[m[1]] || []) : 0; }); ok++;
  }
  log.push(`Roly: ${ok}/${L.length} con precio (hoy leídos ${leidos}${lim ? `, ${lim} cortes por límite` : ""})`);
}

// ---------- TopTex: tarifa completa en archivo ----------
async function toptex() {
  const KEY = process.env.TOPTEX_API_KEY; if (!KEY) return log.push("TopTex: sin clave");
  const BASE = "https://api.toptex.io";
  const a = await (await fetch(BASE + "/v3/authenticate", { method: "POST", headers: { "x-api-key": KEY, "Content-Type": "application/json" }, body: JSON.stringify({ username: process.env.TOPTEX_USER, password: process.env.TOPTEX_PASSWORD }) })).json();
  const H = { headers: { "x-api-key": KEY, "x-toptex-authorization": a.token } };
  const f = await (await fetch(BASE + "/v3/products/price?result_in_file=1", H)).json();
  let raw = [];
  for (let i = 0; i < 30; i++) { const r = await fetch(f.link); if (r.ok) { const d = await r.json(); raw = d.items || (Array.isArray(d) ? d : []); if (raw.length) break; } await sleep(20000); }
  const by = {}; // ref -> color(minúsculas) -> [precios]
  for (const x of raw) { const p = +(x.prices?.[0]?.price); if (p > 0) ((by[x.catalogReference] ||= {})[String(x.color).toLowerCase()] ||= []).push(p); }
  const L = items.filter(it => sup(it) === "toptex"); let ok = 0;
  for (const it of L) { const b = by[it.r]; if (!b) continue; cost[it.r] = it.k.map(c => med(b[String(c[0]).toLowerCase()] || [])); ok++; }
  log.push(`TopTex: ${ok}/${L.length} (tarifa: ${raw.length} filas)`);
}

// ---------- Sol's: tarifa del cliente («Maestro STD» del Excel de Sol's, cifrada en privado/sols-tarifa.enc) ----------
// {modelo: {códigoColor: [precio mediano de las tallas, nombre]}}. Precios especiales del comercial en las reglas:
// especiales_sols {modelo: [blanco, color] | [blanco, color, el más caro (p. ej. rayas)] | [todos]}
function sols() {
  if (!process.env.SOLS_TARIFA) return log.push("Sol's: sin tarifa");
  const T = JSON.parse(readFileSync(process.env.SOLS_TARIFA, "utf8")), E = R.especiales_sols || {};
  const L = items.filter(it => sup(it) === "sols"); let ok = 0, esp = 0;
  for (const it of L) {
    const t = T[it.r]; if (!t) continue;
    const code = c => { const m = String(c[3] || "").match(/^S:n\d{5}(\w+?)[A-Z]$/); if (m && t[m[1]]) return m[1]; const n = String(c[0]).toLowerCase(); return Object.keys(t).find(k => t[k][1].trim().toLowerCase() === n) || ""; };
    const ps = Object.values(t).map(x => x[0]), min = Math.min(...ps), max = Math.max(...ps), e = E[it.r];
    cost[it.r] = it.k.map(c => {
      const k = code(c); if (!k) return 0;
      const [p, name] = t[k];
      if (!e) return p;
      esp++;
      if (e.length === 1) return e[0];
      if (/^blanco/i.test(name.trim()) && p === min) return e[0];
      if (e.length >= 3 && p === max && max > min) return e[2];
      return e[1];
    });
    ok++;
  }
  log.push(`Sol's: ${ok}/${L.length} (${esp} colores con precio especial)`);
}

// ---------- Stanley/Stella: tarifa del cliente («Technical Price list» del Excel, cifrada en privado/stanley-tarifa.enc) ----------
// {estilo: {códigoColor: [precio mediano de las tallas, nombre]}}; el color sale de la foto (…_STTU272_C002.jpg)
function stanley() {
  if (!process.env.STANLEY_TARIFA) return log.push("Stanley/Stella: sin tarifa");
  const T = JSON.parse(readFileSync(process.env.STANLEY_TARIFA, "utf8"));
  const L = items.filter(it => sup(it) === "stanley"); let ok = 0;
  for (const it of L) {
    const t = T[it.r]; if (!t) continue;
    cost[it.r] = it.k.map(c => { const m = String(c[3] || "").match(/_(C\d{3})\.\w+$/); if (m && t[m[1]]) return t[m[1]][0]; const n = String(c[0]).toLowerCase(); const k = Object.keys(t).find(x => t[x][1].toLowerCase() === n); return k ? t[k][0] : 0; });
    ok++;
  }
  log.push(`Stanley/Stella: ${ok}/${L.length}`);
}

// ---------- Falk&Ross: precios del webservice (price.pl, CSV artnr;your_price;currency) ----------
// El artículo de 9 cifras se traduce con data/falkross-sku.json ([ref, color, talla]); el color sale de la foto (F:…_<color>_…)
async function falkross() {
  const U = process.env.FALKROSS_USER, P = process.env.FALKROSS_PASSWORD; if (!U || !P) return log.push("Falk&Ross: sin credenciales");
  const sku = JSON.parse(readFileSync("data/falkross-sku.json", "utf8"));
  const h = { Authorization: "Basic " + Buffer.from(`${U.trim()}:${P.trim()}`).toString("base64"), "Cache-Control": "no-cache", Connection: "close" };
  let t = "";
  for (let i = 0; i < 4 && !t; i++) { // una sola petición a la vez, con reintentos espaciados
    const r = await fetch("https://ws.falk-ross.eu/ws/run/price.pl?format=csv&style=&action=get_price&ndp=1", { headers: h, signal: AbortSignal.timeout(300000) }).catch(e => ({ ok: false, status: e.message }));
    if (r.ok) t = await r.text(); else { log.push(`Falk&Ross precios: ${r.status}`); if (r.status === 401) return; await sleep(30000 * 2 ** i); }
  }
  const by = {}; // ref -> color -> [precios]
  for (const line of t.split(/\r?\n/).slice(1)) { const c = line.split(";"); const k = sku[c[0]]; const p = parseFloat(String(c[1]).replace(",", ".")); if (k && p > 0) ((by[k[0]] ||= {})[k[1]] ||= []).push(p); }
  const L = items.filter(it => sup(it) === "falkross"); let ok = 0;
  for (const it of L) { const b = by[it.r]; if (!b) continue; cost[it.r] = it.k.map(c => { const m = String(c[3] || "").match(/^F:\d+_\d+_(\w+?)_/); return m ? med(b[m[1]] || []) : 0; }); ok++; }
  log.push(`Falk&Ross: ${ok}/${L.length}`);
}

for (const [n, f] of [["Merch", merch], ["JHK", jhk], ["TopTex", toptex], ["Roly", roly], ["Sol's", sols], ["Stanley/Stella", stanley], ["Falk&Ross", falkross]]) { try { await f(); } catch (e) { log.push(`${n}: error ${e.message}`); } }
for (const [ref, c] of Object.entries(R.especiales || {})) { const it = CAT.items.find(x => x.r === ref); if (it) cost[ref] = it.k.map(() => +c); }

// ---------- Merchandising (Makito): coste del artículo + marcaje de cada técnica posible, × factor por cantidad ----------
// precio(q) = coste × (1 + (factor(q) − 1) × escala(coste)), con un margen mínimo por unidad.
//   coste = artículo (tarifa Makito a esa cantidad) + marcaje a 1 color (o a todo color si es digital) en una zona,
//           con el mínimo y la preparación de Makito repartidos entre las unidades.
//   escala: en artículos caros el % de margen baja un poco (escala 1 hasta 1 €, luego desciende con el logaritmo).
async function merch() {
  const M = R.merch; if (!M) return log.push("Merch: sin reglas");
  if (!process.env.MAKITO_CLIENT_ID && !process.env.MAKITO_TARIFAS) return log.push("Merch: sin acceso a Makito");
  const list = x => Array.isArray(x) ? x : x && typeof x === "object" ? (Object.values(x).find(Array.isArray) || []) : [];
  let art, mar;
  if (process.env.MAKITO_TARIFAS) { const j = JSON.parse(readFileSync(process.env.MAKITO_TARIFAS, "utf8")); art = j.articulos; mar = j.tarifaMarcaje; } // pruebas locales
  else { art = list(await makitoGet("/price-list/files?format=JSON")); const pp = await makitoGet("/print-price-list/files?format=JSON"); mar = list(pp?.printPriceList || pp); }
  const A = {}; for (const a of art) A[String(a.material)] = a;
  const T = {}; for (const t of mar) if (t.id && t.prices?.tiers?.length) T[String(t.id)] = t;
  const TEC = JSON.parse(readFileSync("data/makito-marcaje/tecnicas.json", "utf8"));
  const Z = {}; for (const f of readdirSync("data/makito-marcaje").filter(f => /^m-.*\.json$/.test(f))) Object.assign(Z, JSON.parse(readFileSync("data/makito-marcaje/" + f, "utf8")));
  const Q = M.tramos.map(([q]) => q);
  const artCost = (a, q) => { const b = +a.baseQuantity || 1; let v = 0; for (const s of [...a.scales].sort((x, y) => +x.quantity - +y.quantity)) if (+s.quantity <= q || !v) v = +s.amount / b; return v; };
  const tier = (t, q) => t.prices.tiers.find(x => q <= +x.threshold) || t.prices.tiers[t.prices.tiers.length - 1];
  const extra = t => { const m = /DTF(\d)/.exec(t.category || ""); const e = /DTF1: ([\d.]+)€; DTF2: ([\d.]+)€; DTF3: ([\d.]+)€/.exec(t.terms || ""); return m && e ? +e[+m[1]] : 0; };
  function marcaje(t, q, mm) {   // coste total del marcaje de q unidades
    const z = mm && mm[0] && mm[1] ? mm[0] * mm[1] / 100 : M.logo_cm2;            // cm² de la zona
    const sub = /SUBLIMACI/i.test(t.category), cm2 = sub ? z : Math.min(z, M.logo_cm2);
    const x = tier(t, q), u = (x.type === "CM2" ? x.price * cm2 : x.price) + extra(t);
    return Math.max(t.prices.minPrice || 0, u * q) + (t.prices.setupFee || 0);
  }
  const esc = c => c <= 1 ? 1 : Math.max(M.escala_min, 1 - M.escala * Math.log10(c));
  const red2 = v => Math.round(v * 100) / 100;
  const L = CAT.items.filter(it => /^MK/.test(it.r)); let ok = 0, sinArt = 0, sinTec = 0;
  for (const it of L) {
    const z = Z[it.r]; const a = A[z?.m || "1" + it.r.slice(2)];
    if (!a) { sinArt++; continue; }
    const tecs = new Map(); // nombre de técnica -> mejor fila
    for (const ar of z?.areas || []) for (const [id] of ar.tec || []) {
      const t = T[id], d = TEC[id]; if (!t || !d) continue;
      const fila = [], costes = [];
      for (const [q, f] of M.tramos) {
        const c = artCost(a, q) + marcaje(t, q, ar.mm) / q;
        costes.push(+c.toFixed(3));
        fila.push(red2(Math.max(c * (1 + (f - 1) * esc(c)), c + M.min_margen)));
      }
      const nom = d.name, prev = tecs.get(nom);
      if (!prev || fila[1] < prev.fila[1]) tecs.set(nom, { nom, id, d: d.d, fila, costes });
    }
    if (!tecs.size) { sinTec++; continue; }
    const top = [...tecs.values()].sort((x, y) => x.fila[1] - y.fila[1]).slice(0, M.max_tec || 3);
    mout[it.r] = { x: top.map(t => [t.nom, t.fila]) };
    for (const t of top) mrev.push({ ref: it.r, nombre: it.n, cat: it.c, tecnica: t.d, articulo: +artCost(a, 100).toFixed(3), coste: t.costes, web: t.fila });
    ok++;
  }
  log.push(`Merch: ${ok}/${L.length} (sin tarifa del artículo: ${sinArt}, sin técnica con precio: ${sinTec})`);
}

// ---------- Precios ----------
const PREM = new RegExp(R.premium || "oversize|boxy", "i");
const red = v => Math.round(v / (R.redondeo || 0.05)) * (R.redondeo || 0.05);
const out = {}, rev = [];
for (const it of items) {
  const cs = cost[it.r]; if (!cs || !cs.some(x => x > 0)) continue;
  const prem = PREM.test(`${it.n} ${it.ft || ""}`);
  const lv = [], k = [];
  // Un solo precio para todos los colores de la prenda: el del color normal más caro (como se cobra en la tienda).
  // Solo los colores bastante más caros (rayas, flúor…, más de un 25 % sobre la mediana) mantienen su precio propio.
  const mc = med(cs), tope = Math.max(...cs.filter(x => x > 0 && x <= mc * 1.25));
  for (const c0 of cs) {
    const c = c0 > 0 && c0 <= tope ? tope : c0;
    if (!(c > 0)) { k.push(-1); continue; }
    const M = Math.max(prem ? R.margen.premium : (R.margen_cat?.[it.c] ?? R.margen.basico), (R.margen_pct_cat?.[it.c] ?? R.margen.pct ?? 0) * c);
    const tipo = R.logo?.[it.c] || "grande";
    let habitual, m, base;
    if (tipo === "grande") {                                         // camisetas, sudaderas…: precio habitual con delante + detrás
      habitual = c + R.dtf.delante + R.dtf.grande + M;               // lo que cobra Ramstex hoy a 50 uds
      m = habitual - R.web_resta - c - R.dtf.grande;                 // margen de la web (solo logo delante)
      base = c + R.dtf.grande;
    } else {                                                         // pantalones, gorras, bolsas…: un logo (10×10 o el de bolsa)
      base = c + (R.dtf[tipo] ?? R.dtf.delante); m = M; habitual = base + M;
    }
    const t = R.tramos.map(([, f]) => +red(base + m * f).toFixed(2));
    let i = lv.findIndex(x => x.join() === t.join()); if (i < 0) { lv.push(t); i = lv.length - 1; }
    k.push(i);
    rev.push({ ref: it.r, nombre: it.n, cat: it.c, col: it.k[k.length - 1][0], coste: +c0.toFixed(3), coste_precio: +c.toFixed(3), premium: prem, habitual50: +habitual.toFixed(2), web: t });
  }
  if (lv.length) { out[it.r] = lv.length === 1 && k.every(x => x === 0 || x === -1) ? { t: lv[0], k: k.some(x => x < 0) ? k : undefined } : { l: lv, k }; if ((R.logo?.[it.c] || "grande") !== "grande") out[it.r].e = 1; } // e: «con tu logo» (sin «delante»)
}
Object.assign(out, mout);
writeFileSync("data/precios.json", JSON.stringify({ fecha: new Date().toISOString().slice(0, 10), q: R.tramos.map(([q]) => q), qm: R.merch ? R.merch.tramos.map(([q]) => q) : undefined, p: out }));
if (process.env.REVISION) writeFileSync(process.env.REVISION, JSON.stringify({ log, filas: rev, merch: mrev }));
const n = Object.keys(out).length;
writeFileSync("data/precios-resumen.txt", `Precios ${new Date().toISOString().slice(0, 10)}: ${n} productos con precio de ${items.length} en ${R.cats.length} categorías\n${log.join("\n")}\n`);
console.log(`${n} productos con precio · ${log.join(" · ")}`);
