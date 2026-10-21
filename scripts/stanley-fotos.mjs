// Descarga las fotos de Stanley/Stella que usa la web y las guarda optimizadas (WebP, 800 px) en una carpeta
// que GitHub conserva entre publicaciones (caché). Solo baja las que faltan, así que normalmente tarda segundos.
// Stanley/Stella no permite enlazar sus fotos directamente: por eso se sirven desde ramstex.com/st/.
// Uso: node scripts/stanley-fotos.mjs <carpeta>
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const DIR = process.argv[2] || "stimg";
const SRC = "https://res.cloudinary.com/www-stanleystella-com/t_pim/TechnicalNames/";
mkdirSync(DIR, { recursive: true });
let data = [];
try { data = JSON.parse(readFileSync("data/stanley.json", "utf8")); } catch (e) { console.log("Sin data/stanley.json"); process.exit(0); }
const names = new Set();
for (const p of data) for (const st of [...p.img, ...p.colors.flatMap(c => [c.img, ...c.views])]) if (st && st.startsWith("T:")) names.add(st.slice(2));
const out = f => join(DIR, f.replace(/\.\w+$/, "") + ".webp");
const todo = [...names].filter(f => !existsSync(out(f)));
console.log(`Fotos Stanley/Stella: ${names.size} en total, ${todo.length} por descargar`);
let i = 0, ok = 0, fail = 0;
await Promise.all(Array.from({ length: 12 }, async () => {
  while (i < todo.length) {
    const f = todo[i++];
    for (let t = 0; t < 3; t++) {
      try {
        const r = await fetch(SRC + encodeURIComponent(f), { signal: AbortSignal.timeout(60000) });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const buf = Buffer.from(await r.arrayBuffer());
        await sharp(buf).flatten({ background: "#ffffff" }).resize({ width: 800, height: 1100, fit: "inside", withoutEnlargement: true }).webp({ quality: 74 }).toFile(out(f));
        ok++; break;
      } catch (e) { if (t === 2) { fail++; console.log("  no se pudo:", f, e.message); } }
    }
  }
}));
console.log(`Descargadas ${ok}, fallidas ${fail}`);
writeFileSync(join(DIR, ".lista"), [...names].join("\n"));
