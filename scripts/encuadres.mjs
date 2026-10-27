// Encuadre de las fotos del diseñador de logos, medido de antemano en el servidor para todos los proveedores.
// TopTex y Falk&Ross no dejan que el navegador lea sus fotos (sin CORS): sin esto, el diseñador solo tendría un encuadre fijo por proveedor.
// En los demás, el navegador mide el contorno él mismo; de aquí saca la manga de las fotos laterales y el encuadre si la foto
// no se distingue (prenda blanca sobre fondo blanco).
// Descarga cada foto que usa el diseñador (delante, espalda, lateral) y mide, como dzMeasure en index.html:
//   contorno de la prenda (x0,y0,x1,y1), ancho del cuerpo bw (60–86 % de la altura) y comienzo del cuerpo by0 (bolsas);
//   en las fotos laterales, además, el centro de la manga (sx, sy) en proporción al contorno, tal como se ve la foto (sin voltear).
// Resultado: data/encuadres/<categoría>.json
//   { p: { "REF|vista": [x0,y0,x1,y1,bw,by0(,sx,sy)] }   ← valor del producto (mediana de sus colores)
//     s: { "st": [...] } }                               ← fotos concretas que se apartan del valor del producto
// Uso: node scripts/encuadres.mjs   (necesita sharp)   · LIMITE=n solo n fotos (al azar, sin guardar) · DIAG=dir hojas de contacto
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import sharp from "sharp";
import { fotosDisenador } from "./encuadres-lista.mjs";
import { mideFoto } from "./encuadres-medir.mjs";

const OUT = "data/encuadres";
const LIMITE = +process.env.LIMITE || 0, DIAG = process.env.DIAG || "";
let { fotos, prods } = fotosDisenador({ todos: true });
console.log("Productos con diseñador:", prods, "· fotos:", fotos.length);
if (LIMITE) { /* muestra al azar: LIMITE fotos laterales y un tercio de delante/espalda */
  const az = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
  fotos = [...az(fotos.filter(x => /^s/.test(x.k))).slice(0, LIMITE), ...az(fotos.filter(x => !/^s/.test(x.k))).slice(0, LIMITE / 3 | 0)];
}

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
    let img = sharp(buf); if (x.sup === "stanley") img = img.flatten({ background: "#ffffff" }); /* la web la sirve sin transparencia */
    img = img.ensureAlpha().resize(500, 500, { fit: "inside", withoutEnlargement: true });
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const m = mideFoto(data, info.width, info.height, x);
    if (!m) { sinMedida++; return; }
    med[x.st] = m; ok++;
  } catch (e) { sinMedida++; }
}
let i = 0;
await Promise.all(Array.from({ length: 24 }, async () => { while (i < fotos.length) { const x = fotos[i++]; await una(x); if (++n % 1000 === 0) console.log(n, "/", fotos.length); } }));
console.log("Medidas:", ok, "· sin foto:", sinFoto, "· sin medida (p. ej. blanco sobre blanco):", sinMedida);

// Valor por producto y vista: mediana de los colores; se guardan aparte las fotos que se apartan. Un archivo por categoría.
const r3 = v => Math.round(v * 1000) / 1000;
const grupos = {};
for (const x of fotos) if (med[x.st]) { const g = x.c + "\t" + x.ref + "|" + x.k; (grupos[g] ||= []).push(x.st); }
const out = {};
for (const [g, sts] of Object.entries(grupos)) {
  const [c, key] = g.split("\t"), o = (out[c] ||= { p: {}, s: {} });
  const L = Math.max(...sts.map(s => med[s].length));
  const vals = sts.map(s => med[s]).filter(v => v.length === L);
  const m = Array.from({ length: L }, (_, j) => { const a = vals.map(v => v[j]).sort((p, q) => p - q); return r3(a[a.length >> 1]); });
  o.p[key] = m;
  for (const s of sts) { const v = med[s]; if (v.length !== L || v.some((y, j) => Math.abs(y - m[j]) > .025)) o.s[s] = v.map(r3); }
}
if (!LIMITE) {
  rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
  let tot = 0;
  for (const [c, o] of Object.entries(out)) { const t = JSON.stringify(o); writeFileSync(`${OUT}/${c}.json`, t); tot += t.length; console.log(" ", c, "· productos/vista:", Object.keys(o.p).length, "· fotos aparte:", Object.keys(o.s).length, "·", t.length, "bytes"); }
  console.log("Guardado", OUT, "·", tot, "bytes");
}
if (DIAG) { const { diagnostico } = await import("./encuadres-diag.mjs"); await diagnostico(DIAG, fotos.filter(x => !x.cors), med, bajar); }
