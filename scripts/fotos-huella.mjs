// Calcula una "huella" (dHash) de la foto principal de cada producto para detectar
// productos repetidos con la misma foto aunque el archivo tenga otro nombre.
// Guarda data/huellas.json { ref: hash }. Solo calcula las que faltan o cambiaron.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const src = JSON.parse(readFileSync("data/toptex.json", "utf8"));
for (const f of ["data/roly.json", "data/jhk.json"]) { try { src.push(...JSON.parse(readFileSync(f, "utf8"))); } catch (e) {} }
const old = existsSync("data/huellas.json") ? JSON.parse(readFileSync("data/huellas.json", "utf8")) : {};
const out = {};
const todo = [];
for (const p of src) {
  const u = p.img?.[0] || p.colors?.find(c => c.img)?.img;
  if (!p.ref || !u) continue;
  const stem = /jhktshirt/.test(u) ? "J:" + u.replace(/^.*resources\.jhktshirt\.com\/pictures\//, "") : /gorfactory/.test(u) ? "R:" + u.replace(/^.*\/images\/models\//, "") : u.replace(/^https?:\/\/[^/]+\//, "");
  if (old[p.ref] && old[p.ref].s === stem) { out[p.ref] = old[p.ref]; continue; }
  todo.push([p.ref, stem]);
}
async function hash(stem) {
  const url = /^J:/.test(stem) ? "https://s3-eu-west-1.amazonaws.com/resources.jhktshirt.com/pictures/" + stem.slice(2) : /^R:/.test(stem) ? "https://static.gorfactory.es/images/models/" + stem.slice(2) : "https://cdn.europeancatalog.com/" + stem + "?w=120";
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      const px = await sharp(buf).flatten({ background: "#ffffff" }).grayscale().resize(17, 16, { fit: "fill" }).raw().toBuffer();
      let bits = "";
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) bits += px[y * 17 + x] > px[y * 17 + x + 1] ? "1" : "0";
      return BigInt("0b" + bits).toString(16).padStart(64, "0");
    } catch (e) { await new Promise(r => setTimeout(r, 1000 * (i + 1))); }
  }
  return "";
}
let done = 0;
const N = 12;
await Promise.all(Array.from({ length: N }, async (_, w) => {
  for (let i = w; i < todo.length; i += N) {
    const [ref, stem] = todo[i];
    const h = await hash(stem);
    if (h) out[ref] = { s: stem, h };
    if (++done % 200 === 0) console.log(done, "/", todo.length);
  }
}));
writeFileSync("data/huellas.json", JSON.stringify(out));
console.log(`Huellas: ${Object.keys(out).length} (nuevas ${todo.length})`);
