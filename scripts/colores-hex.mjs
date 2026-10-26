// Mide el color real de cada código de color: mediana de la zona central de la foto del producto.
// Uso: node scripts/colores-hex.mjs colores-lista.txt colores-hex.json
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
const [,, LIST, OUT] = process.argv;
const lines = readFileSync(LIST, "utf8").split("\n").filter(Boolean).map(l => l.split("\t"));
const out = {}; let ok = 0, bad = 0;
const med = a => { a.sort((x, y) => x - y); return a[a.length >> 1]; };
async function one([key, url]) {
  for (let t = 0; t < 2; t++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      const { data, info } = await sharp(buf).flatten({ background: "#ffffff" }).resize(100, 100, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
      const R = [], G = [], B = [];
      for (let y = 42; y < 66; y++) for (let x = 40; x < 60; x++) { const i = (y * info.width + x) * info.channels; R.push(data[i]); G.push(data[i + 1]); B.push(data[i + 2]); }
      const h = v => v.toString(16).padStart(2, "0");
      out[key] = "#" + h(med(R)) + h(med(G)) + h(med(B)); ok++; return;
    } catch (e) { if (t) { bad++; console.log("FALLO", key, String(e).slice(0, 80)); } }
  }
}
const N = 12; let i = 0;
await Promise.all(Array.from({ length: N }, async () => { while (i < lines.length) await one(lines[i++]); }));
writeFileSync(OUT, JSON.stringify(out, null, 0));
console.log("ok", ok, "fallos", bad);
