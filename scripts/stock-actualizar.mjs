// Descarga el stock de TopTex, Roly/Stamina y JHK y lo guarda por categoría en data/stock/<cat>.json.
// La web solo lo carga al abrir una ficha, así que el catálogo no va más lento.
// Formato: { updated, s: { ref: { z: [tallas], q: { códigoColor: [uds por talla] } } } }
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";

const cat = JSON.parse(readFileSync("data/catalogo.json", "utf8"));
const catOf = Object.fromEntries(cat.items.map(i => [i.r, i.c]));
const stock = {}; // ref -> { size -> { code -> qty } }
const put = (ref, code, size, qty) => {
  if (!catOf[ref] || !size) return;
  ((stock[ref] ??= {})[size] ??= {})[code] = Math.max(0, Math.round(+qty || 0));
};
const log = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- TopTex (fichero completo de inventario) ----------
try {
  const K = process.env.TOPTEX_API_KEY;
  const a = await (await fetch("https://api.toptex.io/v3/authenticate", { method: "POST", headers: { "x-api-key": K, "Content-Type": "application/json" }, body: JSON.stringify({ username: process.env.TOPTEX_USER, password: process.env.TOPTEX_PASSWORD }) })).json();
  const H = { headers: { "x-api-key": K, "x-toptex-authorization": a.token } };
  const f = await (await fetch("https://api.toptex.io/v3/products/inventory?result_in_file=1", H)).json();
  let items = [];
  for (let i = 0; i < 30 && !items.length; i++) {
    const r = await fetch(f.link);
    if (r.ok) { const d = await r.json(); items = d.items || (Array.isArray(d) ? d : []); }
    if (!items.length) await sleep(20000);
  }
  for (const it of items) {
    const w = (it.warehouses || []).find(x => x.id === "toptex");
    put(it.catalogReference, String(it.colorCode), it.size, w ? w.stock : 0);
  }
  log.push(`TopTex: ${items.length} referencias`);
} catch (e) { log.push("TopTex: error " + e.message); }

// ---------- Roly y Stamina (almacén 01) ----------
try {
  const B = "https://clientsws.gorfactory.es:2096";
  const l = await (await fetch(B + "/api/v1.1/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: process.env.ROLY_USER, password: process.env.ROLY_PASSWORD }) })).json();
  const roly = JSON.parse(readFileSync("data/roly.json", "utf8"));
  const byModel = Object.fromEntries(roly.map(p => [p.ref, p]));
  for (const brand of ["roly", "stamina"]) {
    const fd = new FormData(); fd.append("whscode", "01"); fd.append("brand", brand);
    const r = await fetch(B + "/api/v1/stock/getuserstock", { method: "POST", headers: { Authorization: "Bearer " + l.token }, body: fd });
    const d = await r.json();
    const rows = Array.isArray(d) ? d : (d.stock || []);
    let n = 0;
    for (const row of rows) {
      const sku = String(row.sku || "");
      const p = byModel[sku.slice(0, 6)];
      if (!p) continue;
      const rest = sku.slice(p.ref.length);
      const sizeCode = rest.slice(0, 2), colorCode = rest.slice(2);
      const size = (p.sizecodes || {})[sizeCode] || (p.merch ? "Única" : sizeCode);
      put(p.ref, colorCode, size, row.onhand); n++;
    }
    log.push(`${brand}: ${n} referencias`);
  }
} catch (e) { log.push("Roly: error " + e.message); }

// ---------- JHK (ficha de cada producto) ----------
try {
  const T = process.env.JHK_TOKEN;
  const jhk = JSON.parse(readFileSync("data/jhk.json", "utf8"));
  const refs = jhk.map(p => p.ref).filter(r => catOf[r]);
  let n = 0;
  await Promise.all(Array.from({ length: 6 }, async (_, w) => {
    for (let i = w; i < refs.length; i += 6) {
      try {
        const r = await fetch(`https://www.jhktshirt.com/app/es/api/${T}/clothes/5/${encodeURIComponent(refs[i])}/product.json`);
        const p = await r.json();
        for (const [code, sizes] of Object.entries(p.combinations || {})) for (const [size, v] of Object.entries(sizes || {})) { put(refs[i], code, size, (+v.stock || 0) + (+v.stock_shipment || 0)); n++; /* almacén de Madrid + segundo almacén */ }
      } catch (e) {}
    }
  }));
  log.push(`JHK: ${n} referencias`);
} catch (e) { log.push("JHK: error " + e.message); }

// ---------- Sol's (FTP: stocks.csv, se actualiza cada 15 min) ----------
try {
  const { Client } = await import("basic-ftp");
  const c = new Client(60000);
  await c.access({ host: "csv.sols.es", user: process.env.SOLS_FTP_USER, password: process.env.SOLS_FTP_PASSWORD, secure: false });
  await c.downloadTo("sols-stocks.csv", "/stocks/stocks.csv");
  c.close();
  const sols = JSON.parse(readFileSync("data/sols.json", "utf8"));
  const codes = Object.fromEntries(sols.map(p => [p.ref, p.colors.map(x => x.code)]));
  let n = 0;
  for (const line of readFileSync("sols-stocks.csv", "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).slice(1)) {
    const [sku, es, fr] = line.split(",");
    if (!sku) continue;
    const ref = sku.slice(0, 5), cs = codes[ref]; if (!cs) continue;
    const col = cs.find(x => sku.startsWith(ref + x)); if (!col) continue;
    let size = sku.slice(5 + col.length); if (size === "TUN" || size === "TU") size = "Única";
    put(ref, col, size, (+es || 0) + (+fr || 0)); n++; /* almacén de España + Francia */
  }
  log.push(`Sol's: ${n} referencias`);
} catch (e) { log.push("Sol's: error " + e.message); }

// ---------- Stanley/Stella (API de stock, almacén asignado) ----------
try {
  const call = async (path, extra = {}) => {
    const r = await fetch("https://api.stanleystella.com/webrequest/" + path, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { db_name: "production_api", user: process.env.STANLEY_USER, password: process.env.STANLEY_PASSWORD, ...extra }, id: 0 }) });
    const j = await r.json(); if (j.error) throw new Error(path + " " + JSON.stringify(j.error).slice(0, 200));
    return typeof j.result === "string" ? JSON.parse(j.result) : j.result;
  };
  const sku = {};
  for (const s of await call("productsV2/get_json", { LanguageCode: "es_ES", Published: true }))
    for (const v of s.Variants || []) sku[v.B2BSKUREF] = [s.StyleCode, v.ColorCode, v.SizeCode];
  let n = 0;
  for (const x of await call("v2/stock/get_json", { Is_Inventory: true })) {
    const k = sku[x.SKU]; if (!k || x.Is_Inventory === false) continue;
    const prev = stock[k[0]]?.[k[2]]?.[k[1]] || 0;
    put(k[0], k[1], k[2], prev + (+x.Available_Quantity || 0)); n++;
  }
  log.push(`Stanley/Stella: ${n} referencias`);
} catch (e) { log.push("Stanley/Stella: error " + e.message); }

// ---------- Guardar por categoría ----------
const ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "XXXL", "4XL", "5XL", "6XL"];
const rank = s => { const i = ORDER.indexOf(String(s).toUpperCase()); if (i >= 0) return i; const n = parseFloat(s); return isNaN(n) ? 100 : 50 + n / 1000; };
const files = {};
for (const [ref, bySize] of Object.entries(stock)) {
  const z = Object.keys(bySize).sort((a, b) => rank(a) - rank(b));
  const codes = [...new Set(z.flatMap(s => Object.keys(bySize[s])))];
  const q = Object.fromEntries(codes.map(c => [c, z.map(s => bySize[s][c] ?? null)]));
  (files[catOf[ref]] ??= {})[ref] = { z, q };
}
if (Object.keys(stock).length < 1000) { console.error("Muy pocos datos de stock, no se actualiza:", log.join(" | ")); process.exit(1); }
rmSync("data/stock", { recursive: true, force: true });
mkdirSync("data/stock", { recursive: true });
const updated = new Date().toISOString();
for (const [c, s] of Object.entries(files)) writeFileSync(`data/stock/${c}.json`, JSON.stringify({ updated, s }));
console.log(log.join(" | "), "| productos con stock:", Object.keys(stock).length);
