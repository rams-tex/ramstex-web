// Prueba de conexión con la API de Roly.
// Se conecta con el usuario del área de cliente (guardado como secreto en GitHub),
// y muestra en el registro la ESTRUCTURA de los datos (nombres de campos y un ejemplo),
// sin precios ni datos de acceso. No modifica nada.
import { writeFileSync, mkdirSync } from "node:fs";
const BASE = "https://clientsws.gorfactory.es:2096";
const OUT = [];
const log = (...a) => { const t = a.map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" "); OUT.push(t.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "(token oculto)")); console.log(t.slice(0, 200)); };
const save = () => { mkdirSync("diagnostico", { recursive: true }); writeFileSync("diagnostico/roly.txt", OUT.join("\n")); };
process.on("exit", save);
const user = process.env.ROLY_USER, pass = process.env.ROLY_PASSWORD;
if (!user || !pass) { log("Faltan los secretos ROLY_USER y ROLY_PASSWORD."); process.exit(1); }

const PRIV = /price|precio|tarifa|cost|discount|descuento|password|token/i;
function shape(v, depth = 0) {
  if (Array.isArray(v)) return v.length ? [shape(v[0], depth + 1), `(${v.length} elementos)`] : [];
  if (v && typeof v === "object") {
    if (depth > 5) return "{…}";
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = PRIV.test(k) ? "(oculto)" : shape(x, depth + 1);
    return o;
  }
  if (typeof v === "string") return v.length > 80 ? v.slice(0, 80) + "…" : v;
  return v;
}
async function call(path, opts = {}) {
  let r;
  try { r = await fetch(BASE + path, opts); } catch (e) { return { status: "ERROR " + e.message + " " + (e.cause?.code || e.cause?.message || ""), data: null }; }
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t.slice(0, 300); }
  return { status: r.status, data: j };
}

let login;
for (const [path, body] of [
  ["/api/v1.1/login", { username: user, password: pass }],
  ["/api/v1/login", { username: user, password: pass }],
  ["/api/v1.1/login", { email: user, password: pass }],
  ["/api/v1/login", { email: user, password: pass }],
]) {
  login = await call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  log("Intento", path, Object.keys(body)[0], "->", login.status, typeof login.data === "object" ? JSON.stringify(shape(login.data)).slice(0, 160) : String(login.data).slice(0, 160));
  if (login.status === 200) break;
}
if (login.status !== 200) for (const path of ["/api/v1/login", "/api/v1.1/login"]) {
  login = await call(path, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ username: user, password: pass }).toString() });
  log("Intento (formulario)", path, "->", login.status, typeof login.data === "object" ? JSON.stringify(shape(login.data)).slice(0, 160) : String(login.data).slice(0, 160));
  if (login.status === 200) break;
}
log("Login:", login.status, typeof login.data, typeof login.data === "object" && login.data ? Object.keys(login.data).join(",") : "");
const token = typeof login.data === "string" ? login.data
  : (login.data?.token || login.data?.access_token || login.data?.accessToken || login.data?.Token);
if (!token) { log("Sin token. Respuesta:", typeof login.data === "string" ? login.data.slice(0, 200) : JSON.stringify(shape(login.data))); process.exit(0); }
const H = { headers: { Authorization: "Bearer " + token } };

const brand = process.env.MARCA || "stamina";
const cats = await call(`/api/v1/item/categories/tree?lang=es-ES&brand=${brand}`, H);
const flat = []; const walk = (a, d) => (a || []).forEach(c => { flat.push("  ".repeat(d) + c.category + " [" + c.id + "] " + c.models); walk(c.subcategories, d + 1); });
walk(cats.data, 0); log("== ÁRBOL DE CATEGORÍAS\n" + flat.join("\n"));
const cat = await call(`/api/v1.1/item/getcatalog?lang=es-ES&brand=${brand}`, H);
const items = cat.data.item || [];
const cnt = (k) => { const m = {}; items.forEach(it => m[it[k]] = (m[it[k]] || 0) + 1); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 60).map(x => x.join(": ")).join(" | "); };
log("\n== items:", items.length, "modelos:", new Set(items.map(i => i.modelcode)).size);
for (const k of ["family", "gender", "isforchildren", "isnovelty", "isoutlet", "sizename", "originalbrand"]) log(k, "=>", cnt(k));
const sample = items.filter(i => /^CA6424|^CA6502|^SU1070/.test(i.modelcode));
const one = items.find(i => i.family && /CAMISETA/i.test(i.family)) ;
const mc = (sample[0] || one).modelcode;
log("\n== EJEMPLO COMPLETO modelo", mc);
items.filter(i => i.modelcode === mc).slice(0, 4).forEach(i => log(JSON.stringify(Object.fromEntries(Object.entries(i).filter(([k]) => !PRIV.test(k))))));
log("\n== colores del modelo", mc, [...new Set(items.filter(i => i.modelcode === mc).map(i => i.colorcode + " " + i.colorname))].join(", "));
const m = await call(`/api/v1/model/get?lang=es-ES&brand=${brand}`, H);
log("\n== MODELO completo", JSON.stringify((m.data.models || []).find(x => x.modelcode === mc)));
log("\n== nombres de modelos (muestra)", (m.data.models || []).slice(0, 60).map(x => x.modelcode + " " + x.modelname + " · " + x.family + " · " + x.category.split(",")[0]).join("\n"));
