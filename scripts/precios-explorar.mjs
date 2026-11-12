// Explora qué precios (coste para Ramstex) dan las APIs de los proveedores para unas referencias.
// Solo LEE. El resultado lleva costes, así que NO se escribe en claro: se guarda en $SALIDA (fuera del repo)
// y el flujo lo cifra con privado/clave-publica.pem antes de guardarlo.
// Uso: PRECIOS_REFS="SWRAKNG,BO7601" SALIDA=/tmp/precios.json node scripts/precios-explorar.mjs
import { writeFileSync, readFileSync } from "node:fs";
const refsDe = f => { const d = JSON.parse(readFileSync(`data/${f}.json`, "utf8")); return new Set((Array.isArray(d) ? d : d.products).map(p => p.ref)); };

const REFS = (process.env.PRECIOS_REFS || "").split(",").map(s => s.trim()).filter(Boolean);
const OUT = process.env.SALIDA || "/tmp/precios.json";
const res = { fecha: new Date().toISOString(), jhk: {}, roly: {}, log: [] };
const PRICE = /price|precio|pvp|tarif|cost|import|amount|euro|discount|descuento|neto|net/i;

// Todos los campos con pinta de precio, con su ruta (para entender la estructura)
function campos(o, path = "", out = [], depth = 0) {
  if (depth > 7 || out.length > 400) return out;
  if (Array.isArray(o)) { o.slice(0, 60).forEach((v, i) => campos(v, `${path}[${i}]`, out, depth + 1)); return out; }
  if (o && typeof o === "object") { for (const [k, v] of Object.entries(o)) { const p = path ? `${path}.${k}` : k; if (PRICE.test(k) && (typeof v !== "object" || v === null)) out.push([p, v]); else campos(v, p, out, depth + 1); } }
  return out;
}

// ---------- JHK ----------
const JR = refsDe("jhk"), jhkRefs = REFS.filter(r => JR.has(r));
if (process.env.JHK_TOKEN) {
  const T = process.env.JHK_TOKEN;
  for (const r of jhkRefs) {
    try {
      const p = await (await fetch(`https://www.jhktshirt.com/app/es/api/${T}/clothes/5/${encodeURIComponent(r)}/product.json`)).json();
      res.jhk[r] = { api: campos(p), claves: Object.keys(p || {}).slice(0, 40), comb: Object.entries(p.combinations || {}).slice(0, 2).map(([c, s]) => [c, Object.entries(s || {}).slice(0, 3)]) };
    } catch (e) { res.jhk[r] = { error: e.message }; }
  }
  // Área de clientes (precios que ve el cliente con su sesión)
  if (process.env.JHK_USER && process.env.JHK_PASSWORD) {
    const jar = new Map();
    const keep = r => { for (const c of r.headers.getSetCookie?.() || []) { const [kv] = c.split(";"); jar.set(kv.split("=")[0], kv); } };
    const get = async (u, opt = {}) => { let url = u, r; for (let k = 0; k < 6; k++) { r = await fetch(url, { ...opt, redirect: "manual", headers: { ...(opt.headers || {}), cookie: [...jar.values()].join("; "), "user-agent": "Mozilla/5.0 Ramstex-precios" } }); keep(r); const loc = r.headers.get("location"); if (r.status >= 300 && r.status < 400 && loc) { url = new URL(loc, url).href; opt = {}; } else break; } return r; };
    try {
      const L = "https://www.jhktshirt.com/app/es/login", h = await (await get(L)).text();
      const csrf = (h.match(/name="login\[_csrf_token\]"[^>]*value="([^"]*)"/) || h.match(/value="([^"]*)"[^>]*name="login\[_csrf_token\]"/) || [])[1] || "";
      await get(L, { method: "POST", body: new URLSearchParams({ "login[username]": process.env.JHK_USER, "login[password]": process.env.JHK_PASSWORD, "login[_csrf_token]": csrf }), headers: { "content-type": "application/x-www-form-urlencoded" } });
      for (const r of jhkRefs) {
        const t = await (await get(`https://www.jhktshirt.com/crm/es/pedidos/newd?reference=${encodeURIComponent(r.toLowerCase())}`)).text();
        const txt = t.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
        const euros = [...txt.matchAll(/.{0,80}\d+[.,]\d{2}\s*(€|EUR).{0,40}/g)].slice(0, 40).map(m => m[0]);
        const attrs = [...t.matchAll(/data-[a-z-]*(price|precio)[a-z-]*="[^"]*"/gi)].slice(0, 40).map(m => m[0]);
        (res.jhk[r] ||= {}).web = { euros, attrs };
      }
    } catch (e) { res.log.push("JHK web: " + e.message); }
  }
}

// ---------- Roly / Stamina ----------
const RR = refsDe("roly"), rolyRefs = REFS.filter(r => RR.has(r));
if (process.env.ROLY_USER && rolyRefs.length) {
  const B = "https://clientsws.gorfactory.es:2096";
  try {
    const l = await (await fetch(B + "/api/v1.1/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: process.env.ROLY_USER, password: process.env.ROLY_PASSWORD }) })).json();
    const H = { headers: { Authorization: "Bearer " + l.token } };
    for (const b of ["roly", "stamina"]) {
      const cat = await (await fetch(`${B}/api/v1.1/item/getcatalog?lang=es-ES&brand=${b}`, H)).json();
      for (const it of cat.item || []) if (rolyRefs.includes(it.modelcode)) {
        const e = (res.roly[it.modelcode] ||= { filas: [] });
        if (e.filas.length < 30) e.filas.push({ color: it.colorname, talla: it.sizename, precios: campos(it) });
      }
    }
    // tarifa del cliente: /api/v1/item/pricelist (parámetros según el swagger)
    try {
      const sw = await (await fetch(B + "/swagger/v1/swagger.json", H)).json();
      for (const p of ["/api/v1/item/pricelist", "/api/v1/item/printprices"]) res.log.push(`${p}: ${JSON.stringify(sw.paths?.[p] || {}).slice(0, 1500)}`);
    } catch (e) { res.log.push("swagger: " + e.message); }
    for (const r2 of rolyRefs) for (const model of [r2, r2.replace(/^[A-Z]+/, "")]) {
      if (res.roly[r2]?.tarifa?.length) break;
      for (const b of ["roly", "stamina"]) {
        try {
          const fd = new FormData(); fd.append("brand", b); fd.append("model", model);
          const r = await fetch(`${B}/api/v1/item/pricelist`, { method: "POST", headers: H.headers, body: fd });
          const t = await r.text(); res.log.push(`pricelist ${b} ${model}: ${r.status} ${t.length} b`);
          if (!r.ok) { res.log.push("  " + t.slice(0, 200)); continue; }
          let j; try { j = JSON.parse(t); } catch { res.log.push("  " + t.slice(0, 300)); continue; }
          const arr = Array.isArray(j) ? j : (Object.values(j).find(Array.isArray) || [j]);
          if (!arr.length) continue;
          (res.roly[r2] ||= { filas: [] }).tarifa = arr.slice(0, 25);
          break;
        } catch (e) { res.log.push(`pricelist ${b} ${model}: ${e.message}`); }
      }
    }
    try { const r = await fetch(`${B}/api/v1/item/printprices?lang=es-ES`, H); const t = await r.text(); res.log.push(`printprices: ${r.status} ${t.length} b`); res.printprices = t.slice(0, 20000); } catch (e) {}
    // los campos de un artículo del catálogo (nombres, para ver si hay precio con otro nombre)
    try { const cat = await (await fetch(`${B}/api/v1.1/item/getcatalog?lang=es-ES&brand=roly`, H)).json(); res.log.push("Roly campos artículo: " + Object.keys((cat.item || [])[0] || {}).join(", ")); } catch (e) {}
  } catch (e) { res.log.push("Roly: " + e.message); }
}


// ---------- Roly: tarifa completa de una marca (sin modelo) ----------
if (process.env.ROLY_USER && process.env.PRUEBA_ROLY_TODO) {
  const B = "https://clientsws.gorfactory.es:2096";
  try {
    const l = await (await fetch(B + "/api/v1.1/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: process.env.ROLY_USER, password: process.env.ROLY_PASSWORD }) })).json();
    for (const b of ["roly", "stamina"]) {
      const fd = new FormData(); fd.append("brand", b);
      const t0 = Date.now(), r = await fetch(`${B}/api/v1/item/pricelist`, { method: "POST", headers: { Authorization: "Bearer " + l.token }, body: fd });
      const t = await r.text(); let n = -1, models = 0; try { const j = JSON.parse(t); const a = Array.isArray(j) ? j : (Object.values(j).find(Array.isArray) || []); n = a.length; models = new Set(a.map(x => x.model)).size; } catch {}
      res.log.push(`Roly tarifa completa ${b}: ${r.status} · ${t.length} b · ${n} filas · ${models} modelos · ${Date.now() - t0} ms`);
    }
  } catch (e) { res.log.push("Roly todo: " + e.message); }
}

// ---------- TopTex ----------
const TT = REFS.filter(r => refsDe("toptex").has(r));
if (process.env.TOPTEX_API_KEY && TT.length) {
  const BASE = "https://api.toptex.io", KEY = process.env.TOPTEX_API_KEY;
  try {
    const a = await (await fetch(BASE + "/v3/authenticate", { method: "POST", headers: { "x-api-key": KEY, "Content-Type": "application/json" }, body: JSON.stringify({ username: process.env.TOPTEX_USER, password: process.env.TOPTEX_PASSWORD }) })).json();
    const H = { headers: { "x-api-key": KEY, "x-toptex-authorization": a.token } };
    res.toptex = {};
    for (const r of TT) for (const path of [`/v3/products/price?catalog_reference=${r}`, `/v3/products/price?catalog_reference=${r}&lang=es`]) {
      const x = await fetch(BASE + path, H); const t = await x.text();
      res.log.push(`TopTex ${path}: ${x.status} ${t.length} b`);
      if (x.ok) { try { res.toptex[r] = JSON.parse(t); } catch { res.toptex[r] = t.slice(0, 2000); } break; } else res.log.push("  " + t.slice(0, 200));
    }
    const x = await fetch(BASE + "/v3/products/price?result_in_file=1", H); res.log.push(`TopTex precios en archivo: ${x.status} ${(await x.text()).slice(0, 200)}`);
  } catch (e) { res.log.push("TopTex: " + e.message); }
}

// ---------- Stanley/Stella ----------
const SS = REFS.filter(r => refsDe("stanley").has(r));
if (process.env.STANLEY_USER && SS.length) {
  const call = async (path, extra = {}) => { const r = await fetch("https://api.stanleystella.com/webrequest/" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { db_name: "production_api", user: process.env.STANLEY_USER, password: process.env.STANLEY_PASSWORD, ...extra }, id: 0 }) }); const t = await r.text(); return [r.status, t]; };
  res.stanley = {};
  for (const path of ["products_pricesV2/get_json", "productsV2/get_prices", "prices/get_json", "products_prices/get_json", "pricesV2/get_json"]) {
    try { const [st, t] = await call(path, { LanguageCode: "es_ES", StyleCode: SS[0] }); res.log.push(`Stanley ${path}: ${st} ${t.length} b ${t.slice(0, 160)}`); if (st === 200 && !/"error"/.test(t.slice(0, 200))) { res.stanley[path] = t.slice(0, 4000); break; } } catch (e) { res.log.push(`Stanley ${path}: ${e.message}`); }
  }
}

writeFileSync(OUT, JSON.stringify(res, null, 1));
console.log(`JHK: ${Object.keys(res.jhk).length} · Roly: ${Object.keys(res.roly).length} · (resultado cifrado, no se muestra)`);
