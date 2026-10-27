// Encuadre de las fotos del diseñador de logos que el navegador no puede analizar (TopTex, Falk&Ross: sin CORS).
// Descarga cada foto que usa el diseñador (delante, espalda, lateral) y mide, como dzMeasure en index.html:
//   contorno de la prenda (x0,y0,x1,y1), ancho del cuerpo bw (60–86 % de la altura) y comienzo del cuerpo by0 (bolsas);
//   en las fotos laterales, además, el centro de la manga (sx, sy) en proporción al contorno, tal como se ve la foto (sin voltear).
// Resultado: data/encuadres.json
//   { p: { "REF|vista": [x0,y0,x1,y1,bw,by0(,sx,sy)] }   ← valor del producto (mediana de sus colores)
//     s: { "st": [...] } }                               ← fotos concretas que se apartan del valor del producto
// Uso: node scripts/encuadres.mjs   (necesita sharp)   · MUESTRAS=dir guarda fotos reducidas para revisar · LIMITE=n solo n fotos (al azar)
//      DIAG=dir hace hojas de contacto con las zonas dibujadas
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import sharp from "sharp";
import { fotosDisenador, contexto } from "./encuadres-lista.mjs";
import { mideFoto } from "./encuadres-medir.mjs";

const OUT = "data/encuadres.json";
const MUESTRAS = process.env.MUESTRAS || "", LIMITE = +process.env.LIMITE || 0, DIAG = process.env.DIAG || "";
let { fotos, prods } = fotosDisenador();
console.log("Productos con diseñador y fotos sin CORS:", prods, "· fotos:", fotos.length);
if (LIMITE) { /* muestra al azar: LIMITE fotos laterales y un tercio de delante/espalda */
  const az = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
  fotos = [...az(fotos.filter(x => /^s/.test(x.k))).slice(0, LIMITE), ...az(fotos.filter(x => !/^s/.test(x.k))).slice(0, LIMITE / 3 | 0)];
}
if (MUESTRAS) mkdirSync(MUESTRAS, { recursive: true });

async function bajar(urls) {
  for (const u0 of urls) {
    const u = u0.replace(/\?w=\d+$/, "?w=500");
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

const med = {}; let ok = 0, sinFoto = 0, sinMedida = 0, n = 0;
async function una(x) {
  const buf = await bajar(x.url);
  if (!buf) { sinFoto++; return; }
  try {
    const img = sharp(buf).ensureAlpha().resize(500, 500, { fit: "inside", withoutEnlargement: true });
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const m = mideFoto(data, info.width, info.height, x);
    if (MUESTRAS && /^s/.test(x.k)) {
      const nom = x.st.replace(/[^\w-]+/g, "_");
      await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).flatten({ background: "#ffffff" }).jpeg({ quality: 88 }).toFile(`${MUESTRAS}/${x.sup}-${x.k}-${nom}.jpg`);
    }
    if (!m) { sinMedida++; return; }
    med[x.st] = m; ok++;
  } catch (e) { sinMedida++; }
}
let i = 0;
await Promise.all(Array.from({ length: 24 }, async () => { while (i < fotos.length) { const x = fotos[i++]; await una(x); if (++n % 1000 === 0) console.log(n, "/", fotos.length); } }));
console.log("Medidas:", ok, "· sin foto:", sinFoto, "· sin medida (p. ej. blanco sobre blanco):", sinMedida);

// Valor por producto y vista: mediana de los colores; se guardan aparte las fotos que se apartan
const r3 = v => Math.round(v * 1000) / 1000;
const grupos = {};
for (const x of fotos) if (med[x.st]) (grupos[x.ref + "|" + x.k] ||= []).push(x.st);
const out = { p: {}, s: {} };
for (const [g, sts] of Object.entries(grupos)) {
  const L = Math.max(...sts.map(s => med[s].length));
  const vals = sts.map(s => med[s]).filter(v => v.length === L);
  const m = Array.from({ length: L }, (_, j) => { const a = vals.map(v => v[j]).sort((p, q) => p - q); return r3(a[a.length >> 1]); });
  out.p[g] = m;
  for (const s of sts) { const v = med[s]; if (v.length !== L || v.some((y, j) => Math.abs(y - m[j]) > .02)) out.s[s] = v.map(r3); }
}
if (MUESTRAS) writeFileSync(MUESTRAS + "/medidas.json", JSON.stringify(Object.fromEntries(fotos.filter(x => med[x.st]).map(x => [x.st, [x.sup, x.k, x.ref, x.tpl, ...med[x.st]]]))));
if (!LIMITE) { writeFileSync(OUT, JSON.stringify(out)); console.log("Guardado", OUT, "· productos/vista:", Object.keys(out.p).length, "· fotos aparte:", Object.keys(out.s).length, "·", JSON.stringify(out).length, "bytes"); }
if (DIAG) { const { diagnostico } = await import("./encuadres-diag.mjs"); await diagnostico(DIAG, fotos, med, bajar); }
