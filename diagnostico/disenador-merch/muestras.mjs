// Muestras para probar el diseñador de merchandising en local (solo pruebas; no se publica).
// Previsualizaciones limpias (sin el verde) de unas pocas áreas, igual que scripts/makito-marcaje.mjs (mismas funciones de la librería).
// SOLO LECTURA de la API de Makito: 1 petición de configuración + 1 por área.
// Uso: node diagnostico/disenador-merch/muestras.mjs <carpeta salida> mref-area ...
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { makitoGet } from "../../scripts/makito-api.mjs";
import { cargar, mascaraVerde, limpiar, aSharp } from "../../scripts/makito-marcaje-lib.mjs";
const [out, ...keys] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const print = await makitoGet("/print-config/files?format=JSON&lang=es");
const AREAS = Object.fromEntries((print.products || []).map(x => [String(x.id), x.areas || []]));
for (const k of keys) {
  const [mref, aid] = k.split("-");
  const a = (AREAS[mref] || []).find(x => x.id === aid);
  if (!a || !a.image) { console.log("sin área", k); continue; }
  try {
    const buf = await makitoGet(String(a.image).replace(/^https?:\/\/[^/]+/, ""), { raw: true });
    const small = await sharp(buf).flatten({ background: "#ffffff" }).resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    const img = await cargar(small);
    await aSharp(limpiar(img, mascaraVerde(img))).webp({ quality: 72, effort: 5 }).toFile(join(out, k + ".webp"));
    await sharp(small).toFile(join(out, k + "-verde.webp"));
    console.log("ok", k);
  } catch (e) { console.log("fallo", k, e.message); }
}
