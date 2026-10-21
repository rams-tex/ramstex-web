// Prueba de la API de Stanley/Stella: muestra la estructura de productos, stock e imágenes (sin precios).
// Usuario y contraseña vienen de los secretos STANLEY_USER / STANLEY_PASSWORD.
import { mkdirSync, writeFileSync } from "node:fs";
const out = [], log = s => { out.push(s); console.log(s.slice(0, 3000)); };
const BASE = "https://api.stanleystella.com/webrequest/";
async function call(path, extra = {}) {
  const t = Date.now();
  const r = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { db_name: "production_api", user: process.env.STANLEY_USER, password: process.env.STANLEY_PASSWORD, ...extra }, id: 0 }) });
  const j = await r.json();
  if (j.error) { log(`${path}: ERROR ${JSON.stringify(j.error).slice(0, 500)}`); return null; }
  const res = typeof j.result === "string" ? JSON.parse(j.result) : j.result;
  log(`${path}: HTTP ${r.status}, ${Array.isArray(res) ? res.length + " registros" : typeof res}, ${Date.now() - t} ms`);
  return res;
}
const hide = o => JSON.stringify(o, (k, v) => /price|prix|precio/i.test(k) ? "(oculto)" : v, 1);
try {
  const p = await call("productsV2/get_json", { LanguageCode: "es_ES", Published: true });
  if (p?.length) {
    log("claves estilo: " + Object.keys(p[0]).join(", "));
    log("ejemplo estilo:\n" + hide(p[0]).slice(0, 6000));
    const cats = {}; for (const s of p) { const k = (s.Category || "") + " / " + (s.Type || s.SubCategory || ""); cats[k] = (cats[k] || 0) + 1; }
    log("categorías: " + JSON.stringify(cats));
  }
  const st = await call("v2/stock/get_json", { Is_Inventory: true });
  if (st?.length) { log("claves stock: " + Object.keys(st[0]).join(", ")); log("ejemplos stock:\n" + JSON.stringify(st.slice(0, 5), null, 1)); }
  const im = await call("products_imagesV2/get_json", { LanguageCode: "es_ES" });
  if (im?.length) {
    log("claves imagen: " + Object.keys(im[0]).join(", "));
    log("ejemplos imagen:\n" + JSON.stringify(im.slice(0, 6), null, 1));
    const ty = {}; for (const x of im) { const k = [x.PhotoTypeCode, x.PhotoStyle, x.PhotoShootCode].join("|"); ty[k] = (ty[k] || 0) + 1; }
    log("tipos de foto: " + JSON.stringify(ty));
  }
} catch (e) { log("Error: " + e.message); }
mkdirSync("diagnostico", { recursive: true });
writeFileSync("diagnostico/stanley.txt", out.join("\n"));
