// Prueba de conexión con la API de TopTex (solo lectura).
// Usa los secretos TOPTEX_API_KEY, TOPTEX_USER y TOPTEX_PASSWORD guardados en GitHub
// y deja en diagnostico/toptex.txt la ESTRUCTURA de los datos (sin precios ni claves).
import { writeFileSync, mkdirSync } from "node:fs";
const BASE = "https://api.toptex.io";
const OUT = [];
const log = (...a) => { const t = a.map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" "); OUT.push(t.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "(token oculto)")); console.log(t.slice(0, 200)); };
process.on("exit", () => { mkdirSync("diagnostico", { recursive: true }); writeFileSync("diagnostico/toptex.txt", OUT.join("\n")); });

const KEY = process.env.TOPTEX_API_KEY, USER = process.env.TOPTEX_USER, PASS = process.env.TOPTEX_PASSWORD;
if (!KEY || !USER || !PASS) { log("Faltan secretos: TOPTEX_API_KEY, TOPTEX_USER o TOPTEX_PASSWORD."); process.exit(0); }

const PRIV = /price|prix|precio|tarif|cost|discount|password|token/i;
const isL = x => x && typeof x === "object" && !Array.isArray(x) && ("es" in x) && ("fr" in x);
function shape(v, d = 0) {
  if (Array.isArray(v)) return v.length ? [shape(v[0], d + 1), `(${v.length})`] : [];
  if (isL(v)) return { es: v.es };
  if (v && typeof v === "object") { if (d > 6) return "{…}"; const o = {}; for (const [k, x] of Object.entries(v)) o[k] = PRIV.test(k) ? "(oculto)" : shape(x, d + 1); return o; }
  if (typeof v === "string") return v.length > 90 ? v.slice(0, 90) + "…" : v;
  return v;
}
async function call(path, opts = {}) {
  let r; try { r = await fetch(BASE + path, opts); } catch (e) { return { status: "ERROR " + e.message, data: null }; }
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t.slice(0, 300); }
  return { status: r.status, data: j };
}

const auth = await call("/v3/authenticate", { method: "POST", headers: { "x-api-key": KEY, "Content-Type": "application/json" }, body: JSON.stringify({ username: USER, password: PASS }) });
log("Autenticación:", auth.status, auth.data && typeof auth.data === "object" ? JSON.stringify(shape(auth.data)).slice(0, 300) : String(auth.data).slice(0, 200));
const token = auth.data?.token || auth.data?.access_token || auth.data?.id_token || auth.data?.Token;
if (!token) process.exit(0);
const H = { headers: { "x-api-key": KEY, "x-toptex-authorization": token } };

const attrs = await call("/v3/attributes?lang=es", H);
log("\n== Atributos ->", attrs.status);
log(JSON.stringify(shape(attrs.data), null, 1).slice(0, 6000));

const all = await call("/v3/products/all?lang=es&usage_right=b2b_b2c&page_size=3&page_number=1", H);
log("\n== Productos (página 1, 3 productos) ->", all.status);
log(JSON.stringify(shape(all.data), null, 1).slice(0, 15000));

const one = await call("/v3/products?lang=es&usage_right=b2b_b2c&catalog_reference=NS401", H);
log("\n== Producto NS401 ->", one.status);
log(JSON.stringify(shape(one.data), null, 1).slice(0, 15000));
