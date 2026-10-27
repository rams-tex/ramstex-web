// Muestra de fotos del diseñador de TODOS los proveedores, para revisar a mano dónde caen las zonas de impresión.
// Por cada proveedor × plantilla × vista (delante, espalda, lateral) elige hasta N productos al azar (un color cada uno),
// guarda la foto reducida (JPEG, fondo blanco) y su medida en <dir>/index.json.
// Uso: node scripts/encuadres-muestras.mjs <dir> [N]   (en la acción: commit con [revision] en el mensaje)
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { fotosDisenador } from "./encuadres-lista.mjs";
import { mideFoto } from "./encuadres-medir.mjs";

const DIR = process.argv[2] || "muestras-enc", N = +process.argv[3] || 12;
const FIJAS = new Set(["SU1070", "NS305", "11380", "K356", "03815", "03574"]);
mkdirSync(DIR + "/img", { recursive: true });
const { fotos } = fotosDisenador({ todos: true, colores: "uno" });
const grupo = x => x.sup + "|" + x.tpl + "|" + (/^s/.test(x.k) ? "s" : x.k === "b" ? "b" : "f");
const G = {};
for (const x of fotos.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(a => a[1])) (G[grupo(x)] ||= []).push(x);
const elegidas = [];
for (const [g, l] of Object.entries(G)) {
  const refs = new Set();
  for (const x of l) if (FIJAS.has(x.ref)) { elegidas.push(x); refs.add(x.ref); }
  for (const x of l) { if (refs.size >= N) break; if (refs.has(x.ref)) continue; refs.add(x.ref); elegidas.push(x); }
}
console.log("Grupos:", Object.keys(G).length, "· fotos elegidas:", elegidas.length);

async function bajar(urls) {
  for (const u0 of urls) {
    const u = u0.replace(/\?w=\d+$/, "?w=600").replace(/\?wid=\d+/, "?wid=600");
    for (let t = 0; t < 2; t++) {
      try {
        const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(45000) });
        if (r.status === 404) break;
        if (!r.ok) throw new Error(r.status);
        return Buffer.from(await r.arrayBuffer());
      } catch (e) { }
    }
  }
  return null;
}
const idx = []; let i = 0, fallos = 0;
await Promise.all(Array.from({ length: 16 }, async () => {
  while (i < elegidas.length) {
    const x = elegidas[i++], id = String(idx.length + i).padStart(5, "0");
    const buf = await bajar(x.url);
    if (!buf) { fallos++; continue; }
    try {
      /* Stanley/Stella: la web lo sirve sin transparencia (fondo blanco), así que se mide igual */
      let img = sharp(buf); if (x.sup === "stanley") img = img.flatten({ background: "#ffffff" });
      const { data, info } = await img.ensureAlpha().resize(600, 600, { fit: "inside", withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
      const m = mideFoto(data, info.width, info.height, x);
      const nom = x.st.replace(/[^\w-]+/g, "_").slice(-90) + ".jpg";
      await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).flatten({ background: "#ffffff" }).resize(420, 420, { fit: "inside" }).jpeg({ quality: 86 }).toFile(DIR + "/img/" + nom);
      const { url, ...meta } = x;
      idx.push({ ...meta, img: nom, w: info.width, h: info.height, m });
    } catch (e) { fallos++; }
  }
}));
writeFileSync(DIR + "/index.json", JSON.stringify(idx));
console.log("Guardadas:", idx.length, "· fallos:", fallos, "· sin medida:", idx.filter(x => !x.m).length);
