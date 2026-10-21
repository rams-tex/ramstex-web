// Comprueba qué fotos de Sol's existen de verdad y deja en data/sols.json solo las que cargan.
// - Foto principal del producto: la principal de Sol's (m<ref>A/B/C) y después las del modelo con el primer color.
// - Por color: delante (packshot A); espalda, lateral y foto con modelo solo si existen.
import { readFileSync, writeFileSync } from "node:fs";

const IMG = "https://s7g3.scene7.com/is/image/soloinvest/";
const data = JSON.parse(readFileSync("data/sols.json", "utf8"));
const cache = new Map();
async function exists(url) {
  if (cache.has(url)) return cache.get(url);
  // Solo cuenta como "no existe" si el servidor lo dice claramente (404); si falla por saturación, se reintenta
  let ok = false;
  for (let t = 0; t < 6; t++) {
    try {
      const r = await fetch(url + "?wid=20", { signal: AbortSignal.timeout(30000) });
      await r.arrayBuffer();
      if (r.ok && /image/.test(r.headers.get("content-type") || "")) { ok = true; break; }
      if (r.status === 404 || r.status === 400) break;
    } catch (e) {}
    await new Promise(res => setTimeout(res, 1500 * (t + 1)));
  }
  cache.set(url, ok); return ok;
}
// Comprobar todo con 12 peticiones a la vez (más rápido hace que el servidor rechace peticiones)
const urls = new Set();
for (const p of data) {
  for (const c of p.colors) { urls.add(c.img); c.views.forEach(v => urls.add(v)); ["B", "C"].forEach(s => urls.add(IMG + "vc" + p.ref + c.code + s)); }
  ["A", "B", "C"].forEach(s => { urls.add(IMG + "m" + p.ref + s); urls.add(IMG + "n" + p.ref + s); });
}
const list = [...urls]; let i = 0;
await Promise.all(Array.from({ length: 12 }, async () => { while (i < list.length) await exists(list[i++]); }));

let sinFoto = 0;
for (const p of data) {
  for (const c of p.colors) {
    if (!cache.get(c.img)) c.img = "";
    c.views = c.views.filter(v => cache.get(v));
  }
  p.colors = p.colors.filter(c => c.img || c.views.length);
  // Primero las fotos principales de Sol's (las de su web); después las del modelo con el primer color
  const withModel = p.colors.find(c => cache.get(IMG + "vc" + p.ref + c.code + "A"));
  const main = cache.get(IMG + "n" + p.ref + "A") ? "n" : "m"; /* "main picture" del feed */
  p.img = [...["A", "B", "C"].map(s => IMG + main + p.ref + s), ...(withModel ? ["A", "B", "C"].map(s => IMG + "vc" + p.ref + withModel.code + s) : [])].filter(u => cache.get(u));
  delete p.imgAlt;
  if (!p.img.length && !p.colors.some(c => c.img)) sinFoto++;
}
writeFileSync("data/sols.json", JSON.stringify(data));
const ok = [...cache.values()].filter(Boolean).length;
console.log(`Fotos comprobadas: ${cache.size}, existen ${ok}. Productos sin ninguna foto: ${sinFoto}`);
