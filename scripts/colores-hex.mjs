// Color real de cada código de color, medido en la foto del producto (mediana de la zona central).
// Solo para los proveedores que no dan el código de color (Sol's, Roly, JHK, Falk&Ross) y solo los que faltan.
// Resultado: data/colores-hex.json  { "proveedor|código|nombre_del_color": "#rrggbb" }  (lo usa scripts/catalogo-construir.mjs)
// Uso: node scripts/colores-hex.mjs   (necesita sharp: npm install --no-save sharp@0.33)
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
const OUT = "data/colores-hex.json";
let out = {}; try { out = JSON.parse(readFileSync(OUT, "utf8")); } catch (e) {}
const todo = new Map();
for (const f of ["sols", "roly", "jhk", "falkross"]) {
  let list = []; try { list = JSON.parse(readFileSync(`data/${f}.json`, "utf8")); } catch (e) { continue; }
  for (const p of list) for (const c of p.colors || []) {
    if (/^#?[0-9a-f]{6}$/i.test(c.hex || "") || !c.img) continue;
    const key = (p.source || f) + "|" + (c.code || "") + "|" + String(c.n || "").replace(/\s*\(x?\d+\)/gi, "").trim().toLowerCase().replace(/ /g, "_");
    if (out[key] || todo.has(key)) continue;
    const u = /^F:/.test(c.img) ? "https://download.falk-ross.eu/ws/picture/" + c.img.slice(2) + ".jpg" : /scene7/.test(c.img) ? c.img.split("?")[0] + "?wid=200" : c.img;
    if (/^https?:/.test(u)) todo.set(key, u);
  }
}
console.log("Colores por medir:", todo.size);
const med = a => { a.sort((x, y) => x - y); return a[a.length >> 1]; };
const h = v => v.toString(16).padStart(2, "0");
let ok = 0, bad = 0; const items = [...todo];
async function one([key, url]) {
  for (let t = 0; t < 2; t++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(r.status);
      const { data, info } = await sharp(Buffer.from(await r.arrayBuffer())).flatten({ background: "#ffffff" }).resize(100, 100, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
      const R = [], G = [], B = [];
      for (let y = 42; y < 66; y++) for (let x = 40; x < 60; x++) { const i = (y * info.width + x) * info.channels; R.push(data[i]); G.push(data[i + 1]); B.push(data[i + 2]); }
      out[key] = "#" + h(med(R)) + h(med(G)) + h(med(B)); ok++; return;
    } catch (e) { if (t) bad++; }
  }
}
let i = 0;
await Promise.all(Array.from({ length: 12 }, async () => { while (i < items.length) await one(items[i++]); }));
writeFileSync(OUT, JSON.stringify(out));
console.log("Medidos:", ok, "· fallos:", bad);
