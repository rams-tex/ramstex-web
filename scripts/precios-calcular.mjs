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
import { readFileSync, writeFileSync } from "node:fs";

const R = JSON.parse(readFileSync(process.env.REGLAS, "utf8"));
const CAT = JSON.parse(readFileSync("data/catalogo.json", "utf8"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = [];
const items = CAT.items.filter(it => R.cats.includes(it.c));
const sup = it => /^J:/.test(it.i) ? "jhk" : /^R:/.test(it.i) ? "roly" : /^(S|T|F|K):/.test(it.i) || /^MK/.test(it.r) ? "" : "toptex";
const med = a => { a = a.filter(x => x > 0).sort((x, y) => x - y); return a.length ? a[(a.length - 1) >> 1] : 0; };
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
  if (!process.env.ROLY_USER) return log.push("Roly: sin usuario");
  const B = "https://clientsws.gorfactory.es:2096", CF = process.env.ROLY_CACHE;
  let C = {}; try { if (CF) C = JSON.parse(readFileSync(CF, "utf8")); } catch {}
  const l = await (await fetch(B + "/api/v1.1/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: process.env.ROLY_USER, password: process.env.ROLY_PASSWORD }) })).json();
  const L = items.filter(it => sup(it) === "roly");
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

for (const [n, f] of [["JHK", jhk], ["TopTex", toptex], ["Roly", roly]]) { try { await f(); } catch (e) { log.push(`${n}: error ${e.message}`); } }
for (const [ref, c] of Object.entries(R.especiales || {})) { const it = CAT.items.find(x => x.r === ref); if (it) cost[ref] = it.k.map(() => +c); }

// ---------- Precios ----------
const PREM = new RegExp(R.premium || "oversize|boxy", "i");
const red = v => Math.round(v / (R.redondeo || 0.05)) * (R.redondeo || 0.05);
const out = {}, rev = [];
for (const it of items) {
  const cs = cost[it.r]; if (!cs || !cs.some(x => x > 0)) continue;
  const prem = PREM.test(`${it.n} ${it.ft || ""}`);
  const lv = [], k = [];
  for (const c of cs) {
    if (!(c > 0)) { k.push(-1); continue; }
    const M = Math.max(prem ? R.margen.premium : R.margen.basico, (R.margen.pct || 0) * c);
    const habitual = c + R.dtf.delante + R.dtf.grande + M;             // lo que cobra Ramstex hoy a 50 uds (delante + detrás)
    const m = habitual - R.web_resta - c - R.dtf.grande;             // margen de la web (solo logo delante)
    const t = R.tramos.map(([, f]) => +red(c + R.dtf.grande + m * f).toFixed(2));
    let i = lv.findIndex(x => x.join() === t.join()); if (i < 0) { lv.push(t); i = lv.length - 1; }
    k.push(i);
    rev.push({ ref: it.r, nombre: it.n, cat: it.c, col: it.k[k.length - 1][0], coste: +c.toFixed(3), premium: prem, habitual50: +habitual.toFixed(2), web: t });
  }
  if (lv.length) out[it.r] = lv.length === 1 && k.every(x => x === 0 || x === -1) ? { t: lv[0], k: k.some(x => x < 0) ? k : undefined } : { l: lv, k };
}
writeFileSync("data/precios.json", JSON.stringify({ fecha: new Date().toISOString().slice(0, 10), q: R.tramos.map(([q]) => q), p: out }));
if (process.env.REVISION) writeFileSync(process.env.REVISION, JSON.stringify({ log, filas: rev }));
const n = Object.keys(out).length;
writeFileSync("data/precios-resumen.txt", `Precios ${new Date().toISOString().slice(0, 10)}: ${n} productos con precio de ${items.length} en ${R.cats.length} categorías\n${log.join("\n")}\n`);
console.log(`${n} productos con precio · ${log.join(" · ")}`);
