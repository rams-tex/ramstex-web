// Prueba de stock de TopTex y Roly: muestra la forma de los datos (sin precios).
import { writeFileSync, mkdirSync } from "node:fs";
const OUT = []; const log = (...a) => { OUT.push(a.map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" ")); };
process.on("exit", () => { mkdirSync("diagnostico", { recursive: true }); writeFileSync("diagnostico/stock.txt", OUT.join("\n").replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "(token)")); });
const hide = v => JSON.stringify(v, (k, x) => /price|precio|tarif|cost/i.test(k) ? "(oculto)" : x);
// Roly
try {
  const B = "https://clientsws.gorfactory.es:2096";
  const l = await (await fetch(B + "/api/v1.1/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: process.env.ROLY_USER, password: process.env.ROLY_PASSWORD }) })).json();
  const H = { headers: { Authorization: "Bearer " + l.token } };
  const tries = [
    ["POST", "/api/v1/stock/getuserstock", ""], ["POST", "/api/v1/stock/getuserstock", "brand=roly"],
    ["POST", "/api/v1/stock/getuserstock", "brand=roly&lang=es-ES"], ["POST", "/api/v1/stock/getuserstock", "itemcode=CA64240101"],
    ["POST", "/api/v1/stock/getuserstock", "modelcode=CA6424"], ["POST", "/api/v1/stock/getuserstock", "brand=stamina"],
  ];
  for (const [m, q, body] of tries) {
    const r = await fetch(B + q, { method: m, headers: { ...H.headers, "Content-Type": "application/x-www-form-urlencoded" }, body }); const t = await r.text();
    let j; try { j = JSON.parse(t); } catch { j = t; }
    const arr = Array.isArray(j) ? j : (j && (j.stock || j.item || j.items || j.data));
    log("\nROLY", m, q, JSON.stringify(body || ""), "->", r.status, Array.isArray(arr) ? `(${arr.length} filas) ` + hide(arr.slice(0, 4)) : hide(j).slice(0, 1500));
  }
} catch (e) { log("Roly error", e.message); }
