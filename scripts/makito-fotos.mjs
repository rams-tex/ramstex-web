// Descarga las fotos de Makito que usa la web y las guarda optimizadas (WebP, 800 px) en una carpeta que GitHub
// conserva entre ejecuciones (caché). Makito solo deja bajar las fotos con token y a 25 peticiones por minuto,
// así que la primera vez tarda varios días (unas 7.000 fotos por ejecución); después solo baja las nuevas.
// Orden: primero la foto principal de cada producto, después la de cada color y por último las de detalle.
// Al final deja en data/makito.json SOLO las fotos que ya están descargadas (y quita los productos sin ninguna),
// para que la web no enlace fotos que todavía no existen. Se sirven desde ramstex.com/mk/<nombre>.webp.
// Uso: node scripts/makito-fotos.mjs <carpeta> [minutos máximos de descarga, por defecto 300]
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { makitoGet } from "./makito-api.mjs";

const DIR = process.argv[2] || "mkimg";
const BUDGET = (+process.argv[3] || 300) * 60000;
mkdirSync(DIR, { recursive: true });
let data = [];
try { data = JSON.parse(readFileSync("data/makito.json", "utf8")); } catch (e) { console.log("Sin data/makito.json"); process.exit(0); }
const file = id => join(DIR, id + ".webp");
const id = st => st && st.startsWith("K:") ? st.slice(2) : "";
const where = {};
for (const p of data) Object.assign(where, p.assets || {});
const tiers = [[], [], []];
for (const p of data) {
  tiers[0].push(id(p.img[0]) || id(p.colors[0]?.img));
  for (const c of p.colors) tiers[1].push(id(c.img));
  for (const s of p.img.slice(1)) tiers[2].push(id(s));
}
const order = [...new Set(tiers.flat().filter(Boolean))];
const todo = order.filter(f => !existsSync(file(f)) && where[f]);
console.log(`Fotos Makito: ${order.length} en total, ${todo.length} por descargar`);
const t0 = Date.now();
let ok = 0, fail = 0;
for (const f of todo) {
  if (Date.now() - t0 > BUDGET) { console.log("Tiempo agotado: el resto se descarga en la próxima ejecución"); break; }
  try {
    const buf = await makitoGet("/catalog/assets/" + where[f], { raw: true });
    await sharp(buf).flatten({ background: "#ffffff" }).resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).webp({ quality: 76 }).toFile(file(f));
    ok++;
  } catch (e) { fail++; if (fail <= 30) console.log("  no se pudo:", f, e.message); if (/Login|secretos/.test(e.message)) break; }
  if ((ok + fail) % 500 === 0) console.log(`  ${ok + fail} / ${todo.length} (${Math.round((Date.now() - t0) / 60000)} min)`);
}
console.log(`Descargadas ${ok}, fallidas ${fail}`);
writeFileSync(join(DIR, ".lista"), order.join("\n"));

// Solo las fotos que ya existen
const has = st => !!st && existsSync(file(id(st)));
const out = [];
for (const p of data) {
  p.img = p.img.filter(has);
  for (const c of p.colors) { if (!has(c.img)) c.img = ""; }
  if (!p.img.length) { const c = p.colors.find(c => c.img); if (c) p.img = [c.img]; else continue; }
  out.push(p);
}
writeFileSync("data/makito.json", JSON.stringify(out));
const have = order.filter(f => existsSync(file(f))).length;
const line = `Fotos Makito: ${have} de ${order.length} descargadas · productos con foto: ${out.length} de ${data.length}`;
console.log(line);
writeFileSync("data/makito-fotos.txt", line + "\n");
